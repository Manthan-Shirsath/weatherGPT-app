# SkyCast Deployment Context

## Current Architecture

SkyCast has a React/Vite frontend, FastAPI backend, PostgreSQL, Redis, WebSockets, a background weather collector, Gemini/Google LLM integration, and external weather providers.

Current deployment plan:

```text
Vercel
  └── React/Vite frontend

Railway
  ├── FastAPI backend
  ├── PostgreSQL
  └── Redis
```

## Railway Backend

Current public backend URL:

`https://backend-production-24f0.up.railway.app`

Validated status:
- Railway backend deployment: SUCCESS
- `/docs`: HTTP 200
- `/api/weather?city=Pune`: HTTP 200
- Backend tests: 6 passed
- Docker build: passed

## Important Fixes Already Made

The original Nginx configuration failed because it assumed an upstream hostname named `backend`.

The deployment now uses a runtime `BACKEND_URL`.

Nginx variables such as `$host` and `$scheme` must be escaped when processed by `envsubst`.

Frontend API and WebSocket configuration was made deployment-safe.

FastAPI and health checks honor Railway's `$PORT`.

Railway Postgres and Redis references are configured for the backend.

## Background Collector

The backend starts `collector_worker` during application startup.

The collector:
- performs an initial collection
- repeats every 180 seconds (`COLLECTOR_POLL_INTERVAL`)
- calls Open-Meteo and RainViewer
- uses Redis
- writes snapshots to PostgreSQL
- performs retention cleanup
- broadcasts updates through WebSockets

Do not enable Railway Serverless/sleep without deliberately changing this architecture. The collector creates continuous background activity even with no incoming requests.

WebSockets are also persistent while clients are connected.

For temporary cost reduction, manually scale the backend to zero rather than changing application behavior solely to make it sleep.

## Redis and PostgreSQL

Do not remove Redis without checking all cache/collector functionality.

Do not remove PostgreSQL; it stores persistent application data.

Current SQLAlchemy async engine settings include `pool_size=10`, `max_overflow=20`, and `pool_pre_ping=True`.

## Secrets

Never commit real secrets to GitHub.

Gemini and database credentials belong in Railway environment variables.

Expected Gemini configuration includes:

```env
gemini_api_key=...
gemini_api_key_fallback=...
LLM_PROVIDER=google
LLM_MODEL=gemini-flash-latest
```

Never expose Gemini credentials through frontend `VITE_*` variables.

## Frontend

The frontend is intended for Vercel.

Production backend:

`https://backend-production-24f0.up.railway.app`

Production WebSocket endpoint:

`wss://backend-production-24f0.up.railway.app`

Do not move the FastAPI backend to Vercel unless the backend is intentionally rewritten for serverless execution.

## Development and Deployment Workflow

GitHub is the source of truth for code.

```text
Local development
    ↓
Test
    ↓
git commit
    ↓
git push
    ↓
Vercel deploys frontend
    ↓
Railway deploys backend
```

Keep real `.env` files out of GitHub. Use `.env.example` with placeholders.

## Future GCP Migration

A future architecture may separate the API and collector:

```text
Cloud Run
  └── FastAPI API

Cloud SQL
  └── PostgreSQL

Memorystore
  └── Redis

Cloud Scheduler / Cloud Run Job
  └── Weather collector
```

This is preferable if serverless scaling is eventually desired.

## Instructions for Future AI Agents

Before changing deployment architecture:
1. Inspect Dockerfiles, Nginx configuration, frontend API configuration, backend startup/lifespan, collector, database, Redis, and WebSocket code.
2. Preserve application behavior unless explicitly asked to change it.
3. Never commit secrets.
4. Use environment variables for deployment-specific configuration.
5. Treat the Railway backend URL above as production unless it changes.
6. Verify deployments with health endpoints and representative API calls.
7. Inspect deployment logs after production deployments.
8. Do not remove PostgreSQL or Redis just to reduce service count without checking actual usage.
9. Do not enable backend serverless sleep while the collector remains unconditionally active.
10. When using `envsubst` in Nginx templates, escape Nginx runtime variables such as `$host`, `$scheme`, and WebSocket-related variables.

## Current Status

Backend: deployed and healthy.

PostgreSQL: healthy.

Redis: healthy.

Frontend: intended for Vercel.

Railway frontend service was not created because the account hit its free-plan service/resource limit.

The Railway backend can be manually stopped when not needed.
