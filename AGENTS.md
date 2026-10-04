# SkyCast — Repository & Agent Engineering Rules

These rules govern all AI agents (Antigravity, Gemini, Copilot, etc.) and human developers working in the **SkyCast** codebase. All changes must adhere strictly to these principles.

---

## 1. Zero Secrets & Credentials in Git (CRITICAL)
- **NEVER** hardcode or commit API keys, access tokens, webhook URLs, database passwords, or private certificates.
- This applies to:
  - `GROQ_API_KEY`, `SARVAM_API_KEY`, `OPENAI_API_KEY`
  - `VITE_MAPTILER_KEY`
  - Database credentials (`DATABASE_URL`, `POSTGRES_PASSWORD`)
  - Redis connection URLs with auth
- Always use environment variables via `.env`.
- Keep `.env.example` up to date with placeholder values, and ensure `.env` is never staged.
- Never commit SQLite database files (`*.db`, `*.sqlite3`), dump files, or cache dumps.

---

## 2. No Root-Level Scratch Files or Ad-Hoc Dumps
- **NEVER** write or commit one-off debug scripts (`test_*.py`, `debug_*.js`), LLM response dumps (`chat_output*.json`), diagnostic logs, or scratch files to the repository root.
- If you need a temporary script or scratch file for testing:
  - Place it in the gitignored `scratch/` directory.
  - Delete or clean it up after testing is finished.
- Formal backend tests must live in `backend/tests/` and use `pytest`.
- Formal frontend tests must live in `src/**/__tests__/` or `src/**/*.test.ts`.

---

## 3. Single Source of Truth for Architecture
- **Active Stack**:
  - **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, HeroUI / Radix UI, Recharts, MapLibre GL.
  - **Backend**: Python 3.12, FastAPI, SQLAlchemy 2.0 (asyncpg), Redis 7, WebSockets.
  - **Orchestration**: Docker Compose (`docker-compose.yml`) + Nginx reverse proxy.
- **Obsolete Plans & Proposals**:
  - Do NOT leave speculative or superseded migration docs in the root directory (e.g., Next.js / Supabase proposals).
  - Any historical design notes must be moved to `docs/archive/` with clear disclaimers that they are historical and not active architecture.

---

## 4. Mandatory Documentation & Code Synchronization
- Whenever you add, rename, or deprecate a feature, agent mode, API endpoint, or UI widget:
  - **Both Code and Documentation must be updated in the same change.**
  - Check [README.md](file:///c:/Users/Manthan/OneDrive/Desktop/New%20folder/weather-app/README.md) and [docs/](file:///c:/Users/Manthan/OneDrive/Desktop/New%20folder/weather-app/docs/) for consistency.
  - Keep frontend agent modes in [`src/features/weathergpt/modeConfig.ts`](file:///c:/Users/Manthan/OneDrive/Desktop/New%20folder/weather-app/src/features/weathergpt/modeConfig.ts) 1:1 aligned with the backend agent registry in [`backend/app/services/agent/registry.py`](file:///c:/Users/Manthan/OneDrive/Desktop/New%20folder/weather-app/backend/app/services/agent/registry.py).

---

## 5. Verification Gate Before Task Completion
Before concluding any task, PR, or major edit:
1. **Frontend Lint Check**: Run `npx oxlint` and ensure no new syntax errors or lingering dead imports are introduced.
2. **Backend Test Suite**: Run `.venv\Scripts\python.exe -m pytest -q` and verify that all tests pass.
3. **Git Hygiene**: Run `git status` to ensure no untracked scratch files, `.db` files, or unintended diffs are left behind.
