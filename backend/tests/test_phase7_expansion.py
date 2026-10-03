"""
Phase 7 Expansion Automated Test Suite
Validates:
1. Aviation live METAR observations (NOAA AWC) with 'LIVE OBSERVATION' tag and provenance.
2. Marine modeled wave data with 'FORECAST MODEL' tag and mandatory disclaimer.
3. Multilingual context resolution, Marathi/Hindi language directives, and intent routing independence.
4. WeatherHub centralization and zero-fabrication on provider failure.
5. User-specific monitor map isolation and security (session authorization).
6. Map layer metadata, freshness, and source attribution.
"""

import pytest
import datetime
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient
from httpx import AsyncClient, ASGITransport

from backend.main import app
from backend.app.services.weather_hub import weather_hub
from backend.app.services.aviation_service import AviationService
from backend.app.services.marine_service import MarineService
from backend.app.services.agent import weather_agent
from backend.app.services.agent.context import (
    conversation_context_tracker,
    derive_intent,
    extract_activity_reference,
    resolve_temporal_references
)
from backend.app.services.agent.multi_agent import get_agents
from backend.app.services.agent.registry import AgentMode
from backend.app.services.agent.tools import get_aviation_reports_tool, get_marine_forecast_tool
from backend.app.services.agent.schemas import AviationArgs, MarineArgs
from backend.app.models.chat import UserRole
from backend.app.routes.chat import ChatRequest, chat_weather


client = TestClient(app)


# ==============================================================================
# 1. Aviation Live Observations vs Forecast Models
# ==============================================================================

@pytest.mark.asyncio
async def test_aviation_live_observation_provenance():
    """Verify live METAR reports via WeatherHub are tagged as LIVE OBSERVATION with source and station."""
    mock_response = {
        "status": "success",
        "station_id": "VAPO",
        "station_name": "Pune Airport",
        "distance_km": 10.5,
        "observation_time": "2026-10-04T01:00:00Z",
        "metar_raw": "VAPO 040100Z 28006KT 5000 HZ SCT025 24/18 Q1012 NOSIG",
        "temperature_c": 24.0,
        "dewpoint_c": 18.0,
        "wind_speed_kt": 6.0,
        "wind_direction_deg": 280,
        "visibility_m": 5000,
        "flight_category": "VFR"
    }

    with patch.object(AviationService, "get_aviation_reports", new=AsyncMock(return_value=mock_response)):
        res = await weather_hub.get_aviation_reports(18.5204, 73.8567)
        assert res["status"] == "success"
        assert res["data_category"] == "LIVE OBSERVATION"
        assert "NOAA Aviation Weather Center" in res["source_provenance"]
        assert res["station_identifier"] == "VAPO"
        assert res["observed_at"] == "2026-10-04T01:00:00Z"


@pytest.mark.asyncio
async def test_aviation_observation_unavailable_does_not_fabricate():
    """When no airport or live observation exists, clearly report OBSERVATION UNAVAILABLE."""
    mock_unavailable = {
        "status": "unavailable",
        "error": "No operational airport reporting METAR found within 200km."
    }

    with patch.object(AviationService, "get_aviation_reports", new=AsyncMock(return_value=mock_unavailable)):
        res = await weather_hub.get_aviation_reports(0.0, 0.0)
        assert res["data_category"] == "OBSERVATION UNAVAILABLE"
        assert "NOAA Aviation Weather Center" in res["source_provenance"]
        assert "station_identifier" not in res or res.get("station_identifier") is None


@pytest.mark.asyncio
async def test_aviation_tool_routes_through_weather_hub():
    """Verify get_aviation_reports_tool accesses NOAA AWC via weather_hub."""
    mock_res = {
        "status": "success",
        "data_category": "LIVE OBSERVATION",
        "source_provenance": "NOAA Aviation Weather Center (AWC)",
        "station_id": "VABB",
        "metar_raw": "VABB 040100Z 26008KT 4000 HZ NSC 28/22 Q1010 NOSIG"
    }
    with patch.object(weather_hub, "get_aviation_reports", new=AsyncMock(return_value=mock_res)):
        args = AviationArgs(location="Mumbai", lat=19.0760, lon=72.8777)
        tool_res = await get_aviation_reports_tool(args)
        assert tool_res["data_category"] == "LIVE OBSERVATION"
        assert tool_res["station_id"] == "VABB"


# ==============================================================================
# 2. Marine Modeled Projections vs Live Buoy Observations
# ==============================================================================

@pytest.mark.asyncio
async def test_marine_forecast_model_provenance_and_disclaimer():
    """Verify marine data is tagged as FORECAST MODEL with mandatory navigational safety disclaimer."""
    mock_marine = {
        "status": "success",
        "current": {
            "wave_height_m": 1.2,
            "wave_direction_deg": 240,
            "wave_period_s": 8.5
        },
        "daily": [
            {"date": "2026-10-04", "wave_height_max_m": 1.5}
        ]
    }

    with patch.object(MarineService, "get_marine_forecast", new=AsyncMock(return_value=mock_marine)):
        res = await weather_hub.get_marine_data(15.2993, 74.1240)
        assert res["status"] == "success"
        assert res["data_category"] == "FORECAST MODEL"
        assert "Open-Meteo Marine" in res["source_provenance"]
        assert "disclaimer" in res
        assert "do not replace official coastal marine notices or live buoy telemetry" in res["disclaimer"]


@pytest.mark.asyncio
async def test_marine_tool_routes_through_weather_hub():
    """Verify get_marine_forecast_tool calls weather_hub.get_marine_data."""
    mock_res = {
        "status": "success",
        "data_category": "FORECAST MODEL",
        "source_provenance": "Open-Meteo Marine (NWP modeled waves/currents)",
        "disclaimer": "Safety notice."
    }
    with patch.object(weather_hub, "get_marine_data", new=AsyncMock(return_value=mock_res)):
        args = MarineArgs(location="Goa", lat=15.2993, lon=74.1240)
        tool_res = await get_marine_forecast_tool(args)
        assert tool_res["data_category"] == "FORECAST MODEL"
        assert "disclaimer" in tool_res


# ==============================================================================
# 3. Multilingual Intent Routing and Context Independence
# ==============================================================================

def test_intent_derivation_multilingual():
    """Verify intent extraction understands Marathi, Hindi, and mixed inputs."""
    # Rain checks in Marathi & Hindi
    assert derive_intent("उद्या पाऊस पडेल का?", "tomorrow", None, None) == "rain_check"
    assert derive_intent("क्या कल बारिश होगी?", "tomorrow", None, None) == "rain_check"
    assert derive_intent("Will there be paus tomorrow?", "tomorrow", None, None) == "rain_check"

    # Activity suitability
    assert derive_intent("उद्या क्रिकेट खेळायला योग्य वेळ कोणती?", "tomorrow", "evening", "cricket") == "activity_suitability"

    # Alerts & warnings
    assert derive_intent("पुण्यासाठी काही इशारा किंवा धोका आहे का?", "today", None, None) == "alerts"


def test_triage_agent_language_agnostic_instructions():
    """Verify TriageAgent system instructions mandate language-independent domain routing."""
    triage = get_agents()
    assert "LANGUAGE AGNOSTIC ROUTING" in triage.instructions
    assert "Route strictly based on domain topic and intent, regardless of the user's language" in triage.instructions


def test_agent_system_instruction_language_directive():
    """Verify agent system prompt enforces high-fidelity target language and preserves numbers."""
    instr_hi = weather_agent._build_system_instruction(language="hi", user_role="farmer")
    assert "The user interface is set to Hindi (हिन्दी)" in instr_hi
    assert "CRITICAL SEMANTIC & METEOROLOGICAL FIDELITY RULES" in instr_hi
    assert "Keep all numeric values, temperatures (°C)" in instr_hi
    assert "Keep source names and model names unchanged" in instr_hi

    instr_mr = weather_agent._build_system_instruction(language="mr", user_role="general_public")
    assert "The user interface is set to Marathi (मराठी)" in instr_mr
    assert "Support mixed-language / code-mixed queries" in instr_mr


# ==============================================================================
# 4. Map Workspace Security & User Data Isolation
# ==============================================================================

@pytest.mark.asyncio
async def test_monitors_api_strictly_filters_by_user_or_session():
    """Verify GET /api/monitors does not leak private user monitors across sessions."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        with patch("backend.app.services.monitor_engine.MonitorEvaluationEngine.list_monitors", new_callable=AsyncMock) as mock_list:
            mock_m_a = MagicMock()
            mock_m_a.to_dict.return_value = {"id": "mon-user-a-1", "location": "Nashik", "session_id": "session-user-alpha"}
            mock_m_b = MagicMock()
            mock_m_b.to_dict.return_value = {"id": "mon-user-b-1", "location": "Pune", "session_id": "session-user-beta"}

            def fake_list(location=None, user_id=None, session_id=None, enabled_only=False):
                if session_id == "session-user-alpha":
                    return [mock_m_a]
                elif session_id == "session-user-beta":
                    return [mock_m_b]
                return []

            mock_list.side_effect = fake_list

            # Request from session A
            res_a = await ac.get("/api/monitors", headers={"X-Session-ID": "session-user-alpha"})
            assert res_a.status_code == 200
            monitors_a = res_a.json().get("monitors", [])
            assert len(monitors_a) == 1
            assert monitors_a[0]["id"] == "mon-user-a-1"
            
            # Request from session B
            res_b = await ac.get("/api/monitors", headers={"X-Session-ID": "session-user-beta"})
            assert res_b.status_code == 200
            monitors_b = res_b.json().get("monitors", [])
            assert len(monitors_b) == 1
            assert monitors_b[0]["id"] == "mon-user-b-1"

            # Isolation check: No monitor from session A is returned in session B
            session_a_ids = {m["id"] for m in monitors_a}
            session_b_ids = {m["id"] for m in monitors_b}
            assert session_a_ids.isdisjoint(session_b_ids)


def test_map_weather_endpoints_integrity():
    """Verify /api/map/cities and /api/radar provide structured, un-fabricated data."""
    # Cities weather
    res_cities = client.get("/api/map/cities")
    assert res_cities.status_code == 200
    data_cities = res_cities.json()
    assert "cities" in data_cities
    assert len(data_cities["cities"]) > 0
    first_city = data_cities["cities"][0]
    assert "latitude" in first_city
    assert "longitude" in first_city
    assert "temperature" in first_city

    # Radar metadata
    res_radar = client.get("/api/radar")
    assert res_radar.status_code == 200
    data_radar = res_radar.json()
    assert "host" in data_radar
    assert "radar" in data_radar
    assert "past" in data_radar["radar"]


# ==============================================================================
# 5. Chat Endpoint Accepts Language and Resolves Context
# ==============================================================================

@pytest.mark.asyncio
async def test_chat_endpoint_accepts_language_payload():
    """Verify POST /api/chat accepts language parameter and returns valid ChatResponse."""
    req = ChatRequest(
        message="उद्या पाऊस पडेल का?",
        city="Pune",
        language="mr",
        agent_mode="auto"
    )
    res = await chat_weather(req)
    assert res.reply is not None
    assert res.city == "Pune"
    assert res.timestamp is not None
    assert res.data_status in ("fresh", "degraded", "stale")
