"""Factory utilities for selecting the active market data provider."""

from __future__ import annotations

import os
from typing import Any, Dict, Optional

from app.config import load_config
from app.providers.massive import MassiveProvider

ProviderInstance = Any


def _coerce_float(value: Any, fallback: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _coerce_int(value: Any, fallback: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def get_provider(config: Optional[Dict[str, Any]] = None) -> ProviderInstance:
    """Instantiate the configured market data provider.

    If no configuration is supplied, this function loads it from disk.
    """

    cfg = config or load_config()
    providers_cfg = cfg.get("providers", {}) if isinstance(cfg, dict) else {}
    default_name = str(providers_cfg.get("default", "massive")).strip().lower()

    if default_name not in {"massive", "", None}:
        # Only Massive is supported; warn users attempting to select another provider.
        raise RuntimeError(f"Unsupported provider '{default_name}'. Massive is the only available provider.")

    massive_cfg = providers_cfg.get("massive", {}) if isinstance(providers_cfg, dict) else {}
    if not massive_cfg.get("enabled", False):
        raise RuntimeError("Massive provider is disabled in configuration (providers.massive.enabled=false).")

    # Try to get API key directly from config first (for convenience)
    api_key = massive_cfg.get("api_key")
    
    # If not in config, try to get from environment variable
    if not api_key:
        api_key_env_raw = massive_cfg.get("api_key_env", "MASSIVE_API_KEY")
        api_key_env = str(api_key_env_raw) if api_key_env_raw is not None else "MASSIVE_API_KEY"
        
        # Check if api_key_env looks like an actual API key (long alphanumeric string)
        # rather than an environment variable name (typically uppercase with underscores)
        is_likely_api_key = (
            api_key_env and
            len(api_key_env) > 20 and
            "_" not in api_key_env and
            api_key_env.isalnum()
        )
        
        if is_likely_api_key:
            # Treat it as a direct API key value
            api_key = api_key_env
        else:
            # Treat it as an environment variable name
            api_key = os.environ.get(api_key_env)
    
    if not api_key:
        api_key_env_name = str(massive_cfg.get("api_key_env", "MASSIVE_API_KEY"))
        raise RuntimeError(
            f"Massive provider requires either 'api_key' in config or the {api_key_env_name} environment variable to be set"
        )
    base_url = str(massive_cfg.get("base_url", "https://api.massive.com"))
    timeout = _coerce_float(massive_cfg.get("timeout", 10.0), 10.0)
    retries = _coerce_int(massive_cfg.get("retries", 3), 3)
    return MassiveProvider(
        api_key,
        base_url=base_url,
        timeout=timeout,
        retries=retries,
    )


__all__ = ["get_provider"]
