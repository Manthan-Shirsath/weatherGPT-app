# SkyCast FastAPI Backend Engine

High-performance asynchronous meteorological backend powered by **FastAPI**, **Redis 7**, **PostgreSQL 16**, **SQLAlchemy 2.0 (asyncpg)**, and the **WeatherGPT Multi-Agent Intelligence Suite**.

---

## 🌟 Key Backend Capabilities

- ⚡ **High-Performance FastAPI**: Asynchronous REST endpoints with GZip compression and auto-generated Swagger UI (`/docs`).
- 🧠 **WeatherGPT Multi-Agent Suite**: Specialized agents for **General Weather**, **Agriculture**, **Disaster Risk**, **Urban & Commute**, **Climate Research**, **Aviation (METAR/TAF)**, and **Marine (Ocean Swell)**.
- ⚠️ **Official IMD CAP Alert Engine**: Real-time RSS/XML ingestion from WMO Alert Hub with hierarchical geo-matching (`city` > `district` > `state` > `regional`).
- 🔬 **Methodology-Diverse Forecast Ingestion**: Automated ingestion and storage of physics NWP models (ECMWF IFS, NOAA GFS, DWD ICON) and AI/ML models (ECMWF AIFS, Google WeatherNext 2).
- 🗄️ **Dual-Tier Resilient Caching**: Redis 7 cache with transparent in-memory fallbacks when Redis or PostgreSQL are unavailable, ensuring zero downtime.
- 📡 **WebSockets & Standing Monitors**: Persistent real-time alert evaluation and live browser push updates via `/ws`.
- 🔄 **Continuous Background Daemon Workers**:
  - `collector_worker`: Periodically fetches, normalizes, and snapshots weather observations.
  - `forecast_ingestion_worker`: Background multi-model forecast synchronization.
- 🧪 **290+ Automated Tests**: Thorough test suite covering AST safety guardrails, temporal context resolution, provider fallbacks, and deterministic risk logic.

---

## 🏗️ Directory Structure

```text
backend/
├── alembic/                  # Database migration scripts
├── app/
│   ├── core/                 # Config, Cache (Redis), Database (Postgres), WebSockets
│   ├── models/               # SQLAlchemy ORM models & Pydantic canonical schemas
│   ├── routes/               # API routers (/weather, /chat, /alerts, /climate, /forecast-intelligence, etc.)
│   ├── services/             # WeatherHub, WeatherGPT Agent, IMD CAP Engine, Ingestion
│   └── utils/                # Helper utilities & math modules
├── tests/                    # 290+ pytest unit and integration test suite
├── Dockerfile                # Production multi-stage container
├── main.py                   # Lifespan startup, background worker initiation, CORS, GZip
└── requirements.txt          # Python dependencies
```

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
pip install -r backend/requirements.txt
```

### 2. Configure Environment Variables
Copy template:
```bash
cp .env.example .env
```
Key variables:
- `GROQ_API_KEY`: For LLM-powered WeatherGPT inference.
- `DATABASE_URL`: PostgreSQL connection (`postgresql+asyncpg://user:pass@localhost:5432/skycast`).
- `REDIS_URL`: Redis connection (`redis://localhost:6379/0`).
*(Note: If Postgres or Redis are not running locally, SkyCast automatically falls back to in-memory mode without crashing).*

### 3. Run the Backend Server
```bash
python backend/main.py
```
Or via uvicorn:
```bash
uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```
- **API Base**: `http://localhost:8000`
- **Interactive OpenAPI Docs**: `http://localhost:8000/docs`

---

## 📡 Core API Endpoints

| Endpoint | Method | Description |
| :--- | :---: | :--- |
| `/api/weather` | `GET` | Current conditions, hourly, 7-day forecast, air quality, solar radiation. |
| `/api/chat` | `POST` | WeatherGPT conversational query with multi-agent routing and decision cards. |
| `/api/alerts` | `GET` | Active IMD CAP official warnings and SkyCast derived risk assessments. |
| `/api/forecast-intelligence/compare` | `GET` | Side-by-side comparison of NWP physics models vs AI/ML models. |
| `/api/climate/summary` | `GET` | Historical ERA5 reanalysis weather data and climate normal comparisons. |
| `/api/agriculture/advice` | `GET` | Crop stress analytics, soil moisture, and pesticide spray windows. |
| `/api/trends` | `GET` | Historical observation trends and statistical summaries. |
| `/api/map/weather` | `GET` | Regional GIS weather data layer for MapLibre visualization. |
| `/ws` | `WS` | Real-time WebSocket connection for live monitors and alert events. |
| `/health` | `GET` | System health check (Redis, DB, providers). |

---

## 🧪 Testing

Run the automated backend test suite:
```bash
pytest backend/tests/ -v
```
All tests use SQLite in-memory databases and mocked external providers to ensure reproducible, hermetic test runs.
