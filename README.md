# 🌤️ weatherGPT - AI Weather Intelligence Platform

[![Docker](https://img.shields.io/badge/Docker-Containerized-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io/)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

**weatherGPT** is a production-ready, platform-independent weather intelligence platform combining real-time global meteorology, interactive radar maps, methodology-diverse forecast intelligence (NWP + AI/ML ensembles), autonomous multi-mode AI reasoning via **WeatherGPT**, and IMD CAP disaster alert integration.

---

## 🌟 Key Capabilities

- 🐳 **100% Platform Independent (Docker-First)**: Runs identically on Windows, macOS, Linux, and Cloud VPS with a single command. Zero host installation dependencies.
- 🧠 **Multi-Mode AI Agent Suite (WeatherGPT)**:
  - 🌐 **General Assistant**: Multi-turn weather retrieval, route-planning insights, and conversational forecasting.
  - 🌾 **Agriculture Agent**: Crop stress evaluation with strict threshold validation (wheat, rice, cotton, sugarcane, tomato).
  - 🚨 **Disaster Agent**: Convective storm tracking, heatwave analysis, and official IMD CAP warning synthesis.
  - 🏙️ **Urban Agent**: City commute impact, rain disruption, and grounded outdoor work safety advice.
  - 🔬 **Research Agent**: Historical weather archives, climate baseline comparisons, and multi-period anomaly analytics.
  - ✈️ **Aviation & 🌊 Marine Agents**: Strict boundary-aware specialist interfaces.
- ⚠️ **Official IMD CAP Alert Integration**: Real-time RSS/XML feed parsing from the WMO Alert Hub with hierarchical geo-matching (`city` > `district` > `state` > `regional`).
- 🔬 **Forecast Intelligence (Methodology-Diverse)**: Compare traditional physics NWP models (ECMWF IFS, GFS, ICON) against cutting-edge AI/ML models (ECMWF AIFS, Google WeatherNext 2) side-by-side.
- 🗺️ **Interactive Radar & Satellite Map**: Real-time precipitation radar overlay using RainViewer, wind vector streams, temperature heatmaps, and playback time-slider.
- 📊 **Historical Trends & Analytics**: Time-series analytics and historical weather observation snapshots powered by PostgreSQL and Redis caching.
- ⚡ **Multi-Tier Fault Tolerance**: Transparent in-memory fallbacks if PostgreSQL or Redis are unavailable, ensuring zero downtime.

---

## 🏗️ Architecture & Services

```text
weather-app/
├── backend/
│   ├── app/
│   │   ├── core/               # Configuration, Redis cache, PostgreSQL DB, WebSockets
│   │   ├── models/             # Canonical schemas, snapshot models, chat records
│   │   ├── routes/             # REST endpoints (weather, chat, alerts, climate, etc.)
│   │   └── services/           # WeatherHub, Agent Registry, IMD CAP, Forecast Ingestion
│   ├── tests/                  # 230+ automated unit & integration test suite
│   ├── Dockerfile              # Multi-stage Python 3.12 Slim production container
│   ├── requirements.txt        # Python backend dependencies
│   └── main.py                 # FastAPI application lifecycle & startup
├── src/                        # React 19 Frontend SPA (Vite + Tailwind CSS + Lucide)
├── nginx.conf                  # Hardened production Nginx reverse proxy configuration
├── Dockerfile                  # Multi-stage Node 20 -> Nginx Alpine production container
├── docker-compose.yml          # Full-stack container orchestration
├── .env.example                # Template environment variables
├── docs/                       # Architectural specifications & system design
└── package.json                # Frontend package configuration
```

---

## 🚀 Quick Start with Docker (Recommended)

SkyCast is fully containerized. You do not need Python, Node.js, PostgreSQL, or Redis installed on your computer.

### 1. Clone the Repository
```bash
git clone https://github.com/Manthan-Shirsath/weathergpt-web-app.git
cd weathergpt-web-app
```

### 2. Configure Environment Variables
```bash
cp .env.example .env
```
*(Optionally add your `GROQ_API_KEY` for AI features and `VITE_MAPTILER_KEY` for high-resolution satellite maps).*

### 3. Launch the Complete Full-Stack
```bash
docker compose up --build -d
```

### 4. Open in Browser
- 🌐 **Web Application**: [http://localhost:5173](http://localhost:5173) (or `http://localhost:80`)
- ⚙️ **FastAPI Interactive API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- 📊 **PostgreSQL Database**: `localhost:5432`
- ⚡ **Redis Cache**: `localhost:6379`

### 5. Managing Containers
```bash
# View live container logs:
docker compose logs -f

# Stop all services:
docker compose down
```

---

## 💻 Local Development (Without Docker)

If you prefer running services directly on your host machine:

### 1. Install Dependencies
```bash
# Frontend
npm install

# Backend
pip install -r backend/requirements.txt
```

### 2. Run Full Stack
```bash
npm run dev
# or: npm run start
```
- Frontend: `http://localhost:5173`
- Backend: `http://127.0.0.1:8000`

---

## 🧪 Testing & Code Quality

SkyCast includes a comprehensive test suite with 290+ automated tests covering all agents, tools, weather resolution, temporal grounding, and data routing:

```bash
# Run backend pytest suite:
pytest backend/tests/ -v

# Run frontend linter:
npm run lint
```

---

## 🛡️ Repository Rules & Documentation

- **[AGENTS.md](file:///c:/Users/Manthan/OneDrive/Desktop/New%20folder/weather-app/AGENTS.md)**: Repository engineering standards, secrets protection, and code-sync rules.
- **[CONTRIBUTING.md](file:///c:/Users/Manthan/OneDrive/Desktop/New%20folder/weather-app/CONTRIBUTING.md)**: Developer guidelines, pull request procedures, and code quality expectations.
- **[docs/deployment.md](file:///c:/Users/Manthan/OneDrive/Desktop/New%20folder/weather-app/docs/deployment.md)**: Railway & Vercel cloud deployment architecture and environment configurations.
- **[docs/weathergpt-agent.md](file:///c:/Users/Manthan/OneDrive/Desktop/New%20folder/weather-app/docs/weathergpt-agent.md)**: Deep dive into the WeatherGPT multi-agent architecture and deterministic tool execution.

---

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](file:///c:/Users/Manthan/OneDrive/Desktop/New%20folder/weather-app/CONTRIBUTING.md) for details on code standards, pull request workflows, and development guidelines.

---

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](file:///c:/Users/Manthan/OneDrive/Desktop/New%20folder/weather-app/LICENSE) file for details.


