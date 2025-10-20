import React, { useEffect, useMemo, useState } from "react";
import type { TrendResponse, MomentumResponse } from "../lib/api";
import { fetchTrend, fetchMomentum } from "../lib/api";

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

// Lightweight per-day localStorage cache to avoid overpulling
const SECTOR_CACHE_KEY = "market-insights:sector-etf-cache";
const SECTOR_CACHE_VERSION = 1;

type SectorCacheEntry = { trend?: TrendResponse | null; momentum?: MomentumResponse | null; savedAt: string };
type SectorCache = {
  version: number;
  date: string; // YYYY-MM-DD
  entries: Record<string, SectorCacheEntry>;
};

function getTodayKey(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

function loadSectorCache(expectedDate: string): SectorCache {
  if (typeof window === "undefined") {
    return { version: SECTOR_CACHE_VERSION, date: expectedDate, entries: {} };
  }
  try {
    const raw = window.localStorage.getItem(SECTOR_CACHE_KEY);
    if (!raw) return { version: SECTOR_CACHE_VERSION, date: expectedDate, entries: {} };
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.version !== SECTOR_CACHE_VERSION ||
      parsed.date !== expectedDate
    ) {
      return { version: SECTOR_CACHE_VERSION, date: expectedDate, entries: {} };
    }
    const src = parsed.entries || {};
    const entries: Record<string, SectorCacheEntry> = {};
    for (const [k, v] of Object.entries(src as Record<string, SectorCacheEntry>)) {
      if (v && typeof v === "object" && (v as SectorCacheEntry).trend?.symbol) {
        entries[k] = v as SectorCacheEntry;
      }
    }
    return { version: SECTOR_CACHE_VERSION, date: expectedDate, entries };
  } catch {
    return { version: SECTOR_CACHE_VERSION, date: expectedDate, entries: {} };
  }
}

function saveSectorCache(cache: SectorCache) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SECTOR_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // best-effort only
  }
}

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
  const [expanded, setExpanded] = useState(false);
  const [momentumMap, setMomentumMap] = useState<Record<string, MomentumResponse | null>>({});
  const [sortKey, setSortKey] = useState<"day" | "r5d" | "off52w" | "sector">("day");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  useEffect(() => {
    let alive = true;

    const todayKey = getTodayKey();
    let cache = loadSectorCache(todayKey);

    // Seed from cache
    setSnapshots(() => {
      const seeded: Record<string, TickerSnapshot> = {};
      SECTOR_ETFS.forEach(({ symbol }) => {
        const cached = cache.entries[symbol];
        if (cached?.trend) {
          seeded[symbol] = { data: cached.trend, error: null, loading: false };
        } else {
          seeded[symbol] = { data: null, error: null, loading: true };
        }
      });
      return seeded;
    });
    setMomentumMap(() => {
      const seeded: Record<string, MomentumResponse | null> = {};
      SECTOR_ETFS.forEach(({ symbol }) => {
        const cached = cache.entries[symbol];
        seeded[symbol] = cached?.momentum ?? null;
      });
      return seeded;
    });
    const refreshAll = refreshKey > 0;
    const allSymbols = SECTOR_ETFS.map((s) => s.symbol);
    const toFetchTrend = allSymbols.filter((sym) => refreshAll || !cache.entries[sym]?.trend);
    const toFetchMomentum = allSymbols.filter((sym) => refreshAll || !cache.entries[sym]?.momentum);

    if (!toFetchTrend.length && !toFetchMomentum.length) {
      return () => {
        alive = false;
      };
    }

    (async () => {
      const [trendResults, momentumResults] = await Promise.all([
        Promise.all(
          toFetchTrend.map(async (symbol) => {
            try {
              const data = await fetchTrend(symbol);
              return { symbol, data, error: null as string | null };
            } catch (error: any) {
              const message = error?.message ?? "Failed to load data";
              return { symbol, data: null, error: message };
            }
          })
        ),
        Promise.all(
          toFetchMomentum.map(async (symbol) => {
            try {
              const data = await fetchMomentum(symbol);
              return { symbol, data, error: null as string | null };
            } catch (error: any) {
              const message = error?.message ?? "Failed to load momentum";
              return { symbol, data: null, error: message };
            }
          })
        ),
      ]);

      if (!alive) return;

      // Update states
      if (trendResults.length) {
        setSnapshots((prev) => {
          const merged: Record<string, TickerSnapshot> = { ...prev };
          trendResults.forEach(({ symbol, data, error }) => {
            if (data) {
              merged[symbol] = { data, error: null, loading: false };
            } else {
              merged[symbol] = { data: prev[symbol]?.data ?? null, error, loading: false };
            }
          });
          return merged;
        });
      }

      if (momentumResults.length) {
        setMomentumMap((prev) => {
          const merged = { ...prev } as Record<string, MomentumResponse | null>;
          momentumResults.forEach(({ symbol, data }) => {
            if (data) merged[symbol] = data;
          });
          return merged;
        });
      }

      // Persist into cache
      const entries = { ...cache.entries } as SectorCache["entries"];
      const savedAt = new Date().toISOString();
      let mutated = false;
      trendResults.forEach(({ symbol, data }) => {
        if (data) {
          entries[symbol] = { ...(entries[symbol] || { savedAt }), trend: data, momentum: entries[symbol]?.momentum ?? null, savedAt };
          mutated = true;
        }
      });
      momentumResults.forEach(({ symbol, data }) => {
        if (data) {
          entries[symbol] = { ...(entries[symbol] || { savedAt }), trend: entries[symbol]?.trend ?? null, momentum: data, savedAt };
          mutated = true;
        }
      });
      if (mutated) {
        cache = { version: SECTOR_CACHE_VERSION, date: todayKey, entries };
        saveSectorCache(cache);
      }
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

  const handleRefresh = () => setRefreshKey((key) => key + 1);

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900 h-full flex flex-col">
      <div className="flex items-center justify-between border-b border-gray-800 px-3.5 py-2.5">
        <h3 className="text-[12px] font-semibold text-gray-200 uppercase tracking-wide">Sector Overview</h3>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-md border border-gray-700 px-2.5 py-0.5 text-[12px] leading-none font-semibold text-gray-300 hover:border-primary-500 hover:text-primary-400"
          >
          +
        </button>
      </div>

      <ul className="divide-y divide-gray-800 flex-1 overflow-auto">
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
            <li key={symbol} className="px-3 py-2">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span
                    className="h-7 w-1 rounded-full"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-800 font-mono text-[10px] text-gray-100">
                    {symbol}
                  </span>
                  <div>
                    <div className="text-[12px] font-semibold uppercase tracking-wide text-gray-300">
                      {name}
                    </div>
                    {loading ? null : error ? (
                      <div className="text-[10px] text-red-400">{error}</div>
                    ) : null}
                  </div>
                </div>

                <div className="text-right">
                  <div className={`text-[13px] font-semibold ${display.tone}`}>{display.text}</div>
                  <div className="mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-gray-800">
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

      {expanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-[min(96vw,1000px)] max-h-[90vh] overflow-auto rounded-xl border border-gray-800 bg-gray-900 shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2.5">
              <div className="text-sm font-semibold text-gray-200">Sectors</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="rounded-md border border-gray-700 px-2 py-0.5 text-[11px] text-gray-300 hover:border-primary-500 hover:text-primary-400"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="rounded-md border border-gray-700 px-2 py-0.5 text-[12px] text-gray-300 hover:border-primary-500 hover:text-primary-400"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-3">
              <div className="overflow-auto">
                <table className="min-w-full text-sm text-gray-200">
                  <thead className="text-gray-400">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium cursor-pointer select-none" onClick={() => {
                        setSortDir((prev) => (sortKey === "sector" ? (prev === "desc" ? "asc" : "desc") : "asc"));
                        setSortKey("sector");
                      }}>
                        Sector {sortKey === "sector" ? (sortDir === "desc" ? "▼" : "▲") : ""}
                      </th>
                      <th className="px-3 py-2 text-right font-medium cursor-pointer select-none" onClick={() => {
                        setSortDir((prev) => (sortKey === "day" ? (prev === "desc" ? "asc" : "desc") : "desc"));
                        setSortKey("day");
                      }}>
                        % Day {sortKey === "day" ? (sortDir === "desc" ? "▼" : "▲") : ""}
                      </th>
                      <th className="px-3 py-2 text-right font-medium cursor-pointer select-none" onClick={() => {
                        setSortDir((prev) => (sortKey === "r5d" ? (prev === "desc" ? "asc" : "desc") : "desc"));
                        setSortKey("r5d");
                      }}>
                        % 5D {sortKey === "r5d" ? (sortDir === "desc" ? "▼" : "▲") : ""}
                      </th>
                      <th className="px-3 py-2 text-right font-medium cursor-pointer select-none" onClick={() => {
                        setSortDir((prev) => (sortKey === "off52w" ? (prev === "desc" ? "asc" : "desc") : "desc"));
                        setSortKey("off52w");
                      }}>
                        % off 52W High {sortKey === "off52w" ? (sortDir === "desc" ? "▼" : "▲") : ""}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {(() => {
                      type Row = { symbol: string; name: string; color: string; day: number | null; r5d: number | null; off52w: number | null };
                      const rows: Row[] = SECTOR_ETFS.map(({ symbol, name, color }) => {
                        const trend = snapshots[symbol]?.data ?? null;
                        const mom = momentumMap[symbol] ?? null;
                        const day = computeChangePct(trend);
                        const r5d = mom?.r5d_pct != null ? mom.r5d_pct * 100 : null;
                        const off52w = mom?.off_52w_high_pct != null ? mom.off_52w_high_pct * 100 : null;
                        return { symbol, name, color, day, r5d, off52w };
                      });
                      const val = (x: number | null): number => {
                        if (x == null || Number.isNaN(x)) return sortDir === "desc" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
                        return x;
                      };
                      rows.sort((a, b) => {
                        if (sortKey === "sector") {
                          return sortDir === "desc" ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name);
                        }
                        const aVal = sortKey === "day" ? a.day : sortKey === "r5d" ? a.r5d : a.off52w;
                        const bVal = sortKey === "day" ? b.day : sortKey === "r5d" ? b.r5d : b.off52w;
                        const da = val(aVal);
                        const db = val(bVal);
                        return sortDir === "desc" ? db - da : da - db;
                      });
                      return rows.map(({ symbol, name, color, day, r5d, off52w }) => {
                        const dayDisp = formatPercent(day);
                        const fiveDisp = formatPercent(r5d);
                        const offDisp = formatPercent(off52w);
                        return (
                          <tr key={symbol}>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className="h-3 w-1 rounded-full" style={{ backgroundColor: color }} />
                                <span className="font-mono text-xs text-gray-100">{symbol}</span>
                                <span className="text-[11px] text-gray-400">{name}</span>
                              </div>
                            </td>
                            <td className={`px-3 py-2 text-right ${dayDisp.tone}`}>{dayDisp.text}</td>
                            <td className={`px-3 py-2 text-right ${fiveDisp.tone}`}>{fiveDisp.text}</td>
                            <td className={`px-3 py-2 text-right ${offDisp.tone}`}>{offDisp.text}</td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
