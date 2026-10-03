from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from backend.app.services.weather_hub import weather_hub

router = APIRouter(prefix="/api", tags=["Weather"])

class QueryRequest(BaseModel):
    message: Optional[str] = None
    query: Optional[str] = None
    city: Optional[str] = "Pune"
    language: Optional[str] = "en"
    history: Optional[list] = []

@router.get("/weather")
async def get_weather(
    city: Optional[str] = Query(None, description="City name to search"),
    lat: Optional[float] = Query(None, description="Latitude coordinate"),
    lon: Optional[float] = Query(None, description="Longitude coordinate"),
    fresh: Optional[bool] = Query(False, description="Force refresh from upstream provider")
):
    """
    Unified weather endpoint backed by Central Weather Data Hub and Redis live state.
    Supports either city name or exact latitude/longitude coordinates.
    """
    # 1. Coordinate Point Weather
    if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
        try:
            force = bool(fresh) if isinstance(fresh, bool) else False
            return await weather_hub.get_point_weather(float(lat), float(lon), force_refresh=force)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Failed to fetch coordinate weather: {str(exc)}")

    # 2. City Name Weather
    city_str = city if isinstance(city, str) else "Pune"
    city_clean = (city_str or "Pune").strip()
    if not city_clean:
        raise HTTPException(status_code=400, detail="City name cannot be empty")

    try:
        force = bool(fresh) if isinstance(fresh, bool) else False
        data = await weather_hub.get_weather_for_city(city_clean, force_refresh=force)
        return data
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Weather service error: {str(exc)}")


@router.get("/weather/dashboard")
async def get_weather_dashboard(city: Optional[str] = Query("Pune", description="City name")):
    """
    Aggregated dashboard endpoint returning location, current, hourly, daily, airQuality, alerts, radar, and sun data.
    """
    city_clean = (city or "Pune").strip()
    try:
        data = await weather_hub.get_weather_for_city(city_clean)
        return {
            "location": {
                "city": data.get("city"),
                "displayLocation": data.get("displayLocation"),
                "latitude": data.get("latitude"),
                "longitude": data.get("longitude"),
                "country": data.get("country")
            },
            "current": {
                "tempC": data.get("tempC"),
                "feelsLikeC": data.get("feelsLikeC"),
                "highC": data.get("highC"),
                "lowC": data.get("lowC"),
                "condition": data.get("condition"),
                "humidity": data.get("humidity"),
                "windSpeedKmh": data.get("windSpeedKmh"),
                "details": data.get("details", {})
            },
            "hourly": data.get("hourly", []),
            "daily": data.get("daily", []),
            "airQuality": data.get("airQuality", {}),
            "alerts": data.get("alerts", []),
            "radar": data.get("radar", {}),
            "sun": {
                "sunrise": data.get("daily", [{}])[0].get("sunrise", "06:19") if data.get("daily") else "06:19",
                "sunset": data.get("daily", [{}])[0].get("sunset", "18:51") if data.get("daily") else "18:51"
            }
        }
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch dashboard data: {str(exc)}")


@router.get("/weather/current")
async def get_current_weather(city: Optional[str] = Query("Pune", description="City name")):
    city_clean = (city or "Pune").strip()
    data = await weather_hub.get_weather_for_city(city_clean)
    return {
        "city": data.get("city"),
        "tempC": data.get("tempC"),
        "feelsLikeC": data.get("feelsLikeC"),
        "highC": data.get("highC"),
        "lowC": data.get("lowC"),
        "condition": data.get("condition"),
        "humidity": data.get("humidity"),
        "windSpeedKmh": data.get("windSpeedKmh"),
        "details": data.get("details", {})
    }


@router.get("/weather/hourly")
async def get_hourly_weather(city: Optional[str] = Query("Pune", description="City name")):
    city_clean = (city or "Pune").strip()
    data = await weather_hub.get_weather_for_city(city_clean)
    return data.get("hourly", [])


@router.get("/weather/daily")
async def get_daily_weather(city: Optional[str] = Query("Pune", description="City name")):
    city_clean = (city or "Pune").strip()
    data = await weather_hub.get_weather_for_city(city_clean)
    return data.get("daily", [])


@router.get("/weather/air-quality")
async def get_air_quality(city: Optional[str] = Query("Pune", description="City name")):
    city_clean = (city or "Pune").strip()
    data = await weather_hub.get_weather_for_city(city_clean)
    return data.get("airQuality", {})


@router.get("/weather/alerts")
async def get_weather_alerts(city: Optional[str] = Query("Pune", description="City name")):
    city_clean = (city or "Pune").strip()
    data = await weather_hub.get_weather_for_city(city_clean)
    return data.get("alerts", [])


@router.get("/weather/radar")
async def get_weather_radar(city: Optional[str] = Query("Pune", description="City name")):
    city_clean = (city or "Pune").strip()
    data = await weather_hub.get_weather_for_city(city_clean)
    return data.get("radar", {})


@router.get("/weather/forecast")
async def get_weather_forecast(
    city: Optional[str] = Query(None, description="City name to search"),
    lat: Optional[float] = Query(None, description="Latitude coordinate"),
    lon: Optional[float] = Query(None, description="Longitude coordinate"),
    fresh: Optional[bool] = Query(False, description="Force refresh from upstream provider")
):
    """
    Returns normalized weather forecast data (CanonicalWeatherDataset) explicitly.
    """
    if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
        try:
            force = bool(fresh) if isinstance(fresh, bool) else False
            return await weather_hub.get_point_weather(float(lat), float(lon), force_refresh=force)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Failed to fetch coordinate forecast: {str(exc)}")

    city_str = city if isinstance(city, str) else "Pune"
    city_clean = (city_str or "Pune").strip()
    if not city_clean:
        raise HTTPException(status_code=400, detail="City name cannot be empty")

    try:
        force = bool(fresh) if isinstance(fresh, bool) else False
        return await weather_hub.get_weather_for_city(city_clean, force_refresh=force)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Forecast service error: {str(exc)}")



