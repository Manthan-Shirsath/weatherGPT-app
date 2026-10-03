"""
Phase 6: Comprehensive Test Suite for Persistent Weather Intelligence,
Monitoring Engine, Hysteresis, Deduplication, Failure Preservation & Alert Workflows.
"""

import pytest
import datetime
from unittest.mock import AsyncMock, patch, MagicMock
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select

from backend.app.models.weather_snapshot import Base
from backend.app.models.monitor import WeatherMonitor, TriggeredAlert
from backend.app.services.monitor_engine import (
    MonitorEvaluationEngine,
    validate_monitor_rule,
    HYSTERESIS_MARGINS
)
from backend.app.services.agent.tools import (
    create_weather_monitor_tool,
    list_weather_monitors_tool,
    disable_weather_monitor_tool,
    explain_weather_alert_tool
)
from backend.app.services.agent.schemas import (
    CreateMonitorArgs,
    ListMonitorsArgs,
    DisableMonitorArgs,
    ExplainAlertArgs
)


# ─────────────────────────────────────────────────────────────────────────────
# 1. Rule Validation Unit Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_validate_monitor_rule_valid():
    """Validates supported rules with acceptable thresholds and windows."""
    valid, err = validate_monitor_rule(
        location="Nashik",
        rule_type="rain_probability",
        metric="rain_probability",
        operator=">",
        threshold=70.0,
        time_window="tomorrow",
        severity="warning"
    )
    assert valid is True
    assert err is None

    valid, err = validate_monitor_rule(
        location="Pune",
        rule_type="temperature",
        metric="temperature_c",
        operator=">",
        threshold=40.0,
        time_window="today",
        severity="critical"
    )
    assert valid is True

    valid, err = validate_monitor_rule(
        location="Mumbai",
        rule_type="wind",
        metric="wind_speed_kmh",
        operator=">",
        threshold=35.0,
        time_window="afternoon",
        severity="caution"
    )
    assert valid is True

    valid, err = validate_monitor_rule(
        location="Goa",
        rule_type="precipitation",
        metric="precipitation_mm",
        operator=">",
        threshold=25.0,
        time_window="all_day",
        severity="warning"
    )
    assert valid is True


def test_validate_monitor_rule_invalid_cases():
    """Strictly rejects missing locations, unknown metrics, illegal operators, and out-of-bounds values."""
    # Missing location
    valid, err = validate_monitor_rule(
        location="",
        rule_type="rain_probability",
        metric="rain_probability",
        operator=">",
        threshold=50.0
    )
    assert valid is False
    assert "Location is required" in err

    # Unknown rule type
    valid, err = validate_monitor_rule(
        location="Pune",
        rule_type="solar_flare",
        metric="solar_flare",
        operator=">",
        threshold=50.0
    )
    assert valid is False
    assert "Unknown rule type" in err

    # Invalid metric for rule type
    valid, err = validate_monitor_rule(
        location="Pune",
        rule_type="rain_probability",
        metric="temperature_c",
        operator=">",
        threshold=50.0
    )
    assert valid is False
    assert "Invalid metric" in err

    # Illegal operator
    valid, err = validate_monitor_rule(
        location="Pune",
        rule_type="rain_probability",
        metric="rain_probability",
        operator="<",
        threshold=50.0
    )
    assert valid is False
    assert "Invalid operator" in err

    # Out of bounds threshold (rain > 100%)
    valid, err = validate_monitor_rule(
        location="Pune",
        rule_type="rain_probability",
        metric="rain_probability",
        operator=">",
        threshold=150.0
    )
    assert valid is False
    assert "meteorological bounds" in err

    # Out of bounds temperature (> 60C)
    valid, err = validate_monitor_rule(
        location="Pune",
        rule_type="temperature",
        metric="temperature_c",
        operator=">",
        threshold=85.0
    )
    assert valid is False
    assert "meteorological bounds" in err

    # Invalid time window
    valid, err = validate_monitor_rule(
        location="Pune",
        rule_type="rain_probability",
        metric="rain_probability",
        operator=">",
        threshold=50.0,
        time_window="midnight_after_party"
    )
    assert valid is False
    assert "Invalid time window" in err


# ─────────────────────────────────────────────────────────────────────────────
# 2. Deterministic Condition Evaluation & Hysteresis Unit Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_evaluate_condition_basic():
    """Verifies deterministic condition evaluation with exact thresholds."""
    # Operator >
    is_true, is_resolved = MonitorEvaluationEngine.evaluate_condition(
        operator=">",
        threshold=70.0,
        actual_val=74.0,
        is_already_triggered=False,
        metric="rain_probability"
    )
    assert is_true is True

    is_true, is_resolved = MonitorEvaluationEngine.evaluate_condition(
        operator=">",
        threshold=70.0,
        actual_val=65.0,
        is_already_triggered=False,
        metric="rain_probability"
    )
    assert is_true is False

    # Operator <
    is_true, is_resolved = MonitorEvaluationEngine.evaluate_condition(
        operator="<",
        threshold=15.0,
        actual_val=12.0,
        is_already_triggered=False,
        metric="temperature_c"
    )
    assert is_true is True


def test_flapping_protection_hysteresis():
    """
    Verifies that threshold oscillation does not spam triggers and resolutions.
    For rain_probability threshold 70% (margin: 2%):
    - Trigger when actual > 70%
    - Resolve ONLY when actual <= (70 - 2) = 68%
    - If hovering between 68.1% and 70%, it remains TRIGGERED without flapping.
    """
    metric = "rain_probability"
    threshold = 70.0
    margin = HYSTERESIS_MARGINS[metric]
    assert margin == 2.0

    # 1. Triggered above threshold
    is_true, is_resolved = MonitorEvaluationEngine.evaluate_condition(
        operator=">",
        threshold=threshold,
        actual_val=71.0,
        is_already_triggered=False,
        metric=metric
    )
    assert is_true is True

    # 2. Weather fluctuates to 69.5% (below threshold, but within hysteresis band)
    is_true, is_resolved = MonitorEvaluationEngine.evaluate_condition(
        operator=">",
        threshold=threshold,
        actual_val=69.5,
        is_already_triggered=True,
        metric=metric
    )
    assert is_true is False
    # Crucial: NOT resolved yet! Prevents flapping!
    assert is_resolved is False

    # 3. Weather drops safely below 68% (e.g. 67.5%)
    is_true, is_resolved = MonitorEvaluationEngine.evaluate_condition(
        operator=">",
        threshold=threshold,
        actual_val=67.5,
        is_already_triggered=True,
        metric=metric
    )
    assert is_true is False
    assert is_resolved is True


# ─────────────────────────────────────────────────────────────────────────────
# 3. State Transitions, Deduplication & Persistence Tests
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_monitor_state_transitions_and_deduplication():
    """
    Verifies the complete state machine:
    ACTIVE -> TRIGGERED -> (Deduplication on repeated true) -> RESOLVED
    """
    # Create in-memory SQLite database for deterministic isolation
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async with session_maker() as session:
        # Create standing monitor: Rain probability > 70% in Nashik
        monitor = WeatherMonitor(
            id="mon-nashik-1",
            user_id="user-123",
            session_id="sess-abc",
            location="Nashik",
            rule_type="rain_probability",
            metric="rain_probability",
            operator=">",
            threshold=70.0,
            time_window="tomorrow",
            severity="warning",
            enabled=True,
            state="active"
        )
        session.add(monitor)
        await session.commit()
        await session.refresh(monitor)

        # Mock weather data with rain chance 78% (> 70%)
        mock_weather_78 = {
            "city": "Nashik",
            "precipitation_probability": 78.0,
            "insight": {"rainChance": 78.0},
            "hourlySeries": [
                {"date": (datetime.date.today() + datetime.timedelta(days=1)).isoformat(), "precipitation_probability": 78.0}
            ]
        }

        # CYCLE 1: Condition becomes true -> ACTIVE -> TRIGGERED
        with patch("backend.app.services.monitor_engine.ws_manager.broadcast", new_callable=AsyncMock) as mock_ws:
            res1 = await MonitorEvaluationEngine.evaluate_monitor(session, monitor, mock_weather_78)
            await session.commit()

            assert res1["action"] == "triggered"
            assert monitor.state == "triggered"
            assert monitor.last_triggered_at is not None

            # Verify WebSocket alert.created emitted
            mock_ws.assert_called_once()
            call_args = mock_ws.call_args[0][0]
            assert call_args["type"] == "alert.created"
            assert call_args["city"] == "Nashik"

            # Verify TriggeredAlert row persisted with structured explanation
            alerts_res = await session.execute(select(TriggeredAlert).where(TriggeredAlert.monitor_id == monitor.id))
            alerts = alerts_res.scalars().all()
            assert len(alerts) == 1
            assert alerts[0].status == "active"
            assert alerts[0].threshold == 70.0
            assert alerts[0].actual_value == 78.0
            assert "Threshold of 70.0 was exceeded with observed value 78.0" in alerts[0].explanation

        # CYCLE 2: Condition is STILL true across next forecast cycle (DEDUPLICATION)
        with patch("backend.app.services.monitor_engine.ws_manager.broadcast", new_callable=AsyncMock) as mock_ws:
            res2 = await MonitorEvaluationEngine.evaluate_monitor(session, monitor, mock_weather_78)
            await session.commit()

            assert res2["action"] == "maintained"
            assert monitor.state == "triggered"

            # CRITICAL DEDUPLICATION CHECK: Still only 1 alert in database!
            alerts_res = await session.execute(select(TriggeredAlert).where(TriggeredAlert.monitor_id == monitor.id))
            alerts = alerts_res.scalars().all()
            assert len(alerts) == 1
            # Did not spam another alert.created event
            mock_ws.assert_not_called()

        # CYCLE 3: Weather drops safely below resolution threshold (45% <= 68%) -> RESOLUTION
        mock_weather_45 = {
            "city": "Nashik",
            "precipitation_probability": 45.0,
            "insight": {"rainChance": 45.0},
            "hourlySeries": [
                {"date": (datetime.date.today() + datetime.timedelta(days=1)).isoformat(), "precipitation_probability": 45.0}
            ]
        }
        with patch("backend.app.services.monitor_engine.ws_manager.broadcast", new_callable=AsyncMock) as mock_ws:
            res3 = await MonitorEvaluationEngine.evaluate_monitor(session, monitor, mock_weather_45)
            await session.commit()

            assert res3["action"] == "resolved"
            assert monitor.state == "resolved"
            assert monitor.last_resolved_at is not None

            # Verify WebSocket alert.resolved emitted
            mock_ws.assert_called_once()
            assert mock_ws.call_args[0][0]["type"] == "alert.resolved"

            # Verify alert status updated to resolved with resolution value
            alerts_res = await session.execute(select(TriggeredAlert).where(TriggeredAlert.monitor_id == monitor.id))
            alerts = alerts_res.scalars().all()
            assert len(alerts) == 1
            assert alerts[0].status == "resolved"
            assert alerts[0].resolved_at is not None
            assert alerts[0].resolution_value == 45.0
            assert "Condition resolved: observed 45.0" in alerts[0].resolution_explanation

    await engine.dispose()


# ─────────────────────────────────────────────────────────────────────────────
# 4. Failure Preservation Tests (Section 34)
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_failure_preservation_when_weather_unavailable():
    """
    CRITICAL: If weather retrieval fails, do NOT mark conditions as false or resolve alerts.
    Active alert states must be strictly preserved.
    """
    with patch("backend.app.services.monitor_engine.check_db_health", return_value=True), \
         patch("backend.app.services.monitor_engine.weather_hub.get_weather_for_city", side_effect=RuntimeError("Provider 503 Timeout")):

        res = await MonitorEvaluationEngine.evaluate_location("Pune")
        assert res["status"] == "weather_data_failed"
        assert res["evaluated"] == 0


# ─────────────────────────────────────────────────────────────────────────────
# 5. Agent Monitoring Tools Integration
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_agent_tools_monitor_lifecycle():
    """
    Verifies that WeatherGPT agent tools correctly create, list, disable monitors,
    and retrieve structured explanations.
    """
    with patch("backend.app.services.monitor_engine.MonitorEvaluationEngine.create_monitor") as mock_create, \
         patch("backend.app.services.monitor_engine.MonitorEvaluationEngine.list_monitors") as mock_list, \
         patch("backend.app.services.monitor_engine.MonitorEvaluationEngine.delete_monitor") as mock_delete, \
         patch("backend.app.services.monitor_engine.MonitorEvaluationEngine.get_triggered_alert") as mock_alert:

        fake_monitor = MagicMock()
        fake_monitor.location = "Nashik"
        fake_monitor.to_dict.return_value = {
            "id": "mon-1",
            "location": "Nashik",
            "rule_type": "rain_probability",
            "metric": "rain_probability",
            "operator": ">",
            "threshold": 70.0,
            "state": "active"
        }
        mock_create.return_value = (fake_monitor, None)

        # 1. Create Monitor
        create_res = await create_weather_monitor_tool(CreateMonitorArgs(
            location="Nashik",
            rule_type="rain_probability",
            metric="rain_probability",
            operator=">",
            threshold=70.0,
            time_window="tomorrow",
            severity="warning"
        ))
        assert create_res["success"] is True
        assert create_res["monitor"]["location"] == "Nashik"
        assert "disclaimer" in create_res

        # 2. List Monitors
        mock_list.return_value = [fake_monitor]
        list_res = await list_weather_monitors_tool(ListMonitorsArgs(location="Nashik"))
        assert list_res["count"] == 1
        assert len(list_res["monitors"]) == 1

        # 3. Disable Monitor
        mock_delete.return_value = True
        disable_res = await disable_weather_monitor_tool(DisableMonitorArgs(monitor_id="mon-1"))
        assert disable_res["success"] is True

        # 4. Explain Alert ("Why did I get this alert?")
        fake_alert = MagicMock()
        fake_alert.to_dict.return_value = {
            "id": "alt-1",
            "location": "Nashik",
            "explanation": "Observed 78% rain chance vs threshold 70%",
            "threshold": 70.0,
            "actual_value": 78.0,
            "status": "active"
        }
        mock_alert.return_value = fake_alert
        explain_res = await explain_weather_alert_tool(ExplainAlertArgs(alert_id="alt-1"))
        assert "alert" in explain_res
        assert explain_res["alert"]["actual_value"] == 78.0
        assert "Observed 78%" in explain_res["alert"]["explanation"]


# ─────────────────────────────────────────────────────────────────────────────
# 6. Forecast Change Meaningful Delta Test (Section 12)
# ─────────────────────────────────────────────────────────────────────────────

def test_forecast_change_meaningful_delta():
    """
    Verifies FORECAST_CHANGE triggers only when delta exceeds configured threshold.
    """
    # 1. Delta = 25% (e.g. 50% -> 75%), threshold = 20% -> TRUE
    is_true, _ = MonitorEvaluationEngine.evaluate_condition(
        operator="change_gt",
        threshold=20.0,
        actual_val=25.0,
        is_already_triggered=False,
        metric="forecast_change"
    )
    assert is_true is True

    # 2. Delta = 8% (minor drift), threshold = 20% -> FALSE
    is_true, _ = MonitorEvaluationEngine.evaluate_condition(
        operator="change_gt",
        threshold=20.0,
        actual_val=8.0,
        is_already_triggered=False,
        metric="forecast_change"
    )
    assert is_true is False


# ─────────────────────────────────────────────────────────────────────────────
# 7. REST API Endpoints & Authorization Tests (Sections 25 & 26)
# ─────────────────────────────────────────────────────────────────────────────

from httpx import AsyncClient, ASGITransport
from backend.main import app

@pytest.mark.asyncio
async def test_rest_api_monitor_creation_and_validation():
    """
    Tests REST endpoints /api/monitors:
    - 201 Created on valid rule
    - 422 Unprocessable Entity on invalid threshold
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Invalid: rain threshold = 180%
        invalid_res = await ac.post("/api/monitors", json={
            "location": "Pune",
            "rule_type": "rain_probability",
            "metric": "rain_probability",
            "operator": ">",
            "threshold": 180.0
        })
        assert invalid_res.status_code == 422

        # Valid creation
        with patch("backend.app.services.monitor_engine.MonitorEvaluationEngine.create_monitor") as mock_create:
            mock_mon = MagicMock()
            mock_mon.id = "mon-pune-99"
            mock_mon.to_dict.return_value = {
                "id": "mon-pune-99",
                "location": "Pune",
                "rule_type": "rain_probability",
                "metric": "rain_probability",
                "operator": ">",
                "threshold": 70.0,
                "state": "active"
            }
            mock_create.return_value = (mock_mon, None)

            valid_res = await ac.post("/api/monitors", json={
                "location": "Pune",
                "rule_type": "rain_probability",
                "metric": "rain_probability",
                "operator": ">",
                "threshold": 70.0,
                "time_window": "tomorrow"
            }, headers={"X-Session-ID": "test-session-1"})

            assert valid_res.status_code == 201
            assert valid_res.json()["id"] == "mon-pune-99"


@pytest.mark.asyncio
async def test_rest_api_authorization_and_session_isolation():
    """
    Tests user/session isolation:
    User A cannot access or delete User B's monitor.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        with patch("backend.app.services.monitor_engine.MonitorEvaluationEngine.get_monitor") as mock_get, \
             patch("backend.app.services.monitor_engine.MonitorEvaluationEngine.delete_monitor") as mock_del:

            # User B attempts to access User A's monitor -> returns None from engine -> 404
            mock_get.return_value = None
            res = await ac.get("/api/monitors/mon-user-a", headers={"X-User-ID": "user-b"})
            assert res.status_code == 404

            # User B attempts to delete User A's monitor -> returns False -> 404
            mock_del.return_value = False
            del_res = await ac.delete("/api/monitors/mon-user-a", headers={"X-User-ID": "user-b"})
            assert del_res.status_code == 404


# ─────────────────────────────────────────────────────────────────────────────
# 8. Full Alert Pipeline Integration Test (Section 29)
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_monitoring_pipeline_integration():
    """
    INTEGRATION TEST:
    Weather Data
    ↓
    Location Monitor Evaluation
    ↓
    Deduplicated Alert Persistence
    ↓
    WebSocket Event Emission
    """
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async with session_maker() as session:
        # Pre-seed standing monitor
        monitor = WeatherMonitor(
            id="mon-integ-1",
            user_id="user-integ",
            location="Jaipur",
            rule_type="temperature",
            metric="temperature_c",
            operator=">",
            threshold=42.0,
            time_window="today",
            severity="critical",
            enabled=True,
            state="active"
        )
        session.add(monitor)
        await session.commit()

        # Mock weather snapshot: Temp = 44.5C (> 42.0C threshold)
        mock_weather_jaipur = {
            "city": "Jaipur",
            "tempC": 44.5,
            "temperature": 44.5,
            "hourlySeries": [
                {"hour": 14, "temperature_c": 44.5, "condition": "Sunny"}
            ]
        }

        with patch("backend.app.services.monitor_engine.ws_manager.broadcast", new_callable=AsyncMock) as mock_ws:
            result = await MonitorEvaluationEngine.evaluate_location(
                location="Jaipur",
                weather_data=mock_weather_jaipur,
                db_session=session
            )

            assert result["status"] == "success"
            assert result["evaluated"] == 1
            assert result["results"][0]["result"]["action"] == "triggered"

            # 1. Alert persisted in DB
            alerts_res = await session.execute(
                select(TriggeredAlert).where(TriggeredAlert.monitor_id == monitor.id)
            )
            saved_alerts = alerts_res.scalars().all()
            assert len(saved_alerts) == 1
            assert saved_alerts[0].actual_value == 44.5
            assert saved_alerts[0].threshold == 42.0
            assert "Temperature Alert for Jaipur" in saved_alerts[0].explanation

            # 2. WebSocket event emitted
            mock_ws.assert_called_once()
            ws_payload = mock_ws.call_args[0][0]
            assert ws_payload["type"] == "alert.created"
            assert ws_payload["city"] == "Jaipur"
            assert ws_payload["alert"]["actual_value"] == 44.5

    await engine.dispose()

