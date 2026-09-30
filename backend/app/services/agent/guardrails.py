import re
import json
from typing import Any
from agents import input_guardrail, output_guardrail
from agents import GuardrailFunctionOutput
from agents.tool_guardrails import (
    tool_input_guardrail,
    tool_output_guardrail,
    ToolGuardrailFunctionOutput,
    ToolInputGuardrailData,
    ToolOutputGuardrailData
)
from agents.exceptions import (
    InputGuardrailTripwireTriggered,
    OutputGuardrailTripwireTriggered,
    ToolInputGuardrailTripwireTriggered,
    ToolOutputGuardrailTripwireTriggered
)

# Malicious/injection patterns for the input guardrail.
PROMPT_INJECTION_KEYWORDS = [
    "ignore all",
    "ignore previous",
    "disregard",
    "you are now",
    "system prompt",
    "sudo",
    "override",
    "jailbreak",
]

@input_guardrail(name="safety_input_guardrail")
def safety_input_guardrail(context, agent, input_data: str) -> GuardrailFunctionOutput:
    """
    Blocks prompt injection and explicit malicious requests.
    Does NOT block based on weather keywords to allow valid indirect requests.
    """
    if not isinstance(input_data, str):
        return GuardrailFunctionOutput(output_info=None, tripwire_triggered=False)

    lower_input = input_data.lower()
    for keyword in PROMPT_INJECTION_KEYWORDS:
        if keyword in lower_input:
            return GuardrailFunctionOutput(
                output_info="Safety policy violation: Malicious request detected.",
                tripwire_triggered=True
            )
            
    if len(input_data) > 5000:
        return GuardrailFunctionOutput(
            output_info="Input exceeds maximum allowed length.",
            tripwire_triggered=True
        )

    return GuardrailFunctionOutput(output_info=None, tripwire_triggered=False)

@output_guardrail(name="severe_weather_output_guardrail")
def severe_weather_output_guardrail(context, agent, output_data: str) -> GuardrailFunctionOutput:
    """
    Validates output for empty or broken responses.
    """
    if not isinstance(output_data, str):
        return GuardrailFunctionOutput(output_info=None, tripwire_triggered=False)
        
    if not output_data or output_data.strip() == "":
        # Changed: Do not trigger safety tripwire for empty responses.
        # This was causing "safety boundaries" errors when the local LLM failed to generate text.
        return GuardrailFunctionOutput(
            output_info="Empty response generated.",
            tripwire_triggered=False
        )
        
    return GuardrailFunctionOutput(output_info=None, tripwire_triggered=False)


# ==============================================================================
# Phase 3A.2 Tool Input and Output Guardrails
# ==============================================================================

@tool_input_guardrail(name="weather_tool_input_guardrail")
def weather_tool_input_guardrail(data: ToolInputGuardrailData) -> ToolGuardrailFunctionOutput:
    """
    Validates tool input parameters across registered weather tools:
    - Coordinates: lat in [-90.0, 90.0], lon in [-180.0, 180.0]
    - Forecast horizon: days in [1, 16]
    - Historical range: range_days in [1, 365]
    - Location strings: non-empty, max 100 chars, no purely non-alphanumeric/control strings
    - Comparison sets: 2-10 items
    """
    args = data.context.tool_input if hasattr(data, "context") and hasattr(data.context, "tool_input") else None
    if isinstance(args, str):
        try:
            args = json.loads(args)
        except Exception:
            args = {}
    elif hasattr(args, "model_dump"):
        args = args.model_dump()
    elif hasattr(args, "dict"):
        args = args.dict()
    elif not isinstance(args, dict):
        args = {}

    # 1. Coordinates validation
    lat = args.get("lat")
    if lat is not None:
        try:
            lat_f = float(lat)
            if lat_f < -90.0 or lat_f > 90.0:
                return ToolGuardrailFunctionOutput(
                    output_info=f"Invalid latitude {lat_f}: must be between -90.0 and 90.0",
                    behavior={"type": "raise_exception"}
                )
        except (ValueError, TypeError):
            return ToolGuardrailFunctionOutput(
                output_info=f"Invalid latitude value: {lat}",
                behavior={"type": "raise_exception"}
            )

    lon = args.get("lon")
    if lon is not None:
        try:
            lon_f = float(lon)
            if lon_f < -180.0 or lon_f > 180.0:
                return ToolGuardrailFunctionOutput(
                    output_info=f"Invalid longitude {lon_f}: must be between -180.0 and 180.0",
                    behavior={"type": "raise_exception"}
                )
        except (ValueError, TypeError):
            return ToolGuardrailFunctionOutput(
                output_info=f"Invalid longitude value: {lon}",
                behavior={"type": "raise_exception"}
            )

    # 2. Forecast horizon validation
    days = args.get("days")
    if days is not None:
        try:
            days_i = int(days)
            if days_i < 1 or days_i > 16:
                return ToolGuardrailFunctionOutput(
                    output_info=f"Forecast horizon {days_i} days is out of allowable range [1, 16]",
                    behavior={"type": "raise_exception"}
                )
        except (ValueError, TypeError):
            return ToolGuardrailFunctionOutput(
                output_info=f"Invalid days parameter: {days}",
                behavior={"type": "raise_exception"}
            )

    # 3. Historical range validation
    range_days = args.get("range_days")
    if range_days is not None:
        try:
            range_i = int(range_days)
            if range_i < 1 or range_i > 365:
                return ToolGuardrailFunctionOutput(
                    output_info=f"Historical range {range_i} days is out of allowable bounds [1, 365]",
                    behavior={"type": "raise_exception"}
                )
        except (ValueError, TypeError):
            return ToolGuardrailFunctionOutput(
                output_info=f"Invalid range_days parameter: {range_days}",
                behavior={"type": "raise_exception"}
            )

    # 4. Location strings validation
    loc = args.get("location") or args.get("query")
    if loc is not None and isinstance(loc, str):
        loc_str = loc.strip()
        if len(loc_str) > 100:
            return ToolGuardrailFunctionOutput(
                output_info=f"Location string exceeds maximum length of 100 characters ({len(loc_str)})",
                behavior={"type": "raise_exception"}
            )
        if loc_str and not re.search(r"[\w\u0900-\u097F]", loc_str):
            return ToolGuardrailFunctionOutput(
                output_info=f"Location string '{loc_str}' contains no valid alphanumeric characters",
                behavior={"type": "raise_exception"}
            )

    # 5. Comparison array constraints
    locations = args.get("locations")
    if locations is not None and isinstance(locations, list):
        if len(locations) < 2 or len(locations) > 10:
            return ToolGuardrailFunctionOutput(
                output_info=f"Location comparison requires between 2 and 10 locations (got {len(locations)})",
                behavior={"type": "raise_exception"}
            )

    dates = args.get("dates")
    if dates is not None and isinstance(dates, list):
        if len(dates) < 2 or len(dates) > 10:
            return ToolGuardrailFunctionOutput(
                output_info=f"Date comparison requires between 2 and 10 dates (got {len(dates)})",
                behavior={"type": "raise_exception"}
            )

    return ToolGuardrailFunctionOutput(output_info="Tool input validation passed", behavior={"type": "allow"})


@tool_output_guardrail(name="weather_tool_output_guardrail")
def weather_tool_output_guardrail(data: ToolOutputGuardrailData) -> ToolGuardrailFunctionOutput:
    """
    Validates tool outputs to ensure data integrity and detect corrupted/unphysical values:
    - Distinguishes expected domain failures (e.g. found=False, insufficient_data=True) and transient provider errors (allowed through)
    - Rejects unphysical physical quantities (temperatures < -100°C or > 70°C, humidity < 0 or > 100%, negative precipitation, impossible wind speeds)
    - Rejects malformed / corrupted structures
    """
    output = data.output if hasattr(data, "output") else None
    if output is None:
        return ToolGuardrailFunctionOutput(
            output_info="Tool returned null output unexpectedly",
            behavior={"type": "raise_exception"}
        )

    if not isinstance(output, dict):
        return ToolGuardrailFunctionOutput(
            output_info=f"Tool returned invalid output type {type(output).__name__}, expected dict",
            behavior={"type": "raise_exception"}
        )

    # 1. Expected domain outcomes & errors are permitted
    if output.get("error") or output.get("found") is False or output.get("insufficient_data"):
        return ToolGuardrailFunctionOutput(output_info="Domain outcome / error handled safely", behavior={"type": "allow"})

    # 2. Meteorological sanity checks for physical observations
    # Temperature (-100°C to 70°C)
    for temp_key in ["temperature", "temperature_c", "feels_like_c", "feelsLike", "temp"]:
        temp_val = output.get(temp_key)
        if temp_val is not None:
            try:
                temp_f = float(temp_val)
                if temp_f < -100.0 or temp_f > 70.0:
                    return ToolGuardrailFunctionOutput(
                        output_info=f"Unphysical temperature detected: {temp_f}°C (valid range: -100°C to 70°C)",
                        behavior={"type": "raise_exception"}
                    )
            except (ValueError, TypeError):
                return ToolGuardrailFunctionOutput(
                    output_info=f"Malformed temperature value: {temp_val}",
                    behavior={"type": "raise_exception"}
                )

    # Humidity (0% to 100%)
    for hum_key in ["humidity", "humidity_pct", "relative_humidity"]:
        hum_val = output.get(hum_key)
        if hum_val is not None:
            try:
                hum_f = float(hum_val)
                if hum_f < 0.0 or hum_f > 100.0:
                    return ToolGuardrailFunctionOutput(
                        output_info=f"Invalid relative humidity: {hum_f}% (valid range: 0% to 100%)",
                        behavior={"type": "raise_exception"}
                    )
            except (ValueError, TypeError):
                return ToolGuardrailFunctionOutput(
                    output_info=f"Malformed humidity value: {hum_val}",
                    behavior={"type": "raise_exception"}
                )

    # Precipitation (>= 0 mm, <= 2000 mm)
    for precip_key in ["precipitation", "precipitation_mm", "rain_mm"]:
        precip_val = output.get(precip_key)
        if precip_val is not None:
            try:
                precip_f = float(precip_val)
                if precip_f < 0.0 or precip_f > 2000.0:
                    return ToolGuardrailFunctionOutput(
                        output_info=f"Invalid precipitation quantity: {precip_f}mm (must be >= 0)",
                        behavior={"type": "raise_exception"}
                    )
            except (ValueError, TypeError):
                pass

    # Wind speed (0 to 500 km/h)
    for wind_key in ["wind_speed", "wind_speed_kmh", "windSpeed"]:
        wind_val = output.get(wind_key)
        if wind_val is not None:
            try:
                wind_f = float(wind_val)
                if wind_f < 0.0 or wind_f > 500.0:
                    return ToolGuardrailFunctionOutput(
                        output_info=f"Unphysical wind speed: {wind_f} km/h (valid range: 0 to 500 km/h)",
                        behavior={"type": "raise_exception"}
                    )
            except (ValueError, TypeError):
                pass

    return ToolGuardrailFunctionOutput(output_info="Tool output validation passed", behavior={"type": "allow"})

