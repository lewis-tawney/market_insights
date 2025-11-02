from __future__ import annotations

import asyncio
import json
import logging
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Set

import duckdb  # type: ignore[import]

from app.config import load_config  # noqa: F401  # future use for provider config
from app.providers.yfinance import YFinanceProvider
from app.schemas.sector_volume import SectorIn
from app.services.sector_snapshot import (
    LATEST_SNAPSHOT_JSON,
    SNAPSHOT_DB,
    SNAPSHOT_DIR,
    TickerMetric,
    SnapshotNotFoundError,
    aggregate_sectors,
)


logger = logging.getLogger("jobs.eod_snapshot")

SECTOR_BASE_PATH = Path("config/sectors_snapshot_base.json")
MIN_HISTORY_DAYS = 11
FETCH_PERIOD_SEED = "15d"
FETCH_PERIOD_DAILY = "5d"
PRUNE_DAYS = 90
FAILURE_THRESHOLD = 3
FAILURE_WINDOW_DAYS = 30


def ensure_directories() -> None:
    SNAPSHOT_DB.parent.mkdir(parents=True, exist_ok=True)
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)


def ensure_tables(conn: duckdb.DuckDBPyConnection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ticker_ohlc (
            symbol TEXT,
            date DATE,
            close DOUBLE,
            volume DOUBLE,
            dollar_volume DOUBLE,
            PRIMARY KEY (symbol, date)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ticker_metrics (
            symbol TEXT PRIMARY KEY,
            last_date DATE,
            dollar_vol_today DOUBLE,
            avg_dollar_vol10 DOUBLE,
            rel_vol10 DOUBLE,
            change1d DOUBLE,
            change5d DOUBLE,
            dollar_vol5d DOUBLE,
            price_history TEXT,
            updated_at TIMESTAMP
        )
        """
    )
    try:
        conn.execute("ALTER TABLE ticker_metrics ADD COLUMN price_history TEXT")
    except duckdb.Error:
        pass
    try:
        conn.execute("ALTER TABLE ticker_metrics ADD COLUMN change5d DOUBLE")
    except duckdb.Error:
        pass
    try:
        conn.execute("ALTER TABLE ticker_metrics ADD COLUMN dollar_vol5d DOUBLE")
    except duckdb.Error:
        pass
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS sector_snapshot (
            snapshot_date DATE PRIMARY KEY,
            generated_at TIMESTAMP,
            payload TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS ticker_failures (
            symbol TEXT PRIMARY KEY,
            failure_count INTEGER,
            last_failure TIMESTAMP
        )
        """
    )


def load_failure_state(conn: duckdb.DuckDBPyConnection) -> Dict[str, Dict[str, object]]:
    try:
        rows = conn.execute(
            """
            SELECT symbol, failure_count, last_failure
            FROM ticker_failures
            """
        ).fetchall()
    except duckdb.Error:
        return {}

    state: Dict[str, Dict[str, object]] = {}
    for symbol, count, last_failure in rows:
        if not symbol:
            continue
        try:
            failure_count = int(count)
        except (TypeError, ValueError):
            failure_count = 0
        state[str(symbol).upper()] = {
            "failure_count": failure_count,
            "last_failure": last_failure,
        }
    return state


def record_failure(conn: duckdb.DuckDBPyConnection, symbol: str) -> None:
    symbol = symbol.upper()
    conn.execute(
        """
        INSERT INTO ticker_failures(symbol, failure_count, last_failure)
        VALUES (?, 1, now())
        ON CONFLICT(symbol) DO UPDATE
        SET failure_count = ticker_failures.failure_count + 1,
            last_failure = now()
        """,
        (symbol,),
    )


def clear_failure(conn: duckdb.DuckDBPyConnection, symbol: str) -> None:
    conn.execute("DELETE FROM ticker_failures WHERE symbol = ?", (symbol.upper(),))


def determine_inactive(state: Dict[str, Dict[str, object]]) -> Set[str]:
    inactive: Set[str] = set()
    cutoff = datetime.now(timezone.utc) - timedelta(days=FAILURE_WINDOW_DAYS)
    for symbol, info in state.items():
        count = int(info.get("failure_count", 0) or 0)
        if count < FAILURE_THRESHOLD:
            continue
        last_failure = info.get("last_failure")
        if isinstance(last_failure, datetime):
            lf = last_failure
        elif isinstance(last_failure, str):
            try:
                lf = datetime.fromisoformat(last_failure)
            except Exception:
                lf = None
        else:
            lf = None
        if lf is None:
            inactive.add(symbol)
            continue
        if lf.tzinfo is None:
            lf_utc = lf.replace(tzinfo=timezone.utc)
        else:
            lf_utc = lf.astimezone(timezone.utc)
        if lf_utc >= cutoff:
            inactive.add(symbol)
    return inactive


def load_base_sectors() -> List[SectorIn]:
    if not SECTOR_BASE_PATH.exists():
        logger.warning("Base sector definition file missing at %s", SECTOR_BASE_PATH)
        return []
    try:
        data = json.loads(SECTOR_BASE_PATH.read_text())
    except json.JSONDecodeError as exc:
        logger.error("Failed to parse %s: %s", SECTOR_BASE_PATH, exc)
        return []

    sectors_payload = data.get("sectors")
    if not isinstance(sectors_payload, list):
        logger.warning("No 'sectors' array found in %s", SECTOR_BASE_PATH)
        return []
    sectors: List[SectorIn] = []
    for entry in sectors_payload:
        if not isinstance(entry, dict):
            continue
        try:
            sectors.append(SectorIn(**entry))
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning("Skipping malformed sector entry %s: %s", entry, exc)
    return sectors


def collect_tickers(
    sectors: Sequence[SectorIn], conn: duckdb.DuckDBPyConnection
) -> Set[str]:
    symbols: Set[str] = set()
    for sector in sectors:
        for ticker in sector.tickers:
            ticker_clean = ticker.strip().upper()
            if ticker_clean:
                symbols.add(ticker_clean)
    try:
        existing_rows = conn.execute(
            "SELECT DISTINCT symbol FROM ticker_ohlc"
        ).fetchall()
        for row in existing_rows:
            symbol = row[0]
            if symbol:
                symbols.add(symbol)
    except duckdb.Error:
        pass
    return symbols


async def fetch_symbol_history(
    provider: YFinanceProvider, symbol: str, seed: bool
) -> List[Dict[str, object]]:
    period = FETCH_PERIOD_SEED if seed else FETCH_PERIOD_DAILY
    return await provider.get_ohlc(symbol, period=period, interval="1d")


def upsert_ohlc_rows(
    conn: duckdb.DuckDBPyConnection, symbol: str, rows: Iterable[Dict[str, object]]
) -> None:
    for row in rows:
        date_value = row.get("Date") or row.get("date")
        close = row.get("Close") or row.get("close")
        volume = row.get("Volume") or row.get("volume")
        if close is None or volume is None:
            continue
        if hasattr(date_value, "date"):
            date_obj = date_value.date()
        elif hasattr(date_value, "isoformat"):
            date_obj = date_value
        else:
            try:
                date_obj = datetime.fromisoformat(str(date_value)).date()
            except Exception:
                continue
        try:
            close_val = float(close)
            volume_val = float(volume)
        except (TypeError, ValueError):
            continue
        dollar_volume = close_val * volume_val
        conn.execute(
            """
            INSERT OR REPLACE INTO ticker_ohlc (symbol, date, close, volume, dollar_volume)
            VALUES (?, ?, ?, ?, ?)
            """,
            (symbol, date_obj, close_val, volume_val, dollar_volume),
        )


def prune_old_rows(conn: duckdb.DuckDBPyConnection, symbol: str) -> None:
    cutoff = date.today() - timedelta(days=PRUNE_DAYS)
    try:
        conn.execute(
            "DELETE FROM ticker_ohlc WHERE symbol = ? AND date < ?",
            (symbol, cutoff),
        )
    except duckdb.Error:
        pass


def compute_metrics(conn: duckdb.DuckDBPyConnection, symbol: str) -> Optional[TickerMetric]:
    try:
        rows = conn.execute(
            """
            SELECT date, close, volume, dollar_volume
            FROM ticker_ohlc
            WHERE symbol = ?
            ORDER BY date
            """,
            (symbol,),
        ).fetchall()
    except duckdb.Error:
        return None

    if len(rows) < 2:
        return None

    dates: List[str] = []
    closes: List[float] = []
    volumes: List[float] = []
    dollar_vols: List[float] = []
    for date_val, close, volume, dollar_volume in rows:
        if (
            date_val is None
            or close is None
            or dollar_volume is None
            or volume is None
        ):
            continue
        if hasattr(date_val, "isoformat"):
            date_str = date_val.isoformat()
        else:
            date_str = str(date_val)
        try:
            close_val = float(close)
            volume_val = float(volume)
            dv_val = float(dollar_volume)
        except (TypeError, ValueError):
            continue
        dates.append(date_str)
        closes.append(close_val)
        volumes.append(volume_val)
        dollar_vols.append(dv_val)

    if (
        len(closes) < MIN_HISTORY_DAYS
        or len(dates) < MIN_HISTORY_DAYS
        or len(volumes) < MIN_HISTORY_DAYS
    ):
        return None

    prev_dollar_vols = dollar_vols[-(MIN_HISTORY_DAYS): -1]
    if len(prev_dollar_vols) < (MIN_HISTORY_DAYS - 1):
        return None
    avg_dollar_vol10 = sum(prev_dollar_vols[-10:]) / 10.0

    dollar_vol_today = dollar_vols[-1]

    change5d = None
    if len(closes) >= 6:
        base = closes[-6]
        if base:
            change5d = ((closes[-1] / base) - 1.0) * 100.0

    dollar_vol5d = None
    if len(dollar_vols) >= 5:
        dollar_vol5d = sum(dollar_vols[-5:])

    if len(closes) < 2:
        return None

    prev_close = closes[-2]
    change1d = ((closes[-1] / prev_close) - 1.0) * 100.0 if prev_close else None

    rel_vol10 = None
    if avg_dollar_vol10 and avg_dollar_vol10 != 0:
        rel_vol10 = dollar_vol_today / avg_dollar_vol10

    history_window = 30
    history_entries: List[Dict[str, float]] = []
    for date_str, close_val, volume_val, dollar_val in zip(
        dates[-history_window:], closes[-history_window:], volumes[-history_window:], dollar_vols[-history_window:]
    ):
        history_entries.append(
            {
                "date": date_str,
                "close": close_val,
                "volume": volume_val,
                "dollarVolume": dollar_val,
            }
        )

    return TickerMetric(
        symbol=symbol,
        last_date=dates[-1],
        dollar_vol_today=dollar_vol_today,
        avg_dollar_vol10=avg_dollar_vol10,
        rel_vol10=rel_vol10,
        change1d=change1d,
        change5d=change5d,
        dollar_vol5d=dollar_vol5d,
        history=history_entries,
    )


def upsert_ticker_metrics(
    conn: duckdb.DuckDBPyConnection, metrics: Dict[str, TickerMetric]
) -> None:
    for metric in metrics.values():
        conn.execute(
            """
            INSERT OR REPLACE INTO ticker_metrics (
                symbol,
                last_date,
                dollar_vol_today,
                avg_dollar_vol10,
                rel_vol10,
                change1d,
                change5d,
                dollar_vol5d,
                price_history,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """,
            (
                metric.symbol,
                metric.last_date,
                metric.dollar_vol_today,
                metric.avg_dollar_vol10,
                metric.rel_vol10,
                metric.change1d,
                metric.change5d,
                metric.dollar_vol5d,
                json.dumps(metric.history),
            ),
        )


def serialize_metrics(metrics: Dict[str, TickerMetric]) -> Dict[str, Dict[str, object]]:
    serialized: Dict[str, Dict[str, object]] = {}
    for symbol, metric in metrics.items():
        serialized[symbol] = {
            "last_date": metric.last_date,
            "dollar_vol_today": metric.dollar_vol_today,
            "avg_dollar_vol10": metric.avg_dollar_vol10,
            "rel_vol10": metric.rel_vol10,
            "change1d": metric.change1d,
            "change5d": metric.change5d,
            "dollar_vol5d": metric.dollar_vol5d,
            "history": metric.history,
        }
    return serialized


def resolve_snapshot_date(metrics: Dict[str, TickerMetric]) -> date:
    latest: Optional[date] = None
    for metric in metrics.values():
        last_date_str = metric.last_date
        if not last_date_str:
            continue
        current: Optional[date] = None
        try:
            current = date.fromisoformat(last_date_str)
        except ValueError:
            try:
                current = datetime.fromisoformat(last_date_str).date()
            except ValueError:
                logger.warning(
                    "Unable to parse last_date '%s' for %s; skipping",
                    last_date_str,
                    metric.symbol,
                )
        if current and (latest is None or current > latest):
            latest = current
    if latest is None:
        logger.warning(
            "Falling back to today's date for snapshot; no valid last trading date found."
        )
        return date.today()
    return latest


async def build_snapshot() -> None:
    ensure_directories()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    provider = YFinanceProvider()
    conn = duckdb.connect(str(SNAPSHOT_DB))
    ensure_tables(conn)
    failure_state = load_failure_state(conn)
    inactive_symbols = determine_inactive(failure_state)

    base_sectors = load_base_sectors()
    tickers = collect_tickers(base_sectors, conn)
    if not tickers:
        logger.warning("No tickers available for snapshot generation.")
        conn.close()
        raise SnapshotNotFoundError("No tickers to process for snapshot.")

    logger.info(
        "Processing %d tickers (skipping %d inactive)...",
        len(tickers),
        len(inactive_symbols),
    )
    for symbol in sorted(tickers):
        if symbol in inactive_symbols:
            info = failure_state.get(symbol, {})
            logger.warning(
                "Skipping inactive ticker %s (failures=%s)",
                symbol,
                info.get("failure_count"),
            )
            continue
        count = conn.execute(
            "SELECT COUNT(*) FROM ticker_ohlc WHERE symbol = ?", (symbol,)
        ).fetchone()[0]
        seed = count < MIN_HISTORY_DAYS
        try:
            records = await fetch_symbol_history(provider, symbol, seed=seed)
        except Exception as exc:
            logger.warning("Failed to fetch OHLC for %s: %s", symbol, exc)
            record_failure(conn, symbol)
            failure_state = load_failure_state(conn)
            inactive_symbols = determine_inactive(failure_state)
            continue
        if not records:
            logger.warning("No records returned for %s", symbol)
            record_failure(conn, symbol)
            failure_state = load_failure_state(conn)
            inactive_symbols = determine_inactive(failure_state)
            continue
        upsert_ohlc_rows(conn, symbol, records)
        prune_old_rows(conn, symbol)

    metrics: Dict[str, TickerMetric] = {}
    for symbol in sorted(tickers):
        if symbol in inactive_symbols:
            continue
        metric = compute_metrics(conn, symbol)
        if metric:
            metrics[symbol] = metric
            clear_failure(conn, symbol)
        else:
            logger.debug("Skipping metric generation for %s (insufficient data)", symbol)
            record_failure(conn, symbol)
        failure_state = load_failure_state(conn)
        inactive_symbols = determine_inactive(failure_state)

    if not metrics:
        conn.close()
        raise SnapshotNotFoundError("No ticker metrics could be computed.")

    upsert_ticker_metrics(conn, metrics)
    failure_state = load_failure_state(conn)
    inactive_symbols = determine_inactive(failure_state)

    snapshot_date = resolve_snapshot_date(metrics)
    generated_at = datetime.now(tz=timezone.utc)

    if base_sectors:
        aggregated_default = aggregate_sectors(base_sectors, metrics, inactive_symbols)
        aggregated_payload = [sector.model_dump() for sector in aggregated_default]
    else:
        aggregated_payload = []

    inactive_details = []
    for symbol in sorted(inactive_symbols):
        info = failure_state.get(symbol, {})
        last_failure = info.get("last_failure")
        lf_dt: Optional[datetime]
        if isinstance(last_failure, datetime):
            lf_dt = last_failure
        elif isinstance(last_failure, str):
            try:
                lf_dt = datetime.fromisoformat(last_failure)
            except Exception:
                lf_dt = None
        else:
            lf_dt = None
        if lf_dt is not None:
            if lf_dt.tzinfo is None:
                lf_dt = lf_dt.replace(tzinfo=timezone.utc)
            last_failure_str = lf_dt.astimezone(timezone.utc).isoformat()
        else:
            last_failure_str = None
        inactive_details.append(
            {
                "symbol": symbol,
                "failure_count": int(info.get("failure_count", 0) or 0),
                "last_failure": last_failure_str,
            }
        )

    payload = {
        "snapshot_date": snapshot_date.isoformat(),
        "generated_at": generated_at.isoformat(),
        "ticker_metrics": serialize_metrics(metrics),
        "sectors": aggregated_payload,
        "inactive_tickers": inactive_details,
    }

    dated_json = SNAPSHOT_DIR / f"sectors_volume_{snapshot_date.isoformat()}.json"
    dated_json.write_text(json.dumps(payload, indent=2, sort_keys=True))
    LATEST_SNAPSHOT_JSON.write_text(json.dumps(payload, indent=2, sort_keys=True))

    conn.execute(
        """
        INSERT OR REPLACE INTO sector_snapshot (snapshot_date, generated_at, payload)
        VALUES (?, ?, ?)
        """,
        (snapshot_date, generated_at, json.dumps(payload)),
    )

    conn.close()
    logger.info(
        "Snapshot complete for %s: %d tickers, %d default sectors",
        snapshot_date.isoformat(),
        len(metrics),
        len(aggregated_payload),
    )
    if inactive_symbols:
        logger.warning(
            "Inactive tickers this run (%d): %s",
            len(inactive_symbols),
            ", ".join(sorted(inactive_symbols)),
        )


def main() -> None:
    try:
        asyncio.run(build_snapshot())
    except SnapshotNotFoundError as exc:
        logger.error("Sector snapshot generation failed: %s", exc)


if __name__ == "__main__":
    main()
