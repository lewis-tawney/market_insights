from __future__ import annotations

import pyarrow as pa

"""
Canonical schema for breadth outputs with all Stockbee major move blocks.
Use these constants everywhere (engine, tests, API) to avoid drift.
"""

# Column order matters - exact order specified in requirements
BREADTH_COLUMNS = [
    "date",
    "n_elig",
    "n_up4",
    "n_dn4",
    "up10",
    "dn10",
    "r5",
    "r10",
    "n_up25m",
    "n_dn25m",
    "n_up50m",
    "n_dn50m",
    "n_up25q",
    "n_dn25q",
    "n_up13x34",
    "n_dn13x34",
    "d34_13",
]

# Pandas dtype strings to enforce before Parquet write
BREADTH_DTYPES = {
    "n_elig": "int32",
    "n_up4": "int32",
    "n_dn4": "int32",
    "up10": "int32",
    "dn10": "int32",
    "r5": "float32",
    "r10": "float32",
    "n_up25m": "int32",
    "n_dn25m": "int32",
    "n_up50m": "int32",
    "n_dn50m": "int32",
    "n_up25q": "int32",
    "n_dn25q": "int32",
    "n_up13x34": "int32",
    "n_dn13x34": "int32",
    "d34_13": "int32",
}

# Canonical OHLCV schema for all providers
CANONICAL_SCHEMA = pa.schema(
    [
        pa.field("date", pa.date32()),
        pa.field("symbol", pa.string()),
        pa.field("open", pa.float64()),
        pa.field("high", pa.float64()),
        pa.field("low", pa.float64()),
        pa.field("close", pa.float64()),
        pa.field("adj_close", pa.float64()),
        pa.field("volume", pa.int64()),
        pa.field("provider", pa.string()),
        pa.field("source_run", pa.string()),
    ]
)

__all__ = ["BREADTH_COLUMNS", "BREADTH_DTYPES", "CANONICAL_SCHEMA"]
