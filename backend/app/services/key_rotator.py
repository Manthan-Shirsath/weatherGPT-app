"""
Dynamic API Key Rotator & Pool Manager for LLM Providers (Groq, Gemini, Sarvam).
Provides round-robin rotation and automatic failover when 429 Too Many Requests
or Rate Limit / Quota limits are encountered.
"""

import os
import re
import logging
from typing import List, Optional, Dict
from dotenv import load_dotenv

load_dotenv("backend/.env")

logger = logging.getLogger("skycast.key_rotator")


def mask_key(key: Optional[str]) -> str:
    """Safely mask an API key for logs (e.g. gsk_abc...1234)."""
    if not key or len(key) < 8:
        return "<not_set>"
    prefix = key[:6] if len(key) >= 10 else key[:2]
    suffix = key[-4:]
    return f"{prefix}...{suffix}"


class LLMKeyRotator:
    """
    Manages a pool of API keys for a specific LLM provider.
    Maintains active key state and rotates keys on 429 rate limits or quota exhaustion.
    """

    def __init__(self, provider: str = "groq"):
        self.provider = provider.lower().strip()
        self.keys: List[str] = self._discover_keys()
        self._current_index: int = 0
        
        logger.info(
            "🔑 [KEY ROTATOR] Initialized '%s' key pool with %d key(s): %s",
            self.provider,
            len(self.keys),
            [mask_key(k) for k in self.keys]
        )

    def _discover_keys(self) -> List[str]:
        """Discovers all configured API keys for this provider from environment variables."""
        discovered: List[str] = []

        if self.provider == "groq":
            candidates = [
                os.getenv("GROQ_API_KEYS"),
                os.getenv("GROQ_API_KEY"),
                os.getenv("GROQ_API_KEY_FALLBACK"),
                os.getenv("GROQ_FALLBACK_API_KEY"),
                os.getenv("GROQ_FALLBACK_KEY"),
                os.getenv("GROQ_API_KEY_2"),
                os.getenv("GROQ_API_KEY_3"),
                os.getenv("GROQ_API_KEY_SECONDARY"),
                os.getenv("GROQ_SECONDARY_KEY"),
            ]
        elif self.provider in ["gemini", "google"]:
            candidates = [
                os.getenv("GEMINI_API_KEYS"),
                os.getenv("GEMINI_API_KEY"),
                os.getenv("gemini_api_key"),
                os.getenv("GEMINI_API_KEY_FALLBACK"),
                os.getenv("gemini_api_key_fallback"),
                os.getenv("GEMINI_API_KEY_2"),
            ]
        elif self.provider == "sarvam":
            candidates = [
                os.getenv("SARVAM_API_KEYS"),
                os.getenv("SARVAM_API_KEY"),
                os.getenv("SARVAM_API_KEY_FALLBACK"),
                os.getenv("SARVAM_API_KEY_2"),
            ]
        elif self.provider in ["ovserve", "local"]:
            candidates = [
                os.getenv("OVSERVE_API_KEY"),
                os.getenv("OPENAI_API_KEY"),
            ]
        else:
            candidates = [
                os.getenv(f"{self.provider.upper()}_API_KEY"),
                os.getenv(f"{self.provider.upper()}_API_KEYS"),
                os.getenv(f"{self.provider.upper()}_API_KEY_FALLBACK"),
            ]

        for cand in candidates:
            if not cand:
                continue
            # Support comma or semicolon or newline separated keys in a single env var
            parts = re.split(r'[,;\n]+', cand)
            for p in parts:
                cleaned = p.strip()
                if cleaned and len(cleaned) > 5 and cleaned not in discovered:
                    discovered.append(cleaned)

        return discovered

    def get_current_key(self) -> Optional[str]:
        """Returns the currently active API key, or None if no keys configured."""
        if not self.keys:
            return None
        return self.keys[self._current_index % len(self.keys)]

    def get_all_keys(self) -> List[str]:
        """
        Returns all keys in rotation order starting from the currently active key.
        e.g. if keys are [K1, K2, K3] and index is 1, returns [K2, K3, K1].
        """
        if not self.keys:
            return []
        n = len(self.keys)
        start = self._current_index % n
        return [self.keys[(start + i) % n] for i in range(n)]

    def rotate_key(self, failed_key: Optional[str] = None) -> Optional[str]:
        """
        Advances the active key pointer to the next key in the pool.
        Returns the newly active key.
        """
        if not self.keys:
            return None
        if len(self.keys) == 1:
            logger.warning("⚠️ [KEY ROTATOR] Only 1 key configured for '%s'; cannot rotate to an alternate key.", self.provider)
            return self.keys[0]

        old_idx = self._current_index % len(self.keys)
        self._current_index = (self._current_index + 1) % len(self.keys)
        new_idx = self._current_index
        new_key = self.keys[new_idx]

        logger.warning(
            "🔄 [KEY ROTATOR] Rate limit / failover trigger! Rotated '%s' key from #%d (%s) -> #%d (%s).",
            self.provider,
            old_idx + 1,
            mask_key(self.keys[old_idx]),
            new_idx + 1,
            mask_key(new_key)
        )
        return new_key

    def has_multiple_keys(self) -> bool:
        """Returns True if more than 1 key is available in the pool."""
        return len(self.keys) > 1

    def reload_keys(self):
        """Reloads keys from environment variables."""
        load_dotenv("backend/.env", override=True)
        self.keys = self._discover_keys()
        self._current_index = 0
        logger.info(
            "🔑 [KEY ROTATOR] Reloaded '%s' keys (%d found): %s",
            self.provider,
            len(self.keys),
            [mask_key(k) for k in self.keys]
        )


# Global singletons for active providers
groq_rotator = LLMKeyRotator("groq")
gemini_rotator = LLMKeyRotator("gemini")
sarvam_rotator = LLMKeyRotator("sarvam")
ovserve_rotator = LLMKeyRotator("ovserve")

def get_rotator_for_provider(provider: str) -> LLMKeyRotator:
    p = (provider or "groq").lower().strip()
    if p in ["gemini", "google"]:
        return gemini_rotator
    if p == "sarvam":
        return sarvam_rotator
    if p in ["ovserve", "local"]:
        return ovserve_rotator
    return groq_rotator
