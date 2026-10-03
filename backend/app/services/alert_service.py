import datetime
import logging
from typing import Dict, Any, List, Optional

from backend.app.core.config import TTL_ALERTS
from backend.app.core.cache import cache
from backend.app.services.alert_engine import SkycastRiskEngine
from backend.app.services.weather_hub import weather_hub, KEY_MAP_CITIES

logger = logging.getLogger("skycast.alert_service")

class AlertDetectionService:
    """
    Centralized Alert Aggregation & Routing Engine.
    Evaluates weather risks using the SkycastRiskEngine (based on published IMD warning criteria)
    strictly over data delivered by the Central Weather Data Hub.
    """

    async def get_alerts_for_location(
        self,
        lat: float,
        lon: float,
        city_name: str,
        weather_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Retrieves unified Skycast weather risks for a location.
        """
        clean_city = city_name.strip().lower()
        cache_key = f"alerts:city:{clean_city}"

        cached = await cache.get(cache_key)
        if cached is not None and isinstance(cached, dict) and "alerts" in cached:
            return cached

        if not weather_data:
            weather_data = await weather_hub.get_weather_for_city(city_name)

        result = SkycastRiskEngine.evaluate_all_risks(
            weather_data=weather_data,
            city_name=city_name,
            display_location=weather_data.get("displayLocation", city_name)
        )

        official_data = await weather_hub.get_official_alerts()
        official_alerts_list = []
        has_official = False
        feed_status = official_data.get("official_alerts_status", "unavailable")

        if feed_status == "ready":
            loc_admin1 = ""
            if "location" in weather_data and isinstance(weather_data["location"], dict):
                loc_admin1 = weather_data["location"].get("region", "").lower()
            if not loc_admin1:
                loc_admin1 = weather_data.get("state", "").lower()

            for alert in official_data.get("alerts", []):
                areas_lower = [a.lower() for a in alert.get("areas", [])]
                desc_lower = alert.get("description", "").lower()

                match_level = "none"
                if clean_city and (clean_city in desc_lower or clean_city in areas_lower):
                    match_level = "city"
                elif loc_admin1 and (loc_admin1 in desc_lower or loc_admin1 in areas_lower):
                    # It's a state match, check if it specifies another known city instead
                    other_cities = [
                        c["name"].lower() for c in KEY_MAP_CITIES 
                        if c["state"].lower() == loc_admin1 and c["name"].lower() != clean_city
                    ]
                    if any(c in desc_lower for c in other_cities):
                        match_level = "none" # Unrelated city in the same state
                    else:
                        match_level = "state"

                if match_level != "none":
                    alert_copy = dict(alert)
                    alert_copy["location_match_level"] = match_level
                    official_alerts_list.append(alert_copy)
                    has_official = True

        disclaimer = "Skycast weather risks are derived from open numerical weather data based on published IMD warning criteria. They are NOT official IMD warnings."
        if has_official:
            disclaimer = "Includes active official IMD/government warnings. Skycast risks are supplemental."
        elif feed_status != "ready":
            disclaimer = "Official alert feed is currently unavailable. Showing supplemental Skycast risks only."

        has_official_flag = has_official if feed_status == "ready" else None

        # Standardize outer response schema for REST & WebSocket consumers
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        payload = {
            "city": city_name,
            "displayLocation": result.get("displayLocation", city_name),
            "locationProfile": result.get("locationProfile", "normal"),
            "highestRiskColour": result.get("highestRiskColour", "green"),
            "highestRiskAction": result.get("highestRiskAction", "No Action"),
            "hasHazard": result.get("hasHazard", False),
            "hasOfficialAlert": has_official_flag,
            "officialAlerts": official_alerts_list,
            "official_alerts_status": feed_status,
            "alerts": result.get("alerts", []),
            "upcomingRisks": result.get("upcomingRisks", []),
            "count": len(result.get("alerts", [])),
            "updatedAt": now_iso,
            "source": "skycast",
            "official": has_official,
            "disclaimer": disclaimer
        }

        await cache.set(cache_key, payload, ttl=TTL_ALERTS)
        return payload

    @staticmethod
    def detect_alerts(
        weather_data: Dict[str, Any],
        city_name: str,
        display_loc: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Static helper returning evaluated Skycast risk alerts for weather normalization."""
        res = SkycastRiskEngine.evaluate_all_risks(weather_data, city_name, display_loc)
        return res.get("alerts", [])

    async def process_and_store_alerts(
        self,
        city_name: str,
        weather_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Processes and caches Skycast risk alerts during collector cycles, and persists state transitions."""
        lat = weather_data.get("latitude", 18.52)
        lon = weather_data.get("longitude", 73.85)
        
        result = await self.get_alerts_for_location(lat, lon, city_name, weather_data)
        
        # Persist to database and compute transitions
        transitions = await self._persist_active_alerts(city_name, result.get("alerts", []))
        result["transitions"] = transitions
        
        return result

    async def _persist_active_alerts(self, city_name: str, alerts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        from backend.app.core.database import async_session_factory
        from backend.app.models.core import ActiveAlert
        from sqlalchemy import select
        
        clean_city = city_name.strip().lower()
        transitions = []
        
        try:
            async with async_session_factory() as session:
                stmt = select(ActiveAlert).where(ActiveAlert.city == clean_city, ActiveAlert.is_active == True)
                res = await session.execute(stmt)
                existing_alerts = {a.hazard: a for a in res.scalars().all()}
                
                incoming_hazards = {}
                for a in alerts:
                    hazard = a.get("event") or a.get("hazardClassification", "unknown")
                    incoming_hazards[hazard] = a
                
                now_utc = datetime.datetime.now(datetime.timezone.utc)
                
                # 1. Resolve alerts that are no longer active
                for h, ea in existing_alerts.items():
                    if h not in incoming_hazards:
                        ea.is_active = False
                        ea.valid_until = now_utc
                        transitions.append({
                            "type": "alert.resolved",
                            "city": city_name,
                            "alert": {"hazard": h, "tier": ea.tier, "resolved_at": now_utc.isoformat()}
                        })
                
                # 2. Add or update new alerts
                for h, a in incoming_hazards.items():
                    tier = a.get("severity", "green").lower()
                    if h in existing_alerts:
                        ea = existing_alerts[h]
                        if ea.tier != tier:
                            # State transition: old one inactive, new one active
                            ea.is_active = False
                            ea.valid_until = now_utc
                            
                            new_alert = ActiveAlert(
                                city=clean_city,
                                hazard=h,
                                tier=tier,
                                description=a.get("description", ""),
                                source="skycast",
                                is_active=True
                            )
                            session.add(new_alert)
                            transitions.append({
                                "type": "alert.updated",
                                "city": city_name,
                                "alert": {"hazard": h, "old_tier": ea.tier, "new_tier": tier, "description": new_alert.description}
                            })
                    else:
                        new_alert = ActiveAlert(
                            city=clean_city,
                            hazard=h,
                            tier=tier,
                            description=a.get("description", ""),
                            source="skycast",
                            is_active=True
                        )
                        session.add(new_alert)
                        transitions.append({
                            "type": "alert.created",
                            "city": city_name,
                            "alert": {"hazard": h, "tier": tier, "description": new_alert.description}
                        })
                
                await session.commit()
                return transitions
        except Exception as exc:
            logger.error("Failed to persist alerts for %s: %s", city_name, exc)
            return []

    async def get_alerts_for_city(self, city_name: str, weather: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Fetches alerts for a city by checking cache or resolving weather data."""
        if not weather:
            weather = await weather_hub.get_weather_for_city(city_name)
        lat = weather.get("latitude", 18.52)
        lon = weather.get("longitude", 73.85)
        return await self.get_alerts_for_location(lat, lon, city_name, weather)

    async def get_all_active_alerts(self) -> Dict[str, Any]:
        """Fetches aggregated active alerts across primary cities from Redis."""
        cache_key = "alerts:all"
        cached = await cache.get(cache_key)
        if cached is not None and isinstance(cached, dict) and "alerts" in cached:
            return cached

        all_alerts: List[Dict[str, Any]] = []

        try:
            map_data = await weather_hub.get_map_weather_dataset()
            for city_obj in map_data.get("cities", []):
                c_name = city_obj["name"]
                c_lat = city_obj.get("latitude", 18.52)
                c_lon = city_obj.get("longitude", 73.85)
                res = await self.get_alerts_for_location(c_lat, c_lon, c_name, city_obj)
                # Keep active hazardous risks (Yellow, Orange, Red)
                active_only = [
                    a for a in res.get("alerts", [])
                    if a.get("riskColour") in ["yellow", "orange", "red"]
                ]
                all_alerts.extend(active_only)
        except Exception as exc:
            logger.warning("Error computing aggregated alerts: %s", exc)

        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        result = {
            "alerts": all_alerts,
            "count": len(all_alerts),
            "updatedAt": now_iso,
            "stale": False,
            "source": "skycast",
            "official": False
        }

        await cache.set(cache_key, result, ttl=TTL_ALERTS)
        return result

alert_service = AlertDetectionService()
