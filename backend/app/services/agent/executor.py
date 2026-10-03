"""
Secure Tool Executor for WeatherGPT Agent
Validates tool names, enforces argument schemas, timeouts, output sanitization, and error handling.
"""

import asyncio
import logging
from typing import Dict, Any, Tuple, Type
from pydantic import BaseModel, ValidationError

from backend.app.services.agent.schemas import (
    ToolExecutionResult,
    LocationSearchArgs,
    CurrentWeatherArgs,
    ForecastArgs,
    RiskArgs,
    AlertsArgs,
    HistoricalArgs,
    TrendsArgs,
    MapWeatherArgs,
    FreshnessArgs,
    AgricultureArgs,
    RecommendationArgs,
    VisualExplanationArgs,
    LocationComparisonArgs,
    DateComparisonArgs,
    AlertExplanationArgs,
    AnalyzeRainArgs,
    ClimateResearchArgs,
    AviationArgs,
    MarineArgs,
    ModelComparisonArgs,
    CreateMonitorArgs,
    ListMonitorsArgs,
    DisableMonitorArgs,
    ExplainAlertArgs
)
from backend.app.services.agent.tools import (
    search_location_tool,
    get_current_weather_tool,
    get_forecast_tool,
    get_weather_risk_tool,
    get_weather_alerts_tool,
    get_historical_weather_tool,
    get_weather_trends_tool,
    get_map_weather_tool,
    get_data_freshness_tool,
    get_agriculture_advice_tool,
    get_weather_recommendations_tool,
    show_visual_explanation_tool,
    compare_locations_tool,
    compare_dates_tool,
    show_weather_alert_tool,
    analyze_rain_tool,
    get_climate_summary_tool,
    get_aviation_reports_tool,
    get_marine_forecast_tool,
    compare_models_tool,
    create_weather_monitor_tool,
    list_weather_monitors_tool,
    disable_weather_monitor_tool,
    explain_weather_alert_tool
)

logger = logging.getLogger("skycast.agent.executor")

TOOL_REGISTRY: Dict[str, Tuple[Type[BaseModel], Any]] = {
    "search_location": (LocationSearchArgs, search_location_tool),
    "get_current_weather": (CurrentWeatherArgs, get_current_weather_tool),
    "get_forecast": (ForecastArgs, get_forecast_tool),
    "get_weather_risk": (RiskArgs, get_weather_risk_tool),
    "get_weather_alerts": (AlertsArgs, get_weather_alerts_tool),
    "get_historical_weather": (HistoricalArgs, get_historical_weather_tool),
    "get_weather_trends": (TrendsArgs, get_weather_trends_tool),
    "get_map_weather": (MapWeatherArgs, get_map_weather_tool),
    "get_data_freshness": (FreshnessArgs, get_data_freshness_tool),
    "get_agriculture_advice": (AgricultureArgs, get_agriculture_advice_tool),
    "get_weather_recommendations": (RecommendationArgs, get_weather_recommendations_tool),
    "show_visual_explanation": (VisualExplanationArgs, show_visual_explanation_tool),
    "compare_locations": (LocationComparisonArgs, compare_locations_tool),
    "compare_dates": (DateComparisonArgs, compare_dates_tool),
    "show_weather_alert": (AlertExplanationArgs, show_weather_alert_tool),
    "analyze_rain": (AnalyzeRainArgs, analyze_rain_tool),
    "get_climate_summary": (ClimateResearchArgs, get_climate_summary_tool),
    "get_aviation_reports": (AviationArgs, get_aviation_reports_tool),
    "get_marine_forecast": (MarineArgs, get_marine_forecast_tool),
    "compare_models": (ModelComparisonArgs, compare_models_tool),
    "create_weather_monitor": (CreateMonitorArgs, create_weather_monitor_tool),
    "list_weather_monitors": (ListMonitorsArgs, list_weather_monitors_tool),
    "disable_weather_monitor": (DisableMonitorArgs, disable_weather_monitor_tool),
    "explain_weather_alert": (ExplainAlertArgs, explain_weather_alert_tool),
}

DEFAULT_TOOL_TIMEOUT_SECONDS = 15.0


class ToolExecutor:
    """
    Executes WeatherGPT tools strictly within safety constraints.
    """

    @classmethod
    async def execute(cls, tool_name: str, arguments: Dict[str, Any]) -> ToolExecutionResult:
        """
        Validates and executes a registered tool.
        """
        if tool_name not in TOOL_REGISTRY:
            logger.warning("Attempted execution of unregistered tool: %s", tool_name)
            return ToolExecutionResult(
                tool=tool_name,
                success=False,
                data=None,
                error=f"Tool '{tool_name}' is not registered or allowed."
            )

        schema_cls, func = TOOL_REGISTRY[tool_name]

        # 1. Validate arguments against Pydantic schema
        try:
            validated_args = schema_cls(**(arguments or {}))
        except ValidationError as val_err:
            logger.warning("Argument validation failed for '%s': %s", tool_name, val_err)
            return ToolExecutionResult(
                tool=tool_name,
                success=False,
                data=None,
                error=f"Invalid arguments for {tool_name}: {str(val_err)}"
            )
        except Exception as exc:
            return ToolExecutionResult(
                tool=tool_name,
                success=False,
                data=None,
                error=f"Argument parsing error: {str(exc)}"
            )

        # 2. Execute with bounded timeout
        try:
            coro = func(validated_args)
            if not asyncio.iscoroutine(coro) and not hasattr(coro, '__await__'):
                logger.error(f"FATAL: func {func} did not return a coroutine! Returned {type(coro)}")
            raw_result = await asyncio.wait_for(
                coro,
                timeout=DEFAULT_TOOL_TIMEOUT_SECONDS
            )
            return ToolExecutionResult(
                tool=tool_name,
                success=True,
                data=raw_result,
                error=None
            )
        except asyncio.TimeoutError:
            logger.error("Tool execution timed out for '%s'", tool_name)
            return ToolExecutionResult(
                tool=tool_name,
                success=False,
                data=None,
                error=f"Tool '{tool_name}' timed out after {DEFAULT_TOOL_TIMEOUT_SECONDS}s."
            )
        except Exception as exc:
            logger.error("Tool execution error for '%s': %s", tool_name, exc, exc_info=True)
            return ToolExecutionResult(
                tool=tool_name,
                success=False,
                data=None,
                error=f"Tool '{tool_name}' failed: {str(exc)}"
            )

    @classmethod
    def get_openai_tools(cls, tool_names: list[str] = None):
        from agents import FunctionTool
        import json
        
        def _map_tool_to_card_type(tool_name: str) -> str:
            mapping = {
                "get_current_weather": "current_weather",
                "get_forecast": "forecast",
                "get_weather_risk": "risk",
                "get_weather_alerts": "alert",
                "get_historical_weather": "historical",
                "get_weather_trends": "historical",
                "search_location": "location",
                "get_data_freshness": "data_status",
                "get_agriculture_advice": "agriculture",
                "get_weather_recommendations": "recommendation",
                "show_visual_explanation": "visual_explanation",
                "compare_locations": "location_comparison",
                "compare_dates": "date_comparison",
                "compare_models": "date_comparison",
                "show_weather_alert": "weather_alert",
                "analyze_rain": "rain_timeline"
            }
            return mapping.get(tool_name)
            
        from backend.app.services.agent.guardrails import (
            weather_tool_input_guardrail,
            weather_tool_output_guardrail
        )
        
        tools = []
        for tool_name, (schema_cls, func) in TOOL_REGISTRY.items():
            if tool_names is not None and tool_name not in tool_names:
                continue
            
            # Create a closure for each tool
            def create_invoke(t_name):
                async def on_invoke(ctx, args_data):
                    if isinstance(args_data, str):
                        args_dict = json.loads(args_data)
                    else:
                        args_dict = args_data
                        
                    res = await cls.execute(t_name, args_dict)
                    if not res.success:
                        return {"error": res.error}
                    return res.data
                return on_invoke
                
            tool = FunctionTool(
                name=tool_name,
                description=func.__doc__ or f"Execute {tool_name}",
                params_json_schema=schema_cls.model_json_schema(),
                on_invoke_tool=create_invoke(tool_name),
                strict_json_schema=False,
                tool_input_guardrails=[weather_tool_input_guardrail],
                tool_output_guardrails=[weather_tool_output_guardrail]
            )
            tools.append(tool)
        return tools
