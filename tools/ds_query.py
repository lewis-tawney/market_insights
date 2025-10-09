#!/usr/bin/env python3
import argparse
import pathlib as p

import pyarrow as pa
import pyarrow.dataset as ds


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True, help="Path to ohlcv_daily")
    ap.add_argument("--start", help="YYYY-MM-DD")
    ap.add_argument("--end", help="YYYY-MM-DD")
    ap.add_argument(
        "--symbols", nargs="*", default=[], help="Symbols to include (e.g., AAPL MSFT)"
    )
    ap.add_argument(
        "--cols",
        nargs="*",
        default=["date", "symbol", "open", "high", "low", "close", "volume"],
    )
    ap.add_argument("--limit", type=int, default=50)
    args = ap.parse_args()

    d = ds.dataset(p.Path(args.base), format="parquet", partitioning="hive")
    f = None
    if args.start:
        f = ds.field("date") >= args.start
    if args.end:
        end_filter = ds.field("date") <= args.end
        f = (f & end_filter) if f is not None else end_filter
    if args.symbols:
        syms = [s.upper() for s in args.symbols]
        symbol_filter = ds.field("symbol").isin(syms)
        f = (f & symbol_filter) if f is not None else symbol_filter

    # show how many fragments will be scanned (pruning signal)
    frags = sum(1 for _ in d.get_fragments(f))
    tbl = d.to_table(columns=args.cols, filter=f)
    print(f"fragments_scanned={frags}, rows={tbl.num_rows}")
    print(tbl.slice(0, args.limit).to_pandas())


if __name__ == "__main__":
    main()
