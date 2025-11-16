from __future__ import annotations

import argparse
import logging
from datetime import date, timedelta
from pathlib import Path
from typing import Sequence, Set

import duckdb  # type: ignore[import]

from app.services.massive_flatfiles import (
    backfill_symbols_into_duckdb,
    create_massive_client,
    iterate_dates,
    tracked_symbols,
)
from app.services.sector_snapshot import SNAPSHOT_DB
from server.jobs.eod_snapshot import ensure_tables

LOGGER = logging.getLogger("import_massive_daily")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Backfill daily OHLC from Massive day aggregates into DuckDB"
    )
    parser.add_argument(
        "--start",
        type=date.fromisoformat,
        help="First date to import (inclusive), default = today minus 5 years",
    )
    parser.add_argument(
        "--end",
        type=date.fromisoformat,
        help="Last date to import (inclusive), default = today",
    )
    parser.add_argument(
        "--cache-dir",
        type=Path,
        default=Path("var/massive_cache"),
        help="Directory to persist Massive CSV downloads",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-download Massive files even if already cached",
    )
    parser.add_argument(
        "--symbols",
        type=Path,
        help="Optional newline-separated file with tickers to limit the import (overrides sector map)",
    )
    return parser.parse_args()


def load_symbol_set(symbol_file: Path | None = None) -> Set[str]:
    symbols = tracked_symbols()
    if symbol_file and symbol_file.exists():
        additional = {
            line.strip().upper()
            for line in symbol_file.read_text().splitlines()
            if line.strip()
        }
        symbols |= additional
    return symbols


def date_range(start: date, end: date) -> Sequence[date]:
    if start > end:
        raise ValueError("start date must be on or before end date")
    return list(iterate_dates(start, end))


def main() -> int:
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    end_date = args.end or date.today()
    start_date = args.start or (end_date - timedelta(days=365 * 5))
    dates = date_range(start_date, end_date)

    cache_dir = args.cache_dir
    cache_dir.mkdir(parents=True, exist_ok=True)

    symbols = load_symbol_set(args.symbols)
    if not symbols:
        LOGGER.error("No symbols to process (check sectors_map or symbol file)")
        return 1

    conn = duckdb.connect(str(SNAPSHOT_DB))
    ensure_tables(conn)
    client = create_massive_client()
    try:
        inserted = backfill_symbols_into_duckdb(
            symbols,
            start_date,
            end_date,
            conn,
            cache_dir,
            client=client,
            force_download=args.force,
        )
        conn.commit()
    finally:
        conn.close()

    LOGGER.info("Finished importing %d rows", inserted)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
