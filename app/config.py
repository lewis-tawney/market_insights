# app/config.py
from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml  # type: ignore[import]
from pydantic import BaseModel, ConfigDict, Field

_X = re.compile(r"\$\{([^}]+)\}")


def _expand_env(value: Any) -> Any:
    if isinstance(value, str):

        def repl(m: re.Match) -> str:
            var = m.group(1)
            return os.environ.get(var, "")

        return _X.sub(repl, value)
    if isinstance(value, dict):
        return {k: _expand_env(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_expand_env(v) for v in value]
    return value


def _deep_merge(a: Dict[str, Any], b: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(a)
    for k, v in b.items():
        if k in out and isinstance(out[k], dict) and isinstance(v, dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def _load_config_dict() -> Dict[str, Any]:
    repo_root = Path(__file__).resolve().parents[1]
    default_p = repo_root / "config.example.yaml"
    user_p = repo_root / "config.yaml"
    base: Dict[str, Any] = {}
    if default_p.exists():
        base = yaml.safe_load(default_p.read_text("utf-8")) or {}
    user: Dict[str, Any] = {}
    if user_p.exists():
        user = yaml.safe_load(user_p.read_text("utf-8")) or {}
    merged = _deep_merge(base, user)
    return _expand_env(merged)


class MassiveProviderSettings(BaseModel):
    """Settings for the Massive market data provider."""

    model_config = ConfigDict(extra="allow")

    enabled: bool = True
    api_key_env: str = Field(default="MASSIVE_API_KEY", min_length=1)
    base_url: str = "https://api.massive.com"
    timeout: float = Field(default=10.0, gt=0)
    retries: int = Field(default=3, ge=0)
    equity_universe: List[str] = Field(default_factory=list)

    def model_post_init(self, __context: Any) -> None:
        env_base = os.environ.get("MASSIVE_BASE_URL")
        if env_base:
            self.base_url = env_base

        env_timeout = os.environ.get("MASSIVE_HTTP_TIMEOUT")
        if env_timeout:
            try:
                self.timeout = float(env_timeout)
            except ValueError:
                pass

    @property
    def api_key(self) -> Optional[str]:
        """Resolve the API key from the configured environment variable."""
        value = os.environ.get(self.api_key_env)
        return value or None


class ProvidersSettings(BaseModel):
    """Top-level provider configuration."""

    model_config = ConfigDict(extra="allow")

    default: str = "massive"
    massive: MassiveProviderSettings = Field(default_factory=MassiveProviderSettings)


class AppSettings(BaseModel):
    """Typed representation of the application configuration."""

    model_config = ConfigDict(extra="allow")

    providers: ProvidersSettings = Field(default_factory=ProvidersSettings)


def load_settings() -> AppSettings:
    """Load configuration and return a typed AppSettings instance."""

    raw = _load_config_dict()
    return AppSettings.model_validate(raw)


def load_config() -> Dict[str, Any]:
    """Load configuration as a plain dictionary (legacy behaviour)."""

    settings = load_settings()
    return settings.model_dump(mode="python")
