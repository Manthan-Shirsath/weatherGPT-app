from typing import Optional, List
from fastapi import APIRouter, Query, HTTPException, Response
from backend.app.services.climate_service import ClimateService

router = APIRouter(prefix="/api/climate", tags=["climate"])

@router.get("/intelligence")
async def get_climate_intelligence(
    city: str = Query("Pune", description="City name"),
    range: str = Query("30d", description="Time range: '30d', '90d', '1y', '5y', '10y', 'custom'"),
    start_date: Optional[str] = Query(None, description="Custom start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="Custom end date YYYY-MM-DD"),
    compareWith: Optional[str] = Query(None, description="Secondary city for comparative climate analysis")
):
    return await ClimateService.get_climate_intelligence(
        city=city,
        range_str=range,
        custom_start=start_date,
        custom_end=end_date,
        compare_city=compareWith
    )

@router.get("/summary")
async def get_climate_summary(
    city: str = Query("Pune", description="City name"),
    range: str = Query("30d", description="Time range: '30d', '90d', '1y', '5y', '10y'")
):
    return await ClimateService.get_summary(city=city, range_str=range)

@router.get("/temperature")
async def get_climate_temperature(
    city: str = Query("Pune", description="City name"),
    range: str = Query("12m", description="Time range: '24h', '7d', '30d', '12m'")
):
    trend = await ClimateService.get_temperature_trend(city=city, range_str=range)
    return {"city": city, "range": range, "data": trend}

@router.get("/rainfall")
async def get_climate_rainfall(
    city: str = Query("Pune", description="City name"),
    range: str = Query("12m", description="Time range: '24h', '7d', '30d', '12m'")
):
    trend = await ClimateService.get_rainfall_trend(city=city, range_str=range)
    return {"city": city, "range": range, "data": trend}

@router.get("/distribution")
async def get_climate_distribution(
    city: str = Query("Pune", description="City name"),
    range: str = Query("12m", description="Time range: '24h', '7d', '30d', '12m'")
):
    return await ClimateService.get_distribution(city=city, range_str=range)

@router.get("/insights")
async def get_climate_insights(
    city: str = Query("Pune", description="City name"),
    range: str = Query("12m", description="Time range: '24h', '7d', '30d', '12m'")
):
    return await ClimateService.get_insights(city=city, range_str=range)

@router.get("/compare")
async def get_climate_compare(
    cities: str = Query("Pune,Mumbai", description="Comma-separated city names"),
    range: str = Query("12m", description="Time range: '24h', '7d', '30d', '12m'")
):
    city_list = [c.strip() for c in cities.split(",") if c.strip()]
    if not city_list:
        city_list = ["Pune", "Mumbai"]
    return await ClimateService.get_comparison(cities=city_list, range_str=range)

@router.get("/export")
async def export_climate_data(
    city: str = Query("Pune", description="City name"),
    range: str = Query("12m", description="Time range: '24h', '7d', '30d', '12m'")
):
    csv_content = await ClimateService.generate_csv_export(city=city, range_str=range)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="climate_trends_{city}_{range}.csv"'}
    )
