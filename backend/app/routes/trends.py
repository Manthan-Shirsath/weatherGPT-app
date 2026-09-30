from typing import Optional
from fastapi import APIRouter, Query, HTTPException
from backend.app.services.history_service import HistoryService

router = APIRouter(prefix="/api", tags=["trends"])

@router.get("/trends")
async def get_weather_trends(
    city: str = Query("Pune", description="City name to fetch historical trends for"),
    time_range: str = Query("24h", alias="range", description="Time window for trends: '24h', '7d', or '30d'"),
    compareWith: Optional[str] = Query(None, description="Optional secondary city for side-by-side comparison")
):
    """
    Retrieve real weather observation analytics and Skycast risk history from PostgreSQL.
    Supports 24 hours, 7 days, and 30 days ranges, plus multi-city comparison.
    """
    clean_range = time_range.strip().lower()
    if clean_range not in ["24h", "7d", "30d"]:
        clean_range = "24h"

    clean_city = city.strip()
    if not clean_city:
        raise HTTPException(status_code=400, detail="Parameter 'city' is required.")

    clean_compare = compareWith.strip() if compareWith else None

    import datetime
    from backend.app.services.historical_weather_service import HistoricalWeatherService
    
    # Database-First caching logic
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    end_date = now_utc.date()
    
    if clean_range == "7d":
        start_date = (now_utc - datetime.timedelta(days=7)).date()
    elif clean_range == "30d":
        start_date = (now_utc - datetime.timedelta(days=30)).date()
    else:
        # 24h range spans yesterday and today
        start_date = (now_utc - datetime.timedelta(days=1)).date()
    
    try:
        # Ensure complete coverage in database
        await HistoricalWeatherService.ensure_coverage(clean_city, start_date, end_date)
        if clean_compare:
            await HistoricalWeatherService.ensure_coverage(clean_compare, start_date, end_date)
    except Exception as e:
        import logging
        logger = logging.getLogger("skycast.api")
        logger.error("Failed to ensure historical coverage for '%s': %s", clean_city, e)
        # Continue and return whatever is in the DB even if backfill fails

    trends_data = await HistoryService.get_trends(
        city_name=clean_city,
        range_str=clean_range,
        compare_city=clean_compare
    )

    if trends_data.get("status") == "insufficient_data" or not trends_data.get("observations"):
        from backend.app.services.climate_service import ClimateService
        intel = await ClimateService.get_climate_intelligence(clean_city, clean_range)
        if intel.get("status") == "ready":
            s = intel.get("summary", {})
            obs = []
            for ts in intel.get("timeseries", []):
                obs.append({
                    "timestamp": ts["date"] + "T12:00:00Z",
                    "timeLabel": ts["date"],
                    "temperature": ts["actualMeanTemp"],
                    "precipitation": ts["actualRain"],
                    "normalTemp": ts["baselineMeanTemp"],
                    "condition": "Historical Record"
                })
            trends_data["status"] = "ready"
            trends_data["count"] = len(obs)
            trends_data["observations"] = obs
            trends_data["temperature"] = {
                "avg": s.get("actualMeanTemp"),
                "min": s.get("lowTemp"),
                "max": s.get("peakTemp"),
                "baseline": s.get("baselineMeanTemp"),
                "anomaly": s.get("tempAnomaly")
            }
            trends_data["rainfall"] = {
                "total": s.get("actualRainTotal"),
                "baseline": s.get("baselineRainTotal"),
                "anomalyPct": s.get("rainAnomalyPct")
            }

    return trends_data
