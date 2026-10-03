# WEATHERGPT — FULL-STACK IMPLEMENTATION PLAN

## 1. Current Repository Audit

Based on an inspection of the existing codebase (`src/` for frontend, `backend/` for backend), here is the status of the required capabilities:

### Frontend (React 19 + Vite + TypeScript)
- **EXISTING**:
  - React/Vite structure, React Router (`react-router-dom`)
  - Tailwind CSS + HeroUI (`@heroui/react`) for components
  - Multilingual support via `i18next` (`src/locales`, `i18n.ts`)
  - Map integration (`maplibre-gl`, `react-map-gl`)
  - Recharts for data visualization
- **PLANNED**:
  - Comprehensive WeatherGPT Chat UI (Context chips, specialized domain rendering)
  - Full implementation of domain-specific dashboards (Aviation, Marine, etc.)
- **MISSING**:
  - Voice Interaction (STT/TTS bindings in the UI)
  - Robust local state management for offline alert caching
- **NEEDS REFACTOR**:
  - Consolidate state management (currently scattered; recommend Zustand or React Query)

### Backend (Python + FastAPI)
- **EXISTING**:
  - FastAPI structure with modular routing (`app/routes/`)
  - PostgreSQL via asyncpg/SQLAlchemy
  - Redis caching and background worker loops (`collector.py`, `forecast_ingestion.py`)
  - WebSocket support (`ws.py`)
  - Multi-provider abstraction (`open_meteo.py`, `imd_provider.py`)
  - Multi-agent router placeholder (`forecast_intelligence.py`)
- **PLANNED**:
  - Real IMD/WIS2.0 MQTT live ingestion (currently mocked)
  - SMS/IVR alert channels (currently mocked)
- **MISSING**:
  - Forecast Consensus Engine (Model comparison logic)
  - Full implementation of all 7 specialized agents (some are stubs)
- **NEEDS REFACTOR**:
  - Agent executor loop to handle strict validation of LLM outputs (guardrails)
  - WebSocket state management (needs horizontal scaling considerations with Redis Pub/Sub)

### Infrastructure
- **EXISTING**:
  - `docker-compose.yml` defining Postgres, Redis, Backend, Frontend
  - Environment variable configuration (`.env.example`)
- **PLANNED**:
  - Cloud deployment pipelines (CI/CD)
- **NEEDS REFACTOR**:
  - Migration considerations: `01-skycast-codebase-audit.md` mentions moving to Next.js/Vercel. **Decision**: Maintain FastAPI backend for heavy background polling, WebSockets, and AI orchestration. Use Vercel only for the React static frontend.

---

## 2. System Architecture

```text
User 
 ├── (Web/Mobile Interface - React)
 │    ├── WeatherGPT Chat
 │    ├── Dashboards (Map, Alerts)
 │    └── Voice/Text Input
 ↓ (REST APIs & WebSockets)
API Gateway / Load Balancer (Nginx / Cloudflare)
 ↓
FastAPI Backend
 ├── Routes (/api/chat, /api/weather, /ws)
 ├── Authentication & Rate Limiting Middleware
 │
 ├── WeatherGPT Agent Hub / Router
 │    ├── Intent + Context Extraction
 │    ├── Language & Role Propagation
 │    └── Agent Selection (General, Agri, Disaster, etc.)
 │
 ├── Tool Execution Pipeline
 │    ├── Data Validation & Guardrails
 │    └── Weather Hub (Data Aggregator)
 │         ├── OpenMeteo Provider
 │         ├── IMD / WIS2.0 Provider (MQTT/REST)
 │         └── Historical / Climate Data (Postgres)
 │
 ├── Background Workers (asyncio)
 │    ├── Collector (Polls providers every 180s)
 │    ├── Alert Engine (Evaluates IMD thresholds)
 │    └── Forecast Ingestion (Model runs)
 │
 ├── Redis (Cache, rate limits, pub/sub for WS)
 └── PostgreSQL (Canonical data, chat history, subscriptions)
```

---

## 3. Frontend Architecture

### Application Shell
- **Sidebar**: Primary navigation (Dashboard, WeatherGPT, Map, Alerts, Climate).
- **Global Header**: Location context selector, Role selector (Farmer, Disaster Manager, etc.), Language toggle, System health indicator.
- **Notification System**: Global toast notifications for real-time WebSocket alerts.
- **Theme**: Dark mode prioritized with "layered surfaces" (slate/gray rather than pure navy), semantic weather colors (Orange/Red for alerts, Blue for rain).

### Pages
1. **/dashboard**: Hero widgets, immediate local forecast, active intelligence summary.
2. **/weathergpt**: The core chat workspace. Split view: Chat on left, dynamic widget rendering (charts, maps) on right based on AI output.
3. **/forecast**: Detailed hourly/daily graphs (Recharts).
4. **/map**: MapLibre GL JS integration with radar and alert overlay layers.
5. **/alerts**: Timeline of IMD/Skycast active alerts and subscription management.

### State Management
- **Server State**: `@tanstack/react-query` for all REST API fetching (caching, deduping).
- **Client/Global State**: React Context or `zustand` for Theme, Current Location, User Role, and Language.
- **Real-time State**: Custom WebSocket hook updating local React Query cache on events.

---

## 4. Backend Architecture

### Services
- **Weather Hub**: Abstracted layer standardizing data from multiple providers into a `CanonicalWeather` schema.
- **Alert Engine**: Evaluates weather data against IMD thresholds to compute Risk Tiers (Green, Yellow, Orange, Red).
- **Agent Service**: Orchestrates Gemini LLM, injects context, handles function calling.

### Background Workers
- **Collector**: Runs every 3 minutes. Fetches data for monitored hubs, passes to Alert Engine, stores snapshots to DB, broadcasts WS events.

---

## 5. Database Schema (PostgreSQL)

```sql
-- Core Entities
CREATE TABLE users ( id UUID, email VARCHAR, preferences JSONB );
CREATE TABLE locations ( id SERIAL, name VARCHAR, lat FLOAT, lon FLOAT, tz VARCHAR );

-- Conversational AI
CREATE TABLE chat_sessions ( id UUID, location_id INT, role VARCHAR, language VARCHAR, created_at TS );
CREATE TABLE chat_messages ( id BIGSERIAL, session_id UUID, role VARCHAR, content TEXT, tool_calls JSONB );

-- Weather & Alerts
CREATE TABLE weather_snapshots ( id BIGSERIAL, location_id INT, timestamp TS, data JSONB, source VARCHAR );
CREATE TABLE active_alerts ( id SERIAL, location_id INT, hazard VARCHAR, tier VARCHAR, issued_at TS, valid_until TS );
CREATE TABLE alert_subscriptions ( id SERIAL, location_id INT, min_tier VARCHAR, phone VARCHAR );
```

---

## 6. API Specification (Examples)

### GET `/api/weather/forecast`
```json
// Request: ?lat=18.52&lon=73.85&role=general
// Response:
{
  "location": {"name": "Pune", "lat": 18.52, "lon": 73.85},
  "current": {"temp": 32.5, "condition": "Clear", "wind_kph": 12},
  "forecast": [...],
  "source_provenance": "open-meteo",
  "freshness": "2 mins ago"
}
```

### POST `/api/chat`
```json
// Request:
{
  "message": "Is it safe to spray pesticides tomorrow?",
  "location": {"lat": 18.52, "lon": 73.85},
  "user_role": "farmer",
  "language": "en"
}
// Response:
{
  "reply": "Based on tomorrow's forecast, wind speeds will exceed 20 km/h, making it unsafe for spraying.",
  "confidence": "high",
  "sources": ["open-meteo"],
  "widgets": [{"type": "agri_safety_gauge", "value": "unsafe"}]
}
```

---

## 7. AI Architecture (Agent Router)

1. **Intent & Context Extraction**: Analyzes user query + selected UI role (e.g., `farmer`).
2. **Agent Router**:
   - `Auto`: Routes based on intent.
   - `Agriculture`: Injects crop thresholds.
   - `Disaster`: Injects IMD warning guidelines.
   - `Aviation/Marine/Urban`: Specialized prompt suffixes.
3. **Tool Execution**: LLM outputs a function call (`get_weather(lat, lon)`). Backend executes it against the internal Postgres/Redis cache (never directly to external APIs).
4. **Guardrails**: System prompt strictly forbids inventing numbers. Output is grounded in the injected JSON from the tool call.

---

## 8. Weather Data Architecture

**Provider Abstraction (`BaseWeatherProvider`)**:
- `OpenMeteoProvider`: Primary production source.
- `IMDProvider`: MQTT/WIS2.0 subscriber (currently mocked with fixtures).
- `ForecastConsensusEngine`: A future service that pulls from multiple providers (GFS, ECMWF), normalizes them, computes the standard deviation, and attaches a `confidence_score` to the forecast.

---

## 9. Real-Time Architecture

- **WebSockets (`/ws`)**: Clients connect and subscribe to specific locations.
- **Alert Flow**:
  1. `Collector` worker fetches new data.
  2. `AlertEngine` detects a threshold crossing (Yellow -> Orange).
  3. Saves to `active_alerts`.
  4. Broadcasts JSON payload over WebSocket.
  5. React frontend intercepts WS message and triggers a toast notification.

---

## 10. Voice/Multilingual Architecture

- **Voice (Frontend)**: Uses Web Speech API (Client-side) for Speech-to-Text. User dictates, text is sent to `/api/chat`.
- **Multilingual**: 
  - Frontend UI translated via `i18next`.
  - Chat language passed to LLM via system prompt (`"Respond in Hindi..."`).
  - Fallback deterministic responses use predefined dictionary (Bhashini stub).

---

## 11. Security Architecture

- **Rate Limiting**: Redis-backed sliding window limit on `/api/chat` to prevent LLM abuse.
- **Tool Authorization**: Agents can only execute read-only tools defined in the `ToolRegistry`. No arbitrary code execution.
- **Prompt Injection**: System prompt isolates user input from instructions.
- **API Keys**: Stored in `.env`, never exposed to frontend.

---

## 12. Testing Architecture

- **Backend**: `pytest` for unit testing the `AlertEngine` thresholds and `WeatherHub` normalization.
- **AI**: LLM evaluation framework using deterministic queries to ensure the model refuses to hallucinate when data is omitted.
- **Frontend**: Vitest for component testing (especially specialized widgets).

---

## 13. Deployment Architecture

- **Frontend**: Deployed to Vercel (Static Site + React Router).
- **Backend**: Deployed to Render / Railway / AWS ECS (Docker container). Must be persistent to support background workers and WebSockets.
- **Database**: Supabase / Neon (Serverless Postgres).
- **Cache**: Upstash / Redis Labs.

---

## 14. MVP Scope

**MUST HAVE (SIH Prototype)**:
- Functional Chat interface with Role Selection (Farmer, Disaster).
- Open-Meteo integration with background collector.
- Real-time WebSocket alerts triggered by computed risk tiers.
- Multilingual chat output via Gemini.

**SHOULD HAVE (Post-MVP)**:
- Real IMD/WIS2.0 MQTT integration.
- SMS/IVR alert delivery (Twilio).
- Map overlays.

**FUTURE**:
- Aviation / Marine specialized models.
- Machine Learning forecast consensus.

---

## 15. Implementation Roadmap

- **Phase 1 (Foundation)**: Solidify FastAPI + Postgres + Redis Docker environment. Implement `WeatherHub` provider abstraction.
- **Phase 2 (Data Pipeline)**: Finalize background collector, IMD risk tier engine, and WebSocket broadcasting.
- **Phase 3 (Agentic Core)**: Implement the Gemini LLM router, tool registry, and prompt templates for different roles.
- **Phase 4 (Frontend UI)**: Build the React Application Shell, Dashboards, and WeatherGPT workspace using HeroUI.
- **Phase 5 (Polish)**: i18n localization, Maps integration, Latency optimization.

---

## 16. Recommended File Structure

Keep the existing structure but organize cleanly:

```text
weather-app/
├── src/                    # React Frontend
│   ├── components/         # Reusable HeroUI components
│   ├── features/           # Domain-driven (weathergpt, alerts, map)
│   ├── hooks/              # WebSocket, Geolocation
│   └── locales/            # i18n JSONs
│
├── backend/                # FastAPI Backend
│   ├── app/
│   │   ├── api/            # Route controllers
│   │   ├── agents/         # LLM logic, prompts, tools
│   │   ├── services/       # Weather Hub, Alert Engine
│   │   ├── models/         # SQLAlchemy schemas
│   │   └── workers/        # Asyncio background tasks
│   ├── main.py
│   └── requirements.txt
│
└── docker-compose.yml
```

---

## 17. Risks & Technical Tradeoffs

- **Background Workers in Python**: Running `asyncio` tasks inside FastAPI is fine for MVP, but in a highly scaled production environment, these should be decoupled into a separate Celery/ARQ worker process to prevent blocking the web thread.
- **LLM Latency**: Agentic loops (Tool Call -> Response -> Tool Call) can take 3-5 seconds. **Mitigation**: Stream tokens to the frontend immediately, and show UI indicators ("Fetching weather data...").
- **Cost**: Open-Meteo is free, but Gemini API costs scale with usage. Implement strict Redis caching for identical geographic queries.

---

## 18. Exact Next Steps

1. **Do not rewrite to Next.js serverless.** Stick to the current React + FastAPI architecture to maintain background workers and WebSockets for the SIH prototype.
2. Initialize the Supabase/PostgreSQL schema (run Alembic migrations).
3. Validate the `OpenMeteoProvider` inside `weather_hub.py` and ensure the background `collector_worker` is successfully storing snapshots to Postgres.
4. Finalize the `AgentRegistry` to handle `farmer` and `disaster_manager` roles explicitly in `backend/app/agents/`. 
5. Build out the `WeatherGPTPage.tsx` React component to consume the `/api/chat` streaming response.
