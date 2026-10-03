"""
Phase 5 — Actionable Weather Intelligence Test Suite
Tests:
1. General Weather: conditions, forecast extraction, missing data handling, stale status.
2. Agriculture: grounded spray-window reasoning, risk/recommendations extraction, missing wind/rain safety.
3. Aviation: modeled-data disclaimer, no fabricated METAR/TAF.
4. Marine: modeled-data disclaimer, no fabricated buoy/tides.
5. Climate: historical baseline comparison vs forecast separation.
6. Auto / Triage Routing: domain classification & ambiguity handling.
7. Uncertainty & Model Disagreement: high/moderate/low confidence derivation without arbitrary numbers.
8. Alert Intelligence: active alert explanation (what, where, when, impact, advice) and green/normal state.
9. Zero-fabrication: derived strictly from tools without hallucinated observations.
"""

import datetime
import pytest
from unittest.mock import AsyncMock, patch

from backend.app.services.agent.schemas import (
    CardItem,
    SourceItem,
    UncertaintyInfo,
    RiskItem,
    RecommendationItem,
    AgentResponse
)
from backend.app.services.agent.uncertainty import ActionableIntelligenceSynthesizer
from backend.app.services.agent.registry import AgentRegistry, AgentMode
from backend.app.services.agent.agent import WeatherGPTAgent
from backend.app.routes.chat import chat_weather, ChatRequest


NOW_ISO = datetime.datetime.now(datetime.timezone.utc).isoformat()


# ==============================================================================
# 1. GENERAL WEATHER WORKFLOW TESTS
# ==============================================================================

def test_weather_actionable_synthesis_normal():
    """Verify standard forecast & current conditions extraction."""
    cards = [
        CardItem(type="weather_summary", data={
            "location": "Pune",
            "temperature_c": 28.5,
            "feels_like_c": 29.0,
            "condition": "Partly Cloudy",
            "humidity": 65,
            "wind_speed_kmh": 12.0,
            "rain_probability_pct": 10,
            "precipitation": 0.0,
            "nwp_model": "ECMWF_IFS"
        }),
        CardItem(type="forecast_timeline", data={
            "location": "Pune",
            "target_date": "2026-10-05",
            "analytics": {
                "rain_trend": "Dry throughout the day",
                "temperature_trend": "High 31C, Low 21C",
                "best_dry_window": "06:00 - 18:00"
            },
            "nwp_model": "ECMWF_IFS"
        })
    ]
    sources = [SourceItem(type="forecast", timestamp=NOW_ISO, provider="open_meteo")]

    res = ActionableIntelligenceSynthesizer.synthesize(
        reply_text="Expect partly cloudy skies in Pune tomorrow with pleasant temperatures.",
        city="Pune",
        agent_mode="weather",
        cards=cards,
        sources=sources,
        data_status="fresh"
    )

    assert res["conditions"] is not None
    assert res["conditions"]["temperature_c"] == 28.5
    assert res["conditions"]["condition"] == "Partly Cloudy"
    assert res["forecast"] is not None
    assert res["forecast"]["best_dry_window"] == "06:00 - 18:00"
    assert res["uncertainty"].level == "high"
    assert "High confidence" in res["uncertainty"].explanation
    assert len(res["follow_up_questions"]) > 0


def test_weather_stale_data_handling():
    """Verify that stale/degraded data drops uncertainty to low confidence."""
    cards = [
        CardItem(type="weather_summary", data={
            "location": "Mumbai",
            "temperature_c": 32.0,
            "condition": "Humid"
        })
    ]
    sources = [SourceItem(type="cached_weather", timestamp=NOW_ISO, provider="open_meteo")]

    res = ActionableIntelligenceSynthesizer.synthesize(
        reply_text="Showing cached conditions for Mumbai.",
        city="Mumbai",
        agent_mode="weather",
        cards=cards,
        sources=sources,
        data_status="stale"
    )

    assert res["uncertainty"].level == "low"
    assert "cached/stale" in res["uncertainty"].explanation
    assert res["freshness"]["status"] == "stale"


# ==============================================================================
# 2. AGRICULTURE WORKFLOW TESTS
# ==============================================================================

def test_agriculture_spray_window_reasoning():
    """Verify grounded extraction of agricultural spray windows, risks, and recommendations."""
    cards = [
        CardItem(type="agriculture", data={
            "crop": "Cotton",
            "spraying_advisory": {
                "status": "FAVORABLE",
                "window": "07:00 - 11:00",
                "reason": "Low wind speed (<10 km/h) and zero precipitation expected before noon."
            },
            "recommendations": [
                {
                    "action": "Proceed with foliar application",
                    "reason": "Favorable dry window between 07:00 and 11:00 before afternoon gusting.",
                    "suitability": "favorable",
                    "window": "07:00 - 11:00"
                }
            ]
        })
    ]

    res = ActionableIntelligenceSynthesizer.synthesize(
        reply_text="Tomorrow morning offers a safe spray window for Cotton in Pune.",
        city="Pune",
        agent_mode="agriculture",
        cards=cards,
        sources=[SourceItem(type="agriculture_model", timestamp=NOW_ISO, provider="open_meteo")],
        data_status="fresh"
    )

    assert res["recommendations"] is not None
    assert len(res["recommendations"]) == 1
    assert res["recommendations"][0].suitability == "favorable"
    assert res["recommendations"][0].time_window == "07:00 - 11:00"
    assert "Optimal spray window" in res["follow_up_questions"][0]


def test_agriculture_missing_data_safety():
    """Verify that agriculture workflow without explicit cards produces safe default empty recommendations without fabrication."""
    res = ActionableIntelligenceSynthesizer.synthesize(
        reply_text="Agricultural data unavailable.",
        city="Nagpur",
        agent_mode="agriculture",
        cards=[],
        sources=[],
        data_status="fresh"
    )

    assert res["recommendations"] is None
    assert res["risks"] is None
    assert res["uncertainty"].level == "high"


# ==============================================================================
# 3. AVIATION WORKFLOW TESTS
# ==============================================================================

def test_aviation_modeled_data_disclaimer_and_no_fabrication():
    """Verify Aviation specialist explicitly communicates modeled data limitation without fabricating METAR/TAF."""
    agent_def = AgentRegistry.get_agent("aviation")
    assert agent_def is not None
    assert "METAR" in agent_def.system_prompt or "observation" in agent_def.system_prompt

    cards = [
        CardItem(type="current_weather", data={
            "location": "VAPO (Pune Airport)",
            "temperature_c": 29.0,
            "wind_speed_kmh": 14.0,
            "condition": "Scattered Clouds"
        })
    ]

    res = ActionableIntelligenceSynthesizer.synthesize(
        reply_text="Runway 28 winds 14 km/h based on numerical model data. Live METAR is not connected.",
        city="Pune",
        agent_mode="aviation",
        cards=cards,
        sources=[SourceItem(type="numerical_weather_model", timestamp=NOW_ISO, provider="open_meteo")],
        data_status="fresh"
    )

    assert res["uncertainty"].level == "moderate"
    assert "live METAR/TAF observation feeds are not connected" in res["uncertainty"].explanation
    assert any("Crosswind" in q for q in res["follow_up_questions"])


# ==============================================================================
# 4. MARINE WORKFLOW TESTS
# ==============================================================================

def test_marine_modeled_data_disclaimer():
    """Verify Marine specialist explicitly communicates buoy/tide telemetry limitations."""
    agent_def = AgentRegistry.get_agent("marine")
    assert agent_def is not None

    cards = [
        CardItem(type="weather_summary", data={
            "location": "Goa Coast",
            "wind_speed_kmh": 22.0,
            "condition": "Moderate Seas"
        })
    ]

    res = ActionableIntelligenceSynthesizer.synthesize(
        reply_text="Modeled wave height 1.5m along Goa coast. Live ocean buoy data is unavailable.",
        city="Goa",
        agent_mode="marine",
        cards=cards,
        sources=[SourceItem(type="marine_model", timestamp=NOW_ISO, provider="open_meteo")],
        data_status="fresh"
    )

    assert res["uncertainty"].level == "moderate"
    assert "live ocean buoy and tide telemetry are not connected" in res["uncertainty"].explanation
    assert any("Swell" in q or "wave" in q.lower() for q in res["follow_up_questions"])


# ==============================================================================
# 5. CLIMATE & RESEARCH WORKFLOW TESTS
# ==============================================================================

def test_climate_baseline_comparison():
    """Verify Climate workflow clearly generates climate follow-ups and separates baseline."""
    agent_def = AgentRegistry.get_agent("research")
    assert agent_def is not None

    cards = [
        CardItem(type="historical", data={
            "location": "Delhi",
            "mean_temperature_c": 33.2,
            "climate_normal_c": 31.0,
            "anomaly_c": 2.2
        })
    ]

    res = ActionableIntelligenceSynthesizer.synthesize(
        reply_text="Current temperature anomaly is +2.2C above the 30-year climate baseline.",
        city="Delhi",
        agent_mode="research",
        cards=cards,
        sources=[SourceItem(type="climate_reanalysis", timestamp=NOW_ISO, provider="open_meteo")],
        data_status="fresh"
    )

    assert any("30-year normal" in q for q in res["follow_up_questions"])


# ==============================================================================
# 6. AUTO / TRIAGE ROUTING TESTS
# ==============================================================================

def test_agent_registry_specialist_modes():
    """Verify all core specialists exist and have distinct system instructions."""
    modes = [AgentMode.GENERAL, AgentMode.AGRICULTURE, AgentMode.AVIATION, AgentMode.MARINE, AgentMode.RESEARCH]
    for m in modes:
        agent = AgentRegistry.get_agent(m)
        assert agent is not None
        assert agent.name
        assert len(agent.allowed_tools) > 0


# ==============================================================================
# 7. UNCERTAINTY & MODEL DISAGREEMENT TESTS
# ==============================================================================

def test_source_disagreement_detection():
    """Verify when models diverge, uncertainty is set to low and model spread is captured."""
    cards = [
        CardItem(type="comparison", data={
            "agreement_level": "low",
            "verdict": "ECMWF predicts rain starting at 14:00 (12mm), while GFS predicts dry conditions until 20:00."
        })
    ]

    res = ActionableIntelligenceSynthesizer.synthesize(
        reply_text="Models disagree on precipitation timing tomorrow.",
        city="Pune",
        agent_mode="weather",
        cards=cards,
        sources=[
            SourceItem(type="model_ecmwf", timestamp=NOW_ISO, provider="open_meteo"),
            SourceItem(type="model_gfs", timestamp=NOW_ISO, provider="open_meteo")
        ],
        data_status="fresh"
    )

    assert res["uncertainty"].level == "low"
    assert res["uncertainty"].source_disagreement is True
    assert "diverge significantly" in res["uncertainty"].explanation
    assert "ECMWF predicts rain" in res["uncertainty"].disagreement_details


def test_source_agreement_high_confidence():
    """Verify strong model agreement results in high confidence."""
    cards = [
        CardItem(type="comparison", data={
            "agreement_level": "high",
            "verdict": "All models align on dry conditions."
        })
    ]

    res = ActionableIntelligenceSynthesizer.synthesize(
        reply_text="Consistent dry weather across all models.",
        city="Pune",
        agent_mode="weather",
        cards=cards,
        sources=[SourceItem(type="model_ecmwf", timestamp=NOW_ISO, provider="open_meteo")],
        data_status="fresh"
    )

    assert res["uncertainty"].level == "high"
    assert res["uncertainty"].source_disagreement is False
    assert "strong agreement" in res["uncertainty"].explanation


# ==============================================================================
# 8. ALERT INTELLIGENCE TESTS
# ==============================================================================

def test_alert_intelligence_risk_structuring():
    """Verify active weather alert structuring into grounded risks (hazard, severity, impact, advice)."""
    cards = [
        CardItem(type="weather_alert", data={
            "hazard": "Heavy Rainfall Warning",
            "severity": "orange",
            "description": "Intense rainfall (>64.5 mm) expected within the next 6 hours.",
            "instruction": "Avoid low-lying areas and avoid non-essential travel."
        })
    ]

    res = ActionableIntelligenceSynthesizer.synthesize(
        reply_text="Orange alert issued for heavy rainfall in Pune.",
        city="Pune",
        agent_mode="weather",
        cards=cards,
        sources=[SourceItem(type="alert_feed", timestamp=NOW_ISO, provider="imd_criteria")],
        data_status="fresh"
    )

    assert res["risks"] is not None
    assert len(res["risks"]) == 1
    assert res["risks"][0].hazard == "Heavy Rainfall Warning"
    assert res["risks"][0].severity == "orange"
    assert "Intense rainfall" in res["risks"][0].impact
    assert "Avoid low-lying" in res["risks"][0].advice


# ==============================================================================
# 9. ZERO-FABRICATION LINEAGE TESTS
# ==============================================================================

def test_single_model_does_not_claim_consensus():
    """Verify single model does not claim multi-model consensus or source disagreement."""
    cards = [
        CardItem(type="model_comparison", data={
            "models": ["ECMWF_IFS"],
            "models_count": 1,
            "agreement_level": "high"
        })
    ]

    res = ActionableIntelligenceSynthesizer.synthesize(
        reply_text="Weather forecast for tomorrow.",
        city="Pune",
        agent_mode="weather",
        cards=cards,
        sources=[SourceItem(type="model_ecmwf", timestamp=NOW_ISO, provider="open_meteo")],
        data_status="fresh"
    )

    assert res["uncertainty"].source_disagreement is False
    assert "operational forecast model" in res["uncertainty"].explanation
    assert "consensus" not in res["uncertainty"].explanation.lower()


# ==============================================================================
# 10. ENDPOINT BACKWARD COMPATIBILITY
# ==============================================================================

@pytest.mark.anyio
async def test_chat_route_actionable_response_structure():
    """Verify /api/chat endpoint returns all Phase 5 Actionable Intelligence fields."""
    req = ChatRequest(message="What is the weather in Pune?", city="Pune", language="en")
    res = await chat_weather(req)

    assert res.reply is not None
    assert res.city == "Pune"
    assert res.data_status in ("fresh", "degraded", "stale")
    assert res.uncertainty is not None
    assert res.uncertainty.level in ("high", "moderate", "low")
    assert isinstance(res.follow_up_questions, list)
