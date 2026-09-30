from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import func
from backend.app.core.database import get_db_session
from backend.app.models.forecast import ForecastRun
from backend.app.core.model_registry import MODEL_REGISTRY
import datetime
import logging

logger = logging.getLogger("skycast.forecast_intelligence")

router = APIRouter(
    prefix="/api/forecast-intelligence",
    tags=["Forecast Intelligence"]
)

async def _fetch_runs_for_location(location: str, db: AsyncSession) -> Dict[str, ForecastRun]:
    runs = {}
    loc_clean = location.strip().lower()
    operational_ids = [m for m, meta in MODEL_REGISTRY.items() if meta.get("availability") == "operational"]
    try:
        stmt = select(ForecastRun).where(
            ForecastRun.model_id.in_(operational_ids),
            func.lower(ForecastRun.location_name) == loc_clean,
            ForecastRun.status == "success"
        ).order_by(ForecastRun.run_time.desc()).options(selectinload(ForecastRun.values))
        
        result = await db.execute(stmt)
        all_runs = result.scalars().all()
        for run in all_runs:
            if run.model_id not in runs:
                runs[run.model_id] = run
    except Exception as exc:
        logger.warning("⚠️ Error querying forecast runs from database (%s). Returning available models.", exc)
    return runs

@router.get("/{location}")
async def get_forecast_intelligence(location: str, db: AsyncSession = Depends(get_db_session)) -> Dict[str, Any]:
    """
    Retrieve the latest Multi-Model Forecast Data for a specific location.
    Checks cache -> PostgreSQL -> On-Demand Multi-Model Ingestion.
    """
    from backend.app.core.cache import cache
    from backend.app.core.database import is_db_available
    from backend.app.services.forecast_ingestion import forecast_ingestion_service
    from backend.app.services.forecast_analytics import ForecastAnalytics
    
    loc_clean = location.strip()
    cache_key = f"forecast_intelligence:{loc_clean.lower()}"
    
    # 1. Fast cache check (Redis or In-Memory TTL)
    cached = await cache.get(cache_key)
    if cached and cached.get("models"):
        has_active = any(m.get("status") != "unavailable" and len(m.get("forecast", [])) > 0 for m in cached.get("models", []))
        if has_active:
            return cached
            
    # 2. Check DB if database is connected
    runs_map = {}
    if is_db_available():
        runs_map = await _fetch_runs_for_location(loc_clean, db)
        
    operational_models = [m for m, meta in MODEL_REGISTRY.items() if meta.get("availability") == "operational"]
    missing_models = [m for m in operational_models if m not in runs_map]
    
    # 3. If any model is missing from DB (or DB is offline), run on-demand multi-model ingestion
    if missing_models or not runs_map:
        logger.info("ℹ️ Multi-model forecasts for '%s' missing from DB/cache. Ingesting on-demand...", loc_clean)
        payload = await forecast_ingestion_service.ingest_location_and_build(loc_clean)
        if payload and any(m.get("status") != "unavailable" for m in payload.get("models", [])):
            await cache.set(cache_key, payload, ttl=7200)
            return payload
        
    # 4. If runs were loaded from DB, format response and cache
    response_models = []
    valid_runs = []
    
    for model_id, meta in MODEL_REGISTRY.items():
        if meta.get("availability") != "operational":
            continue
            
        run = runs_map.get(model_id)
        if not run:
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
            
        valid_runs.append(run)
        now = datetime.datetime.now(datetime.timezone.utc)
        age_minutes = int((now - run.fetched_at).total_seconds() / 60)
        is_stale = age_minutes > (meta.get("update_cadence_hours", 6) * 60 + 120) 
        
        formatted_forecast = []
        for val in run.values:
            formatted_forecast.append({
                "valid_time": val.valid_time.isoformat() if hasattr(val.valid_time, "isoformat") else str(val.valid_time),
                "lead_hours": val.lead_hours,
                "variable": val.variable,
                "representation": getattr(val, "representation", "deterministic"),
                "value": val.value,
                "unit": val.unit
            })
            
        response_models.append({
            "id": meta["id"],
            "name": meta["name"],
            "methodology": meta.get("methodology"),
            "forecast_type": meta.get("forecast_type"),
            "how_it_forecasts": meta.get("how_it_forecasts"),
            "run_time": run.run_time.isoformat() if hasattr(run.run_time, "isoformat") else str(run.run_time),
            "fetched_at": run.fetched_at.isoformat() if hasattr(run.fetched_at, "isoformat") else str(run.fetched_at),
            "age_minutes": age_minutes,
            "status": "stale" if is_stale else "fresh",
            "forecast": formatted_forecast
        })

    analytics_data = {}
    if valid_runs:
        analytics_data = ForecastAnalytics.analyze(valid_runs)

    payload = {
        "location": loc_clean,
        "horizon_days": 7,
        "models": response_models,
        "analytics": analytics_data
    }
    await cache.set(cache_key, payload, ttl=7200)
    return payload


@router.get("/{location}/analysis")
async def get_forecast_ai_analysis(location: str, db: AsyncSession = Depends(get_db_session)) -> Dict[str, Any]:
    """
    Decoupled endpoint for AI analysis. Runs asynchronously from the main forecast data fetch.
    """
    from backend.app.core.cache import cache
    from backend.app.services.forecast_ai_service import forecast_ai_service
    
    loc_clean = location.strip()
    ai_cache_key = f"forecast_intelligence_ai:{loc_clean.lower()}"
    
    cached = await cache.get(ai_cache_key)
    if cached and cached.get("analysis"):
        return cached
        
    data = await get_forecast_intelligence(loc_clean, db)
    analytics_data = data.get("analytics", {})
    if not analytics_data:
        return {"analysis": "Multi-model data is currently being ingested for this location. Please check back in a few seconds."}
        
    summary = await forecast_ai_service.get_analysis(loc_clean, analytics_data)
    res = {"analysis": summary}
    await cache.set(ai_cache_key, res, ttl=3600)
    return res

