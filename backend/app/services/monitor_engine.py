"""
Phase 6: Deterministic Weather Monitor Evaluation Engine
Manages persistent weather monitoring rules, deduplication, flapping hysteresis,
and auditable alert histories ("Why did I get this alert?").
"""

import logging
import datetime
from typing import Dict, Any, List, Optional, Tuple, Union
from sqlalchemy import select, update, delete, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.database import async_session_factory, is_db_available, check_db_health
from backend.app.models.monitor import WeatherMonitor, TriggeredAlert
from backend.app.core.websocket import ws_manager
from backend.app.services.weather_hub import weather_hub

logger = logging.getLogger("skycast.monitor_engine")

# ─────────────────────────────────────────────────────────────────────────────
# Supported Rule Types, Metrics, Operators & Boundaries
# ─────────────────────────────────────────────────────────────────────────────

SUPPORTED_RULE_TYPES = {
    "rain_probability",
    "temperature",
    "wind",
    "precipitation",
    "weather_alert",
    "forecast_change",
}

RULE_METRIC_MAP = {
    "rain_probability": "rain_probability",
    "temperature": "temperature_c",
    "wind": "wind_speed_kmh",
    "precipitation": "precipitation_mm",
    "weather_alert": "active_alert",
    "forecast_change": "forecast_change",
}

VALID_OPERATORS = {
    "rain_probability": {">"},
    "temperature": {">", "<"},
    "wind": {">"},
    "precipitation": {">"},
    "weather_alert": {"=="},
    "forecast_change": {"change_gt"},
}

METRIC_BOUNDS = {
    "rain_probability": (0.0, 100.0),
    "temperature_c": (-60.0, 60.0),
    "wind_speed_kmh": (0.0, 250.0),
    "precipitation_mm": (0.0, 500.0),
    "active_alert": (0.0, 1.0),
    "forecast_change": (1.0, 100.0),
}

# Hysteresis margins to prevent oscillation spam / flapping around thresholds
HYSTERESIS_MARGINS = {
    "rain_probability": 2.0,   # e.g., trigger at >70%, resolve only if <=68%
    "temperature_c": 0.5,      # e.g., trigger at >40°C, resolve only if <=39.5°C
    "wind_speed_kmh": 2.0,     # e.g., trigger at >30 km/h, resolve only if <=28 km/h
    "precipitation_mm": 0.5,   # e.g., trigger at >5 mm, resolve only if <=4.5 mm
    "active_alert": 0.0,       # binary: 1 or 0
    "forecast_change": 2.0,    # 2 percentage points or units
}

VALID_TIME_WINDOWS = {
    "all_day",
    "today",
    "tomorrow",
    "next_24h",
    "morning",    # 06:00 - 12:00
    "afternoon",  # 12:00 - 18:00
    "evening",    # 18:00 - 24:00
}

VALID_SEVERITIES = {"info", "caution", "warning", "critical"}


def validate_monitor_rule(
    location: str,
    rule_type: str,
    metric: str,
    operator: str,
    threshold: float,
    time_window: Optional[str] = "all_day",
    severity: Optional[str] = "warning",
) -> Tuple[bool, Optional[str]]:
    """
    Strict validation of a monitoring rule definition.
    Returns (True, None) if valid, or (False, error_message).
    """
    if not location or not location.strip():
        return False, "Location is required for weather monitor."

    if rule_type not in SUPPORTED_RULE_TYPES:
        return False, f"Unknown rule type '{rule_type}'. Supported rule types: {sorted(list(SUPPORTED_RULE_TYPES))}"

    expected_metric = RULE_METRIC_MAP.get(rule_type)
    if metric != expected_metric:
        return False, f"Invalid metric '{metric}' for rule type '{rule_type}'. Expected '{expected_metric}'."

    allowed_ops = VALID_OPERATORS.get(rule_type, set())
    if operator not in allowed_ops:
        return False, f"Invalid operator '{operator}' for rule type '{rule_type}'. Supported: {sorted(list(allowed_ops))}"

    if not isinstance(threshold, (int, float)):
        return False, f"Threshold must be a numeric value, got '{threshold}'"

    bounds = METRIC_BOUNDS.get(metric)
    if bounds:
        min_val, max_val = bounds
        if threshold < min_val or threshold > max_val:
            return False, f"Threshold {threshold} out of realistic meteorological bounds ({min_val} to {max_val}) for {metric}."

    if time_window and time_window not in VALID_TIME_WINDOWS:
        return False, f"Invalid time window '{time_window}'. Supported: {sorted(list(VALID_TIME_WINDOWS))}"

    if severity and severity not in VALID_SEVERITIES:
        return False, f"Invalid severity '{severity}'. Supported: {sorted(list(VALID_SEVERITIES))}"

    return True, None


class MonitorEvaluationEngine:
    """
    Deterministic evaluation engine for persistent WeatherMonitors.
    Evaluates weather snapshots, enforces deduplication, applies hysteresis,
    records auditable TriggeredAlerts, and broadcasts real-time WebSocket events.
    """

    @classmethod
    def extract_metric_value(
        cls,
        metric: str,
        time_window: str,
        weather_data: Dict[str, Any],
        operator: str = ">"
    ) -> Tuple[Optional[float], str]:
        """
        Deterministically extracts the relevant meteorological value from normalized weather data.
        Returns (extracted_value, window_context_explanation).
        """
        hourly_series = weather_data.get("hourlySeries", [])
        daily = weather_data.get("daily", [])
        insight = weather_data.get("insight", {})

        # Filter hourly slots if time window is specified
        filtered_slots = []
        today_iso = datetime.date.today().isoformat()
        tomorrow_iso = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()

        if time_window == "tomorrow":
            filtered_slots = [
                s for s in hourly_series
                if s.get("date") == tomorrow_iso or str(s.get("time_iso", "")).startswith(tomorrow_iso)
            ]
        elif time_window == "today":
            filtered_slots = [
                s for s in hourly_series
                if s.get("date") == today_iso or str(s.get("time_iso", "")).startswith(today_iso)
            ]
        elif time_window == "morning":
            filtered_slots = [
                s for s in hourly_series
                if s.get("hour") is not None and 6 <= s.get("hour") < 12
            ]
        elif time_window == "afternoon":
            filtered_slots = [
                s for s in hourly_series
                if s.get("hour") is not None and 12 <= s.get("hour") < 18
            ]
        elif time_window == "evening":
            filtered_slots = [
                s for s in hourly_series
                if s.get("hour") is not None and 18 <= s.get("hour") <= 23
            ]
        else:
            filtered_slots = hourly_series[:24]

        # 1. RAIN PROBABILITY
        if metric == "rain_probability":
            if filtered_slots:
                max_rain = max(
                    float(s.get("precipitation_probability", s.get("rain_probability_pct", s.get("rainChance", 0))))
                    for s in filtered_slots
                )
                return max_rain, f"Observed peak rain probability across {time_window} forecast slots"
            # Fallback to daily or current insight
            if time_window == "tomorrow" and len(daily) > 1:
                return float(daily[1].get("daily_precipitation_probability", daily[1].get("rainChance", 0))), "Tomorrow daily forecast"
            return float(weather_data.get("precipitation_probability", insight.get("rainChance", 0))), "Current forecast baseline"

        # 2. TEMPERATURE
        elif metric == "temperature_c":
            if filtered_slots:
                temps = [
                    float(s.get("temperature_c", s.get("tempC", 25.0)))
                    for s in filtered_slots
                ]
                if operator == "<":
                    val = min(temps)
                    return val, f"Lowest forecasted temperature ({round(val, 1)}°C) in {time_window}"
                else:
                    val = max(temps)
                    return val, f"Highest forecasted temperature ({round(val, 1)}°C) in {time_window}"
            val = float(weather_data.get("tempC", weather_data.get("temperature", 25.0)))
            return val, f"Current observed temperature ({round(val, 1)}°C)"

        # 3. WIND SPEED
        elif metric == "wind_speed_kmh":
            if filtered_slots:
                val = max(
                    float(s.get("wind_speed_kmh", s.get("windSpeed", 0.0)))
                    for s in filtered_slots
                )
                return val, f"Peak forecasted wind speed ({round(val, 1)} km/h) in {time_window}"
            val = float(weather_data.get("windSpeedKmh", weather_data.get("windSpeed", 0.0)))
            return val, f"Current observed wind speed ({round(val, 1)} km/h)"

        # 4. PRECIPITATION
        elif metric == "precipitation_mm":
            if filtered_slots:
                total_precip = sum(
                    float(s.get("precipitation_mm", s.get("precipitation", 0.0)))
                    for s in filtered_slots
                )
                return round(total_precip, 2), f"Accumulated precipitation ({round(total_precip, 1)} mm) in {time_window}"
            details = weather_data.get("details", {})
            val = float(details.get("precipitationMm", weather_data.get("precipitation", 0.0)))
            return val, f"Current observed precipitation ({round(val, 1)} mm)"

        # 5. WEATHER ALERT
        elif metric == "active_alert":
            alerts = weather_data.get("alerts", [])
            has_alert = 1.0 if (alerts and len(alerts) > 0) else 0.0
            desc = f"{len(alerts)} active meteorological alerts" if has_alert else "No active alerts"
            return has_alert, desc

        # 6. FORECAST CHANGE
        elif metric == "forecast_change":
            # Compare current forecast rain or temp swing across consecutive periods
            if len(daily) >= 2:
                t0_rain = float(daily[0].get("daily_precipitation_probability", daily[0].get("rainChance", 0)))
                t1_rain = float(daily[1].get("daily_precipitation_probability", daily[1].get("rainChance", 0)))
                delta = abs(t1_rain - t0_rain)
                return delta, f"Day-over-day forecast rain probability delta ({round(delta, 1)}%)"
            return 0.0, "Insufficient forecast delta history"

        return None, "Metric data unavailable"

    @classmethod
    def evaluate_condition(
        cls,
        operator: str,
        threshold: float,
        actual_val: float,
        is_already_triggered: bool,
        metric: str
    ) -> Tuple[bool, bool]:
        """
        Determines if the condition is currently TRUE, and if it qualifies for RESOLUTION.
        Applies strict hysteresis to prevent oscillation / flapping.
        Returns (is_condition_true, is_resolved_with_hysteresis).
        """
        margin = HYSTERESIS_MARGINS.get(metric, 1.0)

        if operator == ">":
            condition_true = actual_val > threshold
            # To resolve if already triggered, value must fall comfortably below threshold - margin
            condition_resolved = actual_val <= (threshold - margin)
            return condition_true, condition_resolved

        elif operator == "<":
            condition_true = actual_val < threshold
            # To resolve, value must rise comfortably above threshold + margin
            condition_resolved = actual_val >= (threshold + margin)
            return condition_true, condition_resolved

        elif operator == "==":
            condition_true = actual_val == threshold
            condition_resolved = actual_val != threshold
            return condition_true, condition_resolved

        elif operator == "change_gt":
            condition_true = actual_val >= threshold
            condition_resolved = actual_val < threshold
            return condition_true, condition_resolved

        return False, False

    @classmethod
    async def evaluate_monitor(
        cls,
        session: AsyncSession,
        monitor: WeatherMonitor,
        weather_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Evaluates a single WeatherMonitor against fresh normalized weather data.
        Transitions state, deduplicates alerts, and emits WebSocket notifications.
        """
        now = datetime.datetime.now(datetime.timezone.utc)
        actual_val, context_desc = cls.extract_metric_value(
            metric=monitor.metric,
            time_window=monitor.time_window or "all_day",
            weather_data=weather_data,
            operator=monitor.operator
        )

        if actual_val is None:
            logger.warning("Could not extract metric '%s' for monitor %s in %s", monitor.metric, monitor.id, monitor.location)
            return {"action": "skipped", "reason": "metric_unavailable"}

        is_already_triggered = (monitor.state == "triggered")
        condition_true, condition_resolved = cls.evaluate_condition(
            operator=monitor.operator,
            threshold=monitor.threshold,
            actual_val=actual_val,
            is_already_triggered=is_already_triggered,
            metric=monitor.metric
        )

        # ─────────────────────────────────────────────────────────────────────
        # CASE 1: Condition is TRUE
        # ─────────────────────────────────────────────────────────────────────
        if condition_true:
            monitor.last_evaluated_at = now

            if not is_already_triggered:
                # STATE TRANSITION: ACTIVE/RESOLVED -> TRIGGERED
                monitor.state = "triggered"
                monitor.last_triggered_at = now

                condition_str = f"{monitor.metric} {monitor.operator} {monitor.threshold}"
                explanation = (
                    f"{monitor.rule_type.replace('_', ' ').title()} Alert for {monitor.location}: "
                    f"Threshold of {monitor.threshold} was exceeded with observed value {round(actual_val, 1)} "
                    f"({context_desc}). Window: {monitor.time_window or 'all day'}."
                )

                alert = TriggeredAlert(
                    monitor_id=monitor.id,
                    user_id=monitor.user_id,
                    session_id=monitor.session_id,
                    location=monitor.location,
                    rule_type=monitor.rule_type,
                    severity=monitor.severity,
                    condition_desc=condition_str,
                    threshold=monitor.threshold,
                    actual_value=round(actual_val, 2),
                    time_window=monitor.time_window,
                    explanation=explanation,
                    status="active",
                    triggered_at=now
                )
                session.add(alert)
                await session.flush()

                logger.info(
                    "🚨 [MONITOR TRIGGERED] Monitor %s for '%s' triggered (%s: actual %.1f vs thresh %.1f)",
                    monitor.id, monitor.location, monitor.metric, actual_val, monitor.threshold
                )

                # Broadcast WebSocket event
                alert_dict = alert.to_dict()
                await ws_manager.broadcast({
                    "type": "alert.created",
                    "city": monitor.location,
                    "session_id": monitor.session_id,
                    "alert": alert_dict,
                    "monitor": monitor.to_dict(),
                    "timestamp": now.isoformat()
                })

                return {"action": "triggered", "alert_id": alert.id, "actual_value": actual_val}

            else:
                # DEDUPLICATION: Condition is still true, already triggered.
                # Update last_evaluated_at, do NOT create a second duplicate alert.
                return {"action": "maintained", "state": "triggered", "actual_value": actual_val}

        # ─────────────────────────────────────────────────────────────────────
        # CASE 2: Condition is FALSE
        # ─────────────────────────────────────────────────────────────────────
        else:
            monitor.last_evaluated_at = now

            if is_already_triggered and condition_resolved:
                # STATE TRANSITION: TRIGGERED -> RESOLVED (with hysteresis check)
                monitor.state = "resolved"
                monitor.last_resolved_at = now

                # Find the active TriggeredAlert record for this monitor
                stmt = (
                    select(TriggeredAlert)
                    .where(TriggeredAlert.monitor_id == monitor.id, TriggeredAlert.status == "active")
                    .order_by(desc(TriggeredAlert.triggered_at))
                    .limit(1)
                )
                res = await session.execute(stmt)
                active_alert = res.scalars().first()

                if active_alert:
                    active_alert.status = "resolved"
                    active_alert.resolved_at = now
                    active_alert.resolution_value = round(actual_val, 2)
                    active_alert.resolution_explanation = (
                        f"Condition resolved: observed {round(actual_val, 1)} safely below threshold {monitor.threshold} "
                        f"(hysteresis margin: {HYSTERESIS_MARGINS.get(monitor.metric, 1.0)}). {context_desc}."
                    )
                    alert_dict = active_alert.to_dict()
                else:
                    alert_dict = None

                logger.info(
                    "✅ [MONITOR RESOLVED] Monitor %s for '%s' resolved (actual %.1f vs thresh %.1f)",
                    monitor.id, monitor.location, actual_val, monitor.threshold
                )

                # Broadcast WebSocket event
                await ws_manager.broadcast({
                    "type": "alert.resolved",
                    "city": monitor.location,
                    "session_id": monitor.session_id,
                    "alert": alert_dict,
                    "monitor": monitor.to_dict(),
                    "timestamp": now.isoformat()
                })

                return {"action": "resolved", "actual_value": actual_val}

            # Still within hysteresis band or was already active/resolved and condition remains false
            return {"action": "evaluated_inactive", "state": monitor.state, "actual_value": actual_val}

    @classmethod
    async def evaluate_location(
        cls,
        location: str,
        weather_data: Optional[Dict[str, Any]] = None,
        db_session: Optional[AsyncSession] = None
    ) -> Dict[str, Any]:
        """
        Evaluates ALL active monitors for a location against a SINGLE weather data snapshot.
        Eliminates duplicate N-monitors-to-N-requests overhead.
        FAILURE PRESERVATION: If weather data is unavailable, preserves existing alert states.
        """
        if not await check_db_health():
            logger.warning("[MONITOR] Database health check failed. Skipping evaluation for %s", location)
            return {"status": "db_unavailable", "evaluated": 0}

        # 1. Fetch weather data once if not passed in
        if weather_data is None:
            try:
                weather_data = await weather_hub.get_weather_for_city(location)
            except Exception as exc:
                # FAILURE PRESERVATION: Do not mark condition as false or resolve alerts!
                logger.warning(
                    "⚠️ [MONITOR FAILURE PRESERVATION] Weather retrieval failed for '%s': %s. Preserving active alert states.",
                    location, exc
                )
                return {"status": "weather_data_failed", "evaluated": 0}

        if not weather_data:
            logger.warning("⚠️ [MONITOR FAILURE PRESERVATION] Empty weather data for '%s'. Preserving alert states.", location)
            return {"status": "weather_data_empty", "evaluated": 0}

        async def _run_evaluation(sess: AsyncSession) -> Dict[str, Any]:
            # Query all enabled monitors for this location (case-insensitive)
            stmt = select(WeatherMonitor).where(
                func.lower(WeatherMonitor.location) == location.strip().lower(),
                WeatherMonitor.enabled == True
            )
            res = await sess.execute(stmt)
            monitors = res.scalars().all()

            if not monitors:
                return {"status": "no_monitors", "evaluated": 0, "location": location}

            results = []
            for mon in monitors:
                try:
                    eval_res = await cls.evaluate_monitor(sess, mon, weather_data)
                    results.append({"monitor_id": mon.id, "result": eval_res})
                except Exception as exc:
                    logger.error("Error evaluating monitor %s: %s", mon.id, exc)
                    results.append({"monitor_id": mon.id, "error": str(exc)})

            await sess.commit()
            return {"status": "success", "evaluated": len(monitors), "results": results, "location": location}

        if db_session:
            return await _run_evaluation(db_session)
        else:
            async with async_session_factory() as session:
                return await _run_evaluation(session)

    @classmethod
    async def evaluate_all_active_locations(cls) -> Dict[str, Any]:
        """
        Finds all unique locations with active WeatherMonitors and evaluates each location once.
        Called periodically by the collector.
        """
        if not await check_db_health():
            return {"status": "db_unavailable"}

        async with async_session_factory() as session:
            stmt = select(func.distinct(WeatherMonitor.location)).where(WeatherMonitor.enabled == True)
            res = await session.execute(stmt)
            active_locations = [loc for (loc,) in res.all() if loc]

        if not active_locations:
            return {"status": "no_active_monitors", "count": 0}

        evaluated = 0
        for loc in active_locations:
            try:
                await cls.evaluate_location(loc)
                evaluated += 1
            except Exception as exc:
                logger.error("Error during batch location evaluation for '%s': %s", loc, exc)

        return {"status": "completed", "locations_evaluated": evaluated}

    # ─────────────────────────────────────────────────────────────────────────
    # CRUD & Query Helpers with User / Session Authorization
    # ─────────────────────────────────────────────────────────────────────────

    @classmethod
    async def create_monitor(
        cls,
        location: str,
        rule_type: str,
        metric: str,
        operator: str,
        threshold: float,
        time_window: Optional[str] = "all_day",
        severity: Optional[str] = "warning",
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
    ) -> Tuple[Optional[WeatherMonitor], Optional[str]]:
        """
        Validates and persists a new WeatherMonitor in PostgreSQL.
        Emits 'monitor.created' WebSocket event.
        """
        is_valid, err = validate_monitor_rule(
            location=location,
            rule_type=rule_type,
            metric=metric,
            operator=operator,
            threshold=threshold,
            time_window=time_window,
            severity=severity
        )
        if not is_valid:
            return None, err

        if not await check_db_health():
            return None, "Database temporarily unavailable"

        clean_loc = location.strip()
        monitor = WeatherMonitor(
            user_id=user_id,
            session_id=session_id,
            location=clean_loc,
            latitude=latitude,
            longitude=longitude,
            rule_type=rule_type,
            metric=metric,
            operator=operator,
            threshold=float(threshold),
            time_window=time_window or "all_day",
            severity=severity or "warning",
            enabled=True,
            state="active",
        )

        async with async_session_factory() as session:
            session.add(monitor)
            await session.commit()
            await session.refresh(monitor)

        # Broadcast creation
        await ws_manager.broadcast({
            "type": "monitor.created",
            "city": monitor.location,
            "session_id": monitor.session_id,
            "monitor": monitor.to_dict(),
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
        })

        return monitor, None

    @classmethod
    async def get_monitor(
        cls,
        monitor_id: str,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None
    ) -> Optional[WeatherMonitor]:
        """Fetches a monitor with strict ownership enforcement."""
        if not await check_db_health():
            return None

        async with async_session_factory() as session:
            stmt = select(WeatherMonitor).where(WeatherMonitor.id == monitor_id)
            res = await session.execute(stmt)
            monitor = res.scalars().first()

            if not monitor:
                return None

            # Ownership check
            if user_id and monitor.user_id and monitor.user_id != user_id:
                return None
            if session_id and monitor.session_id and monitor.session_id != session_id:
                return None

            return monitor

    @classmethod
    async def list_monitors(
        cls,
        location: Optional[str] = None,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        enabled_only: bool = False
    ) -> List[WeatherMonitor]:
        """Lists monitors filtered by owner and optional location."""
        if not await check_db_health():
            return []

        async with async_session_factory() as session:
            query = select(WeatherMonitor)
            conditions = []

            if user_id:
                conditions.append(WeatherMonitor.user_id == user_id)
            elif session_id:
                conditions.append(WeatherMonitor.session_id == session_id)

            if location:
                conditions.append(func.lower(WeatherMonitor.location) == location.strip().lower())

            if enabled_only:
                conditions.append(WeatherMonitor.enabled == True)

            if conditions:
                query = query.where(*conditions)

            query = query.order_by(desc(WeatherMonitor.created_at))
            res = await session.execute(query)
            return list(res.scalars().all())

    @classmethod
    async def update_monitor(
        cls,
        monitor_id: str,
        enabled: Optional[bool] = None,
        threshold: Optional[float] = None,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None
    ) -> Tuple[Optional[WeatherMonitor], Optional[str]]:
        """Updates enabled status or threshold with ownership check."""
        if not await check_db_health():
            return None, "Database unavailable"

        async with async_session_factory() as session:
            stmt = select(WeatherMonitor).where(WeatherMonitor.id == monitor_id)
            res = await session.execute(stmt)
            monitor = res.scalars().first()

            if not monitor:
                return None, "Monitor not found"

            # Authorization
            if user_id and monitor.user_id and monitor.user_id != user_id:
                return None, "Unauthorized"
            if session_id and monitor.session_id and monitor.session_id != session_id:
                return None, "Unauthorized"

            now = datetime.datetime.now(datetime.timezone.utc)
            if enabled is not None:
                monitor.enabled = enabled
                if not enabled:
                    monitor.state = "disabled"
                elif monitor.state == "disabled":
                    monitor.state = "active"

            if threshold is not None:
                # Re-validate bounds
                is_valid, err = validate_monitor_rule(
                    location=monitor.location,
                    rule_type=monitor.rule_type,
                    metric=monitor.metric,
                    operator=monitor.operator,
                    threshold=threshold,
                    time_window=monitor.time_window,
                    severity=monitor.severity
                )
                if not is_valid:
                    return None, err
                monitor.threshold = float(threshold)

            monitor.updated_at = now
            await session.commit()
            await session.refresh(monitor)

            # Broadcast update
            await ws_manager.broadcast({
                "type": "monitor.updated",
                "city": monitor.location,
                "session_id": monitor.session_id,
                "monitor": monitor.to_dict(),
                "timestamp": now.isoformat()
            })

            return monitor, None

    @classmethod
    async def delete_monitor(
        cls,
        monitor_id: str,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None
    ) -> bool:
        """Deletes a monitor and its triggered alerts cascade with ownership check."""
        if not await check_db_health():
            return False

        async with async_session_factory() as session:
            stmt = select(WeatherMonitor).where(WeatherMonitor.id == monitor_id)
            res = await session.execute(stmt)
            monitor = res.scalars().first()

            if not monitor:
                return False

            if user_id and monitor.user_id and monitor.user_id != user_id:
                return False
            if session_id and monitor.session_id and monitor.session_id != session_id:
                return False

            location = monitor.location
            sess_id = monitor.session_id

            await session.delete(monitor)
            await session.commit()

            # Broadcast removal
            await ws_manager.broadcast({
                "type": "monitor.disabled",
                "city": location,
                "session_id": sess_id,
                "monitor_id": monitor_id,
                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
            })

            return True

    @classmethod
    async def list_triggered_alerts(
        cls,
        location: Optional[str] = None,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50
    ) -> List[TriggeredAlert]:
        """Lists auditable triggered alerts with 'Why did I get this alert?' explanations."""
        if not await check_db_health():
            return []

        async with async_session_factory() as session:
            query = select(TriggeredAlert)
            conditions = []

            if user_id:
                conditions.append(TriggeredAlert.user_id == user_id)
            elif session_id:
                conditions.append(TriggeredAlert.session_id == session_id)

            if location:
                conditions.append(func.lower(TriggeredAlert.location) == location.strip().lower())

            if status:
                conditions.append(TriggeredAlert.status == status)

            if conditions:
                query = query.where(*conditions)

            query = query.order_by(desc(TriggeredAlert.triggered_at)).limit(limit)
            res = await session.execute(query)
            return list(res.scalars().all())

    @classmethod
    async def get_triggered_alert(
        cls,
        alert_id: str,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None
    ) -> Optional[TriggeredAlert]:
        """Fetches an alert record by ID with ownership verification."""
        if not await check_db_health():
            return None

        async with async_session_factory() as session:
            stmt = select(TriggeredAlert).where(TriggeredAlert.id == alert_id)
            res = await session.execute(stmt)
            alert = res.scalars().first()

            if not alert:
                return None

            if user_id and alert.user_id and alert.user_id != user_id:
                return None
            if session_id and alert.session_id and alert.session_id != session_id:
                return None

            return alert
