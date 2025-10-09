#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
from pathlib import Path
from typing import List, Optional, Sequence

import pyarrow as pa

from engine.providers.current_view import (
    count_fragments,
    detect_baseline_path,
    overlay_path,
    read_current_view,
)


def parse_date(s: Optional[str]) -> Optional[dt.date]:
    if not s:
        return None
    return dt.datetime.strptime(s, "%Y-%m-%d").date()


def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser(
        description="Query unified OHLCV current view (baseline + overlay)"
    )
    ap.add_argument("--out-root", required=True, help="Path to engine/out root")
    ap.add_argument("--start", help="YYYY-MM-DD")
    ap.add_argument("--end", help="YYYY-MM-DD")
    ap.add_argument(
        "--symbols", nargs="*", default=[], help="Symbols to include (e.g., AAPL MSFT)"
    )
    ap.add_argument(
        "--cols",
        nargs="*",
        default=["date", "symbol", "close", "volume"],
        help="Columns to project",
    )
    ap.add_argument("--limit", type=int, default=20)
    args = ap.parse_args(argv)

    out_root = Path(args.out_root)
    start = parse_date(args.start)
    end = parse_date(args.end)
    syms: List[str] = list(args.symbols or [])
    cols: List[str] = list(args.cols or [])

    base = detect_baseline_path(out_root)
    over = overlay_path(out_root)
    print(f"baseline_path={base}")
    print(f"overlay_path={over} exists={over.exists()}")

    frags = count_fragments(out_root, start=start, end=end, symbols=syms)
    tbl: pa.Table = read_current_view(
        out_root, start=start, end=end, symbols=syms, columns=cols
    )
    rows = tbl.num_rows

    print(f"fragments_scanned={frags}, rows={rows}")
    # Print head
    head_rows = min(rows, args.limit)
    if head_rows > 0:
        print(tbl.slice(0, head_rows).to_pandas())
    else:
        print("<no rows>")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
