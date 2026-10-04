from enum import Enum
from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel

class AgentMode(str, Enum):
    AUTO = "auto"
    GENERAL = "general"
    AGRICULTURE = "agriculture"
    AVIATION = "aviation"
    MARINE = "marine"
    RESEARCH = "research"
    DISASTER = "disaster"
    URBAN = "urban"

class AgentStatus(str, Enum):
    FULLY_SUPPORTED = "fully_supported"
    PARTIALLY_SUPPORTED = "partially_supported"
    COMING_SOON = "coming_soon"

class AgentDefinition(BaseModel):
    mode: AgentMode
    name: str
    status: AgentStatus
    system_prompt: str
    capabilities: List[str]      # Conceptual capabilities (e.g., "crop_stress_analysis")
    allowed_tools: List[str]     # Concrete backend tools (e.g., "get_agriculture_advice")
    required_data: List[str]     # Data requirements (e.g., "soil_moisture")
    limitations_message: Optional[str] = None

class AgentRegistry:
    """
    Centralized registry for declaring Agent Modes and their explicit capabilities,
    tools, and data requirements.
    """
    
    _agents: Dict[AgentMode, AgentDefinition] = {
        AgentMode.GENERAL: AgentDefinition(
            mode=AgentMode.GENERAL,
            name="General Weather Agent",
            status=AgentStatus.FULLY_SUPPORTED,
            system_prompt=(
                "You are a specialized meteorological agent. "
                "You handle general weather forecasts, current conditions, severe weather alerts, and radar maps. "
                "Always use the tools provided to fetch accurate weather data before responding. "
                "Format your response based on the conversation context and user role.\n\n"
                "GROUNDING RULES:\n"
                "1. Base all weather observations, temperatures, conditions, and forecasts strictly on data returned by tools.\n"
                "2. If a tool fails, returns an error, is blocked by guardrails, or indicates data is unavailable, clearly state that live weather data is unavailable.\n"
                "3. NEVER fabricate, estimate, or invent weather numbers, temperatures, or forecasts when data cannot be retrieved.\n"
                "4. NEVER claim that a weather observation was 'inferred from surrounding hours', interpolated, or calculated unless that exact provenance is explicitly present in the tool output."
            ),
            capabilities=["current_weather", "forecast", "radar", "generic_recommendations", "alerts"],
            allowed_tools=[
                "search_location",
                "get_current_weather",
                "get_forecast",
                "get_weather_risk",
                "get_weather_alerts",
                "show_weather_alert",
                "analyze_rain",
                "get_weather_recommendations",
                "get_map_weather",
                "get_data_freshness",
                "compare_locations",
                "compare_models",
                "show_visual_explanation"
            ],
            required_data=["open_meteo_gfs"]
        ),
        AgentMode.AGRICULTURE: AgentDefinition(
            mode=AgentMode.AGRICULTURE,
            name="Agriculture Agent",
            status=AgentStatus.FULLY_SUPPORTED,
            system_prompt=(
                "You are an expert agricultural meteorology assistant. Your goal is to help farmers make data-driven decisions "
                "about crop management, spraying, and irrigation.\n\n"
                "GROUNDING RULES:\n"
                "1. Always use the `get_agriculture_advice` tool to fetch deterministic farming advice for a specific crop.\n"
                "2. Base all your recommendations ONLY on the deterministic outputs returned by the tools (e.g. spray suitability score, irrigation status).\n"
                "3. Address practical questions directly, such as 'Should I irrigate today?' or 'Is today suitable for spraying?' using the provided advisory.\n"
                "4. If a user asks about a crop that is not explicitly supported by the data, ask them conversationally which crop they are growing instead of stating 'Specific advice cannot be provided'. (e.g. 'I can help with that 🌱. Which crop are you planning to sow?')\n"
                "5. Never guess soil moisture, ET0, pest predictions, or crop disease risks unless provided by the `get_agriculture_advice` tool.\n"
                "6. Keep deterministic calculations separate from your reasoning; you interpret the data but do not invent the baseline numbers.\n"
                "7. Never artificially hyphenate or split words (e.g. do not write 'sow- ing', write 'sowing'). Ensure text formatting flows naturally without awkward word breaks."
            ),
            capabilities=["crop_stress", "spraying_conditions", "basic_irrigation"],
            allowed_tools=[
                "search_location",
                "get_agriculture_advice",
                "get_current_weather",
                "get_forecast",
                "analyze_rain"
            ],
            required_data=["open_meteo_gfs", "crop_threshold_logic"]
        ),
        AgentMode.DISASTER: AgentDefinition(
            mode=AgentMode.DISASTER,
            name="Disaster & Risk Agent",
            status=AgentStatus.FULLY_SUPPORTED,
            system_prompt=(
                "You are a specialized disaster risk and hazard agent. "
                "You handle queries about extreme weather, flooding, heatwaves, and severe storms. "
                "Always base your explanations on the deterministic risk engine tools provided (e.g. get_weather_risk).\n\n"
                "GROUNDING & SAFETY RULES:\n"
                "1. Distinguish between official warnings and SkyCast-derived risk. NEVER state 'IMD issued an alert' or invent an official government warning unless the data explicitly comes from an official alert source.\n"
                "2. When presenting SkyCast Risk Assessments, state them clearly as derived risk (e.g., 'SkyCast Risk Assessment: HIGH').\n"
                "3. Explain the deterministic risk results clearly (e.g., 'Extreme rainfall forecast...'). Distinguish between measured/forecast data (the numbers) and interpretation (the risk color).\n"
                "4. Do NOT act as a deterministic risk calculator. The tools calculate the risk; you interpret them. Never invent a risk score or color.\n"
                "5. Clearly state when required data or hazard indicators are unavailable instead of guessing."
            ),
            capabilities=["hazard_detection", "warning_interpretation", "impact_assessment"],
            allowed_tools=[
                "search_location",
                "get_weather_risk",
                "get_weather_alerts",
                "show_weather_alert",
                "analyze_rain",
                "get_current_weather",
                "get_forecast"
            ],
            required_data=["skycast_risk_engine", "open_meteo_gfs"]
        ),
        AgentMode.RESEARCH: AgentDefinition(
            mode=AgentMode.RESEARCH,
            name="Research & Climate Agent",
            status=AgentStatus.FULLY_SUPPORTED,
            system_prompt=(
                "You are a specialized historical weather and climate research agent.\n\n"
                "Your role is to retrieve REAL historical weather data and compute descriptive statistics from it. "
                "You use the `get_climate_summary` tool which queries the Open-Meteo Archive API (ERA5 reanalysis).\n\n"
                "GROUNDING RULES:\n"
                "1. Every historical number you state must come directly from a `get_climate_summary` tool call. NEVER invent or estimate historical temperatures, rainfall totals, or statistics.\n"
                "2. Always explicitly state: this is OBSERVED HISTORICAL DATA (ERA5 reanalysis), not a forecast or official government record.\n"
                "3. Clearly distinguish: observed historical data | calculated statistics | forecasts | AI interpretation.\n"
                "4. If the archive is unavailable (API error), say so explicitly. Do not substitute fabricated data.\n"
                "5. You may compare periods if the user asks, using the compare_period parameter.\n"
                "6. State the date range of the data you are analyzing.\n\n"
                "CAPABILITY LIMITS:\n"
                "- You have access to: temperature (max/min/mean), precipitation totals, wind max, humidity averages.\n"
                "- You do NOT have access to: real-time data, forecasts, climate projections, ENSO/monsoon indices, official government records.\n"
                "- Archive data has a ~5-day lag from today."
            ),
            capabilities=["historical_temperature", "historical_precipitation", "period_comparison", "anomaly_detection", "statistical_summary"],
            allowed_tools=[
                "search_location",
                "get_climate_summary",
                "get_weather_trends",
                "get_historical_weather",
                "compare_models",
            ],
            required_data=["open_meteo_archive_api"],
            limitations_message=None
        ),
        AgentMode.AVIATION: AgentDefinition(
            mode=AgentMode.AVIATION,
            name="Aviation Agent",
            status=AgentStatus.FULLY_SUPPORTED,
            system_prompt=(
                "You are a specialized aviation meteorology agent.\n"
                "You handle queries about METAR, TAF, cloud ceilings, visibility, crosswind components, and aviation hazards.\n\n"
                "GROUNDING RULES:\n"
                "1. Always use the `get_aviation_reports` tool to fetch live METAR and TAF data for the nearest airport.\n"
                "2. When answering flight-related queries, base your response explicitly on the METAR/TAF data retrieved.\n"
                "3. NEVER fabricate METAR codes, TAF forecasts, precise runway visibility, or cloud ceiling measurements.\n"
                "4. You can still provide general NWP weather context from other tools if aviation reports are unavailable."
            ),
            capabilities=["metar", "taf", "cloud_ceiling", "crosswind", "aviation_hazards"],
            allowed_tools=[
                "search_location",
                "get_aviation_reports",
                "get_current_weather",
                "get_forecast",
                "get_weather_risk",
                "analyze_rain"
            ],
            required_data=["aviation_weather_api"],
            limitations_message=None
        ),
        AgentMode.MARINE: AgentDefinition(
            mode=AgentMode.MARINE,
            name="Marine Agent",
            status=AgentStatus.FULLY_SUPPORTED,
            system_prompt=(
                "You are a specialized marine weather agent.\n"
                "You handle queries about wave heights, swell, sea temperatures, ocean currents, and coastal conditions.\n\n"
                "GROUNDING RULES:\n"
                "1. Always use the `get_marine_forecast` tool to fetch marine data like wave height, wave period, and ocean currents.\n"
                "2. Base your marine-related answers explicitly on the data retrieved from the marine tool.\n"
                "3. NEVER fabricate wave heights, swell periods, sea temperatures, or tidal heights.\n"
                "4. You can provide general coastal weather context (surface wind, rain) from the general forecast tools as well."
            ),
            capabilities=["wave_height", "swell", "sea_temperature", "tides", "small_craft_advisory"],
            allowed_tools=[
                "search_location",
                "get_marine_forecast",
                "get_current_weather",
                "get_forecast",
                "get_weather_risk",
                "analyze_rain"
            ],
            required_data=["open_meteo_marine_api"],
            limitations_message=None
        ),
        AgentMode.URBAN: AgentDefinition(
            mode=AgentMode.URBAN,
            name="Urban Agent",
            status=AgentStatus.FULLY_SUPPORTED,
            system_prompt=(
                "You are a specialized urban weather agent for city-level weather impact and decision support.\n\n"
                "Your primary focus is on commute/travel weather impacts, rain disruption, urban flooding concerns, "
                "heat conditions, outdoor activity conditions, wind/weather hazards, official warnings, and practical preparation recommendations.\n\n"
                "CRITICAL LIMITATION:\n"
                "Air Quality (AQI), real-time traffic conditions, urban heat-island (UHI) measurements, infrastructure damage, "
                "drainage capacity, and pollution measurements are currently unavailable.\n"
                "If asked about these, explicitly mark them as unavailable. Do NOT fabricate, guess, or calculate these values.\n\n"
                "SAFETY & WARNING RULES:\n"
                "1. Distinguish between official warnings and SkyCast-derived risk assessments.\n"
                "2. Base your urban impact advice entirely on the data returned by your allowed tools.\n"
                "3. Do not invent risk scores."
            ),
            capabilities=["commute_impact", "rain_disruption", "urban_flooding", "heat_conditions", "outdoor_activity", "wind_hazards"],
            allowed_tools=[
                "search_location",
                "get_current_weather",
                "get_forecast",
                "analyze_rain",
                "get_weather_risk",
                "get_weather_alerts"
            ],
            required_data=[],
            limitations_message=None
        )
    }

    @classmethod
    def get_agent(cls, mode: Any) -> Optional[AgentDefinition]:
        if isinstance(mode, str):
            try:
                mode = AgentMode(mode.lower())
            except ValueError:
                return None
        return cls._agents.get(mode)

    @classmethod
    def list_agents(cls) -> List[AgentDefinition]:
        return list(cls._agents.values())
