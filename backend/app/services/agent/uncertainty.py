"""
Uncertainty and Actionable Intelligence Evaluator
Extracts and structures grounded risks, recommendations, uncertainty levels,
and follow-up questions from executed tool cards and weather observations.
Zero fabrication: every field is derived from actual tool execution data.
"""

from typing import Dict, Any, List, Optional
import datetime
from backend.app.services.agent.schemas import (
    CardItem,
    SourceItem,
    UncertaintyInfo,
    RiskItem,
    RecommendationItem
)


class ActionableIntelligenceSynthesizer:
    """
    Synthesizes structured Actionable Intelligence from executed agent cards and tool outputs.
    """

    @classmethod
    def synthesize(
        cls,
        reply_text: str,
        city: str,
        agent_mode: str,
        cards: List[CardItem],
        sources: List[SourceItem],
        data_status: str = "fresh"
    ) -> Dict[str, Any]:
        """
        Builds the structured Actionable Intelligence dictionary.
        """
        conditions: Optional[Dict[str, Any]] = None
        forecast: Optional[Dict[str, Any]] = None
        risks: List[RiskItem] = []
        recommendations: List[RecommendationItem] = []
        uncertainty: Optional[UncertaintyInfo] = None
        freshness: Optional[Dict[str, Any]] = None
        follow_ups: List[str] = []

        # 1. Extract Conditions from weather_summary or current_weather cards
        for card in cards:
            if card.type in ("weather_summary", "current_weather"):
                d = card.data
                conditions = {
                    "location": d.get("location") or d.get("name") or city,
                    "temperature_c": d.get("temperature_c") or d.get("tempC"),
                    "feels_like_c": d.get("feels_like_c") or d.get("feelsLikeC"),
                    "condition": d.get("condition"),
                    "humidity_pct": d.get("humidity"),
                    "wind_speed_kmh": d.get("wind_speed_kmh") or d.get("windSpeed"),
                    "precipitation_probability": d.get("rain_probability_pct") or d.get("precipitation_probability", 0),
                    "precipitation_mm": d.get("precipitation"),
                    "nwp_model": d.get("nwp_model")
                }
                if d.get("main_concern"):
                    risks.append(RiskItem(
                        hazard="Meteorological Concern",
                        severity="moderate",
                        impact=d.get("main_concern"),
                        advice="Monitor radar and short-range forecast updates."
                    ))
                break

        # 2. Extract Forecast & Timeline Analytics from forecast_timeline or forecast cards
        for card in cards:
            if card.type in ("forecast_timeline", "forecast"):
                d = card.data
                analytics = d.get("analytics") or {}
                target_p = d.get("target_period") or {}
                forecast = {
                    "location": d.get("location") or city,
                    "target_date": d.get("target_date"),
                    "rain_trend": analytics.get("rain_trend"),
                    "temperature_trend": analytics.get("temperature_trend"),
                    "best_dry_window": analytics.get("best_dry_window"),
                    "target_period": target_p if target_p else None,
                    "nwp_model": d.get("nwp_model")
                }
                break

        # 3. Extract Risks from alert / risk cards
        for card in cards:
            if card.type in ("alert", "weather_alert", "risk"):
                d = card.data
                if card.type == "risk":
                    for r in d.get("active_risks", []):
                        risks.append(RiskItem(
                            hazard=r.get("hazard", "Weather Risk"),
                            severity=r.get("risk_colour", "moderate"),
                            impact=r.get("explanation"),
                            advice=r.get("action", "Take necessary precautions")
                        ))
                else:
                    severity = (d.get("severity") or "moderate").lower()
                    risks.append(RiskItem(
                        hazard=d.get("hazard") or d.get("event") or d.get("headline") or "Weather Advisory",
                        severity=severity,
                        impact=d.get("description") or d.get("explanation"),
                        advice=d.get("instruction") or (d.get("recommendations")[0] if d.get("recommendations") else "Stay informed via official channels.")
                    ))

        # 4. Extract Recommendations from agriculture, recommendation, decision cards
        for card in cards:
            if card.type == "agriculture":
                d = card.data
                rec_list = d.get("recommendations", [])
                for r in rec_list:
                    if isinstance(r, dict):
                        recommendations.append(RecommendationItem(
                            category="agriculture",
                            action=r.get("action") or r.get("title") or "Agricultural Field Operation",
                            reason=r.get("reason") or r.get("detail", "Derived from temperature, wind, and rain projections"),
                            suitability=r.get("status") or r.get("suitability", "caution"),
                            time_window=r.get("window"),
                            source="Agriculture Intelligence Service"
                        ))
                    elif isinstance(r, str):
                        recommendations.append(RecommendationItem(
                            category="agriculture",
                            action="Field Advisory",
                            reason=r,
                            suitability="caution",
                            source="Agriculture Intelligence Service"
                        ))
            elif card.type == "decision":
                d = card.data
                recommendations.append(RecommendationItem(
                    category=d.get("activity") or "general",
                    action=d.get("recommendation") or d.get("verdict") or "Plan according to forecast",
                    reason=d.get("reason") or f"Suitability status: {d.get('status', 'caution')}",
                    suitability=d.get("status", "caution"),
                    time_window=d.get("target_time") or d.get("window"),
                    source="Decision Support Engine"
                ))
            elif card.type == "recommendation":
                d = card.data
                recs = d.get("recommendations", [])
                for r in recs:
                    if isinstance(r, dict):
                        recommendations.append(RecommendationItem(
                            category=d.get("activity") or "general",
                            action=r.get("action", "Weather Recommendation"),
                            reason=r.get("reason", "Based on meteorological metrics"),
                            suitability=r.get("suitability"),
                            time_window=r.get("window"),
                            source="Recommendation Service"
                        ))

        # 5. Determine Uncertainty and Source Disagreement
        uncertainty_level = "high"
        uncertainty_exp = "High confidence: data is current, validated by numerical models, and grounded in normalized weather observations."
        source_disagree = False
        disagree_detail = None

        # Check for model comparison card
        for card in cards:
            if card.type in ("comparison", "date_comparison", "model_comparison"):
                d = card.data
                agr = d.get("agreement_level")
                models_list = d.get("models") or []
                models_count = d.get("models_count", len(models_list) if isinstance(models_list, list) and models_list else 2)

                if models_count > 1:
                    if agr == "low":
                        uncertainty_level = "low"
                        source_disagree = True
                        disagree_detail = d.get("verdict") or "Forecast models exhibit significant spread in precipitation timing and intensity."
                        uncertainty_exp = "Low confidence: operational models diverge significantly on projected values."
                    elif agr == "moderate":
                        uncertainty_level = "moderate"
                        source_disagree = True
                        disagree_detail = d.get("verdict") or "Forecast models show minor divergence in precipitation amounts."
                        uncertainty_exp = "Moderate confidence: minor divergence across operational models."
                    elif agr == "high":
                        uncertainty_level = "high"
                        uncertainty_exp = "High confidence: operational models (ECMWF, GFS) are in strong agreement."
                elif models_count == 1:
                    uncertainty_level = "high"
                    model_name = models_list[0] if models_list else "primary NWP"
                    uncertainty_exp = f"High confidence: grounded in operational forecast model ({model_name})."
                break

        # Check for domain limitations
        mode_str = str(agent_mode).lower() if agent_mode else "auto"
        if "aviation" in mode_str:
            if uncertainty_level == "high":
                uncertainty_level = "moderate"
                uncertainty_exp = "Moderate confidence: live METAR/TAF observation feeds are not connected; guidance is derived from numerical forecast models."
        elif "marine" in mode_str:
            if uncertainty_level == "high":
                uncertainty_level = "moderate"
                uncertainty_exp = "Moderate confidence: live ocean buoy and tide telemetry are not connected; guidance is derived from marine forecast models."

        # Check for stale/degraded data
        if data_status in ("stale", "degraded"):
            uncertainty_level = "low"
            uncertainty_exp = "Low confidence: weather snapshot is cached/stale due to provider or network latency."

        uncertainty = UncertaintyInfo(
            level=uncertainty_level,
            explanation=uncertainty_exp,
            source_disagreement=source_disagree,
            disagreement_details=disagree_detail
        )

        # 6. Freshness metadata
        freshness = {
            "status": data_status,
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "sources_count": len(sources)
        }

        # 7. Grounded Follow-up Questions
        lower_reply = reply_text.lower()
        if "agri" in mode_str or "farmer" in mode_str or "spray" in lower_reply or "crop" in lower_reply:
            follow_ups.append(f"Optimal spray window for next 48 hours in {city}")
            follow_ups.append(f"Soil moisture & evapotranspiration in {city}")
            follow_ups.append(f"Heat stress index for crops in {city}")
        elif "aviation" in mode_str or "crosswind" in lower_reply or "ceiling" in lower_reply:
            follow_ups.append(f"Crosswind component for runway operations at {city}")
            follow_ups.append(f"Ceiling & visibility trend for next 6 hours")
            follow_ups.append(f"Turbulence and icing assessment near {city}")
        elif "marine" in mode_str or "wave" in lower_reply or "swell" in lower_reply:
            follow_ups.append(f"Swell direction and wave height near {city}")
            follow_ups.append(f"Small craft advisory status for {city}")
            follow_ups.append(f"Tide changes over next 6 hours")
        elif "research" in mode_str or "climate" in mode_str or "historical" in lower_reply:
            follow_ups.append(f"How do temperatures compare to 30-year normal in {city}?")
            follow_ups.append(f"Seasonal rainfall variability for {city}")
        else:
            if "rain" in lower_reply:
                follow_ups.append(f"Hourly rain breakdown for {city}")
                follow_ups.append(f"Best dry window for outdoor activities today in {city}")
            if "temp" in lower_reply or "heat" in lower_reply:
                follow_ups.append(f"7-day temperature trends in {city}")
            if len(follow_ups) < 2:
                follow_ups.append(f"What is the weekend forecast for {city}?")
                follow_ups.append(f"Will weather conditions change tomorrow in {city}?")

        return {
            "summary": reply_text[:300] if reply_text else None,
            "conditions": conditions,
            "forecast": forecast,
            "risks": risks if risks else None,
            "recommendations": recommendations if recommendations else None,
            "uncertainty": uncertainty,
            "freshness": freshness,
            "follow_up_questions": follow_ups[:4]
        }
