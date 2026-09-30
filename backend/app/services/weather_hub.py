"""
Central Weather Data Hub
The single authoritative gateway for all meteorological data ingestion, normalization,
caching in Redis, persistence to PostgreSQL, and internal access across feature services.
"""

import asyncio
import datetime
from typing import Dict, Any, List, Optional, Tuple
import logging

from backend.app.core.cache import cache
import httpx
from backend.app.core.config import OPENWEATHER_API_KEY
from backend.app.core.config import (
    TTL_CURRENT_WEATHER,
    TTL_MAP_WEATHER,
    TTL_FORECAST,
    TTL_RADAR_META
)
from backend.app.services.providers.base import BaseWeatherProvider
from backend.app.services.providers.open_meteo import open_meteo_provider
from backend.app.services.providers.open_weather_map import open_weather_map_provider
from backend.app.services.providers.rainviewer import fetch_radar_maps_raw
from backend.app.services.providers.imd_cap import imd_cap_provider
from backend.app.models.canonical_weather import (
    CanonicalLocationMeta,
    CanonicalCurrentWeather,
    CanonicalHourlyItem,
    CanonicalDailyItem,
    CanonicalFreshnessMeta,
    CanonicalWeatherDataset
)

logger = logging.getLogger("skycast.weather_hub")

# Request Deduplication Locks to eliminate Cache Stampedes
_IN_FLIGHT_LOCKS: Dict[str, asyncio.Lock] = {}
_GLOBAL_LOCK = asyncio.Lock()

async def _get_lock_for_key(key: str) -> asyncio.Lock:
    async with _GLOBAL_LOCK:
        if key not in _IN_FLIGHT_LOCKS:
            _IN_FLIGHT_LOCKS[key] = asyncio.Lock()
        return _IN_FLIGHT_LOCKS[key]

# WMO Weather Condition Map
WMO_WEATHER_MAP = {
    0: ("Sunny", "sun"),
    1: ("Mainly Clear", "sun"),
    2: ("Partly Cloudy", "partly-cloudy"),
    3: ("Cloudy", "cloudy"),
    45: ("Foggy", "fog"),
    48: ("Depositing Rime Fog", "fog"),
    51: ("Light Drizzle", "rain"),
    53: ("Moderate Drizzle", "rain"),
    55: ("Dense Drizzle", "rain"),
    56: ("Light Freezing Drizzle", "rain"),
    57: ("Dense Freezing Drizzle", "rain"),
    61: ("Slight Rain", "rain"),
    63: ("Moderate Rain", "rain"),
    65: ("Heavy Rain", "rain"),
    66: ("Light Freezing Rain", "rain"),
    67: ("Heavy Freezing Rain", "rain"),
    71: ("Light Snow", "snow"),
    73: ("Moderate Snow", "snow"),
    75: ("Heavy Snow", "snow"),
    77: ("Snow Grains", "snow"),
    80: ("Scattered Rain", "rain"),
    81: ("Rain Showers", "rain"),
    82: ("Violent Rain Showers", "rain"),
    85: ("Light Snow Showers", "snow"),
    86: ("Heavy Snow Showers", "snow"),
    95: ("Thunderstorms", "thunderstorm"),
    96: ("Thunderstorm with Hail", "thunderstorm"),
    99: ("Heavy Thunderstorm with Hail", "thunderstorm"),
}

def decode_weather_code(code: Optional[int]) -> Tuple[str, str]:
    if code is None:
        return ("Partly Cloudy", "partly-cloudy")
    return WMO_WEATHER_MAP.get(code, ("Partly Cloudy", "partly-cloudy"))

def get_wind_direction_label(degrees: Optional[float]) -> str:
    if degrees is None:
        return "N"
    directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    idx = round(degrees / (360 / len(directions))) % len(directions)
    return directions[idx]

KEY_MAP_CITIES = [
    {"name": "Pune", "state": "Maharashtra", "lat": 18.5204, "lon": 73.8567},
    {"name": "Mumbai", "state": "Maharashtra", "lat": 19.0760, "lon": 72.8777},
    {"name": "New Delhi", "state": "Delhi", "lat": 28.6139, "lon": 77.2090},
    {"name": "Bengaluru", "state": "Karnataka", "lat": 12.9716, "lon": 77.5946},
    {"name": "Chennai", "state": "Tamil Nadu", "lat": 13.0827, "lon": 80.2707},
    {"name": "Hyderabad", "state": "Telangana", "lat": 17.3850, "lon": 78.4867},
    {"name": "Kolkata", "state": "West Bengal", "lat": 22.5726, "lon": 88.3639},
    {"name": "Ahmedabad", "state": "Gujarat", "lat": 23.0225, "lon": 72.5714},
    {"name": "Jaipur", "state": "Rajasthan", "lat": 26.9124, "lon": 75.7873},
    {"name": "Goa", "state": "Goa", "lat": 15.2993, "lon": 74.1240},
    {"name": "Srinagar", "state": "Jammu & Kashmir", "lat": 34.0837, "lon": 74.7973},
    {"name": "Jammu", "state": "Jammu & Kashmir", "lat": 32.7266, "lon": 74.8570},
    {"name": "Leh", "state": "Ladakh", "lat": 34.1526, "lon": 77.5771},
    {"name": "Kargil", "state": "Ladakh", "lat": 34.5539, "lon": 76.1349},
    {"name": "Muzaffarabad", "state": "Jammu & Kashmir", "lat": 34.3700, "lon": 73.4711},
    {"name": "Gilgit", "state": "Ladakh", "lat": 35.9221, "lon": 74.3087},
    {"name": "Guwahati", "state": "Assam", "lat": 26.1445, "lon": 91.7362},
    {"name": "Kochi", "state": "Kerala", "lat": 9.9312, "lon": 76.2673},
    {"name": "Lucknow", "state": "Uttar Pradesh", "lat": 26.8467, "lon": 80.9462},
    {"name": "Shimla", "state": "Himachal Pradesh", "lat": 31.1048, "lon": 77.1734},
]


class WeatherDataHub:
    """
    Central Weather Data Hub.
    Single access point for all feature services.
    Manages provider ingestion, normalization, Redis live state, and resilient fallback.
    """

    def __init__(self, provider: Optional[BaseWeatherProvider] = None):
        self.provider: BaseWeatherProvider = provider or open_meteo_provider

    def set_provider(self, provider: BaseWeatherProvider):
        """Allows dynamic switching of the active upstream provider (Open-Meteo, IMD, GFS, WRF)."""
        self.provider = provider
        logger.info("Switched Weather Data Hub provider to: %s", provider.provider_name)

    # =========================================================================
    # Internal Access Interface (Used by Feature Services & Routes)
    # =========================================================================

    async def get_weather_for_city(self, city_name: str, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Retrieve normalized weather data for a city.
        Normally reads centralized Redis cache populated by background collector.
        If cache miss occurs, routes through the central ingestion pipeline.
        """
        clean_city = city_name.strip().lower()
        cache_key = f"weather:city:{clean_city}"

        if not force_refresh:
            cached = await cache.get(cache_key)
            if cached:
                return cached

        # Deduplication lock on ingestion
        lock = await _get_lock_for_key(cache_key)
        async with lock:
            if not force_refresh:
                re_cached = await cache.get(cache_key)
                if re_cached:
                    return re_cached

            return await self.ingest_city_weather(city_name)

    async def get_point_weather(self, lat: float, lon: float, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Retrieve normalized point weather for specific coordinates.
        """
        cache_key = f"weather:point:{round(lat, 4)}:{round(lon, 4)}"
        if not force_refresh:
            cached = await cache.get(cache_key)
            if cached:
                return cached

        lock = await _get_lock_for_key(cache_key)
        async with lock:
            if not force_refresh:
                re_cached = await cache.get(cache_key)
                if re_cached:
                    return re_cached

            return await self.ingest_point_weather(lat, lon)

    async def get_map_weather_dataset(self, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Retrieve complete normalized map weather dataset for all key monitored cities.
        """
        cache_key = "weather:map:cities"
        if not force_refresh:
            cached = await cache.get(cache_key)
            if cached:
                return cached

        lock = await _get_lock_for_key(cache_key)
        async with lock:
            if not force_refresh:
                re_cached = await cache.get(cache_key)
                if re_cached:
                    return re_cached

            return await self.ingest_map_weather()

    async def get_radar_metadata(self, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Retrieve cached RainViewer radar metadata & tile URL template.
        """
        cache_key = "radar:metadata:rainviewer"
        if not force_refresh:
            cached = await cache.get(cache_key)
            if cached:
                return cached

        lock = await _get_lock_for_key(cache_key)
        async with lock:
            if not force_refresh:
                re_cached = await cache.get(cache_key)
                if re_cached:
                    return re_cached

            return await self.ingest_radar_metadata()

    async def get_official_alerts(self, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Retrieve and cache official alerts from the IMD CAP feed.
        Caches the feed for 5 minutes (300 seconds).
        """
        cache_key = "weather:official_alerts:imd"
        if not force_refresh:
            cached = await cache.get(cache_key)
            if cached:
                return cached

        lock = await _get_lock_for_key(cache_key)
        async with lock:
            if not force_refresh:
                re_cached = await cache.get(cache_key)
                if re_cached:
                    return re_cached
            
            try:
                data = await imd_cap_provider.fetch_official_alerts()
                # Cache for 5 minutes (300s)
                await cache.set(cache_key, data, ttl=300)
                return data
            except Exception as exc:
                logger.error("❌ [HUB ERROR] Official alerts ingestion failed: %s", exc)
                return {"official_alerts_status": "unavailable", "reason": "fetch_error"}

    async def get_data_freshness(self, key: str) -> Dict[str, Any]:
        """Inspect freshness metadata for any dataset key."""
        data = await cache.get(key)
        if not data:
            return {"status": "missing", "key": key}
        return {
            "status": "fresh" if not data.get("stale") else "stale",
            "provider": data.get("provider", "unknown"),
            "fetchedAt": data.get("fetchedAt"),
            "observedAt": data.get("observedAt")
        }

    # =========================================================================
    # Central Ingestion & Normalization Pipelines
    # =========================================================================

    async def ingest_city_weather(self, city_name: str) -> Dict[str, Any]:
        """
        Master ingestion pipeline for a city:
        1. Query provider geocoding.
        2. Query provider forecast.
        3. Normalize into CanonicalWeatherDataset.
        4. Cache in Redis/Memory with TTL.
        """
        clean_city = city_name.strip().lower()
        cache_key = f"weather:city:{clean_city}"

        try:
            geo = await self.provider.geocode_city(city_name)
            if not geo:
                raise ValueError(f"Location '{city_name}' not found.")

            lat = float(geo["latitude"])
            lon = float(geo["longitude"])
            resolved_name = geo.get("name", city_name.title())
            admin1 = geo.get("admin1") or geo.get("country", "")
            country = geo.get("country", "")

            display_loc = f"{resolved_name}, {admin1}" if admin1 and admin1.lower() != resolved_name.lower() else resolved_name
            if country and country not in display_loc:
                display_loc = f"{display_loc}, {country}"

            raw_forecast = await self.provider.fetch_forecast(lat, lon)
            canonical = self._normalize_raw_to_canonical(
                raw=raw_forecast,
                city=resolved_name,
                region=admin1,
                country=country,
                display_loc=display_loc,
                lat=lat,
                lon=lon
            )

            result_dict = canonical.to_legacy_dict()
            await cache.set(cache_key, result_dict, ttl=TTL_CURRENT_WEATHER)
            logger.info("📥 [HUB INGESTED] Successfully normalized & cached weather for '%s'", resolved_name)
            return result_dict

        except Exception as exc:
            logger.error("❌ [HUB ERROR] Failed ingesting weather for '%s': %s", city_name, exc)
            stale = await cache.get_stale(cache_key)
            if stale:
                stale["stale"] = True
                return stale
            raise exc

    async def ingest_point_weather(self, lat: float, lon: float) -> Dict[str, Any]:
        """Ingest raw coordinate forecast into normalized point schema."""
        cache_key = f"weather:point:{round(lat, 4)}:{round(lon, 4)}"
        try:
            data = await self.provider.fetch_forecast(lat, lon)
            current = data.get("current", {})
            daily = data.get("daily", {})
            w_code = current.get("weather_code", 0)
            cond, icon = decode_weather_code(w_code)
            w_deg = current.get("wind_direction_10m", 0)

            daily_rain = daily.get("precipitation_probability_max", [20])
            rain_chance = daily_rain[0] if daily_rain else 20
            temp_c = round(current.get("temperature_2m", 25))
            press_c = round(current.get("pressure_msl", current.get("surface_pressure", 1013)))

            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
            result = {
                "latitude": lat,
                "longitude": lon,
                "temperature": temp_c,
                "feelsLike": round(current.get("apparent_temperature", temp_c)),
                "humidity": round(current.get("relative_humidity_2m", 60)),
                "precipitation": round(current.get("precipitation", 0.0), 1),
                "rain": round(current.get("rain", 0.0), 1),
                "rainChance": rain_chance,
                "weather_code": w_code,
                "condition": cond,
                "icon": icon,
                "cloudCover": round(current.get("cloud_cover", 40)),
                "windSpeed": round(current.get("wind_speed_10m", 12)),
                "windDirection": get_wind_direction_label(w_deg),
                "windDirectionDeg": w_deg,
                "pressure": press_c,
                "provider": self.provider.provider_name,
                "nwpSource": "gfs_seamless",
                "nwpModel": "NOAA GFS (Global Forecast System)",
                "modelSource": "gfs_seamless",
                "updatedAt": now_iso,
                "stale": False
            }

            await cache.set(cache_key, result, ttl=TTL_CURRENT_WEATHER)
            return result
        except Exception as exc:
            logger.error("❌ [HUB ERROR] Point ingestion failed for (%f, %f): %s", lat, lon, exc)
            stale = await cache.get_stale(cache_key)
            if stale:
                stale["stale"] = True
                return stale
            raise exc

    async def ingest_map_weather(self) -> Dict[str, Any]:
        """Ingest batch map weather dataset for all key monitored cities."""
        cache_key = "weather:map:cities"
        try:
            raw_data = await self.provider.fetch_batch_forecast(KEY_MAP_CITIES)
            data_list = raw_data if isinstance(raw_data, list) else [raw_data]

            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
            cities_list = []

            for i, meta in enumerate(KEY_MAP_CITIES):
                forecast = data_list[i] if i < len(data_list) else {}
                current = forecast.get("current", {})
                daily = forecast.get("daily", {})
                w_code = current.get("weather_code", 0)
                cond, icon = decode_weather_code(w_code)
                w_deg = current.get("wind_direction_10m", 0)

                rain_probs = daily.get("precipitation_probability_max", [20])
                rain_chance = rain_probs[0] if rain_probs else 20
                temp_c = round(current.get("temperature_2m", 25))
                precip_val = round(current.get("precipitation", 0.0), 1)
                wind_val = round(current.get("wind_speed_10m", 12))
                press_val = round(current.get("pressure_msl", current.get("surface_pressure", 1013)))

                has_severe_alert = False
                alert_severity = "normal"
                if w_code in [95, 96, 99] or precip_val >= 10.0 or rain_chance >= 75 or wind_val >= 38 or temp_c >= 37:
                    has_severe_alert = True
                    alert_severity = "severe" if (w_code != 99 and temp_c < 42 and wind_val < 60 and precip_val < 25) else "extreme"
                elif precip_val >= 2.0 or rain_chance >= 35 or wind_val >= 24 or temp_c >= 33:
                    alert_severity = "moderate"

                cities_list.append({
                    "name": meta["name"],
                    "state": meta["state"],
                    "latitude": meta["lat"],
                    "longitude": meta["lon"],
                    "temperature": temp_c,
                    "feelsLike": round(current.get("apparent_temperature", temp_c)),
                    "condition": cond,
                    "icon": icon,
                    "weather_code": w_code,
                    "rainChance": rain_chance,
                    "precipitation": precip_val,
                    "rain": round(current.get("rain", 0.0), 1),
                    "humidity": round(current.get("relative_humidity_2m", 60)),
                    "windSpeed": wind_val,
                    "windDirection": get_wind_direction_label(w_deg),
                    "windDirectionDeg": w_deg,
                    "cloudCover": round(current.get("cloud_cover", 40)),
                    "pressure": press_val,
                    "visibility": 10,
                    "hasAlert": has_severe_alert,
                    "alertSeverity": alert_severity,
                    "updatedAt": now_iso
                })

            result = {
                "cities": cities_list,
                "count": len(cities_list),
                "provider": self.provider.provider_name,
                "updatedAt": now_iso,
                "stale": False
            }

            await cache.set(cache_key, result, ttl=TTL_MAP_WEATHER)
            logger.info("🗺️ [HUB INGESTED] Map cities dataset updated (%d cities).", len(cities_list))
            return result

        except Exception as exc:
            logger.error("❌ [HUB ERROR] Map batch ingestion failed: %s", exc)
            stale = await cache.get_stale(cache_key)
            if stale:
                stale["stale"] = True
                return stale
            raise exc

    async def ingest_radar_metadata(self) -> Dict[str, Any]:
        """Ingest RainViewer radar imagery metadata."""
        cache_key = "radar:metadata:rainviewer"
        try:
            data = await fetch_radar_maps_raw()
            await cache.set(cache_key, data, ttl=TTL_RADAR_META)
            return data
        except Exception as exc:
            logger.error("❌ [HUB ERROR] Radar metadata ingestion failed: %s", exc)
            stale = await cache.get_stale(cache_key)
            if stale:
                return stale
            raise exc

    # =========================================================================
    # Schema Normalization Helper
    # =========================================================================

    def _normalize_raw_to_canonical(
        self,
        raw: Dict[str, Any],
        city: str,
        region: str,
        country: str,
        display_loc: str,
        lat: float,
        lon: float
    ) -> CanonicalWeatherDataset:
        """Parses upstream provider JSON into structured CanonicalWeatherDataset."""
        now_utc = datetime.datetime.now(datetime.timezone.utc)
        now_iso = now_utc.isoformat()

        curr_raw = raw.get("current", {})
        hourly_raw = raw.get("hourly", {})
        daily_raw = raw.get("daily", {})

        w_code = curr_raw.get("weather_code", 0)
        cond_text, icon_name = decode_weather_code(w_code)
        wind_deg = float(curr_raw.get("wind_direction_10m", 0.0))

        # 1. Location Meta
        loc_meta = CanonicalLocationMeta(
            city=city,
            display_location=display_loc,
            region=region,
            country=country,
            latitude=lat,
            longitude=lon
        )

        # Standard Sea Level Pressure preferred over raw elevation station pressure
        live_pressure = float(curr_raw.get("pressure_msl", curr_raw.get("surface_pressure", 1013.0)))

        # 2. Current Weather
        current_precip_prob = float(daily_raw.get("precipitation_probability_max", [20])[0]) if daily_raw.get("precipitation_probability_max") else 20.0
        current_weather = CanonicalCurrentWeather(
            temperature_c=float(curr_raw.get("temperature_2m", 25.0)),
            feels_like_c=float(curr_raw.get("apparent_temperature", curr_raw.get("temperature_2m", 25.0))),
            humidity_pct=float(curr_raw.get("relative_humidity_2m", 60.0)),
            dew_point_c=float(hourly_raw.get("dew_point_2m", [18.0])[0]) if hourly_raw.get("dew_point_2m") else None,
            precipitation_mm=float(curr_raw.get("precipitation", 0.0)),
            rain_mm=float(curr_raw.get("rain", 0.0)),
            precipitation_probability=current_precip_prob,
            rain_probability_pct=current_precip_prob,
            wind_speed_kmh=float(curr_raw.get("wind_speed_10m", 10.0)),
            wind_direction_deg=wind_deg,
            wind_direction_label=get_wind_direction_label(wind_deg),
            wind_gusts_kmh=float(curr_raw.get("wind_gusts_10m", curr_raw.get("wind_speed_10m", 10.0))),
            cloud_cover_pct=float(curr_raw.get("cloud_cover", 40.0)),
            pressure_hpa=live_pressure,
            visibility_km=float(hourly_raw.get("visibility", [10000.0])[0]) / 1000.0 if hourly_raw.get("visibility") else 10.0,
            uv_index=float(daily_raw.get("uv_index_max", [5.0])[0]) if daily_raw.get("uv_index_max") else 5.0,
            weather_code=w_code,
            condition=cond_text,
            icon=icon_name
        )

        # 3. Hourly Forecast (Next 24 hours starting from current local hour)
        hourly_times = hourly_raw.get("time", [])
        hourly_temps = hourly_raw.get("temperature_2m", [])
        hourly_feels = hourly_raw.get("apparent_temperature", [])
        hourly_codes = hourly_raw.get("weather_code", [])
        hourly_rains = hourly_raw.get("precipitation_probability", [])
        hourly_precips = hourly_raw.get("precipitation", [])
        hourly_winds = hourly_raw.get("wind_speed_10m", [])
        hourly_clouds = hourly_raw.get("cloud_cover", [])
        hourly_hums = hourly_raw.get("relative_humidity_2m", [])
        hourly_pressures = hourly_raw.get("pressure_msl") or hourly_raw.get("surface_pressure", [])
        hourly_visibilities = hourly_raw.get("visibility", [])
        hourly_uvs = hourly_raw.get("uv_index", [])

        # Find starting index corresponding to current local hour
        curr_time_str = str(curr_raw.get("time", ""))
        start_idx = 0
        if curr_time_str and hourly_times:
            curr_prefix = curr_time_str[:13]  # e.g. "2026-08-27T15"
            for idx, t_str in enumerate(hourly_times):
                if str(t_str).startswith(curr_prefix):
                    start_idx = idx
                    break
            else:
                for idx, t_str in enumerate(hourly_times):
                    if str(t_str) >= curr_time_str:
                        start_idx = max(0, idx)
                        break

        hourly_items = []
        end_idx = min(len(hourly_times), start_idx + 24)
        for offset, i in enumerate(range(start_idx, end_idx)):
            t_str = hourly_times[i]
            hour_val = int(t_str.split("T")[1].split(":")[0]) if "T" in str(t_str) else (i % 24)
            formatted_time = f"{hour_val:02d}:00"
            h_code = hourly_codes[i] if i < len(hourly_codes) else 0
            h_cond, h_icon = decode_weather_code(h_code)

            if offset == 0:
                # "Now" slot: guaranteed 100% meteorological consistency with current observation
                h_item_temp = current_weather.temperature_c
                h_item_feels = current_weather.feels_like_c
                h_item_hum = current_weather.humidity_pct
                h_item_wind = current_weather.wind_speed_kmh
                h_item_press = current_weather.pressure_hpa
                h_item_cond = current_weather.condition
                h_item_icon = current_weather.icon
                h_item_code = current_weather.weather_code
            else:
                h_item_temp = float(hourly_temps[i]) if i < len(hourly_temps) else current_weather.temperature_c
                h_item_feels = float(hourly_feels[i]) if i < len(hourly_feels) else current_weather.feels_like_c
                h_item_hum = float(hourly_hums[i]) if i < len(hourly_hums) else 60.0
                h_item_wind = float(hourly_winds[i]) if i < len(hourly_winds) else 10.0
                h_item_press = float(hourly_pressures[i]) if i < len(hourly_pressures) else current_weather.pressure_hpa
                h_item_cond = h_cond
                h_item_icon = h_icon
                h_item_code = h_code

            h_prob = float(hourly_rains[i]) if i < len(hourly_rains) else 0.0
            hourly_items.append(CanonicalHourlyItem(
                time=formatted_time,
                hour=hour_val,
                temperature_c=h_item_temp,
                feels_like_c=h_item_feels,
                humidity_pct=h_item_hum,
                precipitation_mm=float(hourly_precips[i]) if i < len(hourly_precips) else 0.0,
                precipitation_probability=h_prob,
                rain_probability_pct=h_prob,
                wind_speed_kmh=h_item_wind,
                wind_direction_label="N",
                cloud_cover_pct=float(hourly_clouds[i]) if i < len(hourly_clouds) else 40.0,
                pressure_hpa=h_item_press,
                visibility_km=float(hourly_visibilities[i]) / 1000.0 if i < len(hourly_visibilities) else 10.0,
                uv_index=float(hourly_uvs[i]) if i < len(hourly_uvs) else 0.0,
                weather_code=h_item_code,
                condition=h_item_cond,
                icon=h_item_icon
            ))

        # 4. Daily Forecast (7 Days)
        daily_times = daily_raw.get("time", [])
        daily_codes = daily_raw.get("weather_code", [])
        daily_tmax = daily_raw.get("temperature_2m_max", [])
        daily_tmin = daily_raw.get("temperature_2m_min", [])
        daily_rains = daily_raw.get("precipitation_probability_max", [])
        daily_precip_sums = daily_raw.get("precipitation_sum", [])
        daily_wind_max = daily_raw.get("wind_speed_10m_max", [])
        daily_gust_max = daily_raw.get("wind_gusts_10m_max", [])
        daily_uv_max = daily_raw.get("uv_index_max", [])
        daily_sunrises = daily_raw.get("sunrise", [])
        daily_sunsets = daily_raw.get("sunset", [])

        daily_items = []
        for i in range(min(7, len(daily_times))):
            date_str = daily_times[i]
            try:
                d_obj = datetime.date.fromisoformat(date_str)
                day_name = "Today" if i == 0 else d_obj.strftime("%a")
                formatted_date = d_obj.strftime("%b %d")
            except Exception:
                day_name = f"Day {i+1}"
                formatted_date = date_str

            d_code = daily_codes[i] if i < len(daily_codes) else 0
            d_cond, d_icon = decode_weather_code(d_code)
            d_rain_val = float(daily_rains[i]) if i < len(daily_rains) else 0.0

            daily_items.append(CanonicalDailyItem(
                day=day_name,
                date=formatted_date,
                date_iso=date_str,
                high_c=float(daily_tmax[i]) if i < len(daily_tmax) else current_weather.temperature_c,
                low_c=float(daily_tmin[i]) if i < len(daily_tmin) else current_weather.temperature_c - 5,
                condition=d_cond,
                icon=d_icon,
                weather_code=d_code,
                daily_precipitation_probability=d_rain_val,
                rain_probability_pct=d_rain_val,
                precipitation_sum_mm=float(daily_precip_sums[i]) if i < len(daily_precip_sums) else 0.0,
                wind_speed_max_kmh=float(daily_wind_max[i]) if i < len(daily_wind_max) else 15.0,
                wind_gusts_max_kmh=float(daily_gust_max[i]) if i < len(daily_gust_max) else 25.0,
                uv_index_max=float(daily_uv_max[i]) if i < len(daily_uv_max) else 5.0,
                sunrise=daily_sunrises[i].split("T")[1][:5] if i < len(daily_sunrises) and "T" in str(daily_sunrises[i]) else "06:00",
                sunset=daily_sunsets[i].split("T")[1][:5] if i < len(daily_sunsets) and "T" in str(daily_sunsets[i]) else "18:30"
            ))

        # Full multi-day hourly series for exact hour / time-range lookups
        full_hourly_series = []
        for i in range(len(hourly_times)):
            t_str = str(hourly_times[i])
            date_part = t_str.split("T")[0] if "T" in t_str else ""
            time_part = t_str.split("T")[1][:5] if "T" in t_str else f"{(i % 24):02d}:00"
            h_val = int(time_part.split(":")[0]) if ":" in time_part else (i % 24)
            h_code = hourly_codes[i] if i < len(hourly_codes) else 0
            h_cond, h_icon = decode_weather_code(h_code)
            h_prob_val = float(hourly_rains[i]) if i < len(hourly_rains) else 0.0

            full_hourly_series.append({
                "time_iso": t_str,
                "date": date_part,
                "time": time_part,
                "hour": h_val,
                "temperature_c": float(hourly_temps[i]) if i < len(hourly_temps) else current_weather.temperature_c,
                "feels_like_c": float(hourly_feels[i]) if i < len(hourly_feels) else current_weather.feels_like_c,
                "humidity_pct": float(hourly_hums[i]) if i < len(hourly_hums) else 60.0,
                "precipitation_mm": float(hourly_precips[i]) if i < len(hourly_precips) else 0.0,
                "precipitation_probability": h_prob_val,
                "rain_probability_pct": h_prob_val,
                "wind_speed_kmh": float(hourly_winds[i]) if i < len(hourly_winds) else 10.0,
                "cloud_cover_pct": float(hourly_clouds[i]) if i < len(hourly_clouds) else 40.0,
                "weather_code": h_code,
                "condition": h_cond,
                "icon": h_icon
            })

        # 5. Freshness Meta
        freshness_meta = CanonicalFreshnessMeta(
            provider=self.provider.provider_name,
            nwp_source="gfs_seamless",
            nwp_model="NOAA GFS (Global Forecast System)",
            fetched_at=now_iso,
            observed_at=curr_raw.get("time", now_iso),
            stale=False,
            ttl_seconds=TTL_CURRENT_WEATHER
        )

        return CanonicalWeatherDataset(
            location=loc_meta,
            current=current_weather,
            hourly=hourly_items,
            daily=daily_items,
            freshness=freshness_meta,
            hourly_series=full_hourly_series
        )

    async def compare_models(
        self,
        location: str,
        models: Optional[List[str]] = None,
        target_date_iso: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Retrieves and compares multi-model NWP forecast data across operational models.
        """
        from backend.app.services.providers.forecast_providers import (
            EcmwfIfsProvider,
            NoaaGfsProvider,
            DwdIconProvider,
            EcmwfAifsProvider,
            WeatherNext2Provider
        )

        loc_clean = location.strip()
        if not loc_clean:
            return {"error": "Location is required"}

        geo = await self.provider.geocode_city(loc_clean)
        if not geo:
            return {"error": f"Could not resolve location coordinates for '{loc_clean}'"}
        lat, lon = geo["latitude"], geo["longitude"]
        resolved_name = geo.get("name", loc_clean)

        if not target_date_iso:
            target_date_iso = datetime.date.today().isoformat()

        ALL_PROVIDERS = {
            "ecmwf_ifs": EcmwfIfsProvider(),
            "ecmwf": EcmwfIfsProvider(),
            "noaa_gfs": NoaaGfsProvider(),
            "gfs": NoaaGfsProvider(),
            "dwd_icon": DwdIconProvider(),
            "icon": DwdIconProvider(),
            "ecmwf_aifs": EcmwfAifsProvider(),
            "aifs": EcmwfAifsProvider(),
            "google_weathernext2": WeatherNext2Provider(),
            "weathernext": WeatherNext2Provider()
        }

        selected_providers = []
        if models and len(models) > 0:
            seen = set()
            for m in models:
                m_key = m.strip().lower().replace(" ", "_").replace("-", "_")
                provider = ALL_PROVIDERS.get(m_key)
                if not provider:
                    for k, p in ALL_PROVIDERS.items():
                        if k in m_key or m_key in k:
                            provider = p
                            break
                if provider and provider.model_id not in seen:
                    seen.add(provider.model_id)
                    selected_providers.append(provider)

        if not selected_providers:
            selected_providers = [EcmwfIfsProvider(), NoaaGfsProvider()]

        async def _fetch_and_normalize(provider):
            try:
                raw = await provider.fetch_forecast(resolved_name, lat, lon)
                normalized = provider.normalize(raw, resolved_name)
                return provider.model_id, provider.model_name, normalized, None
            except Exception as exc:
                logger.warning("Failed to fetch forecast from %s: %s", provider.model_name, exc)
                return provider.model_id, provider.model_name, [], str(exc)

        results = await asyncio.gather(*[_fetch_and_normalize(p) for p in selected_providers])

        models_data = []
        temps_high = []
        temps_low = []
        precips_total = []
        winds_max = []

        for model_id, model_name, values, err in results:
            if err or not values:
                models_data.append({
                    "model_id": model_id,
                    "model_name": model_name,
                    "status": "unavailable",
                    "error": err or "No forecast data returned"
                })
                continue

            day_values = [
                v for v in values
                if (
                    getattr(v["valid_time"], "isoformat", lambda: "")().startswith(target_date_iso)
                    or (hasattr(v["valid_time"], "strftime") and v["valid_time"].strftime("%Y-%m-%d") == target_date_iso)
                )
            ]

            if not day_values:
                day_values = values[:24]

            t_vals = [v["value"] for v in day_values if v["variable"] == "temperature" and v.get("representation", "deterministic") in ("deterministic", "ensemble_mean")]
            p_vals = [v["value"] for v in day_values if v["variable"] == "precipitation" and v.get("representation", "deterministic") in ("deterministic", "ensemble_mean")]
            w_vals = [v["value"] for v in day_values if v["variable"] == "wind_speed" and v.get("representation", "deterministic") in ("deterministic", "ensemble_mean")]

            high_c = round(max(t_vals), 1) if t_vals else None
            low_c = round(min(t_vals), 1) if t_vals else None
            avg_c = round(sum(t_vals) / len(t_vals), 1) if t_vals else None
            total_p_mm = round(sum(p_vals), 1) if p_vals else 0.0
            max_p_hourly = round(max(p_vals), 1) if p_vals else 0.0
            max_w_kmh = round(max(w_vals), 1) if w_vals else None

            if high_c is not None:
                temps_high.append(high_c)
            if low_c is not None:
                temps_low.append(low_c)
            if total_p_mm is not None:
                precips_total.append(total_p_mm)
            if max_w_kmh is not None:
                winds_max.append(max_w_kmh)

            time_samples = []
            for v in day_values:
                if v["variable"] == "temperature" and v.get("representation", "deterministic") in ("deterministic", "ensemble_mean"):
                    vt = v["valid_time"]
                    hr = vt.hour if hasattr(vt, "hour") else 0
                    if hr in [6, 12, 18, 21]:
                        time_samples.append({
                            "time": f"{hr:02d}:00 UTC",
                            "temperature_c": round(v["value"], 1)
                        })

            models_data.append({
                "model_id": model_id,
                "model_name": model_name,
                "status": "available",
                "temperature_high_c": high_c,
                "temperature_low_c": low_c,
                "temperature_avg_c": avg_c,
                "total_precipitation_mm": total_p_mm,
                "max_hourly_precipitation_mm": max_p_hourly,
                "rain_expected": total_p_mm > 0.1,
                "max_wind_speed_kmh": max_w_kmh,
                "samples": time_samples
            })

        available_models = [m for m in models_data if m["status"] == "available"]
        if len(available_models) < 2:
            return {
                "location": resolved_name,
                "target_date": target_date_iso,
                "models_count": len(available_models),
                "models": models_data,
                "agreement_level": "insufficient_data",
                "divergence_summary": "Insufficient operational models returned data for a side-by-side comparison.",
                "source": "open_meteo"
            }

        delta_temp_high = round(max(temps_high) - min(temps_high), 1) if len(temps_high) >= 2 else 0.0
        delta_precip = round(max(precips_total) - min(precips_total), 1) if len(precips_total) >= 2 else 0.0

        consensus_high = round(sum(temps_high) / len(temps_high), 1) if temps_high else None
        consensus_low = round(sum(temps_low) / len(temps_low), 1) if temps_low else None
        consensus_precip = round(sum(precips_total) / len(precips_total), 1) if precips_total else 0.0

        if delta_temp_high <= 1.5 and delta_precip <= 2.0:
            agreement_level = "High Agreement"
            summary_text = (
                f"Strong consensus between models for {resolved_name} on {target_date_iso}. "
                f"Forecasted high temperatures agree within {delta_temp_high}°C "
                f"(Consensus High: {consensus_high}°C, Low: {consensus_low}°C). "
                f"Precipitation expectations are consistent (~{consensus_precip} mm)."
            )
        elif delta_temp_high <= 3.0 and delta_precip <= 6.0:
            agreement_level = "Moderate Agreement"
            summary_text = (
                f"Moderate agreement with slight divergence. "
                f"High temperature spread is {delta_temp_high}°C (Consensus High: {consensus_high}°C). "
                f"Precipitation divergence is {delta_precip} mm."
            )
        else:
            agreement_level = "Divergent"
            summary_text = (
                f"Significant divergence between forecast models. "
                f"High temperature differs by {delta_temp_high}°C, and precipitation estimates differ by {delta_precip} mm."
            )

        return {
            "location": resolved_name,
            "target_date": target_date_iso,
            "models_count": len(available_models),
            "agreement_level": agreement_level,
            "divergence_summary": summary_text,
            "temperature_consensus": {
                "consensus_high_c": consensus_high,
                "consensus_low_c": consensus_low,
                "spread_high_c": delta_temp_high
            },
            "precipitation_consensus": {
                "consensus_total_mm": consensus_precip,
                "spread_mm": delta_precip
            },
            "models": models_data,
            "source": "open_meteo"
        }


# Singleton Instance of Central Weather Data Hub
weather_hub = WeatherDataHub(open_meteo_provider)
