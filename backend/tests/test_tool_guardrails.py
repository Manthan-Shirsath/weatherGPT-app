import pytest
from unittest.mock import patch, MagicMock
from agents.tool_guardrails import (
    ToolGuardrailFunctionOutput,
    ToolInputGuardrailData,
    ToolOutputGuardrailData
)
from agents.exceptions import (
    ToolInputGuardrailTripwireTriggered,
    ToolOutputGuardrailTripwireTriggered,
    InputGuardrailTripwireTriggered
)
from agents.tool_context import ToolContext
from backend.app.services.agent.guardrails import (
    weather_tool_input_guardrail,
    weather_tool_output_guardrail,
    safety_input_guardrail,
    severe_weather_output_guardrail
)
from backend.app.services.agent.agent import WeatherGPTAgent
from backend.app.services.agent.multi_agent import get_agents
from backend.app.services.agent.executor import ToolExecutor


def make_tool_input_data(tool_name: str, tool_input: dict) -> ToolInputGuardrailData:
    ctx = ToolContext(
        context=None,
        tool_name=tool_name,
        tool_call_id="call_test_123",
        tool_arguments="{}",
        tool_input=tool_input
    )
    return ToolInputGuardrailData(context=ctx, agent=None)


def make_tool_output_data(tool_name: str, tool_input: dict, output: any) -> ToolOutputGuardrailData:
    ctx = ToolContext(
        context=None,
        tool_name=tool_name,
        tool_call_id="call_test_123",
        tool_arguments="{}",
        tool_input=tool_input
    )
    return ToolOutputGuardrailData(context=ctx, agent=None, output=output)


@pytest.fixture
def agent():
    return WeatherGPTAgent(api_key="dummy-test-key", model="openai/gpt-oss-120b")


# ==============================================================================
# 1. Tool Input Guardrail Tests
# ==============================================================================

@pytest.mark.anyio
async def test_tool_input_valid_arguments():
    data = make_tool_input_data("get_current_weather", {"location": "Pune", "lat": 18.52, "lon": 73.85})
    res = weather_tool_input_guardrail.guardrail_function(data)
    assert isinstance(res, ToolGuardrailFunctionOutput)
    assert res.behavior.get("type") == "allow"


@pytest.mark.anyio
async def test_tool_input_invalid_latitude():
    # Lat > 90
    data_high = make_tool_input_data("get_current_weather", {"location": "Pune", "lat": 120.0, "lon": 73.85})
    res_high = weather_tool_input_guardrail.guardrail_function(data_high)
    assert res_high.behavior.get("type") == "raise_exception"
    assert "Invalid latitude" in res_high.output_info

    # Lat < -90
    data_low = make_tool_input_data("get_current_weather", {"location": "Pune", "lat": -95.0, "lon": 73.85})
    res_low = weather_tool_input_guardrail.guardrail_function(data_low)
    assert res_low.behavior.get("type") == "raise_exception"
    assert "Invalid latitude" in res_low.output_info


@pytest.mark.anyio
async def test_tool_input_invalid_longitude():
    # Lon > 180
    data_high = make_tool_input_data("get_current_weather", {"location": "Pune", "lat": 18.52, "lon": 250.0})
    res_high = weather_tool_input_guardrail.guardrail_function(data_high)
    assert res_high.behavior.get("type") == "raise_exception"
    assert "Invalid longitude" in res_high.output_info

    # Lon < -180
    data_low = make_tool_input_data("get_current_weather", {"location": "Pune", "lat": 18.52, "lon": -190.0})
    res_low = weather_tool_input_guardrail.guardrail_function(data_low)
    assert res_low.behavior.get("type") == "raise_exception"
    assert "Invalid longitude" in res_low.output_info


@pytest.mark.anyio
async def test_tool_input_excessive_forecast_horizon():
    # Days > 16 should be blocked
    data_excessive = make_tool_input_data("get_forecast", {"location": "Pune", "days": 30})
    res = weather_tool_input_guardrail.guardrail_function(data_excessive)
    assert res.behavior.get("type") == "raise_exception"
    assert "Forecast horizon" in res.output_info

    # Days < 1 should be blocked
    data_zero = make_tool_input_data("get_forecast", {"location": "Pune", "days": 0})
    res_zero = weather_tool_input_guardrail.guardrail_function(data_zero)
    assert res_zero.behavior.get("type") == "raise_exception"


@pytest.mark.anyio
async def test_tool_input_invalid_historical_range():
    # Historical range > 365 days should be blocked
    data = make_tool_input_data("get_historical_weather", {"location": "Pune", "range_days": 500})
    res = weather_tool_input_guardrail.guardrail_function(data)
    assert res.behavior.get("type") == "raise_exception"
    assert "Historical range" in res.output_info


@pytest.mark.anyio
async def test_tool_input_malformed_location():
    # Solely symbols / punctuation
    data_symbols = make_tool_input_data("get_current_weather", {"location": "###$$$@@@"})
    res = weather_tool_input_guardrail.guardrail_function(data_symbols)
    assert res.behavior.get("type") == "raise_exception"
    assert "contains no valid alphanumeric characters" in res.output_info

    # Oversized location > 100 chars
    data_oversized = make_tool_input_data("get_current_weather", {"location": "A" * 150})
    res_over = weather_tool_input_guardrail.guardrail_function(data_oversized)
    assert res_over.behavior.get("type") == "raise_exception"
    assert "exceeds maximum length" in res_over.output_info


# ==============================================================================
# 2. Tool Output Guardrail Tests
# ==============================================================================

@pytest.mark.anyio
async def test_tool_output_valid_observations():
    data = make_tool_output_data(
        "get_current_weather",
        {"location": "Pune"},
        {
            "temperature_c": 28.5,
            "humidity_pct": 65,
            "wind_speed_kmh": 12.0,
            "precipitation_mm": 0.0,
            "condition": "Partly Cloudy"
        }
    )
    res = weather_tool_output_guardrail.guardrail_function(data)
    assert isinstance(res, ToolGuardrailFunctionOutput)
    assert res.behavior.get("type") == "allow"


@pytest.mark.anyio
async def test_tool_output_malformed_corrupted():
    # Null output
    data_null = make_tool_output_data("get_current_weather", {"location": "Pune"}, None)
    res_null = weather_tool_output_guardrail.guardrail_function(data_null)
    assert res_null.behavior.get("type") == "raise_exception"

    # Non-dict output
    data_str = make_tool_output_data("get_current_weather", {"location": "Pune"}, "corrupted string response")
    res_str = weather_tool_output_guardrail.guardrail_function(data_str)
    assert res_str.behavior.get("type") == "raise_exception"

    # Unphysical temperature > 70C
    data_temp_hot = make_tool_output_data("get_current_weather", {"location": "Pune"}, {"temperature_c": 150.0})
    res_hot = weather_tool_output_guardrail.guardrail_function(data_temp_hot)
    assert res_hot.behavior.get("type") == "raise_exception"
    assert "Unphysical temperature" in res_hot.output_info

    # Unphysical temperature < -100C
    data_temp_cold = make_tool_output_data("get_current_weather", {"location": "Pune"}, {"temperature_c": -120.0})
    res_cold = weather_tool_output_guardrail.guardrail_function(data_temp_cold)
    assert res_cold.behavior.get("type") == "raise_exception"

    # Invalid relative humidity > 100%
    data_hum = make_tool_output_data("get_current_weather", {"location": "Pune"}, {"humidity": 150})
    res_hum = weather_tool_output_guardrail.guardrail_function(data_hum)
    assert res_hum.behavior.get("type") == "raise_exception"
    assert "Invalid relative humidity" in res_hum.output_info


@pytest.mark.anyio
async def test_tool_output_domain_and_transient_failures_handled_safely():
    # Expected domain failure (location not found) -> allowed as domain outcome
    data_not_found = make_tool_output_data(
        "search_location",
        {"query": "UnknownCityXYZ"},
        {"found": False, "message": "Could not find geographic coordinates"}
    )
    res_nf = weather_tool_output_guardrail.guardrail_function(data_not_found)
    assert res_nf.behavior.get("type") == "allow"

    # Expected domain outcome (insufficient historical data) -> allowed
    data_hist = make_tool_output_data(
        "get_historical_weather",
        {"location": "Pune"},
        {"insufficient_data": True, "message": "No historical snapshots recorded"}
    )
    res_hist = weather_tool_output_guardrail.guardrail_function(data_hist)
    assert res_hist.behavior.get("type") == "allow"

    # Transient provider failure with stale data -> allowed
    data_stale = make_tool_output_data(
        "get_current_weather",
        {"location": "Pune"},
        {"stale": True, "error": "Provider timeout, served from cache", "temperature_c": 24.0}
    )
    res_stale = weather_tool_output_guardrail.guardrail_function(data_stale)
    assert res_stale.behavior.get("type") == "allow"

    # Structured error message from tool execution -> allowed
    data_err = make_tool_output_data(
        "get_current_weather",
        {"location": "Pune"},
        {"error": "Weather data hub unavailable"}
    )
    res_err = weather_tool_output_guardrail.guardrail_function(data_err)
    assert res_err.behavior.get("type") == "allow"


# ==============================================================================
# 3. Agent Integration & Anti-Fabrication Tests
# ==============================================================================

@pytest.mark.anyio
async def test_tool_guardrail_tripwire_caught_by_agent_loop(agent):
    with patch("agents.Runner.run") as mock_run:
        mock_output = ToolGuardrailFunctionOutput(
            output_info="Invalid latitude 150.0: must be between -90.0 and 90.0",
            behavior={"type": "raise_exception"}
        )
        mock_run.side_effect = ToolInputGuardrailTripwireTriggered(guardrail=None, output=mock_output)

        response = await agent.run("What is the weather at lat 150?")

        assert response.is_fallback is False
        assert "Safety Notice" in response.reply
        assert "Invalid latitude 150.0" in response.reply
        assert len(response.cards) == 1
        assert response.cards[0].type == "safety_notice"
        assert "Invalid latitude" in response.cards[0].data["reason"]


@pytest.mark.anyio
async def test_tools_attached_with_native_guardrails():
    # Verify get_openai_tools instantiates FunctionTool with tool guardrails
    tools = ToolExecutor.get_openai_tools(["get_current_weather", "get_forecast"])
    assert len(tools) == 2
    for t in tools:
        assert t.tool_input_guardrails is not None
        assert len(t.tool_input_guardrails) >= 1
        assert t.tool_output_guardrails is not None
        assert len(t.tool_output_guardrails) >= 1


@pytest.mark.anyio
async def test_native_handoff_and_phase3a1_guardrails_intact():
    # Verify TriageAgent -> Specialists handoffs and Input/Output guardrails intact
    triage = get_agents(model="openai/gpt-oss-120b")

    assert triage.name == "TriageAgent"
    assert len(triage.input_guardrails) == 1
    assert triage.input_guardrails[0].get_name() == "safety_input_guardrail"
    assert len(triage.handoffs) == 5

    specialist_names = [h.name for h in triage.handoffs]
    assert "WeatherAgent" in specialist_names
    assert "AgricultureAgent" in specialist_names
    assert "ClimateAgent" in specialist_names
    assert "AviationAgent" in specialist_names
    assert "MarineAgent" in specialist_names

    for specialist in triage.handoffs:
        assert len(specialist.output_guardrails) == 1
        assert specialist.output_guardrails[0].get_name() == "severe_weather_output_guardrail"
        assert len(specialist.tools) > 0
        for tool in specialist.tools:
            assert len(tool.tool_input_guardrails) == 1
            assert len(tool.tool_output_guardrails) == 1
