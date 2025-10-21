from __future__ import annotations

import sys
from pathlib import Path


# Ensure repository root is importable during tests
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


import pytest


@pytest.fixture()
def anyio_backend():
    # Force anyio tests to run under asyncio only
    return "asyncio"
