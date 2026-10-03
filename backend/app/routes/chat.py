"""
Chat Route for WeatherGPT AI Agent
Handles natural language weather queries with function calling, persistent PostgreSQL memory,
multi-tool reasoning, and backward-compatible response schemas.
"""

import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel, Field

from backend.app.services.agent import weather_agent, AgentResponse, CardItem, SourceItem
from backend.app.services.agent.schemas import UncertaintyInfo, RiskItem, RecommendationItem
from backend.app.models.chat import UserRole

router = APIRouter(prefix="/api", tags=["Chat"])


from backend.app.services.agent.registry import AgentMode

class ChatRequest(BaseModel):
    message: str
    city: Optional[str] = "Pune"
    session_id: Optional[str] = Field(None, description="Optional persistent conversation session ID")
    history: Optional[List[Dict[str, Any]]] = []
    language: Optional[str] = "en"
    user_role: Optional[str] = UserRole.GENERAL_PUBLIC.value  # New: role-adaptive responses
    agent_mode: Optional[AgentMode] = AgentMode.AUTO
    context: Optional[Dict[str, Any]] = None


class ChatResponse(BaseModel):
    reply: str
    city: str
    timestamp: str
    session_id: Optional[str] = None
    cards: List[CardItem] = Field(default_factory=list)
    sources: List[SourceItem] = Field(default_factory=list)
    data_status: str = "fresh"
    conversation_context: Optional[Dict[str, Any]] = None
    summary: Optional[str] = None
    conditions: Optional[Dict[str, Any]] = None
    forecast: Optional[Dict[str, Any]] = None
    risks: Optional[List[RiskItem]] = None
    recommendations: Optional[List[RecommendationItem]] = None
    uncertainty: Optional[UncertaintyInfo] = None
    freshness: Optional[Dict[str, Any]] = None
    follow_up_questions: Optional[List[str]] = None


@router.post("/chat", response_model=ChatResponse)
async def chat_weather(req: ChatRequest = Body(...)):
    """
    WeatherGPT Conversational Agent Endpoint.
    Orchestrates tool calling, persistent multi-turn history, and structured response synthesis.
    Supports role-adaptive response formatting (general_public, farmer, disaster_manager, etc.)
    """
    user_query = req.message.strip()
    if not user_query:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    try:
        agent_res: AgentResponse = await weather_agent.run(
            message=user_query,
            session_id=req.session_id,
            default_city=req.city or "Pune",
            language=req.language or "en",
            user_role=req.user_role or UserRole.GENERAL_PUBLIC.value,
            agent_mode=req.agent_mode.value if req.agent_mode else "auto",
            ui_context=req.context
        )

        return ChatResponse(
            reply=agent_res.reply,
            city=agent_res.city,
            timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
            session_id=agent_res.session_id,
            cards=agent_res.cards,
            sources=agent_res.sources,
            data_status=agent_res.data_status,
            conversation_context=agent_res.conversation_context,
            summary=agent_res.summary,
            conditions=agent_res.conditions,
            forecast=agent_res.forecast,
            risks=agent_res.risks,
            recommendations=agent_res.recommendations,
            uncertainty=agent_res.uncertainty,
            freshness=agent_res.freshness,
            follow_up_questions=agent_res.follow_up_questions
        )

    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"WeatherGPT Agent error: {str(exc)}")
