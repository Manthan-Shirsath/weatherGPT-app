import pytest
import datetime
from unittest.mock import AsyncMock, patch

from backend.app.services.agent.context import derive_intent, ConversationContext, conversation_context_tracker
from backend.app.services.agent.activity_evaluator import ActivityEvaluator
from backend.app.services.agent.tools import get_forecast_tool
from backend.app.services.agent.schemas import ForecastArgs
from backend.app.services.agent.agent import WeatherGPTAgent

# A. Explanation Intent
def test_explanation_intent():
    # Direct questions
    assert derive_intent("Why is it raining?", "today", None, None) == "visual_explanation"
    assert derive_intent("What causes this heatwave?", "today", None, None) == "visual_explanation"
    assert derive_intent("Pune is getting crazy rain today. What's going on?", "today", None, None) == "visual_explanation" # "what's going on" is hard to catch with pure keywords, but we expect the LLM to catch it. We only test keywords here.
    
    # Marathi questions
    assert derive_intent("पाऊस का पडत आहे?", "today", None, None) == "visual_explanation"
    assert derive_intent("उकडण्याचे कारण काय?", "today", None, None) == "visual_explanation"

# C & D. Activity Evaluation & Best-Time Calculation
def test_best_time_calculation():
    hourly_slots = [
        {"time": "08:00", "hour": 8, "temperature_c": 22, "precipitation_probability": 0, "wind_speed_kmh": 10},
        {"time": "12:00", "hour": 12, "temperature_c": 35, "precipitation_probability": 0, "wind_speed_kmh": 15},
        {"time": "16:00", "hour": 16, "temperature_c": 28, "precipitation_probability": 80, "wind_speed_kmh": 20},
        {"time": "18:00", "hour": 18, "temperature_c": 25, "precipitation_probability": 0, "wind_speed_kmh": 10},
    ]
    
    # Cricket requires daylight and penalizes rain
    cricket_best = ActivityEvaluator.evaluate_best_time("cricket", hourly_slots, "2026-08-31")
    assert cricket_best is not None
    # 08:00 has temp 22 (optimal 20-32), rain 0 -> score 100
    # 12:00 has temp 35 (above optimal) -> score 100 - (35-32)*2 = 94
    # 16:00 has rain 80 -> score 100 - 80*2 = -60 -> 0
    # 18:00 has temp 25, rain 0 -> score 100
    assert cricket_best["recommended_start"] in ["08:00", "18:00"]
    assert cricket_best["status"] == "favorable"
    
    # Running doesn't strictly require daylight, optimal temp is 10-25
    running_best = ActivityEvaluator.evaluate_best_time("running", hourly_slots, "2026-08-31")
    assert running_best is not None
    assert running_best["recommended_start"] == "08:00"  # temp 22 is in optimal range, 18:00 is also 25
    
    # Test night activity (if any) or when daylight is required but all slots are night
    night_slots = [
        {"hour": 22, "temperature_c": 20, "precipitation_probability": 0, "wind_speed_kmh": 5}
    ]
    cricket_night = ActivityEvaluator.evaluate_best_time("cricket", night_slots, "2026-08-31")
    assert cricket_night is None # Filtered out due to daylight

import asyncio

def test_get_forecast_tool_best_time():
    async def run_test():
        # Mock weather hub
        with patch("backend.app.services.weather_hub.weather_hub.get_weather_for_city", new_callable=AsyncMock) as mock_hub:
            mock_hub.return_value = {
                "city": "Pune",
                "daily": [
                    {
                        "date_iso": "2026-08-31",
                        "day": "Tomorrow",
                        "highC": 30,
                        "lowC": 20,
                        "rainChance": 10
                    }
                ],
                "hourlySeries": [
                    {"time_iso": "2026-08-31T08:00", "date": "2026-08-31", "hour": 8, "temperature_c": 22, "precipitation_probability": 0, "wind_speed_kmh": 10},
                    {"time_iso": "2026-08-31T16:00", "date": "2026-08-31", "hour": 16, "temperature_c": 28, "precipitation_probability": 90, "wind_speed_kmh": 20}
                ]
            }
            
            args = ForecastArgs(location="Pune", date="2026-08-31", activity="cricket")
            res = await get_forecast_tool(args)
            assert res is not None
            assert "target_period" in res
            assert res["target_period"]["period_type"] == "best_time"
            assert res["target_period"]["hour"] == "08:00"
            assert res["target_period"]["activity_suitability"]["activity"] == "cricket"
            assert res["target_period"]["activity_suitability"]["status"] == "favorable"
            
            # H. Canonical precipitation fields
            assert "precipitation_probability" in res["target_period"]
            assert "precipitation_mm" in res["target_period"]
    
    asyncio.run(run_test())

# G. Fallback behavior preserving context
def test_fallback_preserves_context():
    async def run_test():
        agent = WeatherGPTAgent(api_key="invalid_key")
        # Context says tomorrow, activity cricket
        session_id = "test-fallback"
        conversation_context_tracker.resolve_context(
            session_id, "When is a good time to play cricket tomorrow?", default_city="Pune"
        )
        
        with patch("backend.app.services.weather_hub.weather_hub.get_weather_for_city", new_callable=AsyncMock) as mock_hub, \
             patch("agents.Runner.run", AsyncMock(side_effect=Exception("API Error"))):
            mock_hub.return_value = {
                "city": "Pune",
                "tempC": 25,
                "daily": [
                    {
                        "date_iso": str(datetime.date.today() + datetime.timedelta(days=1)),
                        "day": "Tomorrow",
                        "highC": 30,
                        "lowC": 20,
                        "rainChance": 10
                    }
                ],
                "hourlySeries": [
                    {"time_iso": f"{str(datetime.date.today() + datetime.timedelta(days=1))}T08:00", "date": str(datetime.date.today() + datetime.timedelta(days=1)), "hour": 8, "temperature_c": 22, "precipitation_probability": 0, "wind_speed_kmh": 10}
                ]
            }
            
            res = await agent.run("When is a good time to play cricket tomorrow?", session_id=session_id)
            assert res.data_status == "degraded"
            
            # Check if activity suitability card is present
            has_activity_card = any(c.type == "activity_suitability" for c in res.cards)
            assert has_activity_card, "Fallback should preserve activity context and return suitability card"
    
    asyncio.run(run_test())
