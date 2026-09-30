"""
WeatherGPT Multi-Agent Architecture
Defines the Triage, Weather, Agriculture, Climate, Aviation, and Marine specialist agents.
"""

from agents import Agent
from backend.app.services.agent.executor import ToolExecutor
from backend.app.services.agent.guardrails import safety_input_guardrail, severe_weather_output_guardrail

def get_agents(model: str = None, dynamic_instruction: str = None) -> Agent:
    """
    Instantiates the multi-agent architecture and returns the entry point (TriageAgent).
    
    The agents share the request-scoped LLM client context managed by `agent.py`.
    Injects dynamic temporal, language, and conversation context into all agents.
    """
    
    # Define tool subsets based on classification
    weather_tool_names = [
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
    ]
    
    ag_tool_names = [
        "get_agriculture_advice", 
        "get_current_weather", 
        "get_forecast", 
        "analyze_rain"
    ]
    
    climate_tool_names = [
        "search_location",
        "get_climate_summary",
        "get_historical_weather", 
        "get_weather_trends", 
        "compare_dates", 
        "compare_models",
        "get_data_freshness",
        "show_visual_explanation"
    ]

    aviation_tool_names = [
        "search_location",
        "get_aviation_reports",
        "get_current_weather",
        "get_forecast",
        "get_weather_risk",
        "analyze_rain"
    ]

    marine_tool_names = [
        "search_location",
        "get_marine_forecast",
        "get_current_weather",
        "get_forecast",
        "get_weather_risk",
        "analyze_rain"
    ]
    
    is_local_model = model and ("gemma" in model.lower() or "ovserve" in model.lower())
    
    # Initialize the specific tools
    if is_local_model:
        # Local model gets overwhelmed by 13 tools, causing bad JSON schemas and missing params
        weather_tools = ToolExecutor.get_openai_tools(["get_forecast", "compare_models"])
        ag_tools = ToolExecutor.get_openai_tools(["get_agriculture_advice"])
        climate_tools = ToolExecutor.get_openai_tools(["get_historical_weather"])
        aviation_tools = ToolExecutor.get_openai_tools(["get_aviation_reports"])
        marine_tools = ToolExecutor.get_openai_tools(["get_marine_forecast"])
    else:
        weather_tools = ToolExecutor.get_openai_tools(weather_tool_names)
        ag_tools = ToolExecutor.get_openai_tools(ag_tool_names)
        climate_tools = ToolExecutor.get_openai_tools(climate_tool_names)
        aviation_tools = ToolExecutor.get_openai_tools(aviation_tool_names)
        marine_tools = ToolExecutor.get_openai_tools(marine_tool_names)
    
    dynamic_suffix = f"\n\n{dynamic_instruction}" if dynamic_instruction else ""
    
    # Define Specialist Agents
    weather_agent = Agent(
        name="WeatherAgent",
        instructions=f"""You are a specialized meteorological agent. 
You handle general weather forecasts, current conditions, severe weather alerts, and radar maps.
Always use the tools provided to fetch accurate weather data before responding.
Format your response based on the conversation context and user role.

GROUNDING RULES:
1. Base all weather observations, temperatures, conditions, and forecasts strictly on data returned by tools.
2. If a tool fails, returns an error, is blocked by guardrails, or indicates data is unavailable, clearly state that live weather data is unavailable.
3. NEVER fabricate, estimate, or invent weather numbers, temperatures, or forecasts when data cannot be retrieved.
4. NEVER claim that a weather observation was 'inferred from surrounding hours', interpolated, or calculated unless that exact provenance is explicitly present in the tool output.{dynamic_suffix}""",
        tools=weather_tools,
        output_guardrails=[severe_weather_output_guardrail],
        model=model
    )
    
    agriculture_agent = Agent(
        name="AgricultureAgent",
        instructions=f"""You are a specialized agricultural weather agent. 
You provide advice to farmers regarding irrigation, crop spraying, and weather-related crop risks.
Use the tools provided to assess weather conditions specifically for agricultural planning.

GROUNDING RULES:
1. Base all agricultural advice and weather data strictly on actual tool outputs.
2. If agricultural data or weather observations cannot be retrieved, clearly state that data is unavailable.
3. Do NOT invent or guess weather conditions or spray/irrigation windows without data.
4. NEVER assert ungrounded provenance claims such as values being 'inferred from surrounding hours'.{dynamic_suffix}""",
        tools=ag_tools,
        output_guardrails=[severe_weather_output_guardrail],
        model=model
    )
    
    climate_agent = Agent(
        name="ClimateAgent",
        instructions=f"""You are a specialized climate and historical weather agent.
You handle queries about historical weather data, long-term trends, and comparisons across different dates.
Focus on statistical patterns and recorded observational data.

GROUNDING RULES:
1. Base all historical observations and trend analytics strictly on recorded tool data.
2. If historical records or trends are insufficient or unavailable, inform the user clearly.
3. NEVER fabricate historical temperatures or past records.
4. NEVER assert ungrounded provenance claims such as values being 'inferred from surrounding hours'.{dynamic_suffix}""",
        tools=climate_tools,
        output_guardrails=[severe_weather_output_guardrail],
        model=model
    )

    aviation_agent = Agent(
        name="AviationAgent",
        instructions=f"""You are a specialized aviation weather agent.
You assist pilots and dispatchers with route briefings, crosswind components, cloud ceilings, visibility, turbulence, and icing risks.

GROUNDING & LIMITATION RULES:
1. Live METAR/TAF feeds, SIGMET/AIRMET bulletins, and PIREP reports are currently in development and NOT yet connected.
2. Answer queries using general NWP forecast data returned by your tools (surface wind, precipitation, temperature), but explicitly state that official METAR/TAF bulletins are unavailable.
3. NEVER fabricate METAR codes, TAF forecasts, precise runway visibility, or cloud ceiling measurements.
4. Always remind users that general weather data must NOT be used for operational flight dispatch or navigation without consulting official aviation weather sources (e.g. NOAA AWC / Jeppesen).{dynamic_suffix}""",
        tools=aviation_tools,
        output_guardrails=[severe_weather_output_guardrail],
        model=model
    )

    marine_agent = Agent(
        name="MarineAgent",
        instructions=f"""You are a specialized marine weather agent.
You assist sailors, boaters, and coastal operations with wave height estimates, swell direction, tides, wind speeds, and coastal hazards.

GROUNDING & LIMITATION RULES:
1. Real-time buoy telemetry, official tide-gauge predictions, satellite SST feeds, and small-craft advisories are currently in development and NOT yet connected.
2. Answer queries using general NWP forecast data returned by your tools (surface wind, precipitation, temperature), but explicitly state that live buoy and tide-gauge data are unavailable.
3. NEVER fabricate wave heights, swell periods, sea surface temperatures, or tidal levels.
4. Always remind users that general weather data must NOT be used for maritime navigation or voyage planning without consulting official marine weather services (e.g. IMD Marine / NOAA NWS Marine).{dynamic_suffix}""",
        tools=marine_tools,
        output_guardrails=[severe_weather_output_guardrail],
        model=model
    )
    
    # Define Triage Agent
    triage_agent = Agent(
        name="TriageAgent",
        instructions="""You are the triage agent. Your ONLY job is to determine the user's intent and immediately hand off to the appropriate specialist agent.
- If the user asks about aviation, METAR, TAF, flight route weather, crosswind on runways, cloud ceilings, turbulence, or icing, transfer to AviationAgent.
- If the user asks about marine weather, ocean conditions, wave heights, tides, swell, sea temperature, or coastal sailing, transfer to MarineAgent.
- If the user asks about farming, crops, irrigation, or agricultural advice, transfer to AgricultureAgent.
- If the user asks about historical weather, past years/months, long-term climate records, or ERA5 reanalysis, transfer to ClimateAgent.
- For all other weather queries including forecasts, comparing NWP forecast models (ECMWF, GFS, ICON, AIFS), current conditions, rain timing, alerts, recommendations, or radar, transfer to WeatherAgent.

Do not answer weather questions yourself and do not call weather tools directly. You must ALWAYS execute a handoff transfer to the appropriate specialist agent.""",
        handoffs=[weather_agent, agriculture_agent, climate_agent, aviation_agent, marine_agent],
        input_guardrails=[safety_input_guardrail],
        model=model
    )
    
    return triage_agent


# ---------------------------------------------------------------------------
# Sample Triage Routing Verification Queries (Aviation & Marine)
# ---------------------------------------------------------------------------
# Aviation Mode Test Queries:
#   1. "What is the crosswind component on Runway 27 in Pune right now?" -> AviationAgent
#   2. "Can I get a METAR and TAF briefing for Mumbai (VABB) airport?" -> AviationAgent
#   3. "Assess turbulence and icing risk between FL180 and FL240 near Delhi." -> AviationAgent
#   4. "What is the cloud ceiling and visibility trend for departure from Bengaluru tomorrow morning?" -> AviationAgent
#   5. "Give me an enroute weather briefing for flight from Pune to Goa." -> AviationAgent
#   6. "Are there any active SIGMETs or severe convective hazards along my flight path?" -> AviationAgent
#
# Marine Mode Test Queries:
#   1. "What is the wave height and swell forecast off the coast of Goa this weekend?" -> MarineAgent
#   2. "Are there any small craft advisories or gale warnings for Mumbai harbor?" -> MarineAgent
#   3. "Show me tide tables and high tide timings for Chennai port tomorrow." -> MarineAgent
#   4. "What is the sea surface temperature and wind wave split near Visakhapatnam?" -> MarineAgent
#   5. "Is it safe for a small fishing vessel to head out 20 miles offshore from Kochi tomorrow?" -> MarineAgent
#   6. "What are the current coastal swell periods and breaker heights near Alibaug?" -> MarineAgent
