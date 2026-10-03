import asyncio
import logging
from typing import Optional
from backend.app.core.config import COLLECTOR_POLL_INTERVAL, ENABLE_BACKGROUND_POLLING
from backend.app.core.websocket import ws_manager
from backend.app.services.weather_hub import weather_hub
from backend.app.services.alert_service import alert_service
from backend.app.services.history_service import HistoryService


logger = logging.getLogger("skycast.collector")

PRIMARY_HUB_CITIES = ["Pune", "Mumbai", "New Delhi", "Bengaluru", "Chennai", "Kolkata", "Hyderabad", "Ahmedabad", "Jaipur", "Srinagar"]


class WeatherCollectorWorker:
    """
    Autonomous background worker that operates the Central Weather Data Hub's ingestion cycles,
    maintains normalized live state in Redis, persists historical snapshots to PostgreSQL,
    and broadcasts live update events via WebSockets.
    """

    def __init__(self):
        self._is_running = False
        self._task: Optional[asyncio.Task] = None

    def start(self):
        if not ENABLE_BACKGROUND_POLLING:
            logger.info("⚙️ [COLLECTOR] Background API polling disabled (On-Demand Redis Caching Active).")
            return

        if not self._is_running:
            self._is_running = True
            self._task = asyncio.create_task(self._run_loop())
            logger.info("⚙️ [COLLECTOR] Background weather collector worker started (poll interval: %ds).", COLLECTOR_POLL_INTERVAL)

    def stop(self):
        self._is_running = False
        if self._task and not self._task.done():
            self._task.cancel()
            logger.info("⚙️ [COLLECTOR] Background weather collector worker stopped.")

    async def _run_loop(self):
        # Initial warm-up delay so server completes startup
        await asyncio.sleep(2)

        # Pre-warm Central Weather Data Hub on server boot
        await self._collect_cycle()

        while self._is_running:
            try:
                await asyncio.sleep(COLLECTOR_POLL_INTERVAL)
                await self._collect_cycle()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("⚠️ [COLLECTOR] Error during collection cycle: %s", exc)

    async def _collect_cycle(self):
        logger.info("🔄 [COLLECTOR] Running autonomous Central Weather Data Hub ingestion cycle...")

        # 1. Ingest & Refresh Map Weather dataset
        try:
            map_data = await weather_hub.ingest_map_weather()
            logger.info("🗺️ [COLLECTOR] Map cities dataset refreshed (%d cities).", map_data.get("count", 0))
        except Exception as e:
            logger.warning("Map dataset ingestion error: %s", e)

        # 2. Ingest & Refresh Radar Metadata & Broadcast if updated
        try:
            radar_data = await weather_hub.ingest_radar_metadata()
            await ws_manager.broadcast_radar_update(radar_data)
        except Exception as e:
            logger.warning("Radar metadata ingestion error: %s", e)

        # 3. Ingest primary hub cities, process IMD risks, persist PostgreSQL history, and broadcast
        for city_name in PRIMARY_HUB_CITIES:
            try:
                c_data = await weather_hub.ingest_city_weather(city_name)
                alerts_res = await alert_service.process_and_store_alerts(city_name, c_data)
                alerts = alerts_res.get("alerts", [])

                # Persist historical observation snapshot to PostgreSQL (with 15m smart deduplication)
                snapshot = await HistoryService.record_snapshot(city_name, c_data, alerts_res)
                if snapshot:
                    logger.debug("💾 [COLLECTOR] Snapshot persisted for %s (temp: %.1f°C, risk: %s)", city_name, snapshot.temperature_c, snapshot.skycast_risk_level)

                # Broadcast live weather push update to active subscribers
                await ws_manager.broadcast_weather_update(city_name, c_data)

                # Broadcast active meteorological warnings
                transitions = alerts_res.get("transitions", [])
                for transition in transitions:
                    # Transition contains type (alert.created, etc), city, and alert payload
                    await ws_manager.broadcast(transition)
                    
                for alert in alerts:
                    # Continue broadcasting official IMD warnings if present (as they bypass the RiskEngine persistence in this flow)
                    if alert.get("official") is True:
                        await ws_manager.broadcast({
                            "type": "official_weather_alert",
                            "city": city_name,
                            "authority": alert.get("authority"),
                            "alert": alert,
                            "timestamp": alert.get("fetchedAt")
                        })
                # 3b. Evaluate persistent weather monitors for this city
                try:
                    from backend.app.services.monitor_engine import MonitorEvaluationEngine
                    await MonitorEvaluationEngine.evaluate_location(city_name, c_data)
                except Exception as e:
                    logger.warning("Monitor evaluation for '%s' error: %s", city_name, e)
            except Exception as e:
                logger.warning("Collector city '%s' ingestion error: %s", city_name, e)

        # 4. Evaluate any remaining user-monitored locations outside primary hub cities
        try:
            from backend.app.services.monitor_engine import MonitorEvaluationEngine
            await MonitorEvaluationEngine.evaluate_all_active_locations()
        except Exception as e:
            logger.debug("Additional monitor locations evaluation error: %s", e)

        # 5. Periodic 30-day snapshot retention cleanup
        try:
            await HistoryService.cleanup_old_snapshots(retention_days=30)
        except Exception as e:
            logger.debug("Retention cleanup note: %s", e)


collector_worker = WeatherCollectorWorker()
