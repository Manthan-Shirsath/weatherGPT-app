"""
Lightweight ConversationContext & State Tracking Module for WeatherGPT
Maintains explicit structured weather state across multi-turn sessions (location, date, time, activity, intent).
Resolves conversational references deterministically to prevent LLM amnesia and unnecessary clarification loops.
"""

import re
import datetime
from typing import Dict, Any, Optional, Tuple, List
from pydantic import BaseModel, Field
import logging

logger = logging.getLogger("skycast.agent.context")


# ==============================================================================
# 1. Structured State Model
# ==============================================================================

class ConversationContext(BaseModel):
    """
    Explicit structured conversational state for WeatherGPT.
    Tracks location, date, time, activity, and intent across multi-turn interactions.
    """
    location: Optional[str] = Field(None, description="Active canonical city or location name (e.g. 'Pune', 'Mumbai')")
    locations: List[str] = Field(default_factory=list, description="List of canonical cities for comparison")
    latitude: Optional[float] = Field(None, description="Resolved latitude coordinate if available")
    longitude: Optional[float] = Field(None, description="Resolved longitude coordinate if available")
    date: str = Field("today", description="Normalized date category: 'today', 'tomorrow', 'Saturday', etc.")
    dates: List[str] = Field(default_factory=list, description="List of resolved date ISO strings for comparison")
    date_expression: str = Field("today", description="User-facing date phrase: 'today', 'tomorrow', 'this Saturday'")
    resolved_date: str = Field(default_factory=lambda: datetime.date.today().isoformat(), description="Calendar date YYYY-MM-DD")
    time: Optional[str] = Field(None, description="Specific hour/minute if requested (e.g. '17:00', '5 PM')")
    time_range: Optional[str] = Field(None, description="Time of day: 'morning', 'afternoon', 'evening', 'night'")
    time_span: Optional[List[int]] = Field(None, description="Exact hour span if requested (e.g. [9, 16])")
    weather_intent: str = Field("current_weather", description="Intent: 'current_weather', 'forecast', 'activity_suitability', 'rain_check', 'alerts', 'comparison'")
    activity: Optional[str] = Field(None, description="Outdoor activity (e.g. 'cricket', 'football', 'hiking', 'running')")
    language: str = Field("en", description="Target response language: 'en', 'mr', 'hi', etc.")
    agent_mode: str = Field("auto", description="The agent mode active during this context resolution")
    current_topic: Optional[str] = Field(None, description="High-level topic summary")
    last_updated: str = Field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat())

    def to_summary_dict(self) -> Dict[str, Any]:
        return {
            "location": self.location,
            "locations": self.locations,
            "date": self.date,
            "dates": self.dates,
            "date_expression": self.date_expression,
            "resolved_date": self.resolved_date,
            "time": self.time,
            "time_range": self.time_range,
            "time_span": self.time_span,
            "activity": self.activity,
            "weather_intent": self.weather_intent,
            "language": self.language
        }


# ==============================================================================
# 2. Known Named Entities & Gazetteers (English + Marathi)
# ==============================================================================

KNOWN_CITIES = {
    # Major Indian Metro Cities
    "pune": "Pune",
    "mumbai": "Mumbai",
    "bombay": "Mumbai",
    "delhi": "New Delhi",
    "new delhi": "New Delhi",
    "bengaluru": "Bengaluru",
    "bangalore": "Bengaluru",
    "chennai": "Chennai",
    "madras": "Chennai",
    "kolkata": "Kolkata",
    "calcutta": "Kolkata",
    "hyderabad": "Hyderabad",
    "ahmedabad": "Ahmedabad",
    "jaipur": "Jaipur",
    "srinagar": "Srinagar",
    "surat": "Surat",
    "nagpur": "Nagpur",
    "nashik": "Nashik",
    "aurangabad": "Aurangabad",
    "chhatrapati sambhajinagar": "Aurangabad",
    "thane": "Thane",
    "goa": "Goa",
    "panaji": "Panaji",
    "lucknow": "Lucknow",
    "chandigarh": "Chandigarh",
    "bhopal": "Bhopal",
    "patna": "Patna",
    "kochi": "Kochi",
    "coimbatore": "Coimbatore",
    "shimla": "Shimla",
    "manali": "Manali",
    "guwahati": "Guwahati",
    "dehradun": "Dehradun",
    # Global Cities
    "london": "London",
    "tokyo": "Tokyo",
    "new york": "New York",
    "paris": "Paris",
    "dubai": "Dubai",
    "singapore": "Singapore"
}

MARATHI_CITY_MAP = {
    "पुणे": "Pune",
    "पुण्यात": "Pune",
    "पुण्यातील": "Pune",
    "पुण्यासाठी": "Pune",
    "मुंबई": "Mumbai",
    "मुंबईत": "Mumbai",
    "मुंबईतील": "Mumbai",
    "दिल्ली": "New Delhi",
    "दिल्लीत": "New Delhi",
    "दिल्लीतील": "New Delhi",
    "नवी दिल्ली": "New Delhi",
    "बंगळूर": "Bengaluru",
    "बेंगळुरू": "Bengaluru",
    "चेन्नई": "Chennai",
    "कोलकाता": "Kolkata",
    "हैदराबाद": "Hyderabad",
    "अहमदाबाद": "Ahmedabad",
    "जयपूर": "Jaipur",
    "नागपूर": "Nagpur",
    "नागपुरात": "Nagpur",
    "नाशिक": "Nashik",
    "नाशिकमध्ये": "Nashik",
    "औरंगाबाद": "Aurangabad",
    "संभाजीनगर": "Aurangabad",
    "ठाणे": "Thane",
    "गोवा": "Goa"
}

WEEKDAYS_MAP = {
    "monday": 0, "mon": 0, "सोमवार": 0, "सोमवारी": 0,
    "tuesday": 1, "tue": 1, "मंगळवार": 1, "मंगळवारी": 1,
    "wednesday": 2, "wed": 2, "बुधवार": 2, "बुधवारी": 2,
    "thursday": 3, "thu": 3, "गुरुवार": 3, "गुरुवारी": 3,
    "friday": 4, "fri": 4, "शुक्रवार": 4, "शुक्रवारी": 4,
    "saturday": 5, "sat": 5, "शनिवार": 5, "शनिवारी": 5,
    "sunday": 6, "sun": 6, "रविवार": 6, "रविवारी": 6,
}


# ==============================================================================
# 3. Deterministic Entity Extractors
# ==============================================================================

def extract_explicit_location(text: str) -> Optional[str]:
    """Detects explicit location/city names in user query in English and Marathi."""
    if not text:
        return None
    text_lower = text.lower()

    # 1. Direct match on Marathi city names
    for m_name, canon in MARATHI_CITY_MAP.items():
        if m_name in text:
            return canon

    # 2. Match known English city keywords with word boundaries
    for city_key, canon in KNOWN_CITIES.items():
        pattern = rf"\b{re.escape(city_key)}\b"
        if re.search(pattern, text_lower):
            return canon

    # 3. English preposition patterns: "in Pune", "for Mumbai", "at Goa"
    m = re.search(r"\b(?:in|at|for|around|near|to)\s+([A-Za-z]{3,20})\b", text, re.IGNORECASE)
    if m:
        candidate = m.group(1).title()
        if candidate.lower() in KNOWN_CITIES:
            return KNOWN_CITIES[candidate.lower()]

    # 4. Marathi suffix patterns: "<City> मध्ये", "<City> मधील", "<City> चे"
    m_mr = re.search(r"([A-Za-z\u0900-\u097F]{3,20})(?:मध्ये|मधील|च्या|चे|ला|वरून)\b", text)
    if m_mr:
        candidate = m_mr.group(1).strip()
        if candidate in MARATHI_CITY_MAP:
            return MARATHI_CITY_MAP[candidate]

    return None

def extract_explicit_locations(text: str) -> List[str]:
    """Detects explicit location/city names in user query. Returns a list of unique locations."""
    if not text:
        return []
    text_lower = text.lower()
    found = []

    # 1. Direct match on Marathi city names
    for m_name, canon in MARATHI_CITY_MAP.items():
        if m_name in text:
            if canon not in found:
                found.append(canon)

    # 2. Match known English city keywords with word boundaries
    for city_key, canon in KNOWN_CITIES.items():
        pattern = rf"\b{re.escape(city_key)}\b"
        if re.search(pattern, text_lower):
            if canon not in found:
                found.append(canon)

    # 3. English preposition patterns
    m_iter = re.finditer(r"\b(?:in|at|for|around|near|to|and|or|vs)\s+([A-Za-z]{3,20})\b", text, re.IGNORECASE)
    for m in m_iter:
        candidate = m.group(1).title()
        if candidate.lower() in KNOWN_CITIES:
            canon = KNOWN_CITIES[candidate.lower()]
            if canon not in found:
                found.append(canon)

    # 4. Marathi suffix patterns
    m_mr_iter = re.finditer(r"([A-Za-z\u0900-\u097F]{3,20})(?:मध्ये|मधील|च्या|चे|ला|वरून|आणि|किंवा)\b", text)
    for m_mr in m_mr_iter:
        candidate = m_mr.group(1).strip()
        if candidate in MARATHI_CITY_MAP:
            canon = MARATHI_CITY_MAP[candidate]
            if canon not in found:
                found.append(canon)

    return found


def normalize_target_date(date_str: Optional[str], base_date: Optional[datetime.date] = None) -> str:
    """
    Centralized temporal normalization helper.
    Resolves natural language dates ('today', 'tomorrow', 'day after tomorrow', 'day_after_tomorrow',
    'Saturday', ISO date strings, Marathi terms) to an ISO YYYY-MM-DD string.
    """
    today = base_date or datetime.date.today()
    today_iso = today.isoformat()

    if not date_str or not str(date_str).strip():
        return today_iso

    d_clean = str(date_str).strip().lower()

    # 1. Exact ISO date YYYY-MM-DD
    if re.match(r"^\d{4}-\d{2}-\d{2}$", d_clean):
        return d_clean

    # 2. Day after tomorrow (must precede 'tomorrow' to avoid substring matching)
    if any(k in d_clean for k in [
        "day after tomorrow", "day_after_tomorrow", "the day after tomorrow",
        "परवा", "parwa", "parva", "day-after-tomorrow"
    ]):
        return (today + datetime.timedelta(days=2)).isoformat()

    # 3. Tomorrow
    if any(k in d_clean for k in ["tomorrow", "tmrw", "उद्या", "udya"]):
        return (today + datetime.timedelta(days=1)).isoformat()

    # 4. Today / Now / Tonight
    if any(k in d_clean for k in ["today", "now", "currently", "tonight", "आज", "सध्या"]):
        return today_iso

    # 5. Weekdays (e.g. Saturday, Sunday, शनिवारी)
    for day_word, target_weekday in WEEKDAYS_MAP.items():
        pattern = rf"\b{re.escape(day_word)}\b" if day_word.isascii() else re.escape(day_word)
        if re.search(pattern, d_clean):
            cur_wd = today.weekday()
            ahead = (target_weekday - cur_wd) % 7
            if ahead == 0:
                ahead = 7
            return (today + datetime.timedelta(days=ahead)).isoformat()

    return today_iso


def resolve_temporal_reference(
    text: str,
    base_date: Optional[datetime.date] = None,
    previous_resolved_date: Optional[str] = None
) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Extracts date reference and resolves to (date_key, date_expression, resolved_date_iso).
    Supports today, tomorrow, day after tomorrow, weekend, tonight/this evening, and day of week in English and Marathi.
    Includes contextual ambiguity resolution for weekdays (e.g. this Saturday vs next Saturday).
    """
    if not text:
        return None, None, None

    today = base_date or datetime.date.today()
    text_lower = text.lower()

    # Tonight / This evening / This morning / This afternoon / Today
    if any(k in text_lower for k in ["tonight", "this evening", "this morning", "this afternoon", "आज संध्याकाळी", "आज सकाळी", "आज दुपारी", "आज रात्री"]):
        return "today", "today", today.isoformat()

    if any(k in text_lower for k in ["today", "right now", "currently", "now", "आज", "सध्या", "सध्याचे"]):
        return "today", "today", today.isoformat()

    # Day after tomorrow (Checked BEFORE tomorrow to prevent substring clash)
    if any(k in text_lower for k in ["day after tomorrow", "day_after_tomorrow", "the day after tomorrow", "परवा", "parwa", "parva", "day-after-tomorrow"]):
        target = today + datetime.timedelta(days=2)
        return "day_after_tomorrow", "the day after tomorrow", target.isoformat()

    # Tomorrow / Tomorrow evening / etc.
    if any(k in text_lower for k in [
        "tomorrow morning", "tomorrow afternoon", "tomorrow evening", "tomorrow night",
        "उद्या सकाळी", "उद्या दुपारी", "उद्या संध्याकाळी", "उद्या रात्री",
        "tomorrow", "tmrw", "उद्या", "udya"
    ]):
        target = today + datetime.timedelta(days=1)
        return "tomorrow", "tomorrow", target.isoformat()

    # Weekend / This weekend
    if any(k in text_lower for k in ["this weekend", "the weekend", "weekend", "वीकेंड", "शनिवार-रविवार"]):
        cur_wd = today.weekday()
        # Saturday is 5
        days_ahead = (5 - cur_wd) % 7
        if days_ahead == 0 and cur_wd == 5:
            days_ahead = 0
        target = today + datetime.timedelta(days=days_ahead)
        return "weekend", f"this weekend ({target.strftime('%b %d')})", target.isoformat()

    # Weekday lookups (e.g. Saturday, Sunday, शनिवारी)
    for day_word, target_weekday in WEEKDAYS_MAP.items():
        pattern = rf"\b{re.escape(day_word)}\b" if day_word.isascii() else re.escape(day_word)
        if re.search(pattern, text_lower):
            current_weekday = today.weekday()
            days_ahead = (target_weekday - current_weekday) % 7

            is_explicit_next = any(k in text_lower for k in ["next", "पुढील", "पुढच्या", "पुढल्या"])
            is_explicit_this = any(k in text_lower for k in ["this", "ह्या", "या", "चालू"])

            # Ambiguity handling:
            # If target weekday matches today's weekday (days_ahead == 0):
            if days_ahead == 0:
                if is_explicit_this and not is_explicit_next:
                    days_ahead = 0
                elif is_explicit_next:
                    days_ahead = 7
                elif previous_resolved_date and previous_resolved_date > today.isoformat():
                    # Conversational context is already in the future (e.g. tomorrow/Sunday), so weekday means next occurrence
                    days_ahead = 7
                else:
                    days_ahead = 0
            elif is_explicit_next:
                days_ahead += 7

            target = today + datetime.timedelta(days=days_ahead)
            day_name = target.strftime("%A")
            if days_ahead == 0:
                expr = f"this {day_name} (today)"
            elif days_ahead >= 7 or is_explicit_next:
                expr = f"next {day_name} ({target.strftime('%b %d')})"
            else:
                expr = f"this {day_name} ({target.strftime('%b %d')})"
            return day_name, expr, target.isoformat()

    return None, None, None


def resolve_temporal_references(
    text: str,
    base_date: Optional[datetime.date] = None,
    previous_resolved_date: Optional[str] = None
) -> List[Tuple[str, str, str]]:
    """
    Extracts multiple date references for comparisons (e.g. Saturday or Sunday).
    Returns a list of (date_key, date_expression, resolved_date_iso).
    """
    if not text:
        return []
        
    today = base_date or datetime.date.today()
    text_lower = text.lower()
    found_dates = []
    
    # 1. Check for specific keywords
    if any(k in text_lower for k in ["tonight", "this evening", "this morning", "this afternoon", "आज संध्याकाळी", "आज सकाळी", "आज दुपारी", "आज रात्री"]):
        found_dates.append(("today", "today", today.isoformat()))
    elif any(k in text_lower for k in ["today", "right now", "currently", "now", "आज", "सध्या", "सध्याचे"]):
        found_dates.append(("today", "today", today.isoformat()))

    # Day after tomorrow (Checked BEFORE tomorrow)
    if any(k in text_lower for k in ["day after tomorrow", "day_after_tomorrow", "the day after tomorrow", "परवा", "parwa", "parva", "day-after-tomorrow"]):
        target = today + datetime.timedelta(days=2)
        found_dates.append(("day_after_tomorrow", "the day after tomorrow", target.isoformat()))

    if any(k in text_lower for k in [
        "tomorrow morning", "tomorrow afternoon", "tomorrow evening", "tomorrow night",
        "उद्या सकाळी", "उद्या दुपारी", "उद्या संध्याकाळी", "उद्या रात्री",
        "tomorrow", "tmrw", "उद्या", "udya"
    ]):
        target = today + datetime.timedelta(days=1)
        found_dates.append(("tomorrow", "tomorrow", target.isoformat()))

    if any(k in text_lower for k in ["this weekend", "the weekend", "weekend", "वीकेंड", "शनिवार-रविवार"]):
        cur_wd = today.weekday()
        days_ahead = (5 - cur_wd) % 7
        if days_ahead == 0 and cur_wd == 5:
            days_ahead = 0
        target = today + datetime.timedelta(days=days_ahead)
        found_dates.append(("weekend", f"this weekend ({target.strftime('%b %d')})", target.isoformat()))

    # 2. Weekday lookups
    for day_word, target_weekday in WEEKDAYS_MAP.items():
        pattern = rf"\b{re.escape(day_word)}\b" if day_word.isascii() else re.escape(day_word)
        if re.search(pattern, text_lower):
            current_weekday = today.weekday()
            days_ahead = (target_weekday - current_weekday) % 7
            is_explicit_next = any(k in text_lower for k in ["next", "पुढील", "पुढच्या", "पुढल्या"])
            is_explicit_this = any(k in text_lower for k in ["this", "ह्या", "या", "चालू"])
            
            if days_ahead == 0:
                if is_explicit_this and not is_explicit_next:
                    days_ahead = 0
                elif is_explicit_next:
                    days_ahead = 7
                elif previous_resolved_date and previous_resolved_date > today.isoformat():
                    days_ahead = 7
                else:
                    days_ahead = 0
            elif is_explicit_next:
                days_ahead += 7

            target = today + datetime.timedelta(days=days_ahead)
            day_name = target.strftime("%A")
            if days_ahead == 0:
                expr = f"this {day_name} (today)"
            elif days_ahead >= 7 or is_explicit_next:
                expr = f"next {day_name} ({target.strftime('%b %d')})"
            else:
                expr = f"this {day_name} ({target.strftime('%b %d')})"
                
            # Avoid duplicate days (e.g. multiple "Saturday" synonyms matching)
            if not any(d[0] == day_name for d in found_dates):
                found_dates.append((day_name, expr, target.isoformat()))

    return found_dates


def format_marathi_weather_reply(
    city: str,
    date_key: str,
    date_expr: str,
    time_val: Optional[str],
    time_range: Optional[str],
    high_c: int,
    low_c: int,
    condition: str,
    rain_chance: int,
    activity: Optional[str] = None
) -> str:
    """Formats natural Marathi phrasing without leaking English terms."""
    # 1. Translate date expression
    if date_key in ["tomorrow", "उद्या"]:
        d_mr = "उद्या"
    elif date_key in ["today", "आज"]:
        d_mr = "आज"
    elif date_key in ["day_after_tomorrow", "परवा"]:
        d_mr = "परवा"
    elif "saturday" in date_key.lower() or "शनिवार" in date_key:
        d_mr = "पुढील शनिवारी" if "next" in (date_expr or "").lower() else "शनिवारी"
    elif "sunday" in date_key.lower() or "रविवार" in date_key:
        d_mr = "रविवारी"
    elif "monday" in date_key.lower() or "सोमवार" in date_key:
        d_mr = "सोमवारी"
    elif "tuesday" in date_key.lower() or "मंगळवार" in date_key:
        d_mr = "मंगळवारी"
    elif "wednesday" in date_key.lower() or "बुधवार" in date_key:
        d_mr = "बुधवारी"
    elif "thursday" in date_key.lower() or "गुरुवार" in date_key:
        d_mr = "गुरुवारी"
    elif "friday" in date_key.lower() or "शुक्रवार" in date_key:
        d_mr = "शुक्रवारी"
    else:
        d_mr = "उद्या"

    # 2. Translate time / range expression
    t_mr = ""
    if time_val:
        m_hr = re.search(r"(\d{1,2})", time_val)
        hr = int(m_hr.group(1)) if m_hr else 17
        if hr == 17 or hr == 5:
            t_mr = "संध्याकाळी ५:०० वाजता"
        elif hr > 12:
            t_mr = f"संध्याकाळी {hr-12}:०० वाजता"
        elif hr == 12:
            t_mr = "दुपारी १२:०० वाजता"
        else:
            t_mr = f"सकाळी {hr}:०० वाजता"
    elif time_range:
        if time_range == "evening":
            t_mr = "संध्याकाळी"
        elif time_range == "morning":
            t_mr = "सकाळी"
        elif time_range == "afternoon":
            t_mr = "दुपारी"
        elif time_range == "night":
            t_mr = "रात्री"

    time_phrase = f"{d_mr} {t_mr}".strip() if t_mr else d_mr

    # 3. Translate condition
    cond_lower = condition.lower()
    if "cloud" in cond_lower:
        c_mr = "ढगाळ"
    elif "rain" in cond_lower or "shower" in cond_lower:
        c_mr = "पावसाळी"
    elif "clear" in cond_lower or "sun" in cond_lower:
        c_mr = "निरभ्र / स्वच्छ"
    elif "thunder" in cond_lower:
        c_mr = "वादळी पाऊस"
    else:
        c_mr = "ढगाळ"

    # 4. Activity suitability or weather forecast
    if activity == "cricket":
        if rain_chance >= 50:
            return f"{city} मध्ये {time_phrase} पावसाची शक्यता अधिक ({rain_chance}%) आहे आणि हवामान {c_mr} राहण्याचा अंदाज आहे (तापमान ~{high_c}°C). त्यामुळे मैदानावर क्रिकेट खेळणे टाळावे किंवा इनडोअर बॅकअप ठेवावा."
        else:
            return f"{city} मध्ये {time_phrase} क्रिकेट खेळण्यासाठी हवामान अनुकूल आहे. तापमान अंदाजे {high_c}°C असून पावसाची शक्यता {rain_chance}% आहे."

    return f"{city} मध्ये {time_phrase}: {c_mr} हवामान अपेक्षित, कमाल {high_c}°C / किमान {low_c}°C। पावसाची शक्यता: {rain_chance}%।"



def extract_time_reference(text: str) -> Tuple[Optional[str], Optional[str], Optional[List[int]]]:
    """
    Extracts specific clock time (e.g. '17:00'), time of day ('evening', 'morning'),
    and specific time span constraints (e.g. [9, 16] for 9 AM to 4 PM).
    """
    if not text:
        return None, None, None

    text_lower = text.lower()
    time_str = None
    time_range = None
    time_span = None
    
    def to_24(h: int, m_ampm: Optional[str]) -> int:
        if m_ampm == "pm" and h < 12:
            return h + 12
        if m_ampm == "am" and h == 12:
            return 0
        return h

    # 1. Range matching (e.g., "between 9 AM and 4 PM", "from 9 to 4 pm")
    range_match = re.search(r"(?:from\s+|between\s+)?(\d{1,2})(?::\d{2})?\s*(am|pm)?\s*(?:to|and|-|until|till)\s*(\d{1,2})(?::\d{2})?\s*(am|pm)", text_lower)
    if range_match:
        start_hr = int(range_match.group(1))
        start_am = range_match.group(2)
        end_hr = int(range_match.group(3))
        end_am = range_match.group(4)
        
        if not start_am:
            # infer from end_am. If it's 9 to 4 pm, 9 is AM. If it's 2 to 4 pm, 2 is PM.
            if end_am == "pm":
                if start_hr < end_hr or start_hr == 12:
                    start_am = "pm"
                else:
                    start_am = "am"
            else:
                start_am = end_am or "am"
                
        start_24 = to_24(start_hr, start_am)
        end_24 = to_24(end_hr, end_am)
        
        if start_24 <= end_24:
            time_span = [start_24, end_24]
            # also set a fallback time_range
            if start_24 < 12:
                time_range = "morning"
            elif start_24 < 17:
                time_range = "afternoon"
            else:
                time_range = "evening"
                
            return f"{start_24:02d}:00", time_range, time_span

    # Clock time: e.g. "5 PM", "5:30 PM", "5pm", "17:00", "5 वाजता", "५ वाजता"
    m_pm = re.search(r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", text_lower)
    if m_pm:
        hour = int(m_pm.group(1))
        minute = int(m_pm.group(2) or 0)
        ampm = m_pm.group(3)
        hour = to_24(hour, ampm)
        time_str = f"{hour:02d}:{minute:02d}"
        if 5 <= hour < 12:
            time_range = "morning"
        elif 12 <= hour < 17:
            time_range = "afternoon"
        elif 17 <= hour < 21:
            time_range = "evening"
        else:
            time_range = "night"
        return time_str, time_range, None

    m_24h = re.search(r"\b([01]?\d|2[0-3]):([0-5]\d)\b", text)
    if m_24h:
        hour = int(m_24h.group(1))
        minute = int(m_24h.group(2))
        time_str = f"{hour:02d}:{minute:02d}"
        time_range = "evening" if 17 <= hour < 21 else ("morning" if 5 <= hour < 12 else "afternoon")
        return time_str, time_range, None

    # Marathi time: "5 वाजता", "५ वाजता"
    m_mr = re.search(r"(\d{1,2}|[०-९]{1,2})\s*वाजता", text)
    if m_mr:
        raw_val = m_mr.group(1)
        # convert Marathi numerals if present
        dev_digits = str.maketrans("०१२३४५६७८९", "0123456789")
        hour_int = int(raw_val.translate(dev_digits))
        # If morning/evening context
        if any(k in text_lower for k in ["संध्याकाळी", "सायंकाळी", "दुपारी"]) and hour_int < 12:
            hour_int += 12
        time_str = f"{hour_int:02d}:00"
        time_range = "evening" if "संध्याकाळी" in text or "सायंकाळी" in text or hour_int >= 17 else "morning"
        return time_str, time_range, None

    # Time of day keywords
    if any(k in text_lower for k in ["evening", "tonight", "संध्याकाळी", "सायंकाळी", "संध्याकाळ", "सायंकाळ"]):
        time_range = "evening"
    elif any(k in text_lower for k in ["morning", "सकाळी", "सकाळ"]):
        time_range = "morning"
    elif any(k in text_lower for k in ["afternoon", "दुपारी", "दुपार"]):
        time_range = "afternoon"
    elif any(k in text_lower for k in ["night", "रात्री", "रात्र"]):
        time_range = "night"

    return time_str, time_range, time_span


def extract_activity_reference(text: str) -> Optional[str]:
    """Detects outdoor activities or sports mentioned in query."""
    if not text:
        return None
    text_lower = text.lower()

    if any(k in text_lower for k in ["cricket", "क्रिकेट", "मैच", "सामना"]):
        return "cricket"
    if any(k in text_lower for k in ["football", "soccer", "फुटबॉल"]):
        return "football"
    if any(k in text_lower for k in ["hiking", "trekking", "trek", "हिकिंग", "ट्रेकिंग", "ट्रेक"]):
        return "hiking"
    if any(k in text_lower for k in ["running", "run", "jogging", "धावणे"]):
        return "running"
    if any(k in text_lower for k in ["event", "wedding", "party", "समारंभ", "लग्न"]):
        return "outdoor_event"
    if any(k in text_lower for k in ["play", "playing", "खेळायला", "खेळणे", "खेळू"]):
        return "outdoor_sports"

    return None


def derive_intent(
    text: str,
    date_key: str,
    time_range: Optional[str],
    activity: Optional[str],
    locations_count: int = 1,
    dates_count: int = 1
) -> str:
    """Derives meteorological intent based on query and extracted state."""
    text_lower = text.lower()
    words = [w.strip("?.,! ") for w in text_lower.split() if w.strip("?.,! ")]
    is_polar_marathi_ka = bool(len(words) > 1 and words[-1] == "का")
    is_single_word_why = bool(len(words) == 1 and words[0] in ["why", "का", "क्यों"])

    has_explanation_why = (
        is_single_word_why
        or any(k in text_lower for k in ["why", "how", "explain", "what causes", "what's going on", "what is going on", "कारण", "कशासाठी", "का बरं", "का म्हणून", "क्यों", "कैसे"])
        or ("का" in words[:-1])
    )

    if (has_explanation_why and not is_polar_marathi_ka) or is_single_word_why:
        return "visual_explanation"
    if locations_count > 1 or (locations_count == 1 and any(k in text_lower for k in ["compare with", "vs", "versus", "or", "better", "tulna"]) and "or" not in text_lower):
        # We need a robust check for location_comparison vs date_comparison
        # If dates_count > 1, prioritize date comparison.
        if dates_count > 1:
            return "date_comparison"
        return "location_comparison"
    if dates_count > 1 or ("or" in text_lower and any(day in text_lower for day in WEEKDAYS_MAP.keys())):
        return "date_comparison"
    if activity or "play" in text_lower or "खेळायला" in text_lower or "good time" in text_lower or "योग्य वेळ" in text_lower:
        return "activity_suitability"
    if any(k in text_lower for k in ["rain", "paus", "barish", "barsat", "पाऊस", "बारिश", "बरसात", "वर्षा", "drizzle", "shower"]):
        return "rain_check"
    if any(k in text_lower for k in ["alert", "warning", "risk", "धोका", "इशारा", "सावधान", "चेतावनी", "खतरा", "safe"]):
        return "alerts"
    if any(k in text_lower for k in ["trend", "history", "yesterday", "मागील", "काल"]):
        return "trends"
    if date_key in ["tomorrow", "day_after_tomorrow"] or date_key in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] or time_range:
        return "forecast"
    return "current_weather"


# ==============================================================================
# 4. In-Memory Thread-Safe Session Context Tracker
# ==============================================================================

class ConversationContextTracker:
    """
    Lightweight state manager that tracks and updates conversation state across multi-turn sessions.
    Maintains session isolation and resolves conversational references deterministically.
    """

    def __init__(self):
        self._sessions: Dict[str, ConversationContext] = {}

    def get_context(self, session_id: Optional[str]) -> Optional[ConversationContext]:
        if not session_id:
            return None
        return self._sessions.get(session_id)

    def resolve_context(
        self,
        session_id: Optional[str],
        user_text: str,
        default_city: Optional[str] = None,
        language: str = "en",
        base_date: Optional[datetime.date] = None,
        agent_mode: str = "auto"
    ) -> ConversationContext:
        """
        Deterministically resolves conversational references in user_text against existing state.
        Inherits previous location/date/activity if implicit, or updates state if explicit.
        """
        sid = session_id or "default-session"
        prev = self._sessions.get(sid)

        # 1. Resolve Location
        explicit_locs = extract_explicit_locations(user_text)
        if explicit_locs:
            active_location = explicit_locs[0]
            locations = explicit_locs
        elif prev and prev.locations:
            active_location = prev.location
            locations = prev.locations
        elif prev and prev.location:
            active_location = prev.location
            locations = [prev.location]
        else:
            active_location = default_city or None
            locations = [active_location] if active_location else []

        # 2. Resolve Date
        prev_res_date = prev.resolved_date if prev else None
        found_dates = resolve_temporal_references(
            user_text, base_date=base_date, previous_resolved_date=prev_res_date
        )
        if found_dates:
            date_key = found_dates[0][0]
            date_expr = found_dates[0][1]
            resolved_date = found_dates[0][2]
            dates = [d[2] for d in found_dates]
        elif prev and prev.date != "today":
            # Inherit previous date (e.g. "tomorrow", "Saturday")
            date_key = prev.date
            date_expr = prev.date_expression
            resolved_date = prev.resolved_date
            dates = prev.dates or [prev.resolved_date]
        else:
            today_obj = base_date or datetime.date.today()
            date_key = "today"
            date_expr = "today"
            resolved_date = today_obj.isoformat()
            dates = [resolved_date]


        # 3. Resolve Time & Time Range
        new_time, new_time_range, new_time_span = extract_time_reference(user_text)
        if new_time or new_time_range or new_time_span:
            time_val = new_time
            time_range = new_time_range
            time_span = new_time_span
        elif found_dates:
            # If user explicitly switched dates ("What about Saturday?"), reset specific clock time
            time_val = None
            time_range = None
            time_span = None
        elif prev:
            time_val = prev.time
            time_range = prev.time_range
            time_span = prev.time_span
        else:
            time_val = None
            time_range = None
            time_span = None

        mode_changed = prev and prev.agent_mode != agent_mode

        # 4. Resolve Activity
        new_act = extract_activity_reference(user_text)
        if new_act:
            activity = new_act
        elif prev and prev.activity and not mode_changed:
            activity = prev.activity
        else:
            activity = None

        # 5. Derive Intent
        intent = derive_intent(user_text, date_key, time_range, activity, len(locations), len(dates))

        # Build new Context State
        ctx = ConversationContext(
            location=active_location,
            locations=locations,
            date=date_key,
            dates=dates,
            date_expression=date_expr,
            resolved_date=resolved_date,
            time=time_val,
            time_range=time_range,
            time_span=time_span,
            activity=activity,
            weather_intent=intent,
            language=language,
            agent_mode=agent_mode,
            current_topic=f"{intent}_{active_location or 'unknown'}",
            last_updated=datetime.datetime.now(datetime.timezone.utc).isoformat()
        )

        # Save to session tracker
        if session_id:
            self._sessions[session_id] = ctx

        logger.info(
            "🧠 [CONTEXT RESOLVED] Session '%s' -> Location: '%s', Date: '%s' (%s), Time: '%s', Activity: '%s', Intent: '%s'",
            session_id,
            ctx.location,
            ctx.date_expression,
            ctx.resolved_date,
            ctx.time or ctx.time_range or "all-day",
            ctx.activity,
            ctx.weather_intent
        )

        return ctx

    def clear_context(self, session_id: str):
        """Clears state for a given session."""
        self._sessions.pop(session_id, None)


# Global Singleton Context Tracker
conversation_context_tracker = ConversationContextTracker()
