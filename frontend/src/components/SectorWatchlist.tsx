import React, { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { SectorIn, SectorRalphRow } from "@/lib/api";
import {
  DecoratedSector,
  DecoratedTicker,
  PendingMutation,
  TICKER_PATTERN,
  decorateTicker,
  loadStoredSectorDefinitions,
  normalizeTickerInput,
  persistSectorDefinitions,
  useRalphData,
  useSectorMutations,
  useSectorSnapshot,
  useSnapshotMeta,
} from "@/lib/hooks/sector-data";

type SortDirection = "asc" | "desc";
type SortKey = "oneDayChange" | "fiveDayChange" | "relVol10";
type TickerSortKey =
  | "ticker"
  | "change1d"
  | "change5d"
  | "relVol10"
  | "dollarVolToday"
  | "avgDollarVol10";
type RalphSortKey = "pctGainToHigh" | "pctOffHigh" | "ralphScore" | "ytdReturn" | "avgDollarVol10";

type SortPreset<T extends string> = {
  key: T;
  direction: SortDirection;
};

type ViewMode = "sectors" | "stocks" | "ralph";
type VolumePreset = "all" | "10" | "50" | "200";

type ViewState = {
  mode: ViewMode;
  sectorsSort: SortPreset<SortKey>;
  stocksSort: SortPreset<TickerSortKey>;
  ralphSort: SortPreset<RalphSortKey>;
  volumePreset: VolumePreset;
  leadersNearHigh: boolean;
};

type StockRow = DecoratedTicker & {
  sectorId: string;
  sectorName: string;
};

const VIEW_STATE_KEY = "market-insights:sectors-view-state";

const DEFAULT_VIEW_STATE: ViewState = {
  mode: "sectors",
  sectorsSort: { key: "oneDayChange", direction: "desc" },
  stocksSort: { key: "change1d", direction: "desc" },
  ralphSort: { key: "ralphScore", direction: "desc" },
  volumePreset: "all",
  leadersNearHigh: false,
};

function loadViewState(): ViewState {
  if (typeof window === "undefined") {
    return DEFAULT_VIEW_STATE;
  }
  try {
    const raw = window.localStorage.getItem(VIEW_STATE_KEY);
    if (!raw) {
      return DEFAULT_VIEW_STATE;
    }
    const parsed = JSON.parse(raw) as Partial<ViewState>;
    return { ...DEFAULT_VIEW_STATE, ...parsed };
  } catch {
    return DEFAULT_VIEW_STATE;
  }
}

function formatPercent(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return { text: "—", tone: "text-muted-foreground" };
  }
  const prefix = value >= 0 ? "+" : "";
  return {
    text: `${prefix}${value.toFixed(digits)}%`,
    tone: value >= 0 ? "text-success" : "text-destructive",
  };
}

function formatRelativeVolume(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return `${value.toFixed(2)}×`;
}

function formatCompactNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

function formatDecimal(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return value.toFixed(digits);
}

function formatSnapshotMeta(metaText: string | null | undefined) {
  if (!metaText) {
    return "—";
  }
  return metaText;
}

function ralphHeatClass(score: number | null | undefined) {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return "bg-background-muted text-muted-foreground";
  }
  if (score >= 5) {
    return "bg-trading-emerald/30 text-trading-emerald";
  }
  if (score >= 3.5) {
    return "bg-trading-cyan/30 text-trading-cyan";
  }
  if (score >= 2) {
    return "bg-warning/20 text-warning";
  }
  return "bg-destructive/20 text-destructive";
}

function offHighHeatClass(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "bg-background-muted text-muted-foreground";
  }
  if (value <= 5) {
    return "bg-trading-emerald/20 text-trading-emerald";
  }
  if (value <= 10) {
    return "bg-trading-cyan/20 text-trading-cyan";
  }
  if (value <= 20) {
    return "bg-warning/20 text-warning";
  }
  return "bg-destructive/20 text-destructive";
}

function ralphStatus(row: SectorRalphRow): string {
  if (row.ralphScore === null || Number.isNaN(row.ralphScore)) {
    return "No signal";
  }
  if (row.pctOffHigh !== null && row.pctOffHigh <= 5) {
    return "Near highs";
  }
  if (row.pctOffHigh !== null && row.pctOffHigh <= 15) {
    return "Recovering";
  }
  return row.ralphScore >= 3 ? "Momentum rebuilding" : "Extended pullback";
}

function RalphSparkline({
  data,
  height = 40,
}: {
  data: number[] | null | undefined;
  height?: number;
}) {
  if (!data || !data.length) {
    return <div className="text-body-xs text-muted-foreground">—</div>;
  }
  const width = 120;
  const values = data.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (!values.length) {
    return <div className="text-body-xs text-muted-foreground">—</div>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max > min ? max - min : 1;
  const divisor = values.length > 1 ? values.length - 1 : 1;
  const path = values
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
      aria-label="price trend sparkline"
      className="text-trading-emerald"
    >
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

function DetailMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background p-3">
      <p className="text-body-xs uppercase tracking-[0.25em] text-muted-foreground">{label}</p>
      <p className={cn("text-heading-sm font-semibold", tone)}>{value}</p>
    </div>
  );
}

function sectorSortAccessor(sector: DecoratedSector, key: SortKey): number | null {
  switch (key) {
    case "fiveDayChange":
      return sector.fiveDayChange;
    case "relVol10":
      return sector.relVol10_median;
    case "oneDayChange":
    default:
      return sector.change1d_weighted ?? sector.change1d_median;
  }
}

function stockSortAccessor(row: StockRow, key: TickerSortKey): number | string | null {
  switch (key) {
    case "ticker":
      return row.ticker;
    case "change5d":
      return row.change5d ?? null;
    case "relVol10":
      return row.relVol10 ?? null;
    case "dollarVolToday":
      return row.dollarVolToday ?? null;
    case "avgDollarVol10":
      return row.avgDollarVol10 ?? null;
    case "change1d":
    default:
      return row.change1d ?? null;
  }
}

function ralphAccessor(row: SectorRalphRow, key: RalphSortKey): number | null {
  switch (key) {
    case "pctGainToHigh":
      return row.pctGainToHigh ?? null;
    case "pctOffHigh":
      return row.pctOffHigh ?? null;
    case "ytdReturn": {
      const gain = row.pctGainToHigh;
      const off = row.pctOffHigh;
      if (gain === null || off === null) return null;
      const gainFrac = gain / 100;
      const offFrac = off / 100;
      const y = ( (1 + gainFrac) * (1 - offFrac) - 1 ) * 100;
      return Number.isFinite(y) ? y : null;
    }
    case "avgDollarVol10":
      return row.avgDollarVol10 ?? null;
    case "ralphScore":
    default:
      return row.ralphScore ?? null;
  }
}

function getVolumeThreshold(preset: VolumePreset): number {
  if (preset === "10") return 10_000_000;
  if (preset === "50") return 50_000_000;
  if (preset === "200") return 200_000_000;
  return 0;
}

function PendingStatus({ pending }: { pending?: PendingMutation }) {
  if (!pending) {
    return null;
  }
  if (pending.status === "failed") {
    return (
      <p className="text-body-xs text-destructive">
        {pending.message || "Sector update failed."}
      </p>
    );
  }
  return (
    <p className="text-body-xs text-muted-foreground">
      Update in progress… (task {pending.taskId.slice(0, 6)})
    </p>
  );
}

export default function SectorWatchlist() {
  const [sectorDefinitions, setSectorDefinitions] = useState<SectorIn[] | null>(() =>
    loadStoredSectorDefinitions(),
  );
  const [viewState, setViewState] = useState<ViewState>(() => loadViewState());
  const [searchTerm, setSearchTerm] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [newTickerInput, setNewTickerInput] = useState("");
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [isCreatingSector, setIsCreatingSector] = useState(false);
  const [newSectorName, setNewSectorName] = useState("");
  const [newSectorId, setNewSectorId] = useState("");
  const [newSectorTickers, setNewSectorTickers] = useState<string[]>([""]);
  const [sectorCreationError, setSectorCreationError] = useState<string | null>(null);
  const [creatingSector, setCreatingSector] = useState(false);
  const [selectedRalphRow, setSelectedRalphRow] = useState<SectorRalphRow | null>(null);

  const refreshSnapshot = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  const {
    sectors,
    loading: sectorsLoading,
    error: sectorsError,
  } = useSectorSnapshot(sectorDefinitions, refreshKey);
  const {
    metadata: snapshotMeta,
    error: snapshotError,
  } = useSnapshotMeta(refreshKey);
  const {
    rows: ralphRows,
    loading: ralphLoading,
    error: ralphError,
  } = useRalphData(viewState.mode === "ralph", refreshKey);
  const {
    pendingTasks,
    addTickerToSector,
    removeTickerFromSector,
    createSectorTask,
  } = useSectorMutations(refreshSnapshot);

  useEffect(() => {
    persistSectorDefinitions(sectorDefinitions);
  }, [sectorDefinitions]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(VIEW_STATE_KEY, JSON.stringify(viewState));
  }, [viewState]);

  useEffect(() => {
    if (!sectors.length) {
      setSelectedSectorId(null);
      return;
    }
    if (selectedSectorId && sectors.some((sector) => sector.id === selectedSectorId)) {
      return;
    }
    setSelectedSectorId(sectors[0].id);
  }, [sectors, selectedSectorId]);

  const searchTermLower = searchTerm.trim().toLowerCase();
  const filteredSectors = useMemo(() => {
    if (!searchTermLower) {
      return sectors;
    }
    return sectors.filter((sector) => {
      if (sector.name.toLowerCase().includes(searchTermLower)) {
        return true;
      }
      return sector.members.some((member) => member.toLowerCase().includes(searchTermLower));
    });
  }, [searchTermLower, sectors]);

  const sortedSectors = useMemo(() => {
    const factor = viewState.sectorsSort.direction === "asc" ? 1 : -1;
    return [...filteredSectors].sort((a, b) => {
      const aVal = sectorSortAccessor(a, viewState.sectorsSort.key);
      const bVal = sectorSortAccessor(b, viewState.sectorsSort.key);
      if (aVal === null && bVal === null) {
        return a.name.localeCompare(b.name);
      }
      if (aVal === null) return 1;
      if (bVal === null) return -1;
      if (aVal !== bVal) {
        return factor * (aVal - bVal);
      }
      return a.name.localeCompare(b.name);
    });
  }, [filteredSectors, viewState.sectorsSort]);

  const stockRows: StockRow[] = useMemo(() => {
    return sectors.flatMap((sector) =>
      sector.members_detail.map((metric) => ({
        ...decorateTicker(metric),
        sectorId: sector.id,
        sectorName: sector.name,
      })),
    );
  }, [sectors]);

  const filteredStocks = useMemo(() => {
    if (!searchTermLower) return stockRows;
    return stockRows.filter(
      (row) =>
        row.ticker.toLowerCase().includes(searchTermLower) ||
        row.sectorName.toLowerCase().includes(searchTermLower),
    );
  }, [searchTermLower, stockRows]);

  const sortedStocks = useMemo(() => {
    const factor = viewState.stocksSort.direction === "asc" ? 1 : -1;
    return [...filteredStocks].sort((a, b) => {
      const aVal = stockSortAccessor(a, viewState.stocksSort.key);
      const bVal = stockSortAccessor(b, viewState.stocksSort.key);
      if (typeof aVal === "string" && typeof bVal === "string") {
        return factor * aVal.localeCompare(bVal);
      }
      if (typeof aVal === "string") return 1;
      if (typeof bVal === "string") return -1;
      if (aVal === null && bVal === null) {
        return a.ticker.localeCompare(b.ticker);
      }
      if (aVal === null) return 1;
      if (bVal === null) return -1;
      if (aVal !== bVal) {
        return factor * (aVal - bVal);
      }
      return a.ticker.localeCompare(b.ticker);
    });
  }, [filteredStocks, viewState.stocksSort]);

  const filteredRalphRows = useMemo(() => {
    const term = searchTerm.trim().toUpperCase();
    const base = term
      ? ralphRows.filter((row) => {
          if (row.symbol.includes(term)) return true;
          return row.name.toUpperCase().includes(term);
        })
      : ralphRows;

    const volumeThreshold = getVolumeThreshold(viewState.volumePreset);
    const volumeFiltered =
      volumeThreshold > 0
        ? base.filter((row) => {
            if (typeof row.avgDollarVol10 !== "number") {
              return false;
            }
            return row.avgDollarVol10 >= volumeThreshold;
          })
        : base;

    if (!viewState.leadersNearHigh) {
      return volumeFiltered;
    }

    return volumeFiltered.filter((row) => {
      const ralph = row.ralphScore;
      const off = row.pctOffHigh;
      if (typeof ralph !== "number" || typeof off !== "number") {
        return false;
      }
      return ralph >= 3 && off <= 10;
    });
  }, [ralphRows, searchTerm, viewState.volumePreset, viewState.leadersNearHigh]);

  const sortedRalphRows = useMemo(() => {
    const factor = viewState.ralphSort.direction === "asc" ? 1 : -1;
    return [...filteredRalphRows].sort((a, b) => {
      const aVal = ralphAccessor(a, viewState.ralphSort.key);
      const bVal = ralphAccessor(b, viewState.ralphSort.key);
      if (aVal === null && bVal === null) {
        return a.symbol.localeCompare(b.symbol);
      }
      if (aVal === null) return 1;
      if (bVal === null) return -1;
      if (aVal !== bVal) {
        return factor * (aVal - bVal);
      }
      return a.symbol.localeCompare(b.symbol);
    });
  }, [filteredRalphRows, viewState.ralphSort]);

  const groupedRalphRows = useMemo(() => {
    const groups = new Map<string, { name: string; rows: SectorRalphRow[] }>();
    sortedRalphRows.forEach((row) => {
      const key = row.sectorId ?? `unknown-${row.name}`;
      const name = row.name || "Unassigned";
      const existing = groups.get(key);
      if (existing) {
        existing.rows.push(row);
      } else {
        groups.set(key, { name, rows: [row] });
      }
    });
    return Array.from(groups.entries()).map(([id, group]) => ({ id, ...group }));
  }, [sortedRalphRows]);

  const selectedSector = useMemo(() => {
    if (!selectedSectorId) {
      return null;
    }
    return sectors.find((sector) => sector.id === selectedSectorId) ?? null;
  }, [sectors, selectedSectorId]);

  const selectedTickers = useMemo<DecoratedTicker[]>(() => {
    if (!selectedSector) {
      return [];
    }
    return selectedSector.members_detail.map(decorateTicker);
  }, [selectedSector]);

  const selectedPending = selectedSectorId ? pendingTasks[selectedSectorId] : undefined;

  const handleModeChange = (value: string) => {
    setViewState((prev) => ({ ...prev, mode: value as ViewMode }));
  };

  const toggleSort = (key: SortKey) => {
    setViewState((prev) => ({
      ...prev,
      sectorsSort:
        prev.sectorsSort.key === key
          ? { key, direction: prev.sectorsSort.direction === "desc" ? "asc" : "desc" }
          : { key, direction: "desc" },
    }));
  };

  const toggleStockSort = (key: TickerSortKey) => {
    setViewState((prev) => ({
      ...prev,
      stocksSort:
        prev.stocksSort.key === key
          ? { key, direction: prev.stocksSort.direction === "desc" ? "asc" : "desc" }
          : { key, direction: "desc" },
    }));
  };

  const toggleRalphSort = (key: RalphSortKey) => {
    setViewState((prev) => ({
      ...prev,
      ralphSort:
        prev.ralphSort.key === key
          ? { key, direction: prev.ralphSort.direction === "desc" ? "asc" : "desc" }
          : { key, direction: "desc" },
    }));
  };

  const handleTickerInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setNewTickerInput(normalizeTickerInput(event.target.value).slice(0, 10));
    if (mutationError) {
      setMutationError(null);
    }
  };

  const handleAddTickerSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedSectorId || !selectedSector || !isEditing) {
      setMutationError("Select a sector and enable editing to add tickers.");
      return;
    }

    const normalized = normalizeTickerInput(newTickerInput).slice(0, 10);
    if (!normalized) {
      setMutationError("Enter a ticker symbol.");
      return;
    }
    if (!TICKER_PATTERN.test(normalized)) {
      setMutationError("Use letters, numbers, '.' or '-'.");
      return;
    }
    if (selectedSector.members.some((ticker) => ticker.toUpperCase() === normalized)) {
      setMutationError(`${normalized} already tracked in ${selectedSector.name}.`);
      return;
    }
    const pending = pendingTasks[selectedSectorId];
    if (pending?.status === "pending") {
      setMutationError("A sector update is already running.");
      return;
    }

    try {
      await addTickerToSector(selectedSectorId, normalized);
      setNewTickerInput("");
      setMutationError(null);
    } catch (err: any) {
      setMutationError(
        typeof err?.message === "string" && err.message.trim()
          ? err.message.trim()
          : "Unable to add ticker.",
      );
    }
  };

  const handleRemoveTicker = async (ticker: string) => {
    if (!selectedSectorId || !isEditing) {
      return;
    }
    const normalized = normalizeTickerInput(ticker);
    const pending = pendingTasks[selectedSectorId];
    if (pending?.status === "pending") {
      setMutationError("A sector update is already running.");
      return;
    }
    try {
      await removeTickerFromSector(selectedSectorId, normalized);
      setMutationError(null);
    } catch (err: any) {
      setMutationError(
        typeof err?.message === "string" && err.message.trim()
          ? err.message.trim()
          : "Unable to remove ticker.",
      );
    }
  };

  const handleNewSectorTickerChange = (index: number, value: string) => {
    setNewSectorTickers((prev) => {
      const next = [...prev];
      next[index] = normalizeTickerInput(value).slice(0, 10);
      return next;
    });
  };

  const addTickerField = () => {
    setNewSectorTickers((prev) => [...prev, ""]);
  };

  const removeTickerField = (index: number) => {
    setNewSectorTickers((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleCreateSector = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creatingSector) {
      return;
    }
    const id = newSectorId.trim();
    const name = newSectorName.trim();
    const tickers = newSectorTickers
      .map((ticker) => normalizeTickerInput(ticker))
      .filter(Boolean);

    if (!id || !name) {
      setSectorCreationError("Provide an ID and name for the sector.");
      return;
    }
    if (!tickers.length) {
      setSectorCreationError("Add at least one ticker.");
      return;
    }

    try {
      setCreatingSector(true);
      setSectorCreationError(null);
      const payload: SectorIn = { id, name, tickers };
      await createSectorTask(payload);
      setSectorDefinitions((prev) => {
        const next = prev ? [...prev.filter((sector) => sector.id !== id), payload] : [payload];
        return next;
      });
      setNewSectorId("");
      setNewSectorName("");
      setNewSectorTickers([""]);
      setIsCreatingSector(false);
    } catch (err: any) {
      setSectorCreationError(
        typeof err?.message === "string" && err.message.trim()
          ? err.message.trim()
          : "Unable to create sector.",
      );
    } finally {
      setCreatingSector(false);
    }
  };

  const renderPercentCell = (value: number | null | undefined) => {
    const { text, tone } = formatPercent(value);
    return <span className={cn("font-mono text-body", tone)}>{text}</span>;
  };

  return (
    <section className="space-y-stack">
      <Tabs value={viewState.mode} onValueChange={handleModeChange} className="flex flex-col">
        <div className="sticky top-0 z-10 border-b border-border bg-background">
          <div className="px-shell py-4">
            <div className="flex flex-wrap items-center gap-4">
              <TabsList className="bg-background-raised">
                <TabsTrigger value="sectors">Sectors</TabsTrigger>
                <TabsTrigger value="stocks">Stocks</TabsTrigger>
                <TabsTrigger value="ralph">RALPH</TabsTrigger>
              </TabsList>
              <div className="flex-1 min-w-[220px]">
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search sectors, tickers, stocks"
                  className="bg-background-raised"
                />
              </div>
              <Button variant="secondary" size="sm" onClick={refreshSnapshot}>
                Refresh snapshot
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-body-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Volume preset
                </span>
                <ToggleGroup
                  type="single"
                  value={viewState.volumePreset}
                  onValueChange={(value) => {
                    if (!value) return;
                    setViewState((prev) => ({ ...prev, volumePreset: value as VolumePreset }));
                  }}
                  className="rounded-full bg-background-raised px-1 py-0.5 text-body-xs"
                >
                  {[
                    { value: "all", label: "All" },
                    { value: "10", label: ">10M" },
                    { value: "50", label: ">50M" },
                    { value: "200", label: ">200M" },
                  ].map((preset) => (
                    <ToggleGroupItem
                      key={preset.value}
                      value={preset.value}
                      className="rounded-full px-3 py-1 text-body-xs data-[state=on]:bg-primary/20 data-[state=on]:text-primary"
                      disabled={viewState.mode !== "ralph"}
                    >
                      {preset.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={viewState.leadersNearHigh}
                  onCheckedChange={(checked) =>
                    setViewState((prev) => ({ ...prev, leadersNearHigh: checked }))
                  }
                  disabled={viewState.mode !== "ralph"}
                />
                <span className="text-body text-muted-foreground">Leaders near high (RALPH ≥ 3, off ≤ 10%)</span>
              </div>
            </div>
          </div>
        </div>

        <TabsContent value="sectors" className="mt-0">
          <Card className="bg-background-raised">
            <CardHeader className="flex flex-wrap items-center justify-between gap-3 px-panel pt-panel pb-gutter">
              <div>
                <CardTitle className="text-heading-md">Sector overview</CardTitle>
                <CardDescription className="text-body text-muted-foreground">
                  As of {formatSnapshotMeta(snapshotMeta?.asOfDate)} ·{" "}
                  {formatSnapshotMeta(snapshotMeta?.asOfTimeET)} ET
                </CardDescription>
                {snapshotError ? (
                  <p className="text-body-xs text-destructive mt-1">{snapshotError}</p>
                ) : null}
              </div>
              {sectorsError ? (
                <p className="text-body text-destructive">{sectorsError}</p>
              ) : null}
            </CardHeader>
            <CardContent className="px-panel pb-panel pt-0">
              <ScrollArea className="max-h-[70vh]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead onClick={() => toggleSort("oneDayChange")} className="cursor-pointer">
                        Sector
                      </TableHead>
                      <TableHead
                        className="w-32 cursor-pointer"
                        onClick={() => toggleSort("oneDayChange")}
                      >
                        1D %
                      </TableHead>
                      <TableHead
                        className="hidden w-32 cursor-pointer lg:table-cell"
                        onClick={() => toggleSort("fiveDayChange")}
                      >
                        5D %
                      </TableHead>
                      <TableHead
                        className="hidden w-32 cursor-pointer lg:table-cell"
                        onClick={() => toggleSort("relVol10")}
                      >
                        Rel Vol10
                      </TableHead>
                      <TableHead className="hidden w-28 lg:table-cell">Tickers</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedSectors.map((sector) => {
                      const oneDay = sector.change1d_weighted ?? sector.change1d_median;
                      const fiveDay = sector.fiveDayChange;
                      return (
                        <TableRow
                          key={sector.id}
                          className={cn(
                            "cursor-pointer",
                            selectedSectorId === sector.id && "bg-background-muted",
                          )}
                          onClick={() => setSelectedSectorId(sector.id)}
                        >
                          <TableCell>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <p className="text-heading-sm font-semibold">{sector.name}</p>
                                <Badge variant="outline">{sector.members.length}</Badge>
                              </div>
                              <div className="flex items-center gap-2 text-body-xs text-muted-foreground lg:hidden">
                                <span>5D {formatPercent(fiveDay).text}</span>
                                <span>|</span>
                                <span>RelVol {formatRelativeVolume(sector.relVol10_median)}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{renderPercentCell(oneDay)}</TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {renderPercentCell(fiveDay)}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell font-mono text-body">
                            {formatRelativeVolume(sector.relVol10_median)}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {sector.members.length.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {!sortedSectors.length && !sectorsLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-body text-muted-foreground">
                          No sectors matched your filters.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="bg-background-raised">
            <CardHeader className="flex flex-wrap items-center justify-between gap-3 px-panel pt-panel pb-gutter">
              <div>
                <CardTitle className="text-heading-md">Selected sector</CardTitle>
                <CardDescription className="text-body text-muted-foreground">
                  Manage membership for custom sectors.
                </CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!selectedSector}
                  onClick={() => setIsEditing((value) => !value)}
                >
                  {isEditing ? "Stop editing" : "Edit membership"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-stack px-panel pb-panel pt-0">
              {selectedSector ? (
                <>
                  <div className="flex flex-wrap items-center gap-4 text-body text-muted-foreground">
                    <span className="text-heading-sm font-semibold text-foreground">
                      {selectedSector.name}
                    </span>
                    <span>{selectedSector.members.length} tickers</span>
                    <span>
                      Rel Vol:{" "}
                      <span className="font-mono">
                        {formatRelativeVolume(selectedSector.relVol10_median)}
                      </span>
                    </span>
                    <span>
                      Snapshot:{" "}
                      <span className="font-mono">
                        {selectedSector.lastUpdated ?? "—"}
                      </span>
                    </span>
                  </div>
                  <form
                    className="flex flex-wrap items-center gap-3"
                    onSubmit={handleAddTickerSubmit}
                  >
                    <Input
                      value={newTickerInput}
                      onChange={handleTickerInputChange}
                      placeholder="Add ticker"
                      className="max-w-[200px] bg-background-raised"
                    />
                    <Button type="submit" variant="primary" size="sm" disabled={!isEditing}>
                      Add ticker
                    </Button>
                    {mutationError ? (
                      <p className="text-body-xs text-destructive">{mutationError}</p>
                    ) : null}
                  </form>
                  <PendingStatus pending={selectedPending} />
                  <ScrollArea className="max-h-[260px] rounded-md border border-border bg-background">
                    <ul className="divide-y divide-border">
                      {selectedTickers.map((row) => (
                        <li
                          key={`${row.ticker}-${row.lastUpdated ?? ""}`}
                          className="flex items-center justify-between px-4 py-2"
                        >
                          <div>
                            <p className="font-mono text-body">{row.ticker}</p>
                            <p className="text-body-xs text-muted-foreground">
                              1D {formatPercent(row.change1d).text} · 5D{" "}
                              {formatPercent(row.change5d).text}
                            </p>
                          </div>
                          {isEditing ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveTicker(row.ticker)}
                            >
                              Remove
                            </Button>
                          ) : null}
                        </li>
                      ))}
                      {!selectedTickers.length ? (
                        <li className="px-4 py-6 text-center text-body text-muted-foreground">
                          No tickers available for this sector.
                        </li>
                      ) : null}
                    </ul>
                  </ScrollArea>
                </>
              ) : (
                <p className="text-body text-muted-foreground">Select a sector to edit.</p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-background-raised">
            <CardHeader className="px-panel pt-panel pb-gutter">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-heading-md">Create custom sector</CardTitle>
                  <CardDescription className="text-body text-muted-foreground">
                    Define a custom group of tickers and include it in snapshots.
                  </CardDescription>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setIsCreatingSector((value) => !value)}>
                  {isCreatingSector ? "Close builder" : "New sector"}
                </Button>
              </div>
            </CardHeader>
            {isCreatingSector ? (
              <CardContent className="space-y-stack px-panel pb-panel pt-0">
                <form className="space-y-panel" onSubmit={handleCreateSector}>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="text-body-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Sector ID
                      </label>
                      <Input
                        value={newSectorId}
                        onChange={(event) => setNewSectorId(event.target.value.trim())}
                        placeholder="e.g., custom-growth"
                        className="bg-background-raised"
                      />
                    </div>
                    <div>
                      <label className="text-body-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Sector name
                      </label>
                      <Input
                        value={newSectorName}
                        onChange={(event) => setNewSectorName(event.target.value)}
                        placeholder="Custom Growth"
                        className="bg-background-raised"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-body-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Tickers
                      </label>
                      <Button type="button" variant="ghost" size="sm" onClick={addTickerField}>
                        Add ticker
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {newSectorTickers.map((ticker, index) => (
                        <div key={`new-ticker-${index}`} className="flex items-center gap-2">
                          <Input
                            value={ticker}
                            onChange={(event) => handleNewSectorTickerChange(index, event.target.value)}
                            placeholder="Ticker"
                            className="bg-background-raised"
                          />
                          {newSectorTickers.length > 1 ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeTickerField(index)}
                            >
                              ×
                            </Button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>

                  {sectorCreationError ? (
                    <p className="text-body-xs text-destructive">{sectorCreationError}</p>
                  ) : null}

                  <Button type="submit" variant="primary" size="sm" disabled={creatingSector}>
                    {creatingSector ? "Creating…" : "Create sector"}
                  </Button>
                </form>
              </CardContent>
            ) : null}
          </Card>
        </TabsContent>

        <TabsContent value="stocks" className="mt-0">
          <Card className="bg-background-raised">
            <CardHeader className="px-panel pt-panel pb-gutter">
              <CardTitle className="text-heading-md">Constituent stocks</CardTitle>
              <CardDescription className="text-body text-muted-foreground">
                Filtered across all tracked sectors with liquidity stats.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-panel pb-panel pt-0">
              <ScrollArea className="max-h-[70vh]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead onClick={() => toggleStockSort("ticker")} className="cursor-pointer">
                        Ticker
                      </TableHead>
                      <TableHead className="hidden lg:table-cell">Sector</TableHead>
                      <TableHead onClick={() => toggleStockSort("change1d")} className="cursor-pointer">
                        1D %
                      </TableHead>
                      <TableHead
                        onClick={() => toggleStockSort("change5d")}
                        className="hidden cursor-pointer xl:table-cell"
                      >
                        5D %
                      </TableHead>
                      <TableHead
                        onClick={() => toggleStockSort("relVol10")}
                        className="hidden cursor-pointer xl:table-cell"
                      >
                        Rel Vol10
                      </TableHead>
                      <TableHead
                        onClick={() => toggleStockSort("avgDollarVol10")}
                        className="hidden cursor-pointer 2xl:table-cell"
                      >
                        Avg $Vol10
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedStocks.map((row) => (
                      <TableRow key={`${row.sectorId}-${row.ticker}`}>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-mono text-heading-sm">{row.ticker}</p>
                            <p className="text-body-xs text-muted-foreground lg:hidden">
                              {row.sectorName}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">{row.sectorName}</TableCell>
                        <TableCell>{renderPercentCell(row.change1d)}</TableCell>
                        <TableCell className="hidden xl:table-cell">
                          {renderPercentCell(row.change5d)}
                        </TableCell>
                        <TableCell className="hidden xl:table-cell font-mono">
                          {formatRelativeVolume(row.relVol10)}
                        </TableCell>
                        <TableCell className="hidden 2xl:table-cell font-mono">
                          {formatCompactNumber(row.avgDollarVol10)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {!sortedStocks.length && !sectorsLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-body text-muted-foreground">
                          No stocks matched your filters.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ralph" className="mt-0">
          <Card className="bg-background-raised">
            <CardHeader className="px-panel pt-panel pb-gutter">
              <CardTitle className="text-heading-md">RALPH leaders</CardTitle>
              <CardDescription className="text-body text-muted-foreground">
                Grouped by sector with heatmap cues for top leadership.
              </CardDescription>
              {ralphError ? (
                <p className="text-body-xs text-destructive">{ralphError}</p>
              ) : null}
            </CardHeader>
            <CardContent className="px-panel pb-panel pt-0">
              <ScrollArea className="max-h-[70vh]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[160px]">Symbol</TableHead>
                      <TableHead className="hidden lg:table-cell">Sector</TableHead>
                      <TableHead
                        onClick={() => toggleRalphSort("pctGainToHigh")}
                        className="cursor-pointer"
                      >
                        % gain to high
                      </TableHead>
                      <TableHead
                        onClick={() => toggleRalphSort("pctOffHigh")}
                        className="cursor-pointer"
                      >
                        % off high
                      </TableHead>
                      <TableHead
                        onClick={() => toggleRalphSort("ralphScore")}
                        className="cursor-pointer"
                      >
                        RALPH
                      </TableHead>
                      <TableHead
                        onClick={() => toggleRalphSort("ytdReturn")}
                        className="hidden cursor-pointer xl:table-cell"
                      >
                        YTD %
                      </TableHead>
                      <TableHead
                        onClick={() => toggleRalphSort("avgDollarVol10")}
                        className="hidden cursor-pointer xl:table-cell"
                      >
                        Avg $Vol10
                      </TableHead>
                      <TableHead className="hidden xl:table-cell">Trend</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupedRalphRows.map((group) => (
                      <React.Fragment key={group.id}>
                        <TableRow className="bg-background-muted/60">
                          <TableCell colSpan={8}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Badge variant="outline" className="text-body font-semibold">
                                  {group.name}
                                </Badge>
                                <span className="text-body-xs text-muted-foreground">
                                  {group.rows.length} leaders
                                </span>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                        {group.rows.map((row) => {
                          const gain = formatPercent(row.pctGainToHigh, 1);
                          const off = formatPercent(row.pctOffHigh, 1);
                          const ytd = ralphAccessor(row, "ytdReturn");
                          const handleSelect = () => setSelectedRalphRow(row);
                          const onRowKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedRalphRow(row);
                            }
                          };
                          return (
                            <TableRow
                              key={`${group.id}-${row.rank}`}
                              className="cursor-pointer hover:bg-background-muted"
                              onClick={handleSelect}
                              onKeyDown={onRowKeyDown}
                              tabIndex={0}
                            >
                              <TableCell>
                                <div className="space-y-1">
                                  <p className="font-mono text-heading-sm">{row.symbol}</p>
                                  <div className="text-body-xs text-muted-foreground lg:hidden">
                                    {group.name}
                                  </div>
                                  <div className="block lg:hidden">
                                    <RalphSparkline data={row.sparklineCloses} height={30} />
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="hidden lg:table-cell">{group.name}</TableCell>
                              <TableCell>
                                <span className={cn("font-mono", gain.tone)}>{gain.text}</span>
                              </TableCell>
                              <TableCell>
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded px-2 py-0.5 font-mono text-body-sm",
                                    offHighHeatClass(row.pctOffHigh),
                                  )}
                                >
                                  {off.text}
                                </span>
                              </TableCell>
                              <TableCell>
                                <span
                                  className={cn(
                                    "inline-flex items-center rounded px-2 py-0.5 font-mono text-body-sm",
                                    ralphHeatClass(row.ralphScore),
                                  )}
                                >
                                  {formatDecimal(row.ralphScore, 1)}
                                </span>
                              </TableCell>
                              <TableCell className="hidden xl:table-cell">
                                {renderPercentCell(ytd)}
                              </TableCell>
                              <TableCell className="hidden xl:table-cell font-mono">
                                {formatCompactNumber(row.avgDollarVol10)}
                              </TableCell>
                              <TableCell className="hidden xl:table-cell">
                                <RalphSparkline data={row.sparklineCloses} />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </React.Fragment>
                    ))}
                    {!groupedRalphRows.length && !ralphLoading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-body text-muted-foreground">
                          No candidates matched your filters.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <Sheet
        open={Boolean(selectedRalphRow)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRalphRow(null);
          }
        }}
      >
        <SheetContent
          side="right"
          className="w-full border-l border-border bg-background sm:max-w-md lg:max-w-xl"
        >
          {selectedRalphRow ? (
            <>
              <SheetHeader>
                <SheetTitle className="text-heading-lg">
                  {selectedRalphRow.symbol}
                </SheetTitle>
                <SheetDescription className="text-body text-muted-foreground">
                  {ralphStatus(selectedRalphRow)} · {selectedRalphRow.name}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-stack py-panel">
                <div className="rounded-xl border border-border bg-background-muted p-4">
                  <p className="text-body-xs uppercase tracking-[0.25em] text-muted-foreground">
                    Trend snapshot
                  </p>
                  <div className="mt-3">
                    <RalphSparkline data={selectedRalphRow.sparklineCloses} height={80} />
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <DetailMetric
                    label="RALPH score"
                    value={formatDecimal(selectedRalphRow.ralphScore, 2)}
                    tone={ralphHeatClass(selectedRalphRow.ralphScore)}
                  />
                  <DetailMetric
                    label="% off high"
                    value={formatPercent(selectedRalphRow.pctOffHigh, 2).text}
                    tone={offHighHeatClass(selectedRalphRow.pctOffHigh)}
                  />
                  <DetailMetric
                    label="% gain to high"
                    value={formatPercent(selectedRalphRow.pctGainToHigh, 2).text}
                  />
                  <DetailMetric
                    label="YTD return"
                    value={formatPercent(ralphAccessor(selectedRalphRow, "ytdReturn"), 2).text}
                  />
                  <DetailMetric
                    label="Avg $Vol10"
                    value={formatCompactNumber(selectedRalphRow.avgDollarVol10)}
                  />
                  <DetailMetric
                    label="Rank"
                    value={selectedRalphRow.rank?.toString() ?? "—"}
                  />
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}
