import React, { useEffect, useMemo, useState } from "react";
import type { TrendResponse } from "../lib/api";
import { fetchTrend } from "../lib/api";

const SECTOR_ETFS: Array<{
  symbol: string;
  name: string;
  color: string;
}> = [
  { symbol: "XLC", name: "Communication Services", color: "#8d52c1" },
  { symbol: "XLY", name: "Consumer Discretionary", color: "#c4b000" },
  { symbol: "XLP", name: "Consumer Staples", color: "#00a5c4" },
  { symbol: "XLE", name: "Energy", color: "#ebb500" },
  { symbol: "XLF", name: "Financials", color: "#8bc34a" },
  { symbol: "XLV", name: "Healthcare", color: "#1ba4dc" },
  { symbol: "XLI", name: "Industrials", color: "#9eb7d5" },
  { symbol: "XLB", name: "Materials", color: "#7c83c7" },
  { symbol: "XLRE", name: "Real Estate", color: "#c2185b" },
  { symbol: "XLK", name: "Technology", color: "#9c27b0" },
  { symbol: "XLU", name: "Utilities", color: "#f28c0f" },
];

type TickerSnapshot = {
  loading: boolean;
  error: string | null;
  data: TrendResponse | null;
};

function computeChangePct(data: TrendResponse | null): number | null {
  if (!data?.price || data.prev_close == null || data.prev_close === 0) {
    return null;
  }
  return ((data.price - data.prev_close) / data.prev_close) * 100;
}

function formatPercent(value: number | null): { text: string; tone: string } {
  if (value === null || Number.isNaN(value)) {
    return { text: "—", tone: "text-gray-400" };
  }
  const sign = value >= 0 ? "+" : "";
  const tone = value >= 0 ? "text-green-400" : "text-red-400";
  return { text: `${sign}${value.toFixed(2)}%`, tone };
}

export default function SectorEtfOverview(): React.ReactElement {
  const [snapshots, setSnapshots] = useState<Record<string, TickerSnapshot>>({});
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;

    setSnapshots((prev) => {
      const next: Record<string, TickerSnapshot> = {};
      SECTOR_ETFS.forEach(({ symbol }) => {
        const existing = prev[symbol];
        next[symbol] = existing
          ? { ...existing, loading: true, error: null }
          : { loading: true, error: null, data: null };
      });
      return next;
    });

    (async () => {
      const results = await Promise.all(
        SECTOR_ETFS.map(async ({ symbol }) => {
          try {
            const data = await fetchTrend(symbol);
            return { symbol, data, error: null as string | null };
          } catch (error: any) {
            const message = error?.message ?? "Failed to load data";
            return { symbol, data: null, error: message };
          }
        })
      );
      if (!alive) {
        return;
      }
      setSnapshots((prev) => {
        const merged: Record<string, TickerSnapshot> = { ...prev };
        results.forEach(({ symbol, data, error }) => {
          merged[symbol] = { data, error, loading: false };
        });
        return merged;
      });
    })();

    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const sortedEtfs = useMemo(() => {
    return [...SECTOR_ETFS].sort((a, b) => {
      const changeA = computeChangePct(snapshots[a.symbol]?.data ?? null);
      const changeB = computeChangePct(snapshots[b.symbol]?.data ?? null);

      if (changeA == null && changeB == null) return 0;
      if (changeA == null) return 1;
      if (changeB == null) return -1;
      return changeB - changeA;
    });
  }, [snapshots]);

  const maxAbsChange = useMemo(() => {
    const deltas = sortedEtfs
      .map(({ symbol }) => computeChangePct(snapshots[symbol]?.data ?? null))
      .filter((value): value is number => value !== null && !Number.isNaN(value));
    if (!deltas.length) {
      return 0;
    }
    return Math.max(...deltas.map((value) => Math.abs(value)));
  }, [snapshots, sortedEtfs]);

  const latestDate = useMemo(() => {
    const dates = SECTOR_ETFS.map(({ symbol }) => snapshots[symbol]?.data?.as_of).filter(
      Boolean
    ) as string[];
    if (!dates.length) {
      return null;
    }
    return dates.sort().slice(-1)[0];
  }, [snapshots]);

  const handleRefresh = () => {
    setRefreshKey((key) => key + 1);
  };

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900">
      <div className="flex items-start justify-between border-b border-gray-800 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">Sector Overview</h3>
          <p className="text-[11px] text-gray-500">Daily performance of SPDR sector ETFs</p>
          {latestDate ? (
            <p className="text-[10px] text-gray-600">As of {latestDate}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          className="rounded-md border border-gray-700 px-2 py-1 text-[11px] font-medium text-gray-300 hover:border-primary-500 hover:text-primary-400"
        >
          Refresh
        </button>
      </div>

      <ul className="divide-y divide-gray-800">
        {sortedEtfs.map(({ symbol, name, color }) => {
          const snapshot = snapshots[symbol];
          const change = computeChangePct(snapshot?.data ?? null);
          const display = formatPercent(change);
          const loading = snapshot?.loading;
          const error = snapshot?.error;
          const price = snapshot?.data?.price ?? null;
          const barWidth =
            change === null || !Number.isFinite(change) || maxAbsChange === 0
              ? 0
              : Math.min(100, Math.round((Math.abs(change) / maxAbsChange) * 100));
          const barColor = change != null && change < 0 ? "#f87171" : "#34d399";

          return (
            <li key={symbol} className="px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span
                    className="h-8 w-1 rounded-full"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-800 font-mono text-xs text-gray-100">
                    {symbol}
                  </span>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-300">
                      {name}
                    </div>
                    {loading ? (
                      <div className="text-[10px] text-gray-500">Loading…</div>
                    ) : error ? (
                      <div className="text-[10px] text-red-400">{error}</div>
                    ) : (
                      <div className="text-[10px] text-gray-500">
                        Close {price != null ? `$${price.toFixed(2)}` : "—"}
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <div className={`text-sm font-semibold ${display.tone}`}>{display.text}</div>
                  <div className="mt-1 h-2 w-20 overflow-hidden rounded-full bg-gray-800">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${barWidth}%`, backgroundColor: barColor }}
                    />
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
