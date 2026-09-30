import asyncio
import logging
import datetime
from sqlalchemy.future import select
from sqlalchemy.exc import IntegrityError
from backend.app.core.database import async_session_factory
from backend.app.core.model_registry import MODEL_REGISTRY
from backend.app.services.providers.forecast_providers import (
    ForecastProvider,
    EcmwfIfsProvider,
    EcmwfAifsProvider,
    NoaaGfsProvider,
    DwdIconProvider,
    WeatherNext2Provider
)
from backend.app.models.forecast import ForecastRun, ForecastValue

logger = logging.getLogger("skycast.forecast_ingestion")

# V1: Configurable list of locations (matches live collector for now, but independent)
# Future: Read from DB Locations
INGESTION_LOCATIONS = [
    {"name": "Pune", "lat": 18.5204, "lon": 73.8567},
    {"name": "Mumbai", "lat": 19.0760, "lon": 72.8777},
    {"name": "New Delhi", "lat": 28.6139, "lon": 77.2090},
    {"name": "Bengaluru", "lat": 12.9716, "lon": 77.5946},
    {"name": "Chennai", "lat": 13.0827, "lon": 80.2707},
]

INGESTION_INTERVAL_SECONDS = 3600 * 2  # Run every 2 hours

class ForecastIngestionService:
    def __init__(self):
        self.providers: list[ForecastProvider] = [
            EcmwfIfsProvider(),
            EcmwfAifsProvider(),
            NoaaGfsProvider(),
            DwdIconProvider(),
            WeatherNext2Provider()
        ]

    async def run_ingestion_cycle(self):
        logger.info("Starting forecast ingestion cycle...")
        start_time = datetime.datetime.now(datetime.timezone.utc)
        
        # Determine operational providers from the registry
        operational_providers = [
            p for p in self.providers 
            if MODEL_REGISTRY.get(p.model_id, {}).get("availability") == "operational"
        ]
        
        # Parallelize fetching across locations and providers
        tasks = []
        for loc in INGESTION_LOCATIONS:
            for provider in operational_providers:
                tasks.append(self._fetch_and_store(provider, loc))
                
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Logging Observability
        success_count = 0
        failure_count = 0
        for r in results:
            if isinstance(r, Exception):
                logger.error("⚠️ [ForecastIngestion] Unhandled exception: %s", r)
                failure_count += 1
            elif r is True:
                success_count += 1
            else:
                failure_count += 1
                
        duration = (datetime.datetime.now(datetime.timezone.utc) - start_time).total_seconds()
        logger.info(f"✅ [ForecastIngestion] Completed in {duration:.1f}s. Success: {success_count}, Failed: {failure_count}")

    async def ingest_location(self, loc_name: str, lat: float = None, lon: float = None) -> bool:
        """
        On-demand multi-model forecast ingestion for a single location.
        """
        loc_clean = loc_name.strip()
        if lat is None or lon is None:
            # 1. Match configured locations (case-insensitive)
            match = next((loc for loc in INGESTION_LOCATIONS if loc["name"].lower() == loc_clean.lower()), None)
            if match:
                lat = match["lat"]
                lon = match["lon"]
                loc_clean = match["name"]
            else:
                # 2. Geocode city dynamically
                from backend.app.services.providers.open_meteo import open_meteo_provider
                try:
                    geo = await open_meteo_provider.geocode_city(loc_clean)
                    if geo and "lat" in geo and "lon" in geo:
                        lat = geo["lat"]
                        lon = geo["lon"]
                        loc_clean = geo.get("name", loc_clean)
                    else:
                        logger.warning("⚠️ [ForecastIngestion] Geocoding failed for '%s'.", loc_name)
                        return False
                except Exception as exc:
                    logger.warning("⚠️ [ForecastIngestion] Geocode error for '%s': %s", loc_name, exc)
                    return False

        loc_dict = {"name": loc_clean, "lat": lat, "lon": lon}
        operational_providers = [
            p for p in self.providers 
            if MODEL_REGISTRY.get(p.model_id, {}).get("availability") == "operational"
        ]
        
        logger.info("⚡ [ForecastIngestion] Running on-demand multi-model ingestion for %s (%.4f, %.4f)...", loc_clean, lat, lon)
        tasks = [self._fetch_and_store(p, loc_dict) for p in operational_providers]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        return any(isinstance(r, tuple) and r[0] is True for r in results)

    async def ingest_location_and_build(self, loc_name: str, lat: float = None, lon: float = None) -> dict:
        """
        On-demand multi-model forecast ingestion for a single location,
        returning the complete structured forecast intelligence payload and caching it.
        """
        from types import SimpleNamespace
        from backend.app.services.forecast_analytics import ForecastAnalytics
        from backend.app.core.cache import cache

        loc_clean = loc_name.strip()
        if lat is None or lon is None:
            match = next((loc for loc in INGESTION_LOCATIONS if loc["name"].lower() == loc_clean.lower()), None)
            if match:
                lat = match["lat"]
                lon = match["lon"]
                loc_clean = match["name"]
            else:
                from backend.app.services.providers.open_meteo import open_meteo_provider
                try:
                    geo = await open_meteo_provider.geocode_city(loc_clean)
                    if geo and "lat" in geo and "lon" in geo:
                        lat = geo["lat"]
                        lon = geo["lon"]
                        loc_clean = geo.get("name", loc_clean)
                    else:
                        logger.warning("⚠️ [ForecastIngestion] Geocoding failed for '%s'.", loc_name)
                        return {"location": loc_clean, "horizon_days": 7, "models": [], "analytics": {}}
                except Exception as exc:
                    logger.warning("⚠️ [ForecastIngestion] Geocode error for '%s': %s", loc_name, exc)
                    return {"location": loc_clean, "horizon_days": 7, "models": [], "analytics": {}}

        loc_dict = {"name": loc_clean, "lat": lat, "lon": lon}
        operational_providers = [
            p for p in self.providers 
            if MODEL_REGISTRY.get(p.model_id, {}).get("availability") == "operational"
        ]
        
        logger.info("⚡ [ForecastIngestion] Running on-demand multi-model ingestion for %s (%.4f, %.4f)...", loc_clean, lat, lon)
        fetch_results = await asyncio.gather(*[self._fetch_and_store(p, loc_dict) for p in operational_providers], return_exceptions=True)
        
        runs_map = {}
        for res in fetch_results:
            if isinstance(res, tuple) and res[0] and res[1]:
                item = res[1]
                runs_map[item["model_id"]] = item

        response_models = []
        analytic_runs = []
        now = datetime.datetime.now(datetime.timezone.utc)

        for model_id, meta in MODEL_REGISTRY.items():
            if meta.get("availability") != "operational":
                continue
                
            run_data = runs_map.get(model_id)
            if not run_data:
                response_models.append({
                    "id": meta["id"],
                    "name": meta["name"],
                    "methodology": meta.get("methodology"),
                    "forecast_type": meta.get("forecast_type"),
                    "how_it_forecasts": meta.get("how_it_forecasts"),
                    "status": "unavailable",
                    "forecast": []
                })
                continue

            vals_norm = run_data["values"]
            run_time = run_data["run_time"]
            fetched_at = run_data["fetched_at"]
            age_minutes = int((now - fetched_at).total_seconds() / 60)
            is_stale = age_minutes > (meta.get("update_cadence_hours", 6) * 60 + 120)

            formatted_forecast = [
                {
                    "valid_time": v["valid_time"].isoformat() if isinstance(v["valid_time"], datetime.datetime) else str(v["valid_time"]),
                    "lead_hours": v["lead_hours"],
                    "variable": v["variable"],
                    "representation": v.get("representation", "deterministic"),
                    "value": v["value"],
                    "unit": v["unit"]
                }
                for v in vals_norm
            ]

            response_models.append({
                "id": meta["id"],
                "name": meta["name"],
                "methodology": meta.get("methodology"),
                "forecast_type": meta.get("forecast_type"),
                "how_it_forecasts": meta.get("how_it_forecasts"),
                "run_time": run_time.isoformat(),
                "fetched_at": fetched_at.isoformat(),
                "age_minutes": age_minutes,
                "status": "stale" if is_stale else "fresh",
                "forecast": formatted_forecast
            })

            # Create lightweight run object for ForecastAnalytics
            analytic_vals = [
                SimpleNamespace(
                    valid_time=v["valid_time"] if isinstance(v["valid_time"], datetime.datetime) else datetime.datetime.fromisoformat(str(v["valid_time"])),
                    lead_hours=v["lead_hours"],
                    variable=v["variable"],
                    value=v["value"],
                    unit=v["unit"],
                    representation=v.get("representation", "deterministic")
                )
                for v in vals_norm
            ]
            analytic_runs.append(SimpleNamespace(
                model_id=model_id,
                location_name=loc_clean,
                run_time=run_time,
                fetched_at=fetched_at,
                values=analytic_vals
            ))

        analytics_data = {}
        if analytic_runs:
            analytics_data = ForecastAnalytics.analyze(analytic_runs)

        payload = {
            "location": loc_clean,
            "horizon_days": 7,
            "models": response_models,
            "analytics": analytics_data
        }

        # Cache for 2 hours (7200s)
        await cache.set(f"forecast_intelligence:{loc_clean.lower()}", payload, ttl=7200)
        return payload

    async def _fetch_and_store(self, provider: ForecastProvider, loc: dict) -> tuple:
        loc_name = loc["name"]
        model_id = provider.model_id
        
        try:
            raw_data = await provider.fetch_forecast(loc_name, loc["lat"], loc["lon"])
        except Exception as e:
            logger.error("❌ [ForecastIngestion] %s failed to fetch for %s: %s", model_id, loc_name, e)
            await self._record_failure(model_id, loc_name, str(e))
            return False, None

        try:
            normalized_data = provider.normalize(raw_data, loc_name)
            if not normalized_data:
                logger.warning("⚠️ [ForecastIngestion] %s returned no data for %s", model_id, loc_name)
                return False, None
                
            first_dt = normalized_data[0]["valid_time"]
            run_time = first_dt.replace(hour=(first_dt.hour // 6) * 6, minute=0, second=0, microsecond=0)
            now = datetime.datetime.now(datetime.timezone.utc)
            
            await self._persist_forecast(model_id, loc_name, run_time, normalized_data)
            logger.info("✓ [ForecastIngestion] %s for %s processed (%d values)", model_id, loc_name, len(normalized_data))
            return True, {
                "model_id": model_id,
                "location_name": loc_name,
                "run_time": run_time,
                "fetched_at": now,
                "values": normalized_data
            }
        except Exception as e:
            logger.error("❌ [ForecastIngestion] %s failed to process for %s: %s", model_id, loc_name, e)
            await self._record_failure(model_id, loc_name, str(e))
            return False, None

    async def _persist_forecast(self, model_id: str, loc_name: str, run_time: datetime.datetime, values: list):
        from backend.app.core.database import is_db_available
        if not is_db_available():
            logger.debug("ℹ️ [ForecastIngestion] Database offline, skipping SQL persist for %s %s", model_id, loc_name)
            return

        async with async_session_factory() as session:
            try:
                # 1. Check if ForecastRun already exists (idempotency)
                stmt = select(ForecastRun).where(
                    ForecastRun.model_id == model_id,
                    ForecastRun.location_name == loc_name,
                    ForecastRun.run_time == run_time
                )
                result = await session.execute(stmt)
                existing_run = result.scalar_one_or_none()
                
                if existing_run:
                    if existing_run.status == "success":
                        logger.debug("⏭️ [ForecastIngestion] %s for %s at %s already exists. Skipping.", model_id, loc_name, run_time)
                        return
                    else:
                        existing_run.status = "success"
                        existing_run.fetched_at = datetime.datetime.now(datetime.timezone.utc)
                        run = existing_run
                else:
                    # 2. Create ForecastRun
                    run = ForecastRun(
                        model_id=model_id,
                        location_name=loc_name,
                        run_time=run_time,
                        status="success"
                    )
                    session.add(run)
                    await session.flush() # Get run.id
                
                # 3. Bulk insert ForecastValues
                db_values = [
                    ForecastValue(
                        forecast_run_id=run.id,
                        valid_time=v["valid_time"],
                        lead_hours=v["lead_hours"],
                        variable=v["variable"],
                        representation=v.get("representation", "deterministic"),
                        value=v["value"],
                        unit=v["unit"]
                    )
                    for v in values
                ]
                
                session.add_all(db_values)
                await session.commit()
            except IntegrityError as e:
                await session.rollback()
                logger.warning("⚠️ [ForecastIngestion] Integrity error (duplicate?) for %s %s: %s", model_id, loc_name, str(e.__cause__))
            except Exception as e:
                await session.rollback()
                logger.warning("⚠️ [ForecastIngestion] Database persistence failed for %s %s: %s", model_id, loc_name, e)

    async def _record_failure(self, model_id: str, loc_name: str, error_msg: str):
        from backend.app.core.database import is_db_available
        if not is_db_available():
            return

        run_time = datetime.datetime.now(datetime.timezone.utc)
        run_time = run_time.replace(minute=0, second=0, microsecond=0)
        
        async with async_session_factory() as session:
            try:
                # Check if we already recorded a failure for this hour
                stmt = select(ForecastRun).where(
                    ForecastRun.model_id == model_id,
                    ForecastRun.location_name == loc_name,
                    ForecastRun.run_time == run_time
                )
                result = await session.execute(stmt)
                if result.scalar_one_or_none():
                    return
                    
                run = ForecastRun(
                    model_id=model_id,
                    location_name=loc_name,
                    run_time=run_time,
                    status="failed"
                )
                session.add(run)
                await session.commit()
            except Exception:
                await session.rollback()


forecast_ingestion_service = ForecastIngestionService()


class ForecastIngestionWorker:
    """
    Autonomous background worker for Forecast Intelligence, decoupled from live collector.
    """
    def __init__(self):
        self._is_running = False
        self._task = None
        self.service = forecast_ingestion_service

    def start(self):
        from backend.app.core.config import ENABLE_BACKGROUND_POLLING
        if not ENABLE_BACKGROUND_POLLING:
            logger.info("⚙️ [ForecastIngestionWorker] Background forecast ingestion polling disabled (On-Demand Active).")
            return

        if not self._is_running:
            self._is_running = True
            self._task = asyncio.create_task(self._run_loop())
            logger.info("⚙️ [ForecastIngestionWorker] Started (interval: %ds).", INGESTION_INTERVAL_SECONDS)

    def stop(self):
        self._is_running = False
        if self._task and not self._task.done():
            self._task.cancel()
            logger.info("⚙️ [ForecastIngestionWorker] Stopped.")

    async def _run_loop(self):
        await asyncio.sleep(5) # Delay start to not compete with main startup
        
        while self._is_running:
            try:
                await self.service.run_ingestion_cycle()
                await asyncio.sleep(INGESTION_INTERVAL_SECONDS)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("⚠️ [ForecastIngestionWorker] Fatal error in loop: %s", exc)
                await asyncio.sleep(60) # Backoff

forecast_ingestion_worker = ForecastIngestionWorker()
