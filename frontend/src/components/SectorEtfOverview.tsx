import React, { useEffect, useMemo, useState } from "react";
import type { MomentumResponse, TrendResponse } from "../lib/api";
import { fetchMomentum, fetchTrend } from "../lib/api";

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
  trend: TrendResponse | null;
  momentum: MomentumResponse | null;
};

function computeChangePct(data: TrendResponse | null): number | null {
  if (!data?.price || data.prev_close == null || data.prev_close === 0) {
    return null;
  }
  return ((data.price - data.prev_close) / data.prev_close) * 100;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === "string") {
    return error.message;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  return "Failed to load data";
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
  const [expanded, setExpanded] = useState(false);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    let alive = true;

    setSnapshots((prev) => {
      const next: Record<string, TickerSnapshot> = {};
      SECTOR_ETFS.forEach(({ symbol }) => {
        const existing = prev[symbol];
        next[symbol] = existing
          ? { ...existing, loading: true, error: null }
          : { loading: true, error: null, trend: null, momentum: null };
      });
      return next;
    });

    (async () => {
      const results = await Promise.all(
        SECTOR_ETFS.map(async ({ symbol }) => {
          let trend: TrendResponse | null = null;
          let momentum: MomentumResponse | null = null;
          let error: string | null = null;

          const trendPromise = fetchTrend(symbol);
          const momentumPromise = fetchMomentum(symbol);

          try {
            trend = await trendPromise;
          } catch (trendError) {
            error = toErrorMessage(trendError);
          }

          try {
            momentum = await momentumPromise;
          } catch (momentumError) {
            const message = toErrorMessage(momentumError);
            error = error ? `${error}; ${message}` : message;
          }

          return { symbol, trend, momentum, error };
        })
      );
      if (!alive) {
        return;
      }
      setSnapshots((prev) => {
        const merged: Record<string, TickerSnapshot> = { ...prev };
        results.forEach(({ symbol, trend, momentum, error }) => {
          merged[symbol] = { trend, momentum, error, loading: false };
        });
        return merged;
      });
    })();

    return () => {
      alive = false;
    };
  }, []);

  const sortedEtfs = useMemo(() => {
    const valueFor = (symbol: string): number | null => {
      const snapshot = snapshots[symbol];
      if (!snapshot) {
        return null;
      }
      return computeChangePct(snapshot.trend);
    };

    return [...SECTOR_ETFS].sort((a, b) => {
      const valueA = valueFor(a.symbol);
      const valueB = valueFor(b.symbol);

      if (valueA == null && valueB == null) {
        return 0;
      }
      if (valueA == null) {
        return sortDirection === "desc" ? 1 : -1;
      }
      if (valueB == null) {
        return sortDirection === "desc" ? -1 : 1;
      }
      return sortDirection === "desc" ? valueB - valueA : valueA - valueB;
    });
  }, [snapshots, sortDirection]);

  const maxAbsChange = useMemo(() => {
    const deltas = sortedEtfs
      .map(({ symbol }) => computeChangePct(snapshots[symbol]?.trend ?? null))
      .filter((value): value is number => value !== null && !Number.isNaN(value));
    if (!deltas.length) {
      return 0;
    }
    return Math.max(...deltas.map((value) => Math.abs(value)));
  }, [snapshots, sortedEtfs]);

  const latestDate = useMemo(() => {
    const dates = SECTOR_ETFS.map(({ symbol }) => snapshots[symbol]?.trend?.as_of).filter(
      Boolean
    ) as string[];
    if (!dates.length) {
      return null;
    }
    return dates.sort().slice(-1)[0];
  }, [snapshots]);

  const visibleEtfs = useMemo(() => sortedEtfs.slice(0, 11), [sortedEtfs]);
  const rowTemplate = useMemo(() => {
    if (!visibleEtfs.length) {
      return undefined;
    }
    return `repeat(${visibleEtfs.length}, minmax(3.25rem, 1fr))`;
  }, [visibleEtfs.length]);

  const handleSortToggle = () => {
    setSortDirection((prev) => (prev === "desc" ? "asc" : "desc"));
  };

  useEffect(() => {
    if (!expanded) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpanded(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [expanded]);

  return (
    <section className="flex h-full min-h-0 flex-col rounded border border-gray-800 bg-gray-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-200">Sector Overview</h3>
        <div className="flex items-center gap-3">
          {latestDate ? (
            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
              As of {latestDate}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="flex items-center justify-center rounded-md border border-gray-700 px-2 py-1 text-[11px] font-medium text-gray-300 hover:border-primary-500 hover:text-primary-400"
            aria-expanded={expanded}
            aria-label={expanded ? "Hide sector performance table" : "Show sector performance table"}
          >
            {expanded ? "-" : "+"}
          </button>
        </div>
      </div>

      <ul
        className="grid flex-1 list-none gap-1 min-h-0 p-0 m-0"
        style={rowTemplate ? { gridTemplateRows: rowTemplate } : undefined}
      >
        {visibleEtfs.map(({ symbol, name, color }) => {
          const snapshot = snapshots[symbol];
          const change = computeChangePct(snapshot?.trend ?? null);
          const display = formatPercent(change);
          const loading = snapshot?.loading;
          const error = snapshot?.error;
          const scaledFill =
            change === null || !Number.isFinite(change) || maxAbsChange === 0
              ? 0
              : Math.min(100, Math.round((Math.abs(change) / maxAbsChange) * 100));
          const positiveFill = change !== null && change > 0 ? scaledFill : 0;
          const negativeFill = change !== null && change < 0 ? scaledFill : 0;

          return (
            <li
              key={symbol}
              className="flex h-full items-center rounded-lg border border-gray-800 bg-gray-850 px-3"
            >
              <div className="grid h-full w-full grid-cols-[auto_auto_1fr_auto] items-stretch gap-3">
                <span
                  className="h-full w-2 self-stretch rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                <span className="flex h-10 w-8 items-center justify-center self-center rounded-md bg-gray-800 font-mono text-xs text-gray-100">
                  {symbol}
                </span>
                <div className="flex h-full flex-col justify-center self-stretch text-left">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-300">
                    {name}
                  </div>
                  <div className="text-[10px] text-gray-500">
                    {loading ? "Loading…" : error ? error : "\u00A0"}
                  </div>
                </div>

                <div className="flex flex-col justify-center text-right">
                  <div className={`text-sm font-semibold ${display.tone}`}>{display.text}</div>
                  <div className="relative mt-1 flex h-2 w-24 overflow-hidden rounded-full bg-gray-800">
                    <span className="pointer-events-none absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gray-700" />
                    <div className="relative flex-1">
                      <div
                        className="absolute inset-y-0 right-0 rounded-l-full bg-red-400 transition-all duration-300"
                        style={{ width: `${negativeFill}%` }}
                      />
                    </div>
                    <div className="relative flex-1">
                      <div
                        className="absolute inset-y-0 left-0 rounded-r-full bg-green-400 transition-all duration-300"
                        style={{ width: `${positiveFill}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {expanded ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Sector performance table"
          onClick={() => setExpanded(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-lg border border-gray-700 bg-gray-900 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
              <h4 className="text-sm font-semibold text-gray-200">Sector Performance</h4>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="rounded border border-gray-700 px-2 py-1 text-[11px] font-medium text-gray-300 hover:border-primary-500 hover:text-primary-400"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="max-h-[65vh] overflow-auto">
              <table className="min-w-full table-fixed border-separate border-spacing-y-1 text-[11px] text-gray-200">
                <thead className="sticky top-0 bg-gray-900 text-[10px] uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Symbol</th>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={handleSortToggle}
                        className="inline-flex items-center gap-1 text-gray-400 hover:text-primary-300"
                      >
                        % Day
                        <span className="text-[9px] uppercase">{sortDirection}</span>
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedEtfs.map(({ symbol, name }) => {
                    const snapshot = snapshots[symbol];
                    const dayChange = computeChangePct(snapshot?.trend ?? null);
                    const dayDisplay = formatPercent(dayChange);
                    return (
                      <tr key={`table-${symbol}`} className="rounded bg-gray-850">
                        <td className="px-3 py-2 font-mono text-xs text-gray-100">{symbol}</td>
                        <td className="px-3 py-2 text-left text-[11px] text-gray-300">{name}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${dayDisplay.tone}`}>
                          {dayDisplay.text}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
