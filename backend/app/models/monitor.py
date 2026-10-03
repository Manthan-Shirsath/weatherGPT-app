"""
Persistent Weather Monitoring & Triggered Alert Models
Supports deterministic continuous monitoring rules, thresholds, deduplication,
and auditable alert histories ("Why did I get this alert?").
"""

import uuid
import datetime
from sqlalchemy import (
    Column,
    String,
    Boolean,
    Float,
    DateTime,
    Index,
    ForeignKey
)
from backend.app.models.weather_snapshot import Base


class WeatherMonitor(Base):
    """
    Persistent standing monitoring rule for a user or session.
    Represents criteria like 'Alert me if rain probability tomorrow > 70%'.
    """
    __tablename__ = "weather_monitors"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(100), nullable=True, index=True)
    session_id = Column(String(100), nullable=True, index=True)
    location = Column(String(100), nullable=False, index=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    # Rule type: rain_probability, temperature, wind, precipitation, weather_alert, forecast_change
    rule_type = Column(String(50), nullable=False, index=True)
    # Metric: rain_probability, temperature_c, wind_speed_kmh, precipitation_mm, active_alert, forecast_change
    metric = Column(String(50), nullable=False)
    # Operator: >, <, ==, change_gt
    operator = Column(String(20), nullable=False)
    # Primary threshold: numeric value
    threshold = Column(Float, nullable=False)
    # Optional secondary threshold (e.g., hysteresis or range)
    secondary_threshold = Column(Float, nullable=True)

    # Time window: today, tomorrow, morning, afternoon, evening, all_day, or specific ISO date
    time_window = Column(String(50), nullable=True, default="all_day")

    # Severity: info, caution, warning, critical
    severity = Column(String(20), nullable=False, default="warning")

    # Enabled / disabled toggle
    enabled = Column(Boolean, nullable=False, default=True)

    # Current lifecycle state: active, triggered, resolved, disabled
    state = Column(String(20), nullable=False, default="active")

    # Audit timestamps
    last_evaluated_at = Column(DateTime(timezone=True), nullable=True)
    last_triggered_at = Column(DateTime(timezone=True), nullable=True)
    last_resolved_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.datetime.now(datetime.timezone.utc)
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.datetime.now(datetime.timezone.utc),
        onupdate=lambda: datetime.datetime.now(datetime.timezone.utc)
    )

    __table_args__ = (
        Index("idx_monitors_location_enabled", "location", "enabled"),
        Index("idx_monitors_session_enabled", "session_id", "enabled"),
        Index("idx_monitors_user_enabled", "user_id", "enabled"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "session_id": self.session_id,
            "location": self.location,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "rule_type": self.rule_type,
            "metric": self.metric,
            "operator": self.operator,
            "threshold": self.threshold,
            "secondary_threshold": self.secondary_threshold,
            "time_window": self.time_window,
            "severity": self.severity,
            "enabled": self.enabled,
            "state": self.state,
            "last_evaluated_at": self.last_evaluated_at.isoformat() if self.last_evaluated_at else None,
            "last_triggered_at": self.last_triggered_at.isoformat() if self.last_triggered_at else None,
            "last_resolved_at": self.last_resolved_at.isoformat() if self.last_resolved_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class TriggeredAlert(Base):
    """
    Auditable persistent record of an alert generated when a WeatherMonitor triggers.
    Preserves 'What happened?' explanation and resolution history even after forecasts shift.
    """
    __tablename__ = "triggered_alerts"

    id = Column(String(64), primary_key=True, default=lambda: str(uuid.uuid4()))
    monitor_id = Column(String(64), ForeignKey("weather_monitors.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(100), nullable=True, index=True)
    session_id = Column(String(100), nullable=True, index=True)
    location = Column(String(100), nullable=False, index=True)

    rule_type = Column(String(50), nullable=False)
    severity = Column(String(20), nullable=False, default="warning")

    condition_desc = Column(String(255), nullable=False)
    threshold = Column(Float, nullable=False)
    actual_value = Column(Float, nullable=False)
    time_window = Column(String(50), nullable=True)

    # Structured explanation: "Why did I get this alert?"
    explanation = Column(String(1000), nullable=False)

    # Alert state: active vs resolved
    status = Column(String(20), nullable=False, default="active")

    triggered_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.datetime.now(datetime.timezone.utc),
        index=True
    )
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolution_value = Column(Float, nullable=True)
    resolution_explanation = Column(String(1000), nullable=True)

    __table_args__ = (
        Index("idx_triggered_alerts_monitor_status", "monitor_id", "status"),
        Index("idx_triggered_alerts_session_status", "session_id", "status"),
        Index("idx_triggered_alerts_location_status", "location", "status"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "monitor_id": self.monitor_id,
            "user_id": self.user_id,
            "session_id": self.session_id,
            "location": self.location,
            "rule_type": self.rule_type,
            "severity": self.severity,
            "condition_desc": self.condition_desc,
            "threshold": self.threshold,
            "actual_value": self.actual_value,
            "time_window": self.time_window,
            "explanation": self.explanation,
            "status": self.status,
            "triggered_at": self.triggered_at.isoformat() if self.triggered_at else None,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "resolution_value": self.resolution_value,
            "resolution_explanation": self.resolution_explanation,
        }
