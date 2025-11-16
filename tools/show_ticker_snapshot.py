#!/usr/bin/env python3
"""Utility to inspect daily snapshot metrics for a single ticker.

This script reads the latest sector snapshot (or a custom path) and prints
the stored daily metrics for a ticker so it can be compared against an
external data source.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, Iterable, Tuple

DEFAULT_SNAPSHOT_PATH = Path("snapshots/sectors_volume_latest.json")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "ticker",
        nargs="?",
        default="AAPL",
        help="Ticker symbol to inspect (default: %(default)s)",
    )
    parser.add_argument(
        "-s",
        "--snapshot",
        default=str(DEFAULT_SNAPSHOT_PATH),
        help="Path to the snapshot JSON (default: %(default)s)",
    )
    return parser.parse_args()


def load_snapshot(path: Path) -> Dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"Snapshot file not found: {path}")
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        raise ValueError(f"Snapshot file is not valid JSON: {path}") from exc


def fmt_pct(value: Any) -> str:
    if value is None:
        return "—"
    try:
        number = float(value)
    except (TypeError, ValueError):
        return "—"
    return f"{number:+.2f}%"


def fmt_float(value: Any) -> str:
    if value is None:
        return "—"
    try:
        number = float(value)
    except (TypeError, ValueError):
        return "—"
    if abs(number) >= 1_000_000_000:
        return f"{number/1_000_000_000:.2f}B"
    if abs(number) >= 1_000_000:
        return f"{number/1_000_000:.2f}M"
    if abs(number) >= 1_000:
        return f"{number/1_000:.2f}K"
    return f"{number:.2f}"


def fmt_price(value: Any) -> str:
    if value is None:
        return "—"
    try:
        number = float(value)
    except (TypeError, ValueError):
        return "—"
    return f"${number:.2f}"


def history_rows(entries: Iterable[Dict[str, Any]]) -> Iterable[Tuple[str, str, str, str]]:
    for entry in entries:
        date = str(entry.get("date", "")) or "?"
        close = fmt_price(entry.get("close"))
        volume = fmt_float(entry.get("volume"))
        dollar_vol = fmt_float(entry.get("dollarVolume"))
        yield date, close, volume, dollar_vol


def main() -> int:
    args = parse_args()
    ticker = args.ticker.strip().upper()
    snapshot_path = Path(args.snapshot)

    try:
        payload = load_snapshot(snapshot_path)
    except (FileNotFoundError, ValueError) as exc:
        print(f"error: {exc}")
        return 1

    metrics = payload.get("ticker_metrics")
    if not isinstance(metrics, dict):
        print(f"error: snapshot does not contain ticker_metrics at {snapshot_path}")
        return 1

    data = metrics.get(ticker)
    if data is None:
        inactive = {
            str(entry.get("symbol", "")).upper()
            for entry in payload.get("inactive_tickers", [])
            if isinstance(entry, dict)
        }
        hint = " (inactive)" if ticker in inactive else ""
        print(f"{ticker} not present in snapshot{hint}.")
        return 1

    print(f"Snapshot: {snapshot_path}")
    print(f"Ticker:   {ticker}")
    print(f"Date:     {data.get('last_date', 'n/a')}")
    print(f"1D%:      {fmt_pct(data.get('change1d'))}")
    print(f"ADR20%:   {fmt_pct(data.get('adr20_pct'))}")
    print(f"RelVol10: {fmt_float(data.get('rel_vol10'))}×")
    print(f"$ Vol:    {fmt_float(data.get('dollar_vol_today'))}")
    print(f"Avg $10:  {fmt_float(data.get('avg_dollar_vol10'))}")

    history = data.get("history") or []
    if history:
        print("\nRecent daily values (date, close, volume, dollar volume):")
        for date, close, volume, dollar_vol in history_rows(history):
            print(f"  {date:<12} {close:>10}  {volume:>10}  {dollar_vol:>10}")
    else:
        print("\nNo per-day history stored in snapshot.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
