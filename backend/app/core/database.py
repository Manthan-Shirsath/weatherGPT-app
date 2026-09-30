import os
import logging
from typing import AsyncGenerator, Optional
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text
from dotenv import load_dotenv

from backend.app.models.weather_snapshot import Base

logger = logging.getLogger("skycast.database")

# Load environment variables
load_dotenv()

RAW_DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@127.0.0.1:5432/skycast_weather"
)

# Ensure asyncpg dialect and handle Supabase/PgBouncer connection strings
if RAW_DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = RAW_DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
elif RAW_DATABASE_URL.startswith("postgresql://") and not RAW_DATABASE_URL.startswith("postgresql+asyncpg://"):
    DATABASE_URL = RAW_DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
else:
    DATABASE_URL = RAW_DATABASE_URL

# Normalize sslmode for asyncpg (asyncpg expects `ssl` not `sslmode`)
if "sslmode=" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("sslmode=require", "ssl=require").replace("sslmode=prefer", "ssl=prefer").replace("sslmode=disable", "ssl=disable")

connect_args = {}
if "supabase" in DATABASE_URL.lower() or "pooler" in DATABASE_URL.lower():
    # Supabase connection poolers (PgBouncer) require disabling prepared statement cache
    connect_args["statement_cache_size"] = 0

# Create Async Engine with connection pooling and health check
engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    connect_args=connect_args
)

async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)

_is_db_available: bool = False
_last_health_check_time: float = 0.0
_health_check_cooldown: float = 30.0  # seconds between reconnect attempts

def is_db_available() -> bool:
    """Return whether PostgreSQL connection is actively established and responsive."""
    return _is_db_available

async def check_db_health(force: bool = False) -> bool:
    """
    Check if PostgreSQL is available with smart backoff throttling.
    If database was offline, prevents hammering connection attempts on every single city in a loop.
    """
    global _is_db_available, _last_health_check_time
    import time
    now = time.time()

    if _is_db_available:
        return True

    # If offline and within cooldown window, skip immediately without stalling
    if not force and (now - _last_health_check_time < _health_check_cooldown):
        return False

    _last_health_check_time = now
    return await init_db()

def _try_start_wsl_postgres():
    """If running on Windows native and PostgreSQL is on 127.0.0.1, ensure WSL postgresql service is active."""
    import subprocess
    import platform
    if platform.system() != "Windows" or os.getenv("RUNNING_IN_DOCKER") or os.getenv("DISABLE_WSL_POSTGRES", "false").lower() in ("true", "1"):
        return
    try:
        # Quick non-blocking attempt to ensure WSL postgresql is running
        subprocess.run(
            ["wsl", "-d", "Ubuntu", "-u", "root", "--", "bash", "-c", "service postgresql status | grep -q online || service postgresql start"],
            capture_output=True,
            timeout=2
        )
    except Exception:
        pass

async def init_db() -> bool:
    """
    Initialize PostgreSQL connection and ensure schema tables & indexes exist.
    Non-blocking: If PostgreSQL is temporarily down, logs informative warning and retries on demand.
    """
    global _is_db_available, _last_health_check_time
    import time
    _last_health_check_time = time.time()
    try:
        if "127.0.0.1" in DATABASE_URL or "localhost" in DATABASE_URL:
            _try_start_wsl_postgres()

        async with engine.begin() as conn:
            # Check connection
            await conn.execute(text("SELECT 1"))
            # Ensure schema tables exist
            await conn.run_sync(Base.metadata.create_all)

        _is_db_available = True
        # Sanitize password from log
        sanitized_url = DATABASE_URL
        if "@" in sanitized_url and ":" in sanitized_url.split("@")[0]:
            parts = sanitized_url.split("@")
            user_part = parts[0].split(":")[0] + ":****"
            sanitized_url = f"{user_part}@{parts[1]}"
        logger.info("🐘 [DATABASE] PostgreSQL connection established successfully (%s).", sanitized_url)
        return True
    except Exception as exc:
        _is_db_available = False
        logger.warning(
            "⚠️ [DATABASE] PostgreSQL unavailable (%s). Historical snapshot persistence will retry on next cycle.",
            exc
        )
        return False

async def close_db():
    """Dispose of connection pool gracefully on application shutdown."""
    global _is_db_available
    _is_db_available = False
    await engine.dispose()
    logger.info("🛑 [DATABASE] PostgreSQL connection pool disposed.")

async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Dependency / context helper to yield an active AsyncSession."""
    async with async_session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
