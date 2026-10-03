import datetime
import pytest
from unittest.mock import patch, MagicMock, AsyncMock

from backend.app.services.agent.context import (
    resolve_temporal_reference,
    resolve_temporal_references,
    normalize_target_date,
    conversation_context_tracker
)
from backend.app.services.agent.schemas import (
    ForecastArgs,
    RecommendationArgs,
    AnalyzeRainArgs
)
from backend.app.services.agent.tools import (
    get_forecast_tool,
    analyze_rain_tool,
    get_weather_recommendations_tool
)
from backend.app.services.recommendation_service import RecommendationService
from backend.app.services.agent.multi_agent import get_agents
from backend.app.services.agent.agent import WeatherGPTAgent


# ==============================================================================
# 1. Temporal Precedence Tests (Fix 2)
# ==============================================================================

@pytest.mark.anyio
async def test_temporal_precedence_day_after_tomorrow():
    today = datetime.date.today()
    expected_iso = (today + datetime.timedelta(days=2)).isoformat()

    # Must resolve to day_after_tomorrow, NOT tomorrow
    key, expr, iso = resolve_temporal_reference("What about the day after tomorrow?")
    assert key == "day_after_tomorrow"
    assert "the day after tomorrow" in expr
    assert iso == expected_iso


@pytest.mark.anyio
async def test_temporal_precedence_tomorrow():
    today = datetime.date.today()
    expected_iso = (today + datetime.timedelta(days=1)).isoformat()

    key, expr, iso = resolve_temporal_reference("What is the weather tomorrow in Pune?")
    assert key == "tomorrow"
    assert expr == "tomorrow"
    assert iso == expected_iso


@pytest.mark.anyio
async def test_temporal_precedence_today():
    today = datetime.date.today()
    key, expr, iso = resolve_temporal_reference("What is the weather today in Pune?")
    assert key == "today"
    assert expr == "today"
    assert iso == today.isoformat()


@pytest.mark.anyio
async def test_temporal_precedence_marathi():
    today = datetime.date.today()
    # Parwa (day after tomorrow in Marathi)
    key_parwa, _, iso_parwa = resolve_temporal_reference("परवा पुण्यात पाऊस पडेल का?")
    assert key_parwa == "day_after_tomorrow"
    assert iso_parwa == (today + datetime.timedelta(days=2)).isoformat()

    # Udya (tomorrow in Marathi)
    key_udya, _, iso_udya = resolve_temporal_reference("उद्या पुण्यात पाऊस पडेल का?")
    assert key_udya == "tomorrow"
    assert iso_udya == (today + datetime.timedelta(days=1)).isoformat()


# ==============================================================================
# 2. Centralized Date Normalization Tests (Fix 3)
# ==============================================================================

@pytest.mark.anyio
async def test_normalize_target_date_spacing_and_underscores():
    today = datetime.date.today()
    today_iso = today.isoformat()
    tmrw_iso = (today + datetime.timedelta(days=1)).isoformat()
    day_after_iso = (today + datetime.timedelta(days=2)).isoformat()

    assert normalize_target_date("today") == today_iso
    assert normalize_target_date("tomorrow") == tmrw_iso
    assert normalize_target_date("day after tomorrow") == day_after_iso
    assert normalize_target_date("day_after_tomorrow") == day_after_iso
    assert normalize_target_date("the day after tomorrow") == day_after_iso
    assert normalize_target_date("2026-09-03") == "2026-09-03"


@pytest.mark.anyio
async def test_tools_use_centralized_normalization():
    today = datetime.date.today()
    day_after_iso = (today + datetime.timedelta(days=2)).isoformat()

    # Spaced "day after tomorrow" in get_forecast
    res_forecast = await get_forecast_tool(ForecastArgs(location="Pune", date="day after tomorrow"))
    assert res_forecast.get("day_forecast", {}).get("date_iso") == day_after_iso

    # Spaced "day after tomorrow" in analyze_rain
    res_rain = await analyze_rain_tool(AnalyzeRainArgs(location="Pune", date="day after tomorrow"))
    assert res_rain.get("target_date") == day_after_iso


# ==============================================================================
# 3. Recommendation Service Date Awareness (Fix 5)
# ==============================================================================

@pytest.mark.anyio
async def test_recommendation_service_future_date_awareness():
    today = datetime.date.today()
    tmrw_iso = (today + datetime.timedelta(days=1)).isoformat()

    # Query recommendation for tomorrow
    with patch("backend.app.services.weather_hub.weather_hub.get_weather_for_city", new_callable=AsyncMock) as mock_hub:
        mock_hub.return_value = {
            "city": "Pune",
            "daily": [
                {
                    "date_iso": str(datetime.date.today()),
                    "rainChance": 10
                },
                {
                    "date_iso": tmrw_iso,
                    "rainChance": 90,
                    "daily_precipitation_probability": 90
                }
            ]
        }
        rec_res = await RecommendationService.get_recommendations(
            city_name="Pune",
            activity="umbrella",
            date="tomorrow"
        )

        assert rec_res.get("status") == "ready"
        assert rec_res.get("target_date") == tmrw_iso

        umbrella_rec = rec_res.get("recommendations")
        if isinstance(umbrella_rec, list):
            umbrella_rec = next((r for r in umbrella_rec if r["activity"] == "umbrella"), None)
        assert umbrella_rec is not None
        assert umbrella_rec.get("activity") == "umbrella"
        assert "accessible" in umbrella_rec["action"].lower()


@pytest.mark.anyio
async def test_recommendation_tool_passes_date_parameter():
    today = datetime.date.today()
    tmrw_iso = (today + datetime.timedelta(days=1)).isoformat()

    tool_res = await get_weather_recommendations_tool(RecommendationArgs(
        location="Pune",
        activity="umbrella",
        date="tomorrow"
    ))
    assert tool_res.get("target_date") == tmrw_iso


# ==============================================================================
# 4. Dynamic Context Injection & Fallback Wording (Fix 1 & Fix 4)
# ==============================================================================

@pytest.mark.anyio
async def test_dynamic_instruction_injected_into_specialists():
    custom_instruction = "=== TEMPORAL GROUNDING ===\n- Current Date: 2026-09-02\n- Target Date: tomorrow (2026-09-03)"
    triage = get_agents(model="openai/gpt-oss-120b", dynamic_instruction=custom_instruction)

    assert "Current Date: 2026-09-02" in triage.instructions
    for specialist in triage.handoffs:
        assert "Current Date: 2026-09-02" in specialist.instructions
        assert "Target Date: tomorrow (2026-09-03)" in specialist.instructions
        # Anti-fabrication check
        assert "inferred from surrounding hours" in specialist.instructions


@pytest.mark.anyio
async def test_deterministic_fallback_uses_correct_temporal_wording():
    agent = WeatherGPTAgent()
    
    # Context resolved for tomorrow
    ctx_tmrw = conversation_context_tracker.resolve_context(
        user_text="Will it rain in Pune tomorrow?",
        session_id="fallback_test_tmrw",
        default_city="Pune"
    )
    
    res_tmrw = await agent._execute_deterministic_fallback(
        user_text="Will it rain in Pune tomorrow?",
        city="Pune",
        session_id="fallback_test_tmrw",
        context=ctx_tmrw
    )
    
    assert "in Pune tomorrow" in res_tmrw.reply
    assert "in Pune today" not in res_tmrw.reply
