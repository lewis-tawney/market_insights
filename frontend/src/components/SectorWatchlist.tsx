import React, { useEffect, useMemo, useState } from "react";
import {
  fetchSectorVolumeAggregate,
  fetchSnapshotHealth,
  type SectorVolumeDTO,
  type SnapshotHealthSummary,
  type TickerMetricDTO,
} from "../lib/api";

type SortKey = "oneDayChange" | "fiveDayChange" | "relVol10";
type SortDirection = "asc" | "desc";

type SortPreset = {
  key: SortKey;
  direction: SortDirection;
};

type TickerSortKey = "ticker" | "change1d" | "change5d" | "relVol10" | "dollarVolToday" | "avgDollarVol10";
type TickerSortPreset = {
  key: TickerSortKey;
  direction: SortDirection;
};

type DecoratedSector = SectorVolumeDTO & {
  fiveDayChange: number | null;
};

type DecoratedTicker = TickerMetricDTO & {
  change5d: number | null;
};

function formatPercent(value: number | null, digits = 2): { text: string; tone: string } {
  if (value === null || Number.isNaN(value)) {
    return { text: "—", tone: "text-gray-400" };
  }
  const prefix = value >= 0 ? "+" : "";
  const tone = value >= 0 ? "text-emerald-300" : "text-rose-300";
  return { text: `${prefix}${value.toFixed(digits)}%`, tone };
}

function formatRelativeVolume(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "—";
  }
  return `${value.toFixed(2)}×`;
}

function formatCompactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  }
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (abs >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return value.toFixed(0);
}

function formatSnapshotTimestamp(metadata: SnapshotHealthSummary | null): string {
  if (!metadata) {
    return "—";
  }
  const { asOfDate, asOfTimeET } = metadata;
  const parts: string[] = [];
  if (asOfDate) {
    parts.push(asOfDate);
  }
  if (asOfTimeET) {
    parts.push(`${asOfTimeET} ET`);
  }
  return parts.length ? parts.join(" • ") : "—";
}

function median(values: number[]): number | null {
  const sorted = values
    .filter((value) => typeof value === "number" && Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!sorted.length) {
    return null;
  }
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function computeTickerFiveDayChange(history: TickerMetricDTO["history"]): number | null {
  if (!Array.isArray(history) || history.length === 0) {
    return null;
  }
  const closes = history
    .map((entry) => (typeof entry?.close === "number" && Number.isFinite(entry.close) ? entry.close : null))
    .filter((value): value is number => value !== null);
  if (closes.length < 6) {
    return null;
  }
  const end = closes[closes.length - 1];
  const start = closes[closes.length - 6];
  if (start === 0) {
    return null;
  }
  return ((end / start) - 1) * 100;
}

function tickerFiveDayChange(metric: TickerMetricDTO): number | null {
  return computeTickerFiveDayChange(metric.history);
}

function computeSectorFiveDayChange(metrics: TickerMetricDTO[]): number | null {
  const values = metrics
    .map((metric) => tickerFiveDayChange(metric))
    .filter((value): value is number => value !== null && Number.isFinite(value));
  if (!values.length) {
    return null;
  }
  return median(values);
}

function SortIndicator({ active, direction }: { active: boolean; direction: SortDirection }) {
  const tone = active ? "text-emerald-300" : "text-gray-500";
  const rotation = direction === "desc" ? "rotate-180" : "";
  return (
    <svg
      className={`h-3 w-3 transform transition-transform ${tone} ${rotation}`}
      viewBox="0 0 12 12"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 2l4 6H2z" fill="currentColor" />
    </svg>
  );
}

function decorateTicker(metric: TickerMetricDTO): DecoratedTicker {
  return {
    ...metric,
    change5d: tickerFiveDayChange(metric),
  };
}

function SectorWatchlist(): React.ReactElement {
  const [sectors, setSectors] = useState<DecoratedSector[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [snapshotMeta, setSnapshotMeta] = useState<SnapshotHealthSummary | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [filterTerm, setFilterTerm] = useState("");
  const [sortPreset, setSortPreset] = useState<SortPreset>({ key: "oneDayChange", direction: "desc" });
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
  const [tickerSort, setTickerSort] = useState<TickerSortPreset>({ key: "change1d", direction: "desc" });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const response = await fetchSectorVolumeAggregate();
        if (!alive) {
          return;
        }
        const mapped: DecoratedSector[] = response.map((sector) => ({
          ...sector,
          fiveDayChange: computeSectorFiveDayChange(sector.members_detail),
        }));
        setSectors(mapped);
        setError(null);
      } catch (err: any) {
        if (!alive) {
          return;
        }
        const message =
          typeof err?.message === "string" && err.message.trim()
            ? err.message
            : "Unable to load sector snapshot";
        setError(message);
        setSectors([]);
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchSnapshotHealth();
        if (!alive) {
          return;
        }
        setSnapshotMeta(data);
        setSnapshotError(null);
      } catch (error: any) {
        if (!alive) {
          return;
        }
        const message =
          typeof error?.message === "string" && error.message.trim()
            ? error.message
            : "Unable to load snapshot status";
        setSnapshotMeta(null);
        setSnapshotError(message);
      }
    })();

    return () => {
      alive = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    if (!sectors.length) {
      setSelectedSectorId(null);
      return;
    }
    if (selectedSectorId && sectors.some((sector) => sector.id === selectedSectorId)) {
      return;
    }
    const sorted = [...sectors].sort((a, b) => {
      const aVal = typeof a.change1d_median === "number" ? a.change1d_median : Number.NEGATIVE_INFINITY;
      const bVal = typeof b.change1d_median === "number" ? b.change1d_median : Number.NEGATIVE_INFINITY;
      if (aVal === bVal) {
        return a.name.localeCompare(b.name);
      }
      return bVal - aVal;
    });
    setSelectedSectorId(sorted[0]?.id ?? null);
  }, [sectors, selectedSectorId]);

  const filteredSectors = useMemo(() => {
    const term = filterTerm.trim().toLowerCase();
    if (!term) {
      return sectors;
    }
    return sectors.filter((sector) => {
      if (sector.name.toLowerCase().includes(term)) {
        return true;
      }
      return sector.members.some((member) => member.toLowerCase().includes(term));
    });
  }, [sectors, filterTerm]);

  const sortedSectors = useMemo(() => {
    const accessor = (sector: DecoratedSector): number | null => {
      switch (sortPreset.key) {
        case "fiveDayChange":
          return sector.fiveDayChange;
        case "relVol10":
          return sector.relVol10_median;
        case "oneDayChange":
        default:
          return sector.change1d_median;
      }
    };
    const directionFactor = sortPreset.direction === "asc" ? 1 : -1;
    return [...filteredSectors].sort((a, b) => {
      const aVal = accessor(a);
      const bVal = accessor(b);
      if (aVal === null && bVal === null) {
        return a.name.localeCompare(b.name);
      }
      if (aVal === null) {
        return 1;
      }
      if (bVal === null) {
        return -1;
      }
      if (aVal !== bVal) {
        return directionFactor * (aVal - bVal);
      }
      return a.name.localeCompare(b.name);
    });
  }, [filteredSectors, sortPreset]);

  const selectedSector = useMemo(() => {
    if (!selectedSectorId) {
      return null;
    }
    return sortedSectors.find((sector) => sector.id === selectedSectorId) ?? null;
  }, [sortedSectors, selectedSectorId]);

  const selectedTickers: DecoratedTicker[] = useMemo(() => {
    if (!selectedSector) {
      return [];
    }
    return selectedSector.members_detail.map(decorateTicker);
  }, [selectedSector]);

  const sortedTickers = useMemo(() => {
    if (!selectedTickers.length) {
      return [];
    }
    const factor = tickerSort.direction === "asc" ? 1 : -1;
    return [...selectedTickers].sort((a, b) => {
      if (tickerSort.key === "ticker") {
        return factor * a.ticker.localeCompare(b.ticker);
      }
      const accessor = (item: DecoratedTicker): number | null => {
        switch (tickerSort.key) {
          case "change1d":
            return item.change1d ?? null;
          case "change5d":
            return item.change5d ?? null;
          case "relVol10":
            return item.relVol10 ?? null;
          case "dollarVolToday":
            return item.dollarVolToday ?? null;
          case "avgDollarVol10":
            return item.avgDollarVol10 ?? null;
          default:
            return null;
        }
      };
      const valueA = accessor(a);
      const valueB = accessor(b);
      if (valueA === null && valueB === null) {
        return a.ticker.localeCompare(b.ticker);
      }
      if (valueA === null) {
        return 1;
      }
      if (valueB === null) {
        return -1;
      }
      if (valueA !== valueB) {
        return factor * (valueA - valueB);
      }
      return a.ticker.localeCompare(b.ticker);
    });
  }, [selectedTickers, tickerSort]);

  const trackedTickerCount = useMemo(() => {
    return sectors.reduce((acc, sector) => acc + sector.members.length, 0);
  }, [sectors]);

  const handleSortToggle = (key: SortKey) => {
    setSortPreset((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === "desc" ? "asc" : "desc" };
      }
      return { key, direction: "desc" };
    });
  };

  const handleTickerSortToggle = (key: TickerSortKey) => {
    setTickerSort((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === "desc" ? "asc" : "desc" };
      }
      return { key, direction: "desc" };
    });
  };

  const handleRefresh = () => {
    setRefreshKey((value) => value + 1);
  };

  const renderSortableHeader = (label: string, key: SortKey, align: "left" | "right" = "right") => {
    const active = sortPreset.key === key;
    const direction = active ? sortPreset.direction : "desc";
    return (
      <button
        type="button"
        onClick={() => handleSortToggle(key)}
        className={`group inline-flex w-full items-center gap-1 ${
          align === "right" ? "justify-end" : "justify-start"
        } text-xs font-semibold transition ${
          active ? "text-emerald-300" : "text-gray-300 hover:text-gray-100"
        }`}
      >
        <span>{label}</span>
        <SortIndicator active={active} direction={direction} />
      </button>
    );
  };

  const renderTickerSortableHeader = (label: string, key: TickerSortKey, align: "left" | "right" = "right") => {
    const active = tickerSort.key === key;
    const direction = active ? tickerSort.direction : "desc";
    return (
      <button
        type="button"
        onClick={() => handleTickerSortToggle(key)}
        className={`group inline-flex w-full items-center gap-1 ${
          align === "right" ? "justify-end" : "justify-start"
        } text-[11px] font-semibold transition ${
          active ? "text-emerald-300" : "text-gray-300 hover:text-gray-100"
        }`}
      >
        <span>{label}</span>
        <SortIndicator active={active} direction={direction} />
      </button>
    );
  };

  const sectorSummary = useMemo(() => {
    if (!selectedSector) {
      return null;
    }
    return {
      oneDay: formatPercent(selectedSector.change1d_median, 2),
      fiveDay: formatPercent(selectedSector.fiveDayChange, 2),
      relVol10: formatRelativeVolume(selectedSector.relVol10_median),
    };
  }, [selectedSector]);

  return (
    <section className="mx-auto max-w-6xl space-y-5 text-gray-100">
      <div className="rounded-xl border border-gray-700 bg-[#1E2937] p-4 shadow space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-100">Sector Snapshot</h3>
            <p className="text-xs text-gray-400">
              Tracking {sectors.length} sectors • {trackedTickerCount} tickers.
            </p>
            <p className="text-xs text-gray-500">
              Last updated: {formatSnapshotTimestamp(snapshotMeta)}
              {snapshotMeta?.stale ? " • Data may be stale" : ""}
            </p>
            {snapshotError ? (
              <p className="text-[11px] text-rose-300">{snapshotError}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <input
              type="search"
              value={filterTerm}
              onChange={(event) => setFilterTerm(event.target.value)}
              placeholder="Filter sectors or tickers"
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400 sm:w-56"
            />
            <div className="flex items-center gap-1 rounded-md border border-gray-700 bg-[#1E2937] p-1">
              <button
                type="button"
                className="rounded-md px-3 py-1 text-xs font-semibold text-emerald-300"
              >
                Sectors
              </button>
              <button
                type="button"
                className="rounded-md px-3 py-1 text-xs font-medium text-gray-500/70"
                disabled
              >
                Stocks
              </button>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              className="inline-flex items-center justify-center rounded-md border border-gray-700 px-3 py-2 text-sm font-medium text-gray-200 transition hover:border-gray-600 hover:text-white"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      ) : loading ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 text-center text-sm text-gray-400">
          Loading snapshot…
        </div>
      ) : sortedSectors.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 text-center text-sm text-gray-400">
          No sectors match your filter. Clear the search to see everything.
        </div>
      ) : (
        <div className="space-y-4 lg:grid lg:grid-cols-[2fr_1fr] lg:items-start lg:gap-4 lg:space-y-0">
        <div className="rounded-xl border border-gray-800 bg-[#1E2937] shadow">
            <table className="min-w-full divide-y divide-gray-800">
              <thead className="bg-[#24344A] text-xs uppercase tracking-wide text-gray-300">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    Sector
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    {renderSortableHeader("1D%", "oneDayChange")}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    {renderSortableHeader("5D%", "fiveDayChange")}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    {renderSortableHeader("RelVol10", "relVol10")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 bg-[#1E2937]">
                {sortedSectors.map((sector) => {
                  const isSelected = selectedSectorId === sector.id;
                  const oneDay = formatPercent(sector.change1d_median, 2);
                  const fiveDay = formatPercent(sector.fiveDayChange, 2);
                  const relVol = formatRelativeVolume(sector.relVol10_median);
                  return (
                    <tr
                      key={sector.id}
                      className={`cursor-pointer transition ${
                        isSelected ? "bg-[#24344A] ring-1 ring-emerald-400/30" : "bg-[#1E2937] hover:bg-[#26374D]"
                      }`}
                      onClick={() => setSelectedSectorId(sector.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className={`text-sm font-medium ${isSelected ? "text-emerald-200" : "text-gray-200"}`}>
                            {sector.name}
                          </span>
                          <span className="text-xs text-gray-500">{sector.members.length} tickers</span>
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-right font-mono text-sm ${oneDay.tone}`}>{oneDay.text}</td>
                      <td className={`px-4 py-3 text-right font-mono text-sm ${fiveDay.tone}`}>{fiveDay.text}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-gray-200">{relVol}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl border border-gray-800 bg-[#1E2937] p-4 shadow space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-gray-100">
                  {selectedSector ? selectedSector.name : "Select a sector"}
                </h4>
                <span className="text-xs text-gray-500">
                  {selectedSector ? `${selectedSector.members.length} tickers` : ""}
                </span>
              </div>
              {sectorSummary ? (
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    1D{" "}
                    <span className={`font-mono ${sectorSummary.oneDay.tone}`}>
                      {sectorSummary.oneDay.text}
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    5D{" "}
                    <span className={`font-mono ${sectorSummary.fiveDay.tone}`}>
                      {sectorSummary.fiveDay.text}
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    RelVol10{" "}
                    <span className="font-mono text-gray-200">{sectorSummary.relVol10}</span>
                  </span>
                </div>
              ) : (
                <p className="mt-2 text-xs text-gray-500">
                  Choose a sector to see its members and snapshot metrics.
                </p>
              )}
            </div>

            {selectedSector ? (
              selectedTickers.length ? (
                <div className="rounded-lg border border-gray-800 bg-[#1E2937] shadow-inner">
                  <table className="min-w-full divide-y divide-gray-800">
                    <thead className="bg-[#24344A] text-[11px] uppercase tracking-wide text-gray-300">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">
                          {renderTickerSortableHeader("Ticker", "ticker", "left")}
                        </th>
                        <th className="px-3 py-2 text-right font-semibold">
                          {renderTickerSortableHeader("1D%", "change1d")}
                        </th>
                        <th className="px-3 py-2 text-right font-semibold">
                          {renderTickerSortableHeader("5D%", "change5d")}
                        </th>
                        <th className="px-3 py-2 text-right font-semibold">
                          {renderTickerSortableHeader("RelVol10", "relVol10")}
                        </th>
                        <th className="px-3 py-2 text-right font-semibold">
                          {renderTickerSortableHeader("$Vol Today", "dollarVolToday")}
                        </th>
                        <th className="px-3 py-2 text-right font-semibold">
                          {renderTickerSortableHeader("Avg $Vol10", "avgDollarVol10")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800 bg-[#1E2937]">
                      {sortedTickers.map((ticker) => {
                        const change1d = formatPercent(ticker.change1d, 2);
                        const change5d = formatPercent(ticker.change5d, 2);
                        const relVol = formatRelativeVolume(ticker.relVol10);
                        return (
                          <tr key={ticker.ticker} className="bg-[#24344A] hover:bg-[#2a3d54]">
                            <td className="px-3 py-2 font-mono text-sm text-gray-100">
                              {ticker.ticker}
                              {ticker.inactive ? (
                                <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-200">
                                  inactive
                                </span>
                              ) : null}
                            </td>
                            <td className={`px-3 py-2 text-right font-mono text-xs ${change1d.tone}`}>
                              {change1d.text}
                            </td>
                            <td className={`px-3 py-2 text-right font-mono text-xs ${change5d.tone}`}>
                              {change5d.text}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-xs text-gray-200">{relVol}</td>
                            <td className="px-3 py-2 text-right font-mono text-xs text-gray-300">
                              {formatCompactNumber(ticker.dollarVolToday)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-xs text-gray-300">
                              {formatCompactNumber(ticker.avgDollarVol10)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-700 bg-[#132030] p-4 text-sm text-gray-400">
                  No tickers available for this sector snapshot.
                </div>
              )
            ) : (
              <div className="rounded-lg border border-dashed border-gray-700 bg-[#132030] p-4 text-sm text-gray-400">
                Select a sector to inspect its members.
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default SectorWatchlist;
