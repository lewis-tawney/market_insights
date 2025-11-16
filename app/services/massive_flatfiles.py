from __future__ import annotations

import logging
import os
from datetime import date, timedelta
from pathlib import Path
from typing import Iterable, List, Optional, Set, Tuple

import boto3  # type: ignore[import]
import duckdb  # type: ignore[import]
import pandas as pd  # type: ignore[import]
from botocore.config import Config
from botocore.exceptions import ClientError

from app.services.sector_snapshot import SNAPSHOT_DB

LOGGER = logging.getLogger("massive_flatfiles")
FLATFILE_BUCKET = "flatfiles"
DAY_AGG_PREFIX = "us_stocks_sip/day_aggs_v1"
BASELINE_SYMBOLS = {"SPY", "QQQ", "IWM", "VIX"}


def create_massive_client():
    access_key = os.environ.get("MASSIVE_ACCESS_KEY_ID")
    secret_key = os.environ.get("MASSIVE_SECRET_ACCESS_KEY")
    if not access_key or not secret_key:
        raise RuntimeError(
            "Massive S3 credentials missing; set MASSIVE_ACCESS_KEY_ID and MASSIVE_SECRET_ACCESS_KEY"
        )
    session = boto3.Session(aws_access_key_id=access_key, aws_secret_access_key=secret_key)
    return session.client(
        "s3",
        endpoint_url="https://files.massive.com",
        config=Config(signature_version="s3v4"),
    )


def massivet_key_for_date(target_date: date) -> str:
    return f"{DAY_AGG_PREFIX}/{target_date.year}/{target_date:%m}/{target_date:%Y-%m-%d}.csv.gz"


def cached_day_path(cache_dir: Path, target_date: date) -> Path:
    key = massivet_key_for_date(target_date)
    return cache_dir / key.replace("/", os.sep)


def download_day_file(
    target_date: date,
    cache_dir: Path,
    client=None,
    *,
    force: bool = False,
) -> Optional[Path]:
    target_path = cached_day_path(cache_dir, target_date)
    if target_path.exists() and not force:
        LOGGER.debug("Using cached Massive file %s", target_path)
        return target_path

    client = client or create_massive_client()
    target_path.parent.mkdir(parents=True, exist_ok=True)
    object_key = massivet_key_for_date(target_date)

    try:
        client.download_file(FLATFILE_BUCKET, object_key, str(target_path))
        LOGGER.info("Downloaded %s to %s", object_key, target_path)
        return target_path
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code in {"404", "NoSuchKey"}:
            LOGGER.debug("Massive file for %s missing (%s)", target_date, object_key)
            return None
        LOGGER.warning("Failed to download %s: %s", object_key, exc)
        return None
    except Exception as exc:  # pragma: no cover - defensive
        LOGGER.warning("Unexpected error downloading %s: %s", object_key, exc)
        return None


def iterate_dates(start: date, end: date) -> Iterable[date]:
    current = start
    while current <= end:
        yield current
        current = current + timedelta(days=1)


def normalize_symbol(symbol: str) -> str:
    return symbol.strip().upper()


def tracked_symbols() -> Set[str]:
    conn = duckdb.connect(str(SNAPSHOT_DB))
    try:
        rows = conn.execute("SELECT DISTINCT symbol FROM sectors_map").fetchall()
    finally:
        conn.close()
    symbols = {normalize_symbol(row[0]) for row in rows if row and row[0]}
    symbols.update(BASELINE_SYMBOLS)
    return {sym for sym in symbols if sym}


def rows_for_date(
    target_date: date,
    symbols: Set[str],
    cache_dir: Path,
    client=None,
    *,
    force_download: bool = False,
) -> List[Tuple[str, date, float, float, float, float, float, float]]:
    file_path = download_day_file(target_date, cache_dir, client, force=force_download)
    if file_path is None:
        return []

    try:
        df = pd.read_csv(file_path, compression="gzip")
    except Exception as exc:  # pragma: no cover - defensive
        LOGGER.warning("Unable to load CSV %s: %s", file_path, exc)
        return []

    if "ticker" not in df.columns or "window_start" not in df.columns:
        LOGGER.warning("Missing expected columns in %s", file_path)
        return []

    df["ticker"] = df["ticker"].astype(str).str.upper().str.strip()
    filtered = (
        df[df["ticker"].isin(symbols)]
        .copy()
    )
    if filtered.empty:
        return []

    filtered["trading_date"] = pd.to_datetime(filtered["window_start"], unit="ns").dt.date

    rows: List[Tuple[str, date, float, float, float, float, float, float]] = []
    for row in filtered.itertuples(index=False):
        try:
            open_px = float(row.open)
            high_px = float(row.high)
            low_px = float(row.low)
            close_px = float(row.close)
            volume = float(row.volume)
        except (TypeError, ValueError):
            LOGGER.debug("Skipping invalid row for %s on %s", row.ticker, target_date)
            continue
        dollar_volume = close_px * volume
        rows.append(
            (
                normalize_symbol(row.ticker),
                row.trading_date,
                open_px,
                high_px,
                low_px,
                close_px,
                volume,
                dollar_volume,
            )
        )
    return rows


def insert_rows(
    rows: Iterable[Tuple[str, date, float, float, float, float, float, float]],
    conn: duckdb.DuckDBPyConnection,
) -> None:
    if not rows:
        return
    stmt = """
    INSERT OR REPLACE INTO ticker_ohlc (
        symbol,
        date,
        open,
        high,
        low,
        close,
        volume,
        dollar_volume
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """
    conn.executemany(stmt, rows)


def backfill_symbols_into_duckdb(
    symbols: Iterable[str],
    start_date: date,
    end_date: date,
    conn: duckdb.DuckDBPyConnection,
    cache_dir: Path,
    client=None,
    *,
    force_download: bool = False,
) -> int:
    client = client or create_massive_client()
    symbol_set = {normalize_symbol(sym) for sym in symbols if sym}
    if not symbol_set:
        return 0

    total = 0
    for day in iterate_dates(start_date, end_date):
        rows = rows_for_date(
            day,
            symbol_set,
            cache_dir,
            client=client,
            force_download=force_download,
        )
        if not rows:
            continue
        insert_rows(rows, conn)
        total += len(rows)
    return total
