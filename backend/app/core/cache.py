import json
import time
import logging
from typing import Any, Optional, Dict
import redis.asyncio as aioredis
from backend.app.core.config import REDIS_URL

logger = logging.getLogger("skycast.cache")

class HybridWeatherCache:
    """
    High-performance Cache Manager using Redis with automatic in-memory fallback.
    Maintains active TTL entries as well as stale snapshots for graceful fallback.
    """
    def __init__(self):
        self.redis_client: Optional[aioredis.Redis] = None
        self._memory_cache: Dict[str, Dict[str, Any]] = {}
        self._stale_snapshots: Dict[str, Any] = {}
        self._is_redis_active = False

    async def initialize(self):
        try:
            client = aioredis.from_url(REDIS_URL, decode_responses=True, socket_connect_timeout=2.0)
            await client.ping()
            self.redis_client = client
            self._is_redis_active = True
            logger.info("⚡ [CACHE] Successfully connected to Redis server at %s", REDIS_URL)
        except Exception as exc:
            self._is_redis_active = False
            self.redis_client = None
            logger.warning("⚠️ [CACHE] Redis unavailable (%s). Falling back to resilient In-Memory TTL cache.", exc)

    async def close(self):
        if self.redis_client:
            try:
                await self.redis_client.aclose()
            except Exception:
                pass

    def is_redis(self) -> bool:
        return self._is_redis_active

    async def get(self, key: str) -> Optional[Any]:
        # 1. Try Redis if active
        if self._is_redis_active and self.redis_client:
            try:
                val = await self.redis_client.get(key)
                if val is not None:
                    logger.debug("🎯 [CACHE HIT - REDIS] key='%s'", key)
                    parsed = json.loads(val)
                    self._stale_snapshots[key] = parsed
                    return parsed
            except Exception as e:
                logger.warning("Redis get error for key '%s': %s. Checking memory cache.", key, e)

        # 2. In-memory TTL fallback
        now = time.time()
        if key in self._memory_cache:
            entry = self._memory_cache[key]
            if now < entry["expires_at"]:
                logger.debug("🎯 [CACHE HIT - MEMORY] key='%s'", key)
                return entry["data"]
            else:
                # Expired from active memory
                self._stale_snapshots[key] = entry["data"]
                del self._memory_cache[key]

        logger.debug("💨 [CACHE MISS] key='%s'", key)
        return None

    async def set(self, key: str, value: Any, ttl: int = 300):
        # Save snapshot for stale fallback
        self._stale_snapshots[key] = value
        serialized = json.dumps(value)

        # 1. Set in Redis
        if self._is_redis_active and self.redis_client:
            try:
                await self.redis_client.set(key, serialized, ex=ttl)
                # Store stale copy in redis under stale: prefix with 24hr TTL
                await self.redis_client.set(f"stale:{key}", serialized, ex=86400)
            except Exception as e:
                logger.warning("Redis set error for key '%s': %s", key, e)

        # 2. Always maintain local memory cache
        self._memory_cache[key] = {
            "data": value,
            "expires_at": time.time() + ttl
        }

    async def get_stale(self, key: str) -> Optional[Any]:
        """Return last known data during provider outages."""
        if key in self._stale_snapshots:
            logger.debug("🛡️ [STALE FALLBACK - MEMORY] Returning last known data for key='%s'", key)
            return self._stale_snapshots[key]

        if self._is_redis_active and self.redis_client:
            try:
                val = await self.redis_client.get(f"stale:{key}")
                if val:
                    logger.debug("🛡️ [STALE FALLBACK - REDIS] Returning last known data for key='%s'", key)
                    return json.loads(val)
            except Exception:
                pass

        return None

# Singleton cache instance
cache = HybridWeatherCache()
