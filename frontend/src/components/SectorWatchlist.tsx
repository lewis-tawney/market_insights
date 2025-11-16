import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchSectorVolumeAggregate,
  fetchSectorRalph,
  fetchSnapshotHealth,
  addSectorTicker,
  removeSectorTicker,
  fetchTaskStatus,
  createSector,
  type SectorIn,
  type SectorVolumeDTO,
  type SnapshotHealthSummary,
  type TickerMetricDTO,
  type TaskStatusResponse,
  type SectorRalphRow,
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

type ViewMode = "sectors" | "stocks" | "ralph";

type RalphSortKey = "pctGainToHigh" | "pctOffHigh" | "ralphScore" | "ytdReturn" | "avgDollarVol10";

type RalphSortPreset = {
  key: RalphSortKey;
  direction: SortDirection;
};

type DecoratedSector = SectorVolumeDTO & {
  fiveDayChange: number | null;
};

type DecoratedTicker = TickerMetricDTO & {
  change5d: number | null;
};

type StockRow = DecoratedTicker & {
  sectorId: string;
  sectorName: string;
};

const SECTOR_STORAGE_KEY = "market-insights:sector-definitions";
const TICKER_PATTERN = /^[A-Z0-9.-]{1,10}$/;

type PendingMutation = {
  taskId: string;
  status: "pending" | "failed";
  message?: string;
  action: "add" | "remove";
  symbol?: string;
};

function normalizeTickerInput(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

function loadStoredSectorDefinitions(): SectorIn[] | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(SECTOR_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }

    const sanitized = parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }

        const { id, name, tickers } = entry as {
          id?: unknown;
          name?: unknown;
          tickers?: unknown;
        };

        if (typeof id !== "string" || typeof name !== "string") {
          return null;
        }

        const cleaned = Array.isArray(tickers)
          ? Array.from(
              new Set(
                tickers
                  .map((ticker) =>
                    typeof ticker === "string" ? normalizeTickerInput(ticker) : null
                  )
                  .filter((ticker): ticker is string => Boolean(ticker))
              )
            )
          : [];

        return {
          id,
          name,
          tickers: cleaned,
        } satisfies SectorIn;
      })
      .filter((sector): sector is SectorIn => sector !== null);

    return sanitized.length ? sanitized : null;
  } catch {
    return null;
  }
}

function persistSectorDefinitions(definitions: SectorIn[] | null): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (!definitions || !definitions.length) {
      window.localStorage.removeItem(SECTOR_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(SECTOR_STORAGE_KEY, JSON.stringify(definitions));
  } catch {
    // Ignore storage failures (e.g., Safari private mode)
  }
}

function formatPercent(value: number | null, digits = 2): { text: string; tone: string } {
  if (value === null || Number.isNaN(value)) {
    return { text: "—", tone: "text-gray-400" };
  }
  const prefix = value >= 0 ? "+" : "";
  const tone = value >= 0 ? "text-emerald-300" : "text-rose-300";
  return { text: `${prefix}${value.toFixed(digits)}%`, tone };
}

function formatOffHigh(value: number | null, digits = 2): { text: string; tone: string } {
  const base = formatPercent(value, digits);
  if (base.text === "—") {
    return base;
  }
  const withoutSign = base.text.replace(/^(\+|-)*/, "");
  return {
    text: `-${withoutSign}`,
    tone: "text-rose-300",
  };
}

function formatRalphScore(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "—";
  }
  return value.toFixed(1);
}

const sectorBadgePalette = [
  "bg-emerald-500/10 border border-emerald-500/30 text-emerald-200",
  "bg-sky-500/10 border border-sky-500/30 text-sky-200",
  "bg-violet-500/10 border border-violet-500/30 text-violet-200",
  "bg-amber-500/10 border border-amber-500/30 text-amber-200",
  "bg-rose-500/10 border border-rose-500/30 text-rose-200",
  "bg-indigo-500/10 border border-indigo-500/30 text-indigo-200",
];

function sectorBadgeClass(sectorId: string | null): string {
  if (!sectorId) {
    return "bg-gray-500/10 border border-gray-500/30 text-gray-200";
  }
  const hash = [...sectorId].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return sectorBadgePalette[hash % sectorBadgePalette.length];
}

function Sparkline({ data }: { data: number[] }): React.ReactElement {
  if (!data || data.length === 0) {
    return (
      <div className="h-6 w-14 text-[11px] text-gray-400 text-center">—</div>
    );
  }
  const width = 56;
  const height = 18;
  const values = data.filter((value) => Number.isFinite(value));
  if (!values.length) {
    return (
      <div className="h-6 w-14 text-[11px] text-gray-400 text-center">—</div>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max > min ? max - min : 1;
  const divisor = values.length > 1 ? values.length - 1 : 1;
  const points = values
    .map((value, index) => {
      const normalized = ((value - min) / range) * (height - 2);
      const x = (index / divisor) * width;
      const y = height - 1 - normalized;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="price sparkline"
      className="mx-auto block"
    >
      <path
        d={points}
        fill="none"
        stroke="#22C55E"
        strokeWidth={1.5}
      />
    </svg>
  );
}

type RalphFiltersProps = {
  rows: SectorRalphRow[];
  selectedSectors: string[];
  setSelectedSectors: (ids: string[]) => void;
  volumePreset: "all" | "10" | "50" | "200";
  setVolumePreset: (value: "all" | "10" | "50" | "200") => void;
  leadersNearHighOnly: boolean;
  setLeadersNearHighOnly: (value: boolean) => void;
};

function RalphFilters({
  rows,
  selectedSectors,
  setSelectedSectors,
  volumePreset,
  setVolumePreset,
  leadersNearHighOnly,
  setLeadersNearHighOnly,
}: RalphFiltersProps): React.ReactElement {
  const sectors = useMemo(() => {
    const byId = new Map<string, string>();
    for (const row of rows) {
      if (!row.sectorId || !row.name) continue;
      if (!byId.has(row.sectorId)) {
        byId.set(row.sectorId, row.name);
      }
    }
    return Array.from(byId.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  const toggleSector = (id: string) => {
    setSelectedSectors((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
  };

  const isAllSectors = selectedSectors.length === 0;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-gray-800 bg-[#111827] px-4 py-3 text-xs text-gray-300">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Sectors
        </span>
        <button
          type="button"
          onClick={() => setSelectedSectors([])}
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            isAllSectors
              ? "bg-emerald-500/20 text-emerald-200"
              : "bg-gray-700/40 text-gray-200 hover:bg-gray-600/60"
          }`}
        >
          All
        </button>
        {sectors.map((sector) => {
          const active = selectedSectors.includes(sector.id);
          return (
            <button
              key={sector.id}
              type="button"
              onClick={() => toggleSector(sector.id)}
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                active
                  ? "bg-emerald-500/20 text-emerald-200"
                  : "bg-gray-700/40 text-gray-200 hover:bg-gray-600/60"
              }`}
            >
              {sector.name}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          Min Avg $Vol10
        </span>
        {[
          { key: "all", label: "All" },
          { key: "10", label: ">10M" },
          { key: "50", label: ">50M" },
          { key: "200", label: ">200M" },
        ].map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => setVolumePreset(preset.key as RalphFiltersProps["volumePreset"])}
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              volumePreset === preset.key
                ? "bg-sky-500/20 text-sky-200"
                : "bg-gray-700/40 text-gray-200 hover:bg-gray-600/60"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setLeadersNearHighOnly(!leadersNearHighOnly)}
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            leadersNearHighOnly
              ? "bg-emerald-500/25 text-emerald-200"
              : "bg-gray-700/40 text-gray-200 hover:bg-gray-600/60"
          }`}
        >
          Leaders near high
        </button>
        <span className="text-[11px] text-gray-500">
          RALPH ≥ 3 and % off high ≤ 10%
        </span>
      </div>
    </div>
  );
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
  if (typeof metric.change5d === "number" && Number.isFinite(metric.change5d)) {
    return metric.change5d;
  }
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
  const [sectorDefinitions, setSectorDefinitions] = useState<SectorIn[] | null>(
    () => loadStoredSectorDefinitions()
  );
  const definitionsRef = useRef<SectorIn[] | null>(sectorDefinitions);
  const latestRequestRef = useRef<symbol | null>(null);
  const [snapshotMeta, setSnapshotMeta] = useState<SnapshotHealthSummary | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [filterTerm, setFilterTerm] = useState("");
  const [activeView, setActiveView] = useState<ViewMode>("sectors");
  const [sortPreset, setSortPreset] = useState<SortPreset>({ key: "oneDayChange", direction: "desc" });
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
  const [tickerSort, setTickerSort] = useState<TickerSortPreset>({ key: "change1d", direction: "desc" });
  const [isEditing, setIsEditing] = useState(false);
  const [newTickerInput, setNewTickerInput] = useState("");
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [pendingTasks, setPendingTasks] = useState<Record<string, PendingMutation>>({});
  const [ralphRows, setRalphRows] = useState<SectorRalphRow[]>([]);
  const [ralphLoading, setRalphLoading] = useState(false);
  const [ralphError, setRalphError] = useState<string | null>(null);
  const [ralphSort, setRalphSort] = useState<RalphSortPreset>({ key: "ralphScore", direction: "desc" });
  const [selectedRalphSectors, setSelectedRalphSectors] = useState<string[]>([]);
  const [volumePreset, setVolumePreset] = useState<"all" | "10" | "50" | "200">("all");
  const [leadersNearHighOnly, setLeadersNearHighOnly] = useState(false);
  const isMountedRef = useRef(true);
  const [isCreatingSector, setIsCreatingSector] = useState(false);
  const [newSectorName, setNewSectorName] = useState("");
  const [newSectorTickers, setNewSectorTickers] = useState<string[]>([""]);
  const [creatingSector, setCreatingSector] = useState(false);
  const [sectorCreationError, setSectorCreationError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    definitionsRef.current = sectorDefinitions;
    persistSectorDefinitions(sectorDefinitions);
  }, [sectorDefinitions]);

  useEffect(() => {
    setNewTickerInput("");
    setMutationError(null);
    setIsEditing(false);
  }, [selectedSectorId]);

  useEffect(() => {
    if (!isEditing) {
      setNewTickerInput("");
      setMutationError(null);
    }
  }, [isEditing]);

  useEffect(() => {
    let alive = true;
    const requestMarker = Symbol("sector-fetch");
    latestRequestRef.current = requestMarker;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const definitions = definitionsRef.current;
        const response = await fetchSectorVolumeAggregate(
          definitions && definitions.length ? definitions : undefined
        );
        if (!alive || latestRequestRef.current !== requestMarker) {
          return;
        }
        const mapped: DecoratedSector[] = response.map((sector) => ({
          ...sector,
          fiveDayChange:
            typeof sector.change5d_weighted === "number" && Number.isFinite(sector.change5d_weighted)
              ? sector.change5d_weighted
              : computeSectorFiveDayChange(sector.members_detail),
        }));
        const normalizedDefinitions: SectorIn[] = response.map((sector) => ({
          id: sector.id,
          name: sector.name,
          tickers: [...sector.members],
        }));
        setSectors(mapped);
        setSectorDefinitions(normalizedDefinitions);
        setError(null);
      } catch (err: any) {
        if (!alive || latestRequestRef.current !== requestMarker) {
          return;
        }
        const message =
          typeof err?.message === "string" && err.message.trim()
            ? err.message
            : "Unable to load sector snapshot";
        setError(message);
        setSectors([]);
      } finally {
        if (alive && latestRequestRef.current === requestMarker) {
          setLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const closeSectorModal = () => {
    setIsCreatingSector(false);
    setNewSectorName("");
    setNewSectorTickers([""]);
    setSectorCreationError(null);
  };

  const addTickerInput = () => {
    setNewSectorTickers((prev) => [...prev, ""]);
  };

  const updateTickerInput = (index: number, value: string) => {
    setNewSectorTickers((prev) => prev.map((ticker, idx) => (idx === index ? value : ticker)));
  };

  const removeTickerInput = (index: number) => {
    setNewSectorTickers((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleCreateSector = async () => {
    const trimmedName = newSectorName.trim();
    if (!trimmedName) {
      setSectorCreationError("Sector name is required.");
      return;
    }
    const cleanedTickers = newSectorTickers
      .map((ticker) => ticker.trim().toUpperCase())
      .filter((ticker) => ticker);
    if (!cleanedTickers.length) {
      setSectorCreationError("Add at least one ticker.");
      return;
    }
    setCreatingSector(true);
    setSectorCreationError(null);
    const derivedId = trimmedName.replace(/\s+/g, "-").toUpperCase();
    try {
      const { task_id } = await createSector({
        id: derivedId,
        name: trimmedName,
        tickers: cleanedTickers,
      });
      startTaskPolling(derivedId, task_id);
      closeSectorModal();
    } catch (error: any) {
      const message =
        typeof error?.message === "string" && error.message.trim()
          ? error.message.trim()
          : "Unable to create sector.";
      setSectorCreationError(message);
    } finally {
      setCreatingSector(false);
    }
  };

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
    if (activeView !== "ralph") {
      return;
    }
    let alive = true;
    setRalphLoading(true);
    setRalphError(null);
    (async () => {
      try {
        const rows = await fetchSectorRalph();
        if (!alive) {
          return;
        }
        setRalphRows(rows);
        setRalphError(null);
      } catch (error: any) {
        if (!alive) {
          return;
        }
        const message =
          typeof error?.message === "string" && error.message.trim()
            ? error.message.trim()
            : "Unable to load RALPH data";
        setRalphRows([]);
        setRalphError(message);
      } finally {
        if (alive) {
          setRalphLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [activeView, refreshKey]);

  useEffect(() => {
    if (!sectors.length) {
      setSelectedSectorId(null);
      return;
    }
    if (selectedSectorId && sectors.some((sector) => sector.id === selectedSectorId)) {
      return;
    }
    const sorted = [...sectors].sort((a, b) => {
      const aBase = a.change1d_weighted ?? a.change1d_median;
      const bBase = b.change1d_weighted ?? b.change1d_median;
      const aVal = typeof aBase === "number" ? aBase : Number.NEGATIVE_INFINITY;
      const bVal = typeof bBase === "number" ? bBase : Number.NEGATIVE_INFINITY;
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

  const computeYtdReturnPct = (row: SectorRalphRow): number | null => {
    const gain = row.pctGainToHigh;
    const off = row.pctOffHigh;
    if (
      gain === null ||
      off === null ||
      Number.isNaN(gain) ||
      Number.isNaN(off)
    ) {
      return null;
    }
    const gainFrac = gain / 100;
    const offFrac = off / 100;
    const a = 1 + gainFrac;
    const b = 1 - offFrac;
    const y = (a * b - 1) * 100;
    if (!Number.isFinite(y)) {
      return null;
    }
    return y;
  };

  const filteredRalphRows = useMemo(() => {
    const term = filterTerm.trim().toUpperCase();
    const base = term
      ? ralphRows.filter((row) => {
          if (row.symbol.includes(term)) {
            return true;
          }
          return row.name.toUpperCase().includes(term);
        })
      : ralphRows;

    const sectorFiltered =
      selectedRalphSectors.length === 0
        ? base
        : base.filter((row) => row.sectorId && selectedRalphSectors.includes(row.sectorId));

    const volumeThreshold =
      volumePreset === "10" ? 10_000_000 : volumePreset === "50" ? 50_000_000 : volumePreset === "200" ? 200_000_000 : 0;
    const volumeFiltered =
      volumeThreshold > 0
        ? sectorFiltered.filter((row) => {
            if (typeof row.avgDollarVol10 !== "number" || Number.isNaN(row.avgDollarVol10)) {
              return false;
            }
            return row.avgDollarVol10 >= volumeThreshold;
          })
        : sectorFiltered;

    const leadersFiltered = leadersNearHighOnly
      ? volumeFiltered.filter((row) => {
          const ralph = row.ralphScore;
          const off = row.pctOffHigh;
          if (
            typeof ralph !== "number" ||
            Number.isNaN(ralph) ||
            typeof off !== "number" ||
            Number.isNaN(off)
          ) {
            return false;
          }
          return ralph >= 3 && off <= 10;
        })
      : volumeFiltered;

    return leadersFiltered;
  }, [filterTerm, ralphRows, selectedRalphSectors, volumePreset, leadersNearHighOnly]);

  const sortedRalphRows = useMemo(() => {
    if (!filteredRalphRows.length) {
      return [];
    }
    const factor = ralphSort.direction === "desc" ? -1 : 1;
    const accessor = (row: SectorRalphRow): number | null => {
      switch (ralphSort.key) {
        case "pctGainToHigh":
          return typeof row.pctGainToHigh === "number" ? row.pctGainToHigh : null;
        case "pctOffHigh":
          return typeof row.pctOffHigh === "number" ? row.pctOffHigh : null;
        case "ytdReturn":
          return computeYtdReturnPct(row);
        case "avgDollarVol10":
          return typeof row.avgDollarVol10 === "number" ? row.avgDollarVol10 : null;
        case "ralphScore":
        default:
          return typeof row.ralphScore === "number" ? row.ralphScore : null;
      }
    };
    return [...filteredRalphRows].sort((a, b) => {
      const aVal = accessor(a);
      const bVal = accessor(b);
      if (aVal === null && bVal === null) {
        return a.symbol.localeCompare(b.symbol);
      }
      if (aVal === null) {
        return 1;
      }
      if (bVal === null) {
        return -1;
      }
      if (aVal !== bVal) {
        return factor * (aVal - bVal);
      }
      return a.symbol.localeCompare(b.symbol);
    });
  }, [filteredRalphRows, ralphSort]);

  const ralphBounds = useMemo(() => {
    const values = sortedRalphRows
      .map((row) => row.ralphScore)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (!values.length) {
      return { min: 0, max: 1 };
    }
    return {
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }, [sortedRalphRows]);

  const rowHighlightStyle = (score: number | null): React.CSSProperties | undefined => {
    if (score === null || Number.isNaN(score)) {
      return undefined;
    }
    const range = ralphBounds.max - ralphBounds.min || 1;
    const normalized = Math.max(0, Math.min(1, (score - ralphBounds.min) / range));
    const intensity = 0.04 + normalized * 0.2;
    return { backgroundColor: `rgba(16, 185, 129, ${intensity})` };
  };

  const handleRalphSortToggle = (key: RalphSortKey) => {
    setRalphSort((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === "desc" ? "asc" : "desc" };
      }
      return { key, direction: "desc" };
    });
  };

  const sortedSectors = useMemo(() => {
    const accessor = (sector: DecoratedSector): number | null => {
      switch (sortPreset.key) {
        case "fiveDayChange":
          return sector.fiveDayChange;
        case "relVol10":
          return sector.relVol10_median;
        case "oneDayChange":
        default:
          return sector.change1d_weighted ?? sector.change1d_median;
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

  const selectedSectorDefinition = useMemo(() => {
    if (!selectedSectorId || !sectorDefinitions) {
      return null;
    }
    return sectorDefinitions.find((sector) => sector.id === selectedSectorId) ?? null;
  }, [sectorDefinitions, selectedSectorId]);

  const selectedPending = selectedSectorId ? pendingTasks[selectedSectorId] : undefined;

  const selectedTickers: DecoratedTicker[] = useMemo(() => {
    if (!selectedSector) {
      return [];
    }
    return selectedSector.members_detail.map(decorateTicker);
  }, [selectedSector]);

  const stockRows: StockRow[] = useMemo(() => {
    if (!sectors.length) {
      return [];
    }
    return sectors.flatMap((sector) =>
      sector.members_detail.map((metric) => ({
        ...decorateTicker(metric),
        sectorId: sector.id,
        sectorName: sector.name,
      })),
    );
  }, [sectors]);

  const filteredStockRows = useMemo(() => {
    const term = filterTerm.trim().toLowerCase();
    if (!term) {
      return stockRows;
    }
    return stockRows.filter((row) => {
      return (
        row.ticker.toLowerCase().includes(term) ||
        row.sectorName.toLowerCase().includes(term)
      );
    });
  }, [stockRows, filterTerm]);

  const tickerComparator = useMemo(() => {
    const factor = tickerSort.direction === "asc" ? 1 : -1;
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
    return (a: DecoratedTicker, b: DecoratedTicker) => {
      if (tickerSort.key === "ticker") {
        return factor * a.ticker.localeCompare(b.ticker);
      }
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
    };
  }, [tickerSort]);

  const sortedTickers = useMemo(() => {
    if (!selectedTickers.length) {
      return [];
    }
    return [...selectedTickers].sort(tickerComparator);
  }, [selectedTickers, tickerComparator]);

  const sortedStockRows = useMemo(() => {
    if (!filteredStockRows.length) {
      return [];
    }
    return [...filteredStockRows].sort(tickerComparator);
  }, [filteredStockRows, tickerComparator]);

  const trackedTickerCount = useMemo(() => {
    return sectors.reduce((acc, sector) => acc + sector.members.length, 0);
  }, [sectors]);

  const refreshSnapshot = useCallback(() => {
    definitionsRef.current = null;
    setSectorDefinitions(null);
    setRefreshKey((value) => value + 1);
  }, [setSectorDefinitions, setRefreshKey]);

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
    refreshSnapshot();
  };

  const startTaskPolling = useCallback(
    (sectorId: string, taskId: string) => {
      let delay = 750;

      const poll = async (): Promise<void> => {
        while (isMountedRef.current) {
          try {
            const status: TaskStatusResponse = await fetchTaskStatus(taskId);
            if (status.status === "succeeded") {
              setPendingTasks((prev) => {
                const next = { ...prev };
                delete next[sectorId];
                return next;
              });
              setMutationError(null);
              refreshSnapshot();
              return;
            }
            if (status.status === "failed") {
              const message =
                typeof status.message === "string" && status.message.trim()
                  ? status.message.trim()
                  : "Sector update failed.";
              setPendingTasks((prev) => ({
                ...prev,
                [sectorId]: {
                  ...(prev[sectorId] ?? { taskId, action: "add" as const }),
                  taskId,
                  status: "failed",
                  message,
                },
              }));
              setMutationError(message);
              return;
            }
          } catch (error: any) {
            const message =
              typeof error?.message === "string" && error.message.trim()
                ? error.message.trim()
                : "Sector update failed.";
            setPendingTasks((prev) => ({
              ...prev,
              [sectorId]: {
                ...(prev[sectorId] ?? { taskId, action: "add" as const }),
                taskId,
                status: "failed",
                message,
              },
            }));
            setMutationError(message);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay = Math.min(delay * 1.5, 5000);
        }
      };

      void poll();
    },
    [refreshSnapshot],
  );

  const toggleEditing = () => {
    if (!selectedSector || !sectorDefinitions) {
      return;
    }
    setIsEditing((value) => !value);
  };

  const handleTickerInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = normalizeTickerInput(event.target.value).slice(0, 10);
    setNewTickerInput(next);
    if (mutationError) {
      setMutationError(null);
    }
  };

  const handleAddTickerSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isEditing) {
      return;
    }

    if (loading) {
      setMutationError("Please wait for the latest snapshot to finish loading.");
      return;
    }

    if (!selectedSector || !selectedSectorId) {
      setMutationError("Select a sector to add tickers.");
      return;
    }

    const normalized = normalizeTickerInput(newTickerInput).slice(0, 10);
    if (!normalized) {
      setMutationError("Enter a ticker symbol.");
      return;
    }

    if (!TICKER_PATTERN.test(normalized)) {
      setMutationError("Use letters, numbers, '.' or '-' (max 10 chars).");
      return;
    }

    if (selectedSector.members.some((ticker) => ticker.toUpperCase() === normalized)) {
      setMutationError(`${normalized} already tracked in ${selectedSector.name}.`);
      return;
    }

    const existing = pendingTasks[selectedSectorId];
    if (existing?.status === "pending") {
      setMutationError("A sector update is already in progress.");
      return;
    }

    try {
      setPendingTasks((prev) => {
        const next = { ...prev };
        delete next[selectedSectorId];
        return next;
      });
      setMutationError(null);
      const { task_id } = await addSectorTicker(selectedSectorId, normalized);
      setPendingTasks((prev) => ({
        ...prev,
        [selectedSectorId]: {
          taskId: task_id,
          status: "pending",
          action: "add",
          symbol: normalized,
        },
      }));
      setNewTickerInput("");
      startTaskPolling(selectedSectorId, task_id);
    } catch (error: any) {
      const message =
        typeof error?.message === "string" && error.message.trim()
          ? error.message.trim()
          : "Unable to add ticker.";
      setMutationError(message);
    }
  };

  const handleRemoveTicker = async (tickerSymbol: string) => {
    if (!isEditing || loading || !selectedSector || !selectedSectorId) {
      return;
    }

    const normalized = normalizeTickerInput(tickerSymbol);
    if (!normalized) {
      return;
    }

    if (!selectedSector.members.some((ticker) => ticker.toUpperCase() === normalized)) {
      setMutationError(`${normalized} is not currently tracked in ${selectedSector.name}.`);
      return;
    }

    const existing = pendingTasks[selectedSectorId];
    if (existing?.status === "pending") {
      setMutationError("A sector update is already in progress.");
      return;
    }

    try {
      setPendingTasks((prev) => {
        const next = { ...prev };
        delete next[selectedSectorId];
        return next;
      });
      setMutationError(null);
      const { task_id } = await removeSectorTicker(selectedSectorId, normalized);
      setPendingTasks((prev) => ({
        ...prev,
        [selectedSectorId]: {
          taskId: task_id,
          status: "pending",
          action: "remove",
          symbol: normalized,
        },
      }));
      startTaskPolling(selectedSectorId, task_id);
    } catch (error: any) {
      const message =
        typeof error?.message === "string" && error.message.trim()
          ? error.message.trim()
          : "Unable to remove ticker.";
      setMutationError(message);
    }
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
      oneDay: formatPercent(selectedSector.change1d_weighted ?? selectedSector.change1d_median, 2),
      fiveDay: formatPercent(selectedSector.fiveDayChange, 2),
      relVol10: formatRelativeVolume(selectedSector.relVol10_median),
    };
  }, [selectedSector]);

  return (
    <section className="mx-auto max-w-6xl space-y-5 text-gray-100">
      <div className="rounded-xl border border-gray-700 bg-[#1E2937] p-4 shadow space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-gray-100">Sector Snapshot</h3>
              <button
                type="button"
                onClick={() => setIsCreatingSector(true)}
                className="inline-flex items-center justify-center rounded-md border border-gray-600 px-2 py-1 text-xs font-semibold text-gray-200 transition hover:border-gray-500 hover:bg-white/5"
              >
                <span className="text-xs font-semibold">+</span>
              </button>
            </div>
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
                onClick={() => setActiveView("sectors")}
                aria-pressed={activeView === "sectors"}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                  activeView === "sectors"
                    ? "bg-gray-900 text-emerald-200 shadow-inner shadow-emerald-900/40"
                    : "text-gray-500/70 hover:text-gray-300"
                }`}
              >
                Sectors
              </button>
              <button
                type="button"
                onClick={() => setActiveView("stocks")}
                aria-pressed={activeView === "stocks"}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                  activeView === "stocks"
                    ? "bg-gray-900 text-emerald-200 shadow-inner shadow-emerald-900/40"
                    : "text-gray-500/70 hover:text-gray-300"
                }`}
              >
                Stocks
              </button>
              <button
                type="button"
                onClick={() => setActiveView("ralph")}
                aria-pressed={activeView === "ralph"}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                  activeView === "ralph"
                    ? "bg-gray-900 text-emerald-200 shadow-inner shadow-emerald-900/40"
                    : "text-gray-500/70 hover:text-gray-300"
                }`}
              >
                RALPH
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

      {activeView === "ralph" ? (
        ralphLoading ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 text-center text-sm text-gray-400">
            Loading RALPH scores…
          </div>
        ) : ralphError ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
            {ralphError}
          </div>
        ) : filteredRalphRows.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 text-center text-sm text-gray-400">
            No RALPH metrics available. Refresh to try again.
          </div>
        ) : (
          <div className="rounded-xl border border-gray-800 bg-[#1E2937] shadow">
            <div className="border-b border-gray-800 px-4 py-3 text-xs text-gray-400">
              RALPH (Risk Adjusted Leadership Performance Heuristic) = YTD surge divided by drawdown from the YTD high. Higher is stronger.
            </div>
            <RalphFilters
              rows={ralphRows}
              selectedSectors={selectedRalphSectors}
              setSelectedSectors={setSelectedRalphSectors}
              volumePreset={volumePreset}
              setVolumePreset={setVolumePreset}
              leadersNearHighOnly={leadersNearHighOnly}
              setLeadersNearHighOnly={setLeadersNearHighOnly}
            />
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-800">
                <thead className="bg-[#24344A] text-xs uppercase tracking-wide text-gray-300">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Rank</th>
                    <th className="px-4 py-3 text-left font-semibold">Symbol</th>
                    <th className="px-4 py-3 text-center font-semibold">Sector</th>
                    <th className="px-4 py-3 text-center font-semibold">YTD Sparkline</th>
                    <th className="px-4 py-3 text-right font-semibold">
                      <button
                        type="button"
                        onClick={() => handleRalphSortToggle("ytdReturn")}
                        className={`group inline-flex w-full items-center justify-end gap-1 text-[11px] font-semibold transition ${
                          ralphSort.key === "ytdReturn"
                            ? "text-emerald-300"
                            : "text-gray-300 hover:text-gray-100"
                        }`}
                      >
                        <span>YTD %</span>
                        {ralphSort.key === "ytdReturn" ? (
                          <SortIndicator active direction={ralphSort.direction} />
                        ) : null}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      <button
                        type="button"
                        onClick={() => handleRalphSortToggle("pctGainToHigh")}
                        className={`group inline-flex w-full items-center justify-end gap-1 text-[11px] font-semibold transition ${
                          ralphSort.key === "pctGainToHigh"
                            ? "text-emerald-300"
                            : "text-gray-300 hover:text-gray-100"
                        }`}
                      >
                        <span>YTD → High %</span>
                        {ralphSort.key === "pctGainToHigh" ? (
                          <SortIndicator active direction={ralphSort.direction} />
                        ) : null}
                      </button>
                    </th>
                      <th className="px-4 py-3 text-right font-semibold">
                        <button
                          type="button"
                        onClick={() => handleRalphSortToggle("pctOffHigh")}
                        className={`group inline-flex w-full items-center justify-end gap-1 text-[11px] font-semibold transition ${
                          ralphSort.key === "pctOffHigh"
                            ? "text-emerald-300"
                            : "text-gray-300 hover:text-gray-100"
                        }`}
                      >
                        <span>% Off High</span>
                        {ralphSort.key === "pctOffHigh" ? (
                          <SortIndicator active direction={ralphSort.direction} />
                        ) : null}
                      </button>
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      <button
                        type="button"
                        onClick={() => handleRalphSortToggle("ralphScore")}
                        className={`group inline-flex w-full items-center justify-end gap-1 text-[11px] font-semibold transition ${
                          ralphSort.key === "ralphScore"
                            ? "text-emerald-300"
                            : "text-gray-300 hover:text-gray-100"
                        }`}
                      >
                        <span>RALPH</span>
                        {ralphSort.key === "ralphScore" ? (
                          <SortIndicator active direction={ralphSort.direction} />
                        ) : null}
                      </button>
                      </th>
                      <th className="px-4 py-3 text-right font-semibold">
                        <button
                          type="button"
                          onClick={() => handleRalphSortToggle("avgDollarVol10")}
                          className={`group inline-flex w-full items-center justify-end gap-1 text-[11px] font-semibold transition ${
                            ralphSort.key === "avgDollarVol10"
                              ? "text-emerald-300"
                              : "text-gray-300 hover:text-gray-100"
                          }`}
                        >
                          <span>Avg $Vol10</span>
                          {ralphSort.key === "avgDollarVol10" ? (
                            <SortIndicator active direction={ralphSort.direction} />
                          ) : null}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                  {sortedRalphRows.map((row) => {
                    const gain = formatPercent(row.pctGainToHigh ?? null, 0);
                    const off = formatOffHigh(row.pctOffHigh ?? null, 1);
                    const ytd = formatPercent(computeYtdReturnPct(row), 0);
                    const baselineRow = row.isBaseline;
                    return (
                      <tr
                        key={row.symbol}
                        className={baselineRow ? "text-indigo-100" : "text-gray-100 hover:bg-[#26374D]"}
                        style={baselineRow ? undefined : rowHighlightStyle(row.ralphScore)}
                      >
                        <td className="px-4 py-3 text-sm text-gray-400">{row.rank}</td>
                        <td className="px-4 py-3 font-mono text-sm">
                          {row.symbol}
                          {baselineRow ? (
                            <span className="ml-2 rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] text-indigo-100">
                              baseline
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-sm text-center">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${sectorBadgeClass(
                              row.sectorId,
                            )}`}
                          >
                            {row.name}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <Sparkline data={row.sparklineCloses} />
                        </td>
                        <td className="px-4 py-3 text-right text-sm">
                          <span className={ytd.tone}>{ytd.text}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm">
                          <span className={gain.tone}>{gain.text}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm">
                          <span className={off.tone}>{off.text}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-emerald-200">
                          {formatRalphScore(row.ralphScore ?? null)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-300">
                          {formatCompactNumber(row.avgDollarVol10)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      ) : loading ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 text-center text-sm text-gray-400">
          Loading snapshot…
        </div>
      ) : activeView === "stocks" ? (
        sortedStockRows.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 text-center text-sm text-gray-400">
            No stocks match your filter. Clear the search to see everything.
          </div>
        ) : (
          <div className="rounded-xl border border-gray-800 bg-[#1E2937] shadow">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-800">
                <thead className="bg-[#24344A] text-xs uppercase tracking-wide text-gray-300">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">
                      {renderTickerSortableHeader("Ticker", "ticker", "left")}
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">Sector</th>
                    <th className="px-4 py-3 text-right font-semibold">
                      {renderTickerSortableHeader("1D%", "change1d")}
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      {renderTickerSortableHeader("5D%", "change5d")}
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      {renderTickerSortableHeader("RelVol10", "relVol10")}
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      {renderTickerSortableHeader("$Vol Today", "dollarVolToday")}
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      {renderTickerSortableHeader("Avg $Vol10", "avgDollarVol10")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800 bg-[#1E2937]">
                  {sortedStockRows.map((row) => {
                    const change1d = formatPercent(row.change1d, 2);
                    const change5d = formatPercent(row.change5d, 2);
                    const relVol = formatRelativeVolume(row.relVol10);
                    return (
                      <tr
                        key={`${row.sectorId}-${row.ticker}`}
                        className="bg-[#1E2937] hover:bg-[#26374D]"
                      >
                        <td className="px-4 py-3 font-mono text-sm text-gray-100">
                          {row.ticker}
                          {row.inactive ? (
                            <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-200">
                              inactive
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">{row.sectorName}</td>
                        <td className={`px-4 py-3 text-right font-mono text-xs ${change1d.tone}`}>
                          {change1d.text}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono text-xs ${change5d.tone}`}>
                          {change5d.text}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-gray-200">
                          {relVol}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-gray-300">
                          {formatCompactNumber(row.dollarVolToday)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs text-gray-300">
                          {formatCompactNumber(row.avgDollarVol10)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
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
                  const oneDayBase = sector.change1d_weighted ?? sector.change1d_median;
                  const oneDay = formatPercent(oneDayBase, 2);
                  const fiveDay = formatPercent(sector.fiveDayChange, 2);
                  const relVol = formatRelativeVolume(sector.relVol10_median);
                  const pending = pendingTasks[sector.id];
                  return (
                    <tr
                      key={sector.id}
                      className={`cursor-pointer transition ${
                        isSelected ? "bg-[#24344A]" : "bg-[#1E2937] hover:bg-[#26374D]"
                      }`}
                      onClick={() => setSelectedSectorId(sector.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-medium ${isSelected ? "text-emerald-200" : "text-gray-200"}`}>
                              {sector.name}
                            </span>
                            {pending ? (
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  pending.status === "pending"
                                    ? "bg-emerald-500/20 text-emerald-200"
                                    : "bg-rose-500/20 text-rose-200"
                                }`}
                              >
                                {pending.status === "pending" ? "Updating…" : "Update failed"}
                              </span>
                            ) : null}
                          </div>
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
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-gray-100">
                  {selectedSector ? selectedSector.name : "Select a sector"}
                </h4>
                <span className="text-xs text-gray-500">
                  {selectedSector ? `${selectedSector.members.length} tickers` : ""}
                </span>
              </div>
              {selectedSector ? (
                <button
                  type="button"
                  onClick={toggleEditing}
                  disabled={!selectedSectorDefinition || loading || selectedPending?.status === "pending"}
                  aria-pressed={isEditing}
                  className={`rounded-md border px-2 py-1 text-xs font-semibold transition ${
                    isEditing
                      ? "border-emerald-400 text-emerald-200 hover:border-emerald-300 hover:text-white"
                      : "border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-100"
                  } disabled:cursor-not-allowed disabled:border-gray-800 disabled:text-gray-500`}
                >
                  {isEditing ? "Done" : "Edit"}
                </button>
              ) : null}
            </div>
            {sectorSummary ? (
              <div className="flex flex-wrap gap-3 text-xs text-gray-400">
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
              <p className="text-xs text-gray-500">
                Choose a sector to see its members and snapshot metrics.
              </p>
            )}
            {selectedPending?.status === "pending" ? (
              <p className="text-xs font-semibold text-emerald-200">Updating sector membership…</p>
            ) : null}
            {selectedPending?.status === "failed" && selectedPending.message ? (
              <p className="text-xs text-rose-300">{selectedPending.message}</p>
            ) : null}

            {selectedSector ? (
              <div className="space-y-3">
                {selectedTickers.length ? (
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
                          {isEditing ? (
                            <th className="px-2 py-2 text-right font-semibold">
                              <span className="sr-only">Remove ticker</span>
                            </th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800 bg-[#1E2937]">
                        {sortedTickers.map((ticker) => {
                          const change1d = formatPercent(ticker.change1d, 2);
                          const change5d = formatPercent(ticker.change5d, 2);
                          const relVol = formatRelativeVolume(ticker.relVol10);
                          return (
                            <tr key={ticker.ticker} className="bg-[#1E2937] hover:bg-[#26374D]">
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
                              {isEditing ? (
                                <td className="px-2 py-2 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveTicker(ticker.ticker)}
                                    disabled={loading || selectedPending?.status === "pending"}
                                    className="rounded-full border border-gray-600 px-2 py-0.5 text-xs font-semibold text-gray-300 transition hover:border-rose-400 hover:text-rose-200 disabled:cursor-not-allowed disabled:border-gray-800 disabled:text-gray-500"
                                    aria-label={`Remove ${ticker.ticker}`}
                                  >
                                    &times;
                                  </button>
                                </td>
                              ) : null}
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
                )}
                {isEditing ? (
                  <div className="space-y-2">
                    <form className="flex items-center gap-2" onSubmit={handleAddTickerSubmit}>
                      <input
                        type="text"
                        value={newTickerInput}
                        onChange={handleTickerInputChange}
                        placeholder="Add ticker"
                        className="w-36 rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-gray-100 placeholder:font-normal placeholder:text-gray-500 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                        disabled={!selectedSector || loading || selectedPending?.status === "pending"}
                        aria-label="Add ticker to sector"
                      />
                      <button
                        type="submit"
                        disabled={!selectedSector || loading || !newTickerInput || selectedPending?.status === "pending"}
                        className="rounded-md border border-emerald-500/60 px-2 py-1 text-xs font-semibold text-emerald-200 transition hover:border-emerald-400 hover:text-white disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-500"
                      >
                        Add
                      </button>
                    </form>
                    {mutationError ? <p className="text-xs text-rose-300">{mutationError}</p> : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-700 bg-[#132030] p-4 text-sm text-gray-400">
                Select a sector to inspect its members.
              </div>
            )}
          </div>
        </div>
      )}
      {isCreatingSector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-700 bg-[#0f172a] p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-100">Create new sector</h3>
              <button
                type="button"
                onClick={closeSectorModal}
                className="text-gray-400 hover:text-gray-100"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="space-y-4 pt-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Sector name
                </label>
                <input
                  type="text"
                  value={newSectorName}
                  onChange={(event) => setNewSectorName(event.target.value)}
                  placeholder="e.g., Clean Energy"
                  className="w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                />
                <p className="text-[11px] text-gray-500">Sector ID will be derived from the name.</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Tickers</span>
                  <button
                    type="button"
                    onClick={addTickerInput}
                    className="text-xs font-semibold text-emerald-300 underline underline-offset-2"
                  >
                    + Add ticker slot
                  </button>
                </div>
                {newSectorTickers.map((ticker, index) => (
                  <div key={`sector-ticker-${index}`} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={ticker}
                      onChange={(event) => updateTickerInput(index, event.target.value)}
                      placeholder="Ticker"
                      className="flex-1 rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    />
                    {newSectorTickers.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => removeTickerInput(index)}
                        className="text-xs font-semibold text-rose-300"
                        aria-label="Remove ticker input"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              {sectorCreationError ? (
                <p className="text-xs text-rose-300">{sectorCreationError}</p>
              ) : null}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeSectorModal}
                  className="rounded-md border border-gray-600 px-3 py-2 text-xs font-semibold text-gray-400 hover:border-gray-500"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateSector}
                  disabled={creatingSector}
                  className="rounded-md bg-emerald-500 px-3 py-2 text-xs font-semibold text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-600"
                >
                  {creatingSector ? "Saving…" : "Save sector"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default SectorWatchlist;
