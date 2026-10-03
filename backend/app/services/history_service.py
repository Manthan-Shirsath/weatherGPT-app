import datetime
import logging
from typing import Dict, Any, List, Optional
from sqlalchemy import select, delete, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import async_session_factory, is_db_available, check_db_health
from backend.app.models.weather_snapshot import WeatherSnapshot

logger = logging.getLogger("skycast.history")

class HistoryService:
    """
    Service for storing real weather observations and generating analytics trends
    backed by PostgreSQL.
    """
    _last_db_error: Optional[str] = None

    @classmethod
    def get_last_error(cls) -> Optional[str]:
        return cls._last_db_error

    @classmethod
    async def record_snapshot(
        cls,
        city_name: str,
        weather_data: Dict[str, Any],
        alerts_data: Optional[Dict[str, Any]] = None
    ) -> Optional[WeatherSnapshot]:
        """
        Persist a real weather observation snapshot for a city into PostgreSQL.
        Applies a 15-minute deduplication strategy unless significant weather/risk delta occurs.
        """
        if not weather_data:
            return None

        # Check database health with throttling (avoids 14x connection timeouts if DB is offline)
        if not await check_db_health():
            return None

        clean_city = city_name.strip().lower()
        now_utc = datetime.datetime.now(datetime.timezone.utc)

        # Extract meteorological metrics with fallback protection
        temp_c = float(weather_data.get("tempC", weather_data.get("temperature", 25.0)))
        feels_like_c = float(weather_data.get("feelsLikeC", weather_data.get("feelsLike", temp_c)))
        humidity_pct = float(weather_data.get("humidity", 60.0))

        details = weather_data.get("details", {})
        precip_mm = float(details.get("precipitationMm", weather_data.get("precipitation", 0.0)))

        insight = weather_data.get("insight", {})
        rain_prob = float(insight.get("rainChance", weather_data.get("rainChance", 0.0)))

        wind_speed_kmh = float(weather_data.get("windSpeedKmh", weather_data.get("windSpeed", 10.0)))
        wind_deg = float(details.get("windDirectionDeg", weather_data.get("windDirectionDeg", 0.0)))
        wind_dir = str(details.get("windDirection", weather_data.get("windDirection", "N")))
        cloud_cover_pct = float(details.get("cloudCoverPct", weather_data.get("cloudCover", 40.0)))
        pressure_hpa = float(details.get("pressureHpa", weather_data.get("pressure", 1013.0)))
        vis_km = float(details.get("visibilityKm", weather_data.get("visibility", 10.0)))
        w_code = int(weather_data.get("weather_code", weather_data.get("weatherCode", 0)))
        cond_text = str(weather_data.get("condition", "Clear"))
        display_loc = str(weather_data.get("displayLocation", f"{city_name.capitalize()}, India"))
        lat = float(weather_data.get("latitude", 0.0))
        lon = float(weather_data.get("longitude", 0.0))

        # Risk assessment parsing
        risk_level = "green"
        highest_risk = "none"
        active_hazards_str = ""

        if alerts_data and isinstance(alerts_data, dict):
            risk_level = str(alerts_data.get("highestRiskColour", "green")).lower()
            alerts_list = alerts_data.get("alerts", [])
            if alerts_list:
                highest_risk = str(alerts_list[0].get("hazardClassification", "none"))
                active_hazards_str = ", ".join([a.get("hazard", "") for a in alerts_list if a.get("hazard")])
        elif "alerts" in weather_data and weather_data["alerts"]:
            alerts_list = weather_data["alerts"]
            risk_level = str(alerts_list[0].get("skycastRiskColour", alerts_list[0].get("severity", "green"))).lower()
            highest_risk = str(alerts_list[0].get("hazardClassification", alerts_list[0].get("event", "none")))
            active_hazards_str = ", ".join([a.get("hazard", a.get("event", "")) for a in alerts_list])

        try:
            async with async_session_factory() as session:
                # Deduplication check: get most recent snapshot
                stmt = (
                    select(WeatherSnapshot)
                    .where(WeatherSnapshot.city == clean_city)
                    .order_by(desc(WeatherSnapshot.timestamp))
                    .limit(1)
                )
                res = await session.execute(stmt)
                latest: Optional[WeatherSnapshot] = res.scalar_one_or_none()

                if latest and latest.timestamp:
                    time_diff_sec = (now_utc - latest.timestamp).total_seconds()
                    # If within 15 minutes (900 seconds)
                    if time_diff_sec < 900:
                        temp_diff = abs(temp_c - latest.temperature_c)
                        precip_diff = abs(precip_mm - latest.precipitation_mm)
                        wind_diff = abs(wind_speed_kmh - latest.wind_speed_kmh)
                        risk_changed = (risk_level != latest.skycast_risk_level)

                        # If no significant change, skip duplicate insert
                        if temp_diff < 0.5 and precip_diff < 0.1 and wind_diff < 5.0 and not risk_changed:
                            logger.debug("⏭️ [HISTORY DEDUP] Skipped duplicate snapshot for '%s' (age: %ds)", city_name, time_diff_sec)
                            return latest

                # Extract Freshness Meta
                provider = str(weather_data.get("provider", "unknown"))
                is_stale = bool(weather_data.get("stale", False))

                # Create new persistent snapshot
                snapshot = WeatherSnapshot(
                    timestamp=now_utc,
                    city=clean_city,
                    display_location=display_loc,
                    latitude=lat,
                    longitude=lon,
                    temperature_c=temp_c,
                    feels_like_c=feels_like_c,
                    humidity_pct=humidity_pct,
                    precipitation_mm=precip_mm,
                    rain_probability_pct=rain_prob,
                    wind_speed_kmh=wind_speed_kmh,
                    wind_direction_deg=wind_deg,
                    wind_direction_label=wind_dir,
                    cloud_cover_pct=cloud_cover_pct,
                    pressure_hpa=pressure_hpa,
                    visibility_km=vis_km,
                    weather_code=w_code,
                    condition_text=cond_text,
                    skycast_risk_level=risk_level,
                    highest_risk=highest_risk,
                    active_hazards=active_hazards_str,
                    provider=provider,
                    is_stale=is_stale
                )

                session.add(snapshot)
                await session.commit()
                await session.refresh(snapshot)
                cls._last_db_error = None
                logger.info("💾 [HISTORY SAVED] Persisted snapshot for '%s' in PostgreSQL (id: %s, temp: %.1f°C, risk: %s, provider: %s, stale: %s)", city_name, snapshot.id, temp_c, risk_level, provider, is_stale)
                return snapshot

        except Exception as exc:
            cls._last_db_error = str(exc)
            logger.error("❌ [DATABASE ERROR] Failed to persist snapshot to PostgreSQL for '%s': %s", city_name, exc)
            return None

    @classmethod
    async def cleanup_old_snapshots(cls, retention_days: int = 30) -> int:
        """
        Delete historical observations older than retention_days to maintain optimal database size.
        """
        cutoff_utc = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=retention_days)
        try:
            async with async_session_factory() as session:
                stmt = delete(WeatherSnapshot).where(WeatherSnapshot.timestamp < cutoff_utc)
                res = await session.execute(stmt)
                await session.commit()
                deleted_count = res.rowcount or 0
                if deleted_count > 0:
                    logger.info("🧹 [HISTORY RETENTION] Cleaned up %d snapshots older than %d days.", deleted_count, retention_days)
                return deleted_count
        except Exception as exc:
            logger.warning("Retention cleanup warning: %s", exc)
            return 0

    @classmethod
    async def get_trends(
        cls,
        city_name: str,
        range_str: str = "24h",
        compare_city: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Fetch real stored observations from PostgreSQL and compute statistical analytics trends.
        Does NOT invent or simulate historical observations.
        """
        clean_city = city_name.strip().lower()
        now_utc = datetime.datetime.now(datetime.timezone.utc)

        # Range cutoff mapping
        if range_str == "7d":
            cutoff_utc = now_utc - datetime.timedelta(days=7)
            range_label = "Past 7 Days"
        elif range_str == "30d":
            cutoff_utc = now_utc - datetime.timedelta(days=30)
            range_label = "Past 30 Days"
        else:
            range_str = "24h"
            cutoff_utc = now_utc - datetime.timedelta(hours=24)
            range_label = "Past 24 Hours"

        try:
            async with async_session_factory() as session:
                # Query snapshots for primary city
                stmt = (
                    select(WeatherSnapshot)
                    .where(WeatherSnapshot.city == clean_city, WeatherSnapshot.timestamp >= cutoff_utc)
                    .order_by(WeatherSnapshot.timestamp.asc())
                )
                res = await session.execute(stmt)
                snapshots: List[WeatherSnapshot] = list(res.scalars().all())

                # If no snapshots in database, return clear no-data structure
                if not snapshots:
                    return cls._build_insufficient_data_response(city_name, range_str, range_label)

                # Process real observations
                observations = []
                temps = []
                precips = []
                rain_probs = []
                humidities = []
                winds = []
                pressures = []
                wind_dirs = []
                risk_transitions = []
                last_risk = None

                display_location = snapshots[0].display_location or f"{city_name.capitalize()}, India"

                for s in snapshots:
                    ts: datetime.datetime = s.timestamp
                    if ts.tzinfo is None:
                        ts = ts.replace(tzinfo=datetime.timezone.utc)

                    if range_str == "24h":
                        time_label = ts.strftime("%I:%M %p").lstrip("0")
                    else:
                        time_label = ts.strftime("%b %d, %I:%M %p").lstrip("0")

                    obs_item = {
                        "id": s.id,
                        "timestamp": ts.isoformat(),
                        "timeLabel": time_label,
                        "temperature": round(s.temperature_c, 1),
                        "feelsLike": round(s.feels_like_c, 1) if s.feels_like_c is not None else round(s.temperature_c, 1),
                        "precipitation": round(s.precipitation_mm, 2),
                        "rainProbability": round(s.rain_probability_pct, 1) if s.rain_probability_pct is not None else 0.0,
                        "humidity": round(s.humidity_pct, 1),
                        "windSpeed": round(s.wind_speed_kmh, 1),
                        "windDirection": s.wind_direction_label or "N",
                        "windDirectionDeg": s.wind_direction_deg or 0.0,
                        "cloudCover": round(s.cloud_cover_pct, 1) if s.cloud_cover_pct is not None else 0.0,
                        "pressure": round(s.pressure_hpa, 1),
                        "visibility": round(s.visibility_km, 1) if s.visibility_km is not None else 10.0,
                        "condition": s.condition_text or "Clear",
                        "weatherCode": s.weather_code or 0,
                        "riskLevel": s.skycast_risk_level or "green",
                        "highestRisk": s.highest_risk or "none"
                    }
                    observations.append(obs_item)

                    temps.append(s.temperature_c)
                    precips.append(s.precipitation_mm)
                    if s.rain_probability_pct is not None:
                        rain_probs.append(s.rain_probability_pct)
                    humidities.append(s.humidity_pct)
                    winds.append(s.wind_speed_kmh)
                    pressures.append(s.pressure_hpa)
                    if s.wind_direction_label:
                        wind_dirs.append(s.wind_direction_label)

                    # Build risk history timeline
                    curr_risk = s.skycast_risk_level or "green"
                    if curr_risk != last_risk or not risk_transitions:
                        risk_transitions.append({
                            "timestamp": ts.isoformat(),
                            "timeLabel": time_label,
                            "riskLevel": curr_risk,
                            "highestRisk": s.highest_risk or "Normal Conditions",
                            "activeHazards": s.active_hazards or "None",
                            "temperature": round(s.temperature_c, 1),
                            "actionDirective": cls._get_action_directive(curr_risk)
                        })
                        last_risk = curr_risk

                # Mathematical analytics
                temp_summary = {
                    "current": round(temps[-1], 1) if temps else None,
                    "avg": round(sum(temps) / len(temps), 1) if temps else None,
                    "min": round(min(temps), 1) if temps else None,
                    "max": round(max(temps), 1) if temps else None,
                    "unit": "°C"
                }

                rainfall_summary = {
                    "total": round(sum(precips), 2),
                    "avg": round(sum(precips) / len(precips), 2) if precips else 0.0,
                    "maxPeriod": round(max(precips), 2) if precips else 0.0,
                    "latestProbability": round(rain_probs[-1], 1) if rain_probs else 0.0,
                    "unit": "mm"
                }

                humidity_summary = {
                    "current": round(humidities[-1], 1) if humidities else None,
                    "avg": round(sum(humidities) / len(humidities), 1) if humidities else None,
                    "min": round(min(humidities), 1) if humidities else None,
                    "max": round(max(humidities), 1) if humidities else None,
                    "unit": "%"
                }

                # Dominant wind direction mode
                dominant_dir = max(set(wind_dirs), key=wind_dirs.count) if wind_dirs else "N"
                wind_summary = {
                    "current": round(winds[-1], 1) if winds else None,
                    "avg": round(sum(winds) / len(winds), 1) if winds else None,
                    "min": round(min(winds), 1) if winds else None,
                    "max": round(max(winds), 1) if winds else None,
                    "dominantDirection": dominant_dir,
                    "unit": "km/h"
                }

                pressure_summary = {
                    "current": round(pressures[-1], 1) if pressures else None,
                    "avg": round(sum(pressures) / len(pressures), 1) if pressures else None,
                    "min": round(min(pressures), 1) if pressures else None,
                    "max": round(max(pressures), 1) if pressures else None,
                    "unit": "hPa"
                }

                # Forecast vs Recent Observed comparison
                try:
                    from backend.app.services.weather_hub import weather_hub
                    current_weather = await weather_hub.get_weather_for_city(city_name)
                except Exception:
                    current_weather = None
                forecast_vs_observed = cls._build_forecast_vs_observed(snapshots[-1], current_weather)

                # Optional location comparison
                comparison_payload = None
                if compare_city and compare_city.strip().lower() != clean_city:
                    comparison_payload = await cls._build_comparison(session, compare_city, cutoff_utc, range_str)

                return {
                    "city": city_name.capitalize(),
                    "displayLocation": display_location,
                    "range": range_str,
                    "rangeLabel": range_label,
                    "status": "ready" if len(observations) >= 2 else "insufficient_data",
                    "count": len(observations),
                    "message": "Real weather observations retrieved from PostgreSQL." if len(observations) >= 2 else "Skycast started collecting weather history recently. More data will appear as observations accumulate.",
                    "temperature": temp_summary,
                    "rainfall": rainfall_summary,
                    "humidity": humidity_summary,
                    "wind": wind_summary,
                    "pressure": pressure_summary,
                    "observations": observations,
                    "riskHistory": risk_transitions,
                    "forecastVsObserved": forecast_vs_observed,
                    "comparison": comparison_payload,
                    "database": {
                        "type": "PostgreSQL",
                        "isAvailable": is_db_available(),
                        "lastError": cls._last_db_error if not is_db_available() else None
                    },
                    "disclaimer": "Skycast risk levels are derived assessments based on published IMD criteria/framework. They are not official IMD warnings."
                }

        except Exception as exc:
            cls._last_db_error = str(exc)
            logger.error("Error retrieving weather trends for '%s': %s", city_name, exc)
            return cls._build_insufficient_data_response(city_name, range_str, range_str, exc_msg=str(exc))

    @staticmethod
    def _get_action_directive(risk_level: str) -> str:
        color_actions = {
            "red": "Take Action",
            "orange": "Be Prepared",
            "yellow": "Be Updated",
            "green": "No Action"
        }
        return color_actions.get(risk_level.lower(), "No Action")

    @classmethod
    def _build_insufficient_data_response(
        cls,
        city_name: str,
        range_str: str,
        range_label: str,
        exc_msg: Optional[str] = None
    ) -> Dict[str, Any]:
        """Response structure when database has no records or during bootstrap."""
        error_detail = exc_msg or cls._last_db_error
        base_msg = "Not enough historical data yet. Skycast started collecting weather history recently."
        if error_detail:
            if "refused" in error_detail.lower() or "timeout" in error_detail.lower():
                msg = f"{base_msg} (PostgreSQL is currently in standby/offline at 127.0.0.1:5432. Snapshot persistence will resume automatically once connected)."
            else:
                msg = f"{base_msg} (PostgreSQL diagnostic: {error_detail})."
        else:
            msg = f"{base_msg} More data will appear as observations accumulate."

        return {
            "city": city_name.capitalize(),
            "displayLocation": f"{city_name.capitalize()}, India",
            "range": range_str,
            "rangeLabel": range_label,
            "status": "insufficient_data",
            "count": 0,
            "message": msg,
            "temperature": {"current": None, "avg": None, "min": None, "max": None, "unit": "°C"},
            "rainfall": {"total": 0.0, "avg": 0.0, "maxPeriod": 0.0, "latestProbability": 0.0, "unit": "mm"},
            "humidity": {"current": None, "avg": None, "min": None, "max": None, "unit": "%"},
            "wind": {"current": None, "avg": None, "min": None, "max": None, "dominantDirection": "N", "unit": "km/h"},
            "pressure": {"current": None, "avg": None, "min": None, "max": None, "unit": "hPa"},
            "observations": [],
            "riskHistory": [],
            "forecastVsObserved": None,
            "comparison": None,
            "database": {
                "type": "PostgreSQL",
                "isAvailable": is_db_available() and (error_detail is None),
                "lastError": error_detail
            },
            "disclaimer": "Skycast risk levels are derived assessments based on published IMD criteria/framework. They are not official IMD warnings."
        }

    @staticmethod
    def _build_forecast_vs_observed(
        latest_snapshot: WeatherSnapshot,
        current_weather: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Build side-by-side comparison of recent observed database snapshot against current numerical forecast.
        Does NOT fabricate forecast accuracy metrics.
        """
        if not latest_snapshot or not current_weather:
            return None

        daily = current_weather.get("daily", [])
        today_forecast = daily[0] if daily else {}

        return {
            "hasForecastAccuracyClaim": False,
            "note": "Comparison presents recent real observations alongside the current numerical weather prediction. Historical forecast verification will be available once forecast archive snapshots accumulate.",
            "observed": {
                "label": "Latest Recorded Observation (Database)",
                "timestamp": latest_snapshot.timestamp.isoformat() if latest_snapshot.timestamp else None,
                "temperature": round(latest_snapshot.temperature_c, 1),
                "feelsLike": round(latest_snapshot.feels_like_c, 1) if latest_snapshot.feels_like_c is not None else round(latest_snapshot.temperature_c, 1),
                "humidity": round(latest_snapshot.humidity_pct, 1),
                "precipitation": round(latest_snapshot.precipitation_mm, 2),
                "windSpeed": round(latest_snapshot.wind_speed_kmh, 1),
                "pressure": round(latest_snapshot.pressure_hpa, 1),
                "condition": latest_snapshot.condition_text or "Clear",
                "riskLevel": latest_snapshot.skycast_risk_level or "green"
            },
            "forecast": {
                "label": "Current Forecast (Open-Meteo)",
                "highTemp": today_forecast.get("highC", current_weather.get("highC", latest_snapshot.temperature_c + 2)),
                "lowTemp": today_forecast.get("lowC", current_weather.get("lowC", latest_snapshot.temperature_c - 4)),
                "rainChance": today_forecast.get("rainChance", current_weather.get("insight", {}).get("rainChance", 20)),
                "expectedPrecipitation": today_forecast.get("precipitationMm", 0.0),
                "maxWind": today_forecast.get("maxWindKmh", 15),
                "condition": today_forecast.get("condition", current_weather.get("condition", "Partly Cloudy")),
                "uvIndex": today_forecast.get("uvIndex", 5.0)
            }
        }

    @classmethod
    async def _build_comparison(
        cls,
        session: AsyncSession,
        compare_city: str,
        cutoff_utc: datetime.datetime,
        range_str: str
    ) -> Optional[Dict[str, Any]]:
        """Fetch and aggregate comparative metrics for a secondary city."""
        clean_compare = compare_city.strip().lower()
        stmt = (
            select(WeatherSnapshot)
            .where(WeatherSnapshot.city == clean_compare, WeatherSnapshot.timestamp >= cutoff_utc)
            .order_by(WeatherSnapshot.timestamp.asc())
        )
        res = await session.execute(stmt)
        c_snapshots = list(res.scalars().all())

        if not c_snapshots:
            return {
                "city": compare_city.capitalize(),
                "status": "insufficient_data",
                "count": 0,
                "message": f"Insufficient historical records for {compare_city.capitalize()}."
            }

        temps = [s.temperature_c for s in c_snapshots]
        precips = [s.precipitation_mm for s in c_snapshots]
        winds = [s.wind_speed_kmh for s in c_snapshots]
        humidities = [s.humidity_pct for s in c_snapshots]

        return {
            "city": compare_city.capitalize(),
            "displayLocation": c_snapshots[0].display_location or f"{compare_city.capitalize()}, India",
            "status": "ready",
            "count": len(c_snapshots),
            "temperature": {
                "current": round(temps[-1], 1),
                "avg": round(sum(temps) / len(temps), 1),
                "min": round(min(temps), 1),
                "max": round(max(temps), 1)
            },
            "rainfall": {
                "total": round(sum(precips), 2),
                "avg": round(sum(precips) / len(precips), 2),
                "maxPeriod": round(max(precips), 2)
            },
            "humidity": {
                "current": round(humidities[-1], 1),
                "avg": round(sum(humidities) / len(humidities), 1)
            },
            "wind": {
                "current": round(winds[-1], 1),
                "avg": round(sum(winds) / len(winds), 1)
            },
            "latestRisk": c_snapshots[-1].skycast_risk_level or "green"
        }
