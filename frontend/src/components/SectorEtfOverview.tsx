import React, { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
    return { text: "—", tone: "text-muted-foreground" };
  }
  const sign = value >= 0 ? "+" : "";
  const tone = value >= 0 ? "text-success" : "text-destructive";
  return { text: `${sign}${value.toFixed(2)}%`, tone };
}

export default function SectorEtfOverview(): React.ReactElement {
  const [snapshots, setSnapshots] = useState<Record<string, TickerSnapshot>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
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

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <Card className="flex h-full min-h-0 min-w-0 flex-col bg-background-raised">
        <CardHeader className="flex items-center justify-between px-panel pt-panel pb-gutter">
          <CardTitle className="text-heading-md">Sector Overview</CardTitle>
          <div className="flex items-center gap-2 text-body-xs text-muted-foreground">
            {latestDate ? <span>{latestDate}</span> : null}
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={dialogOpen}
                className="text-body-xs text-muted-foreground hover:text-foreground"
              >
                Table
              </Button>
            </DialogTrigger>
          </div>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col px-panel pb-panel pt-0">
          <ul
            className="grid min-h-0 list-none gap-2 p-0"
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
                  className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-3 rounded-lg border border-border bg-background px-3 py-3"
                >
                  <span
                    className="h-8 w-1 rounded-full"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                  <Badge
                    variant="outline"
                    className="flex h-8 w-12 items-center justify-center font-mono text-body"
                  >
                    {symbol}
                  </Badge>
                  <div className="min-w-0">
                    <p className="text-body font-semibold text-foreground">{name}</p>
                    <p className="text-body-xs text-muted-foreground">
                      {loading ? "Loading…" : error ? error : "\u00A0"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 text-right">
                    <p className={`text-heading-sm font-semibold ${display.tone}`}>
                      {display.text}
                    </p>
                    <div className="relative flex h-2 w-24 overflow-hidden rounded-full bg-background-muted">
                      <span className="pointer-events-none absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-border" />
                      <div className="relative flex-1">
                        <div
                          className="absolute inset-y-0 right-0 rounded-l-full bg-destructive/70 transition-all duration-300"
                          style={{ width: `${negativeFill}%` }}
                        />
                      </div>
                      <div className="relative flex-1">
                        <div
                          className="absolute inset-y-0 left-0 rounded-r-full bg-success/80 transition-all duration-300"
                          style={{ width: `${positiveFill}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <DialogContent className="max-w-4xl space-y-4 bg-background-raised">
        <DialogHeader>
          <DialogTitle className="text-heading-md">Sector Performance</DialogTitle>
          <DialogDescription className="text-body text-muted-foreground">
            Toggle the % day column to flip between gainers and laggards.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-border bg-background">
          <ScrollArea className="max-h-[60vh]">
            <Table>
              <TableHeader className="sticky top-0 bg-background-raised">
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSortToggle}
                      className="h-auto px-2 py-0 text-body-xs text-muted-foreground hover:text-foreground"
                    >
                      % Day
                      <span className="ml-2 text-[10px] uppercase">{sortDirection}</span>
                    </Button>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedEtfs.map(({ symbol, name }) => {
                  const snapshot = snapshots[symbol];
                  const dayChange = computeChangePct(snapshot?.trend ?? null);
                  const dayDisplay = formatPercent(dayChange);
                  return (
                    <TableRow key={`table-${symbol}`}>
                      <TableCell className="font-mono text-body">{symbol}</TableCell>
                      <TableCell className="text-body text-muted-foreground">{name}</TableCell>
                      <TableCell className={`text-right font-semibold ${dayDisplay.tone}`}>
                        {dayDisplay.text}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
