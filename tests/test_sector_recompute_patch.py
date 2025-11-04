import json
import hashlib
from datetime import date, datetime, timezone, timedelta
from pathlib import Path

import duckdb
import pytest

from app.services import sector_snapshot
from app.schemas.sector_volume import SectorIn, TickerLeaderDTO, TickerMetricDTO, SectorVolumeDTO
from server.jobs import eod_snapshot


def _setup_db(tmp_path: Path) -> duckdb.DuckDBPyConnection:
    db_path = tmp_path / "market.duckdb"
    conn = duckdb.connect(str(db_path))
    eod_snapshot.ensure_tables(conn)
    return conn


@pytest.mark.anyio("asyncio")
async def test_recompute_sector_matches_aggregate(tmp_path, monkeypatch):
    conn = _setup_db(tmp_path)
    monkeypatch.setattr(sector_snapshot, "SNAPSHOT_DB", tmp_path / "market.duckdb")

    conn.execute(
        "INSERT INTO sector_definitions (sector_id, name, sort_order) VALUES (?, ?, ?)",
        ("alpha", "Alpha", 0),
    )
    conn.executemany(
        "INSERT INTO sectors_map (sector_id, symbol) VALUES (?, ?)",
        [("alpha", "AAA"), ("alpha", "BBB")],
    )

    start = date(2024, 1, 1)
    for symbol, price_base in [("AAA", 50.0), ("BBB", 75.0)]:
        for offset in range(12):
            current_date = start + timedelta(days=offset)
            close = price_base + offset
            volume = 1_000_000 + (offset * 10_000)
            conn.execute(
                """
                INSERT INTO ticker_ohlc (symbol, date, close, volume, dollar_volume)
                VALUES (?, ?, ?, ?, ?)
                """,
                (symbol, current_date, close, volume, close * volume),
            )

    metric_bbb = sector_snapshot._compute_metric_from_ohlc(conn, "BBB")
    assert metric_bbb is not None
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
            metric_bbb.symbol,
            metric_bbb.last_date,
            metric_bbb.dollar_vol_today,
            metric_bbb.avg_dollar_vol10,
            metric_bbb.rel_vol10,
            metric_bbb.change1d,
            metric_bbb.change5d,
            metric_bbb.dollar_vol5d,
            json.dumps(metric_bbb.history),
        ),
    )

    metrics_expected = {}
    for ticker in ("AAA", "BBB"):
        metric = sector_snapshot._compute_metric_from_ohlc(conn, ticker)
        assert metric is not None
        metrics_expected[ticker] = metric

    expected = sector_snapshot.aggregate_sectors(
        [SectorIn(id="alpha", name="Alpha", tickers=["AAA", "BBB"])],
        metrics_expected,
        sector_snapshot._load_inactive_symbols(conn),
    )[0]

    result = sector_snapshot.recompute_sector("alpha", conn)

    assert result.model_dump() == expected.model_dump()

    conn.close()


@pytest.mark.anyio("asyncio")
async def test_patch_latest_snapshot_updates_single_row(tmp_path, monkeypatch):
    snapshots_dir = tmp_path / "snapshots"
    snapshots_dir.mkdir()
    latest_path = snapshots_dir / "sectors_volume_latest.json"
    checksum_dir = snapshots_dir / "checksums"
    checksum_dir.mkdir()
    checksum_path = checksum_dir / f"{latest_path.name}.sha256"

    db_path = tmp_path / "market.duckdb"
    conn = duckdb.connect(str(db_path))
    eod_snapshot.ensure_tables(conn)

    monkeypatch.setattr(sector_snapshot, "SNAPSHOT_DIR", snapshots_dir)
    monkeypatch.setattr(sector_snapshot, "SNAPSHOT_CHECKSUM_DIR", checksum_dir)
    monkeypatch.setattr(sector_snapshot, "LATEST_SNAPSHOT_JSON", latest_path)
    monkeypatch.setattr(sector_snapshot, "SNAPSHOT_DB", db_path)
    monkeypatch.setenv("SNAPSHOT_TMP_DIR", str(tmp_path / "tmp"))

    initial_payload = {
        "snapshot_date": "2024-01-05",
        "generated_at": "2024-01-05T20:00:00+00:00",
        "sectors": [
            {
                "id": "alpha",
                "name": "Alpha",
                "members": ["AAA", "BBB"],
                "relVol10_median": 1.0,
                "dollarVol_today_sum": 100.0,
                "avgDollarVol10_sum": 90.0,
                "change1d_median": 0.5,
                "change1d_weighted": 0.6,
                "change5d_weighted": 0.7,
                "leaders": [],
                "lastUpdated": "2024-01-04",
                "members_detail": [],
            },
            {
                "id": "beta",
                "name": "Beta",
                "members": ["CCC"],
                "relVol10_median": 0.9,
                "dollarVol_today_sum": 80.0,
                "avgDollarVol10_sum": 70.0,
                "change1d_median": -0.2,
                "change1d_weighted": -0.1,
                "change5d_weighted": -0.3,
                "leaders": [],
                "lastUpdated": "2024-01-04",
                "members_detail": [],
            },
        ],
        "sectors_count": 2,
        "members_count": 3,
        "ticker_metrics": {
            "AAA": {"last_date": "2024-01-04"},
            "BBB": {"last_date": "2024-01-04"},
            "CCC": {"last_date": "2024-01-04"},
        },
        "inactive_tickers": [],
    }

    latest_path.write_text(json.dumps(initial_payload, indent=2, sort_keys=True))
    checksum_path.write_text(
        hashlib.sha256(latest_path.read_bytes()).hexdigest() + "\n"
    )

    conn.execute(
        """
        INSERT OR REPLACE INTO sector_snapshot (snapshot_date, generated_at, payload)
        VALUES (?, ?, ?)
        """,
        (
            initial_payload["snapshot_date"],
            datetime.fromisoformat(initial_payload["generated_at"]),
            json.dumps(initial_payload, sort_keys=True),
        ),
    )

    updated_row = SectorVolumeDTO(
        id="alpha",
        name="Alpha",
        members=["AAA", "BBB"],
        relVol10_median=1.5,
        dollarVol_today_sum=150.0,
        avgDollarVol10_sum=140.0,
        change1d_median=1.2,
        change1d_weighted=1.1,
        change5d_weighted=1.0,
        leaders=[TickerLeaderDTO(ticker="AAA", relVol10=2.5, change1d=3.0)],
        lastUpdated="2024-01-05",
        members_detail=[
            TickerMetricDTO(
                ticker="AAA",
                change1d=3.0,
                change5d=4.0,
                relVol10=2.5,
                dollarVolToday=90.0,
                avgDollarVol10=80.0,
                lastUpdated="2024-01-05",
                dollarVol5d=400.0,
                inactive=False,
                history=[
                    {"date": "2024-01-01", "close": 100.0, "volume": 1000000.0, "dollarVolume": 100000000.0},
                    {"date": "2024-01-02", "close": 101.0, "volume": 1005000.0, "dollarVolume": 102000000.0},
                ],
            ),
            TickerMetricDTO(
                ticker="BBB",
                change1d=-1.0,
                change5d=0.5,
                relVol10=1.2,
                dollarVolToday=60.0,
                avgDollarVol10=55.0,
                lastUpdated="2024-01-05",
                dollarVol5d=250.0,
                inactive=False,
                history=[
                    {"date": "2024-01-01", "close": 50.0, "volume": 900000.0, "dollarVolume": 45000000.0},
                    {"date": "2024-01-02", "close": 52.0, "volume": 950000.0, "dollarVolume": 49400000.0},
                ],
            ),
        ],
    )

    before_generated_at = initial_payload["generated_at"]
    await sector_snapshot.patch_latest_snapshot(updated_row)

    patched_payload = json.loads(latest_path.read_text())
    sector_map = {entry["id"]: entry for entry in patched_payload["sectors"]}

    assert sector_map["alpha"] == updated_row.model_dump()
    assert sector_map["beta"] == initial_payload["sectors"][1]
    assert patched_payload["sectors_count"] == 2
    assert patched_payload["members_count"] == 3
    assert patched_payload["generated_at"] != before_generated_at

    checksum_contents = checksum_path.read_text().strip()
    calculated_checksum = hashlib.sha256(latest_path.read_bytes()).hexdigest()
    assert checksum_contents == calculated_checksum

    ticker_metrics = patched_payload["ticker_metrics"]
    assert ticker_metrics["AAA"]["last_date"] == "2024-01-05"
    assert ticker_metrics["BBB"]["change1d"] == -1.0
    assert "CCC" in ticker_metrics  # untouched entries remain

    db_row = conn.execute(
        "SELECT generated_at, payload FROM sector_snapshot WHERE snapshot_date = ?",
        (initial_payload["snapshot_date"],),
    ).fetchone()
    assert isinstance(db_row[0], datetime)
    assert json.loads(db_row[1])["sectors"][0]["change1d_median"] == 1.2

    conn.close()
