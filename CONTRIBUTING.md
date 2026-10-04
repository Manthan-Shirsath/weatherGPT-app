# Contributing to SkyCast

Thank you for your interest in contributing to **SkyCast**! Whether you are fixing bugs, adding new weather intelligence modules, enhancing the UI, or improving documentation, your help is warmly welcomed.

---

## 📋 Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Golden Repository Rules](#golden-repository-rules)
3. [Getting Started & Development Workflow](#getting-started--development-workflow)
4. [Project Structure](#project-structure)
5. [Testing & Quality Verification](#testing--quality-verification)
6. [Submitting a Pull Request](#submitting-a-pull-request)
7. [Reporting Issues](#reporting-issues)

---

## 🤝 Code of Conduct

Please be respectful, collaborative, and constructive when communicating across issues, discussions, and pull requests.

---

## 🛡️ Golden Repository Rules

All contributors (and AI assistants) must strictly adhere to these rules:

1. **Zero Secrets in Git**: Never hardcode or stage API keys (`GROQ_API_KEY`, `VITE_MAPTILER_KEY`), `.env` files, or database credentials. Always update `.env.example` with sanitized placeholders.
2. **No Root-Level Scratch Files**: Do not commit one-off test scripts (`test_*.py` in root), LLM token dumps (`chat_output*.json`), or scratch files. Use the gitignored `scratch/` directory for local experiments.
3. **Architecture Consistency**: SkyCast is built on **React 19 + TypeScript + Vite** (frontend) and **FastAPI + PostgreSQL + Redis** (backend). Do not introduce contradictory serverless/framework specs unless an agreed RFC is approved.
4. **Mandatory Documentation Sync**: Whenever you add, rename, or update an API route, agent persona, or UI widget, update the corresponding documentation in `README.md` and `docs/` in the same PR.
5. **Clean Code & Passing Tests**: Before submitting, ensure `oxlint` passes with zero errors and backend `pytest` tests pass.

---

## 🚀 Getting Started & Development Workflow

### Prerequisites
- **Node.js** (v18 or newer)
- **Python** (v3.12 recommended, v3.10+ supported)
- *(Optional)* **Docker & Docker Compose** (for zero-install full-stack run)

### Local Setup
1. **Clone the repository**:
   ```bash
   git clone https://github.com/Manthan-Shirsath/skycast-weather-app.git
   cd skycast-weather-app
   ```
2. **Install Frontend Dependencies**:
   ```bash
   npm install
   ```
3. **Install Backend Dependencies**:
   ```bash
   pip install -r backend/requirements.txt
   ```
4. **Configure Environment**:
   ```bash
   cp .env.example .env
   ```
   Add your `GROQ_API_KEY` (for WeatherGPT) and optional keys.

### Running the App
Run both frontend and backend concurrently:
```bash
npm run dev
```
- **React Frontend**: `http://localhost:5173`
- **FastAPI Backend**: `http://localhost:8000`
- **FastAPI Interactive Docs**: `http://localhost:8000/docs`

---

## 🏗️ Project Structure

```text
skycast-weather-app/
├── backend/
│   ├── alembic/              # Database schema migrations
│   ├── app/
│   │   ├── core/             # Cache (Redis), DB connection, WebSockets, Config
│   │   ├── models/           # SQLAlchemy schemas & Pydantic domain models
│   │   ├── routes/           # FastAPI routers (weather, map, chat, alerts, climate, etc.)
│   │   └── services/         # WeatherHub, Agent Registry, IMD Alert Engine, Ingestion
│   ├── tests/                # Automated pytest suite (290+ tests)
│   ├── main.py               # FastAPI entrypoint & lifecycle
│   └── requirements.txt      # Python dependencies
├── src/
│   ├── app/                  # Router (router.tsx), Layout (layout.tsx), Providers
│   ├── components/           # Reusable UI widgets & weather visual cards (DecisionHero, etc.)
│   ├── features/             # Feature-sliced modules (dashboard, weathergpt, map, alerts, climate)
│   ├── lib/                  # Utilities, API client, canonical types
│   ├── locales/              # i18n translation strings
│   └── main.tsx              # React DOM entrypoint
├── docs/                     # Architectural specifications & system design
├── docker-compose.yml        # Multi-container orchestration
├── AGENTS.md                 # Agent & repository engineering standards
└── package.json              # Frontend package configuration
```

---

## 🧪 Testing & Quality Verification

### Backend Tests
Run the test suite using `pytest`:
```bash
pytest backend/tests/
```

### Frontend Linting
Run oxlint:
```bash
npm run lint
```

---

## 📬 Submitting a Pull Request

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/amazing-new-feature
   ```
2. **Commit your changes**:
   ```bash
   git commit -m "feat(agent): add multi-city comparative weather tool"
   ```
3. **Check Quality Gates**:
   - `npm run lint` passes without errors.
   - `pytest` passes without regressions.
   - Documentation is updated.
4. **Push and Open PR**:
   ```bash
   git push origin feature/amazing-new-feature
   ```
