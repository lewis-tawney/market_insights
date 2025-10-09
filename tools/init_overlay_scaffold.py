#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Optional, Sequence

# Add project root to Python path for imports
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from engine.providers.current_view import detect_baseline_path, overlay_path


def _atomic_write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w") as f:
        json.dump(data, f, separators=(",", ":"))
    os.replace(tmp, path)


def _max_date_from_partitions(base: Path) -> Optional[str]:
    # Prefer reading hive partition folder names to avoid scanning files
    dates = []
    if base.exists() and base.is_dir():
        for p in base.iterdir():
            if p.is_dir() and p.name.startswith("date="):
                val = p.name.split("=", 1)[1]
                dates.append(val)
    if not dates:
        return None
    return max(dates)


def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser(
        description="Initialize overlay dataset scaffold and watermarks"
    )
    ap.add_argument("--out-root", required=True, help="Path to engine/out root")
    args = ap.parse_args(argv)

    out_root = Path(args.out_root)

    # Ensure overlay folder exists
    over = overlay_path(out_root)
    over.mkdir(parents=True, exist_ok=True)

    # Watermarks dir
    wm_dir = out_root / "_watermarks"
    wm_dir.mkdir(parents=True, exist_ok=True)

    # overlay watermark
    overlay_wm = wm_dir / "overlay.json"
    if not overlay_wm.exists():
        _atomic_write_json(overlay_wm, {"last_date": None})

    # base watermark using max partition date
    base = detect_baseline_path(out_root)
    max_date = _max_date_from_partitions(base)
    base_wm = wm_dir / "base.json"
    _atomic_write_json(base_wm, {"last_date": max_date})

    print(f"Initialized overlay at: {over}")
    print(f"Wrote watermarks: base={base_wm}, overlay={overlay_wm}")
    print(f"Detected baseline at: {base} (max_date={max_date})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
