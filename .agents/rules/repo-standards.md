# SkyCast — Repository & Codebase Standards

- **Architecture Truth**: React 19 + Vite + FastAPI + Redis + PostgreSQL (Docker-first). No Next.js or Supabase.
- **Secrets Protection**: Never commit or hardcode credentials, keys (`GROQ_API_KEY`, etc.), or `.env` files.
- **Clean Root**: Do not place `test_*.py`, JSON dumps (`chat_output*.json`), or scratch files in the repo root. Use `scratch/`.
- **Docs Parity**: When modifying API routes, agent modes, or feature sets, update `README.md` and `docs/`.
- **Verification**: Run `oxlint` and backend `pytest` before finalizing tasks.
