"""
Agent Schemas & Tool Input/Output Validation Models
"""

from typing import Dict, Any, List, Optional, Union
from pydantic import BaseModel, Field


# ==============================================================================
# Tool Input Schemas
# ==============================================================================

class LocationSearchArgs(BaseModel):
    query: str = Field(..., description="The natural language location name or city to search/geocode (e.g. 'Tokyo', 'London', 'Pune', 'Baner Pune')")


class CurrentWeatherArgs(BaseModel):
    location: str = Field(..., description="City or canonical location name (e.g. 'Pune', 'Mumbai', 'Tokyo')")
    lat: Optional[float] = Field(None, description="Optional latitude coordinate if known")
    lon: Optional[float] = Field(None, description="Optional longitude coordinate if known")


class ForecastArgs(BaseModel):
    location: str = Field(..., description="City or canonical location name")
    days: Optional[int] = Field(5, description="Number of forecast days to retrieve (1 to 7)")
    hourly: Optional[bool] = Field(True, description="Whether to include hourly projections")
    date: Optional[str] = Field(None, description="Optional target date (e.g. 'tomorrow', 'today', '2026-08-30', 'Saturday')")
    time: Optional[str] = Field(None, description="Optional specific clock time (e.g. '17:00', '5 PM')")
    time_range: Optional[str] = Field(None, description="Optional time of day window ('morning', 'afternoon', 'evening', 'night')")
    time_span: Optional[List[int]] = Field(None, description="Exact hour span if requested (e.g. [9, 16])")
    activity: Optional[str] = Field(None, description="Optional outdoor activity to evaluate suitability for (e.g. 'cricket', 'hiking')")
    model: Optional[str] = Field(None, description="Specific NWP model if requested: 'ecmwf'/'ecmwf_ifs', 'gfs'/'noaa_gfs', 'icon'/'dwd_icon', 'aifs'/'ecmwf_aifs', 'weathernext'/'google_weathernext2'")


class ModelComparisonArgs(BaseModel):
    location: str = Field(..., description="City or location name to compare weather model forecasts for (e.g. 'Pune', 'Mumbai')")
    models: Optional[List[str]] = Field(None, description="List of NWP models to compare (e.g. ['ecmwf_ifs', 'noaa_gfs'], ['ECMWF', 'GFS']). Defaults to ECMWF IFS and NOAA GFS if not specified.")
    date: Optional[str] = Field(None, description="Optional target date (e.g. 'today', 'tomorrow', '2026-09-09')")
    variable: Optional[str] = Field(None, description="Optional specific variable focus: 'temperature', 'precipitation', 'wind', or None for complete multi-variable comparison")


class AnalyzeRainArgs(BaseModel):
    location: str = Field(..., description="City or canonical location name")
    date: Optional[str] = Field(None, description="Optional target date (e.g. 'tomorrow', 'today', '2026-08-30', 'Saturday')")
    time: Optional[str] = Field(None, description="Optional specific clock time (e.g. '17:00', '5 PM')")
    time_range: Optional[str] = Field(None, description="Optional time of day window ('morning', 'afternoon', 'evening', 'night')")
    time_span: Optional[List[int]] = Field(None, description="Exact hour span if requested (e.g. [9, 16])")


class ClimateResearchArgs(BaseModel):
    location: str = Field(..., description="City or location name to retrieve historical weather data for")
    start_date: Optional[str] = Field(None, description="Start date in YYYY-MM-DD format (defaults to 30 days ago)")
    end_date: Optional[str] = Field(None, description="End date in YYYY-MM-DD format (defaults to yesterday)")
    metric: Optional[str] = Field(None, description="Specific metric focus: 'temperature', 'precipitation', 'wind', 'humidity', or None for all")
    compare_period: Optional[str] = Field(None, description="An optional prior period to compare against, in YYYY-MM-DD/YYYY-MM-DD format")


class RiskArgs(BaseModel):
    location: str = Field(..., description="City or location name to evaluate Skycast meteorological risk for")


class AlertsArgs(BaseModel):
    location: Optional[str] = Field(None, description="Optional city name to filter active weather warnings for; if omitted, returns all active alerts")


class HistoricalArgs(BaseModel):
    location: str = Field(..., description="City name to fetch real recorded historical observation snapshots for")
    range_days: Optional[int] = Field(7, description="Number of days of history to inspect (1 to 30)")
    metric: Optional[str] = Field(None, description="Specific metric to isolate (e.g. 'temperature', 'precipitation', 'wind', 'humidity')")


class TrendsArgs(BaseModel):
    location: str = Field(..., description="Primary city name to retrieve statistical trend analytics for")
    range: Optional[str] = Field("24h", description="Time window for trends: '24h', '7d', or '30d'")
    compare_with: Optional[str] = Field(None, description="Optional secondary city for side-by-side trend comparison")


class MapWeatherArgs(BaseModel):
    pass


class FreshnessArgs(BaseModel):
    location: str = Field(..., description="City or location name to inspect data age and cache status for")


class AgricultureArgs(BaseModel):
    location: str = Field(..., description="City or location name for agricultural advisory")
    crop: Optional[str] = Field("Cotton", description="Crop name (e.g. Cotton, Sugarcane, Wheat, Rice, Soybean, Tomato, Onion, Groundnut)")
    growth_stage: Optional[str] = Field("Flowering", description="Growth stage (e.g. Sowing, Vegetative, Flowering, Fruiting, Harvesting)")


class RecommendationArgs(BaseModel):
    location: str = Field(..., description="City or location name for practical recommendation")
    activity: Optional[str] = Field("all", description="Activity name ('all', 'umbrella', 'jacket', 'run', 'outdoor_event', 'travel', 'drying_clothes')")
    date: Optional[str] = Field(None, description="Optional target date (e.g. 'tomorrow', 'today', '2026-09-03', 'Saturday')")


class VisualExplanationArgs(BaseModel):
    phenomenon: str = Field(..., description="The weather phenomenon to explain (e.g. 'rain', 'heat', 'wind')")
    explanation: str = Field(..., description="A short, clear AI-generated explanation grounded in actual data")
    visual_type: str = Field(..., description="Visual diagram type: 'rain', 'wind', 'heat', 'clouds', 'pressure', 'storm', 'general'")
    available_facts: List[str] = Field(..., description="2-3 key facts driving this phenomenon, explicitly based on retrieved weather data")
    unavailable_facts: List[str] = Field(..., description="Meteorological drivers that you suspect are causes but which were NOT present in the tool data")

class LocationComparisonArgs(BaseModel):
    locations: List[str] = Field(..., description="List of city names to compare (e.g. ['Pune', 'Mumbai'])")
    date: Optional[str] = Field(None, description="Optional target date for the comparison")
    activity: Optional[str] = Field(None, description="Optional activity to evaluate suitability for")

class DateComparisonArgs(BaseModel):
    location: str = Field(..., description="City name where the comparison takes place")
    dates: List[str] = Field(..., description="List of dates to compare (e.g. ['Saturday', 'Sunday'])")
    activity: Optional[str] = Field(None, description="Optional activity to evaluate suitability for")

class AlertExplanationArgs(BaseModel):
    location: str = Field(..., description="City name where the alert applies")
    hazard: str = Field(..., description="The main hazard (e.g. 'Heavy Rain', 'Heatwave')")
    severity: str = Field(..., description="The alert severity (e.g. 'Red', 'Orange', 'Yellow', 'Green')")
    explanation: str = Field(..., description="AI-generated explanation of the alert and potential impacts")
    recommendations: List[str] = Field(..., description="AI-generated practical safety recommendations")

class AviationArgs(BaseModel):
    location: str = Field(..., description="City or location name to fetch aviation METAR/TAF reports for")
    lat: Optional[float] = Field(None, description="Optional latitude")
    lon: Optional[float] = Field(None, description="Optional longitude")

class MarineArgs(BaseModel):
    location: str = Field(..., description="City or coastal location name to fetch marine forecasts for")
    lat: Optional[float] = Field(None, description="Optional latitude")
    lon: Optional[float] = Field(None, description="Optional longitude")

class CreateMonitorArgs(BaseModel):
    location: str = Field(..., description="Location to monitor (e.g. 'Nashik', 'Pune', 'Mumbai')")
    rule_type: str = Field(..., description="Rule type: 'rain_probability', 'temperature', 'wind', 'precipitation', 'weather_alert', 'forecast_change'")
    metric: str = Field(..., description="Metric name: 'rain_probability', 'temperature_c', 'wind_speed_kmh', 'precipitation_mm', 'active_alert', 'forecast_change'")
    operator: str = Field(..., description="Operator: '>', '<', '==', 'change_gt'")
    threshold: float = Field(..., description="Numeric threshold value")
    time_window: Optional[str] = Field("all_day", description="Time window: 'today', 'tomorrow', 'morning', 'afternoon', 'evening', 'all_day', 'next_24h'")
    severity: Optional[str] = Field("warning", description="Severity level: 'info', 'caution', 'warning', 'critical'")

class ListMonitorsArgs(BaseModel):
    location: Optional[str] = Field(None, description="Optional city name to filter standing monitors")

class DisableMonitorArgs(BaseModel):
    monitor_id: Optional[str] = Field(None, description="ID of the monitor to disable")
    location: Optional[str] = Field(None, description="Location of monitor to disable if monitor_id not known")
    rule_type: Optional[str] = Field(None, description="Rule type to disable (e.g. 'wind', 'rain_probability')")

class ExplainAlertArgs(BaseModel):
    alert_id: Optional[str] = Field(None, description="ID of the triggered alert to explain")
    location: Optional[str] = Field(None, description="Location of the alert to explain if alert_id is not known")

# ==============================================================================
# Tool Execution Output Envelope
# ==============================================================================

class ToolExecutionResult(BaseModel):
    tool: str
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None


# ==============================================================================
# UI Response Card & Source Models
# ==============================================================================

SUPPORTED_CARD_TYPES = {
    "text",
    "current_weather",
    "forecast",
    "risk",
    "alert",
    "historical",
    "comparison",
    "location",
    "data_status",
    "agriculture",
    "recommendation",
    "visual_explanation",
    "location_comparison",
    "date_comparison",
    "weather_alert",
    "rain_timeline",
    "weather_summary",
    "forecast_timeline",
    "decision",
    "monitor",
    "triggered_alert"
}

class CardItem(BaseModel):
    type: str = Field(..., description="Controlled card type: 'current_weather', 'forecast', 'risk', 'alert', 'historical', 'comparison', 'location', 'data_status', 'location_comparison', 'date_comparison', 'weather_alert', 'rain_timeline'")
    data: Dict[str, Any] = Field(default_factory=dict)



class SourceItem(BaseModel):
    type: str = "central_weather_data"
    timestamp: str
    provider: Optional[str] = "open_meteo"


class UncertaintyInfo(BaseModel):
    level: str = "high"  # "high" | "moderate" | "low"
    explanation: str
    source_disagreement: bool = False
    disagreement_details: Optional[str] = None


class RiskItem(BaseModel):
    hazard: str
    severity: str = "moderate"  # "low" | "moderate" | "severe" | "critical"
    impact: Optional[str] = None
    time_window: Optional[str] = None
    advice: Optional[str] = None


class RecommendationItem(BaseModel):
    category: str = "general"
    action: str
    reason: str
    suitability: Optional[str] = None  # "suitable" | "caution" | "not_suitable"
    time_window: Optional[str] = None
    source: Optional[str] = None


# ==============================================================================
# Final Agent Response (100% Backward Compatible + Rich Structure)
# ==============================================================================

class AgentResponse(BaseModel):
    reply: str
    city: str
    timestamp: str
    session_id: Optional[str] = None
    cards: List[CardItem] = Field(default_factory=list)
    sources: List[SourceItem] = Field(default_factory=list)
    data_status: str = "fresh"  # "fresh" | "stale" | "degraded"
    conversation_context: Optional[Dict[str, Any]] = None
    is_fallback: bool = False
    summary: Optional[str] = None
    conditions: Optional[Dict[str, Any]] = None
    forecast: Optional[Dict[str, Any]] = None
    risks: Optional[List[RiskItem]] = None
    recommendations: Optional[List[RecommendationItem]] = None
    uncertainty: Optional[UncertaintyInfo] = None
    freshness: Optional[Dict[str, Any]] = None
    follow_up_questions: Optional[List[str]] = None

