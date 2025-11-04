import json
from pathlib import Path

import duckdb

from server.jobs import eod_snapshot


def _make_conn(tmp_path):
    db_path = tmp_path / "market.duckdb"
    conn = duckdb.connect(str(db_path))
    eod_snapshot.ensure_tables(conn)
    return conn


def test_bootstrap_sectors_from_json_when_empty(tmp_path, monkeypatch):
    seed = {
        "sectors": [
            {"id": "alpha", "name": "Alpha Sector", "tickers": ["aaa", "bbb", "ccc"]},
            {"id": "beta", "name": "Beta Sector", "tickers": ["ddd"]},
        ]
    }
    json_path = tmp_path / "sectors.json"
    json_path.write_text(json.dumps(seed))
    monkeypatch.setattr(eod_snapshot, "SECTOR_BASE_PATH", json_path)

    conn = _make_conn(tmp_path)
    try:
        eod_snapshot.bootstrap_sector_membership(conn)
        sectors = eod_snapshot.load_base_sectors(conn)

        assert [sector.id for sector in sectors] == ["alpha", "beta"]
        assert sectors[0].tickers == ["AAA", "BBB", "CCC"]

        json_path.unlink()
        eod_snapshot.bootstrap_sector_membership(conn)
        sectors_again = eod_snapshot.load_base_sectors(conn)
        assert [sector.id for sector in sectors_again] == ["alpha", "beta"]
        assert sectors_again[0].tickers == ["AAA", "BBB", "CCC"]
    finally:
        conn.close()


def test_load_base_sectors_matches_json_order(tmp_path, monkeypatch):
    seed = {
        "sectors": [
            {"id": "gamma", "name": "Gamma", "tickers": ["x", "y"]},
            {"id": "delta", "name": "Delta", "tickers": ["z"]},
        ]
    }
    json_path = tmp_path / "sectors.json"
    json_path.write_text(json.dumps(seed))
    monkeypatch.setattr(eod_snapshot, "SECTOR_BASE_PATH", json_path)

    conn = _make_conn(tmp_path)
    try:
        eod_snapshot.bootstrap_sector_membership(conn)
        sectors = eod_snapshot.load_base_sectors(conn)

        assert [sector.id for sector in sectors] == ["gamma", "delta"]
        assert sectors[1].tickers == ["Z"]
    finally:
        conn.close()
