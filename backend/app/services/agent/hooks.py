import logging
from typing import Dict, Any, List, Optional
from agents import RunHooks
from backend.app.services.agent.schemas import CardItem

logger = logging.getLogger("skycast.agent.hooks")

def _map_tool_to_card_type(tool_name: str) -> Optional[str]:
    mapping = {
        "get_current_weather": "weather_summary",
        "get_forecast": "forecast_timeline",
        "get_weather_risk": "decision",
        "get_weather_alerts": "alert",
        "get_historical_weather": "historical",
        "get_weather_trends": "historical",
        "search_location": "location",
        "get_data_freshness": "data_status",
        "get_agriculture_advice": "decision",
        "get_weather_recommendations": "decision",
        "show_visual_explanation": "visual_explanation",
        "compare_locations": "location_comparison",
        "compare_dates": "date_comparison",
        "compare_models": "date_comparison",
        "show_weather_alert": "weather_alert",
        "analyze_rain": "rain_timeline",
        "create_weather_monitor": "monitor",
        "list_weather_monitors": "monitor",
        "explain_weather_alert": "triggered_alert"
    }
    return mapping.get(tool_name)


class UICardCollectorHook(RunHooks):
    """
    Agents SDK Lifecycle Hook to extract UI cards and state variables
    without polluting the tool business logic or intercepting tool execution.
    """
    def __init__(self, executed_cards: List[CardItem], state_callback):
        self.executed_cards = executed_cards
        self.state_callback = state_callback

    async def on_tool_end(self, context, agent, tool, result: object) -> None:
        if not isinstance(result, dict) or "error" in result:
            return

        t_name = getattr(tool, "name", "")
        if not t_name:
            return

        # City resolution callback
        if t_name in ["search_location", "get_current_weather", "get_forecast", "get_weather_risk"]:
            if "location" in result and self.state_callback:
                self.state_callback(result["location"])
            elif "name" in result and self.state_callback:
                self.state_callback(result["name"])

        # Card extraction logic
        if t_name == "get_forecast":
            target_p = result.get("target_period")
            act_eval = target_p.get("activity_suitability") if target_p else None
            analytics = result.get("analytics")
            
            if act_eval:
                if analytics:
                    act_eval["analytics"] = analytics
                self.executed_cards.append(CardItem(type="decision", data=act_eval))
            elif target_p and (target_p.get("period_type") in ["time_range", "exact_hour"] or result.get("hourly_forecast")):
                self.executed_cards.append(CardItem(type="forecast_timeline", data=result))
            else:
                self.executed_cards.append(CardItem(type="forecast_timeline", data=result))
        elif t_name == "get_agriculture_advice":
            spray_adv = result.get("spraying_advisory", {})
            weather = result.get("weather_snapshot", {})
            act_eval = {
                "activity": f"{result.get('crop')} Farming",
                "status": "favorable" if spray_adv.get("status") == "OPTIMAL" else "marginal" if spray_adv.get("status") == "MODERATE" else "unfavorable",
                "reason": spray_adv.get("summary"),
                "recommendation": result.get("irrigation_advisory", {}).get("guidance"),
                "temperature_c": weather.get("temperature_c"),
                "precipitation_probability": weather.get("rain_chance_pct"),
                "condition": weather.get("condition"),
                "wind_speed_kmh": weather.get("wind_speed_kmh"),
                "precipitation_mm": weather.get("precipitation_mm")
            }
            self.executed_cards.append(CardItem(type="decision", data=act_eval))
        elif t_name == "get_weather_recommendations":
            recs = result.get("recommendations", [])
            weather = result.get("weather_context", {})
            if isinstance(recs, list) and len(recs) > 0:
                rec = recs[0]
            elif isinstance(recs, dict):
                rec = recs
            else:
                rec = {}
                
            act_eval = {
                "activity": rec.get("activity", "General"),
                "status": "favorable" if rec.get("verdict") == "favorable" or rec.get("verdict") == "yes" else "marginal" if rec.get("verdict") == "caution" else "unfavorable",
                "reason": rec.get("reasons", [""])[0] if rec.get("reasons") else "",
                "recommendation": rec.get("action", ""),
                "temperature_c": weather.get("temperature_c"),
                "precipitation_probability": weather.get("rain_chance_pct"),
                "condition": weather.get("condition"),
                "wind_speed_kmh": weather.get("wind_speed_kmh"),
                "precipitation_mm": weather.get("precipitation_mm")
            }
            self.executed_cards.append(CardItem(type="decision", data=act_eval))
        else:
            card_type = _map_tool_to_card_type(t_name)
            if card_type:
                self.executed_cards.append(CardItem(type=card_type, data=result))
