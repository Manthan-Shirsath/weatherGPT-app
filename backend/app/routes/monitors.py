"""
Phase 6: Weather Monitors & Triggered Alerts REST API
Provides typed endpoints for creating, inspecting, updating, and disabling
persistent weather monitors, and retrieving auditable triggered alert histories.
"""

import logging
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query, Header, status, Depends
from pydantic import BaseModel, Field

from backend.app.services.monitor_engine import MonitorEvaluationEngine, validate_monitor_rule

logger = logging.getLogger("skycast.routes.monitors")

router = APIRouter(tags=["Weather Monitors & Alerts"])


# ─────────────────────────────────────────────────────────────────────────────
# Request & Response Schemas
# ─────────────────────────────────────────────────────────────────────────────

class CreateMonitorRequest(BaseModel):
    location: str = Field(..., description="Location to monitor, e.g. 'Nashik' or 'Pune'")
    rule_type: str = Field(..., description="Rule type: 'rain_probability', 'temperature', 'wind', 'precipitation', 'weather_alert', 'forecast_change'")
    metric: str = Field(..., description="Metric name: 'rain_probability', 'temperature_c', 'wind_speed_kmh', 'precipitation_mm', 'active_alert', 'forecast_change'")
    operator: str = Field(..., description="Operator: '>', '<', '==', 'change_gt'")
    threshold: float = Field(..., description="Numeric threshold value")
    secondary_threshold: Optional[float] = Field(None, description="Optional secondary threshold")
    time_window: Optional[str] = Field("all_day", description="Time window: 'today', 'tomorrow', 'morning', 'afternoon', 'evening', 'all_day', 'next_24h'")
    severity: Optional[str] = Field("warning", description="Severity: 'info', 'caution', 'warning', 'critical'")
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class UpdateMonitorRequest(BaseModel):
    enabled: Optional[bool] = Field(None, description="Toggle monitor on or off")
    threshold: Optional[float] = Field(None, description="New threshold value")


class EvaluateLocationRequest(BaseModel):
    location: str = Field(..., description="City or location to evaluate active monitors for")


# ─────────────────────────────────────────────────────────────────────────────
# Monitors Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/api/monitors", summary="List persistent weather monitors")
async def list_monitors(
    location: Optional[str] = Query(None, description="Filter by location"),
    enabled_only: bool = Query(False, description="Filter only enabled monitors"),
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID"),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """
    Returns all weather monitors created by the requesting user or session.
    Server-side ownership is enforced.
    """
    monitors = await MonitorEvaluationEngine.list_monitors(
        location=location,
        user_id=x_user_id,
        session_id=x_session_id,
        enabled_only=enabled_only
    )
    return {
        "count": len(monitors),
        "monitors": [m.to_dict() for m in monitors]
    }


@router.post("/api/monitors", status_code=status.HTTP_201_CREATED, summary="Create a persistent weather monitor")
async def create_monitor(
    payload: CreateMonitorRequest,
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID"),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """
    Creates a new validated persistent WeatherMonitor.
    Deterministic validation rejects unknown metrics, illegal operators, or out-of-bounds thresholds.
    """
    is_valid, err_msg = validate_monitor_rule(
        location=payload.location,
        rule_type=payload.rule_type,
        metric=payload.metric,
        operator=payload.operator,
        threshold=payload.threshold,
        time_window=payload.time_window,
        severity=payload.severity
    )
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=err_msg)

    monitor, err = await MonitorEvaluationEngine.create_monitor(
        location=payload.location,
        rule_type=payload.rule_type,
        metric=payload.metric,
        operator=payload.operator,
        threshold=payload.threshold,
        time_window=payload.time_window,
        severity=payload.severity,
        user_id=x_user_id,
        session_id=x_session_id,
        latitude=payload.latitude,
        longitude=payload.longitude
    )

    if err or not monitor:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err or "Failed to create monitor")

    return monitor.to_dict()


@router.get("/api/monitors/{monitor_id}", summary="Get a single monitor by ID")
async def get_monitor_by_id(
    monitor_id: str,
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID"),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Fetches a monitor verifying user/session ownership."""
    monitor = await MonitorEvaluationEngine.get_monitor(
        monitor_id=monitor_id,
        user_id=x_user_id,
        session_id=x_session_id
    )
    if not monitor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Monitor not found")

    return monitor.to_dict()


@router.patch("/api/monitors/{monitor_id}", summary="Update or toggle a weather monitor")
async def update_monitor_by_id(
    monitor_id: str,
    payload: UpdateMonitorRequest,
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID"),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Updates enabled state or threshold for an owned monitor."""
    monitor, err = await MonitorEvaluationEngine.update_monitor(
        monitor_id=monitor_id,
        enabled=payload.enabled,
        threshold=payload.threshold,
        user_id=x_user_id,
        session_id=x_session_id
    )
    if err == "Unauthorized":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized")
    if err == "Monitor not found" or not monitor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=err or "Monitor not found")
    if err:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=err)

    return monitor.to_dict()


@router.delete("/api/monitors/{monitor_id}", status_code=status.HTTP_200_OK, summary="Delete a weather monitor")
async def delete_monitor_by_id(
    monitor_id: str,
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID"),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """Deletes a monitor and cascades to its alert history with ownership verification."""
    success = await MonitorEvaluationEngine.delete_monitor(
        monitor_id=monitor_id,
        user_id=x_user_id,
        session_id=x_session_id
    )
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Monitor not found or unauthorized")

    return {"deleted": True, "monitor_id": monitor_id}


# ─────────────────────────────────────────────────────────────────────────────
# Alerts History & Auditing Endpoints ("Why did I get this alert?")
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/api/alerts", summary="List auditable triggered alerts")
async def list_triggered_alerts(
    location: Optional[str] = Query(None, description="Filter by location"),
    status: Optional[str] = Query(None, description="Filter by status: 'active' or 'resolved'"),
    limit: int = Query(50, ge=1, le=100, description="Max alerts to return"),
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID"),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """
    Returns auditable triggered alerts with 'Why did I get this alert?' explanations.
    Preserves trigger values, thresholds, timestamps, and resolution metrics.
    """
    alerts = await MonitorEvaluationEngine.list_triggered_alerts(
        location=location,
        user_id=x_user_id,
        session_id=x_session_id,
        status=status,
        limit=limit
    )
    return {
        "count": len(alerts),
        "alerts": [a.to_dict() for a in alerts]
    }


@router.get("/api/alerts/{alert_id}", summary="Get auditable alert explanation by ID")
async def get_triggered_alert_by_id(
    alert_id: str,
    x_session_id: Optional[str] = Header(None, alias="X-Session-ID"),
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
):
    """
    Retrieves full auditable alert detail including structured explanation:
    'Why did I get this alert?'.
    """
    alert = await MonitorEvaluationEngine.get_triggered_alert(
        alert_id=alert_id,
        user_id=x_user_id,
        session_id=x_session_id
    )
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")

    return alert.to_dict()


@router.post("/api/monitors/evaluate", summary="Trigger on-demand evaluation of active monitors")
async def evaluate_monitors(
    payload: EvaluateLocationRequest,
):
    """
    Deterministically evaluates all active monitors for a location against a single fresh weather snapshot.
    Enforces failure preservation and deduplication.
    """
    result = await MonitorEvaluationEngine.evaluate_location(payload.location)
    return result
