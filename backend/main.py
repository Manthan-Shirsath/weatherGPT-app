import os
import sys
import logging
from contextlib import asynccontextmanager

# Setup path so backend package can be imported directly
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

# Auto-detect local project virtual environment and re-execute if launched from an external/system interpreter lacking fastapi
try:
    import fastapi
except ImportError:
    import subprocess
    candidate_venvs = [
        os.path.join(PROJECT_ROOT, ".venv", "Scripts", "python.exe"),
        os.path.join(BASE_DIR, ".venv", "Scripts", "python.exe"),
        os.path.join(PROJECT_ROOT, "venv", "Scripts", "python.exe"),
        os.path.join(BASE_DIR, "venv", "Scripts", "python.exe"),
        os.path.join(PROJECT_ROOT, ".venv", "bin", "python"),
        os.path.join(BASE_DIR, ".venv", "bin", "python"),
        os.path.join(PROJECT_ROOT, "venv", "bin", "python"),
        os.path.join(BASE_DIR, "venv", "bin", "python"),
    ]
    for venv_py in candidate_venvs:
        if os.path.isfile(venv_py) and os.path.abspath(sys.executable).lower() != os.path.abspath(venv_py).lower():
            sys.exit(subprocess.call([venv_py] + sys.argv))
    raise

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from backend.app.core.cache import cache
from backend.app.core.database import init_db, close_db
from backend.app.services.collector import collector_worker
from backend.app.services.forecast_ingestion import forecast_ingestion_worker
from backend.app.routes.weather import router as weather_router
from backend.app.routes.map import router as map_router
from backend.app.routes.chat import router as chat_router
from backend.app.routes.ws import router as ws_router
from backend.app.routes.alerts import router as alerts_router
from backend.app.routes.alerts_subscription import router as alerts_subscription_router
from backend.app.routes.trends import router as trends_router
from backend.app.routes.climate import router as climate_router
from backend.app.routes.agriculture import router as agriculture_router
from backend.app.routes.recommendations import router as recommendations_router
from backend.app.routes.system import router as system_router
from backend.app.routes.forecast_intelligence import router as forecast_intelligence_router
from backend.app.routes.monitoring import router as monitoring_router

# Configure logging format
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("skycast.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup:
    logger.info("🚀 [STARTUP] Initializing SkyCast Weather Engine...")
    await cache.initialize()
    await init_db()
    collector_worker.start()
    forecast_ingestion_worker.start()
    yield
    # Shutdown:
    logger.info("🛑 [SHUTDOWN] Stopping SkyCast Weather Engine...")
    collector_worker.stop()
    forecast_ingestion_worker.stop()
    await cache.close()
    await close_db()

app = FastAPI(
    title="SkyCast High-Performance Weather Engine",
    description="FastAPI Backend powered by Open-Meteo, RainViewer, Redis Caching, Background Collector, WebSockets, and PostgreSQL History",
    version="2.0.0",
    lifespan=lifespan
)

# Enable GZip compression for responses > 1KB
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Modular Routers
app.include_router(weather_router)
app.include_router(map_router)
app.include_router(chat_router)
app.include_router(ws_router)
app.include_router(alerts_router)
app.include_router(alerts_subscription_router)
app.include_router(trends_router)
app.include_router(climate_router)
app.include_router(agriculture_router)
app.include_router(recommendations_router)
app.include_router(system_router)
app.include_router(forecast_intelligence_router)
app.include_router(monitoring_router)

def ensure_single_instance(host: str = "127.0.0.1", port: int = 8000) -> bool:
    """
    Ensure exactly one active backend instance runs on port 8000.
    If a stale/orphaned Python backend process occupies port 8000 from a previous dev run,
    terminate it cleanly so the new dev session can bind without WinError 10048.
    """
    import socket
    import time
    import psutil

    current_pid = os.getpid()

    # 1. Quick probe to see if port 8000 is open
    test_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = test_sock.connect_ex((host, port))
    test_sock.close()
    
    if result != 0:
        return True  # Port is completely free!
        
    logger.warning("⚠️ Port %d is currently in use. Checking for stale backend processes...", port)

    # 2. Inspect connections to find process on port
    stale_pid = None
    try:
        for conn in psutil.net_connections(kind="inet"):
            if conn.laddr and conn.laddr.port == port and conn.status == psutil.CONN_LISTEN:
                if conn.pid and conn.pid != current_pid:
                    stale_pid = conn.pid
                    break
    except Exception as e:
        logger.debug("Process inspection note: %s", e)

    if stale_pid:
        try:
            proc = psutil.Process(stale_pid)
            proc_name = proc.name().lower()
            if "python" in proc_name or "uvicorn" in proc_name:
                logger.warning("🛑 Terminating stale backend process on port %d (PID %d: %s)...", port, stale_pid, proc_name)
                proc.terminate()
                try:
                    proc.wait(timeout=3)
                except psutil.TimeoutExpired:
                    proc.kill()
                logger.info("✓ Successfully freed port %d.", port)
                time.sleep(1)
                return True
            else:
                logger.error("❌ Port %d is in use by '%s' (PID %d, e.g. Docker container). Please stop it first.", port, proc_name, stale_pid)
                return False
        except (psutil.NoSuchProcess, psutil.AccessDenied) as e:
            logger.warning("Could not terminate process PID %d: %s", stale_pid, e)

    # If no specific LISTEN process found, wait up to 3s for any socket cleanup
    for _ in range(3):
        time.sleep(1)
        test_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        res = test_sock.connect_ex((host, port))
        test_sock.close()
        if res != 0:
            return True

    logger.warning("⚠️ Port %d is still occupied. Attempting to start server...", port)
    return True


if __name__ == "__main__":
    import uvicorn
    if ensure_single_instance(host="127.0.0.1", port=8000):
        uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)
    else:
        logger.error("❌ Aborting startup to prevent duplicate competing backend instances.")
        sys.exit(1)


