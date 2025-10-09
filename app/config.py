# app/config.py
from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any, Dict

import yaml  # type: ignore[import]

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


def load_config() -> Dict[str, Any]:
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
