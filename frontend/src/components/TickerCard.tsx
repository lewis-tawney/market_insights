import React, { useEffect, useState } from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { fetchTrend } from "../lib/api";
import type { TrendResponse } from "../lib/api";

interface TickerCardProps {
  symbol: string;
  accentColor?: string;
}

export function TickerCard({ symbol, accentColor }: TickerCardProps) {
  const [data, setData] = useState<TrendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const trendData = await fetchTrend(symbol);
        if (!alive) return;
        setData(trendData);
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || "Failed to load trend data");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [symbol]);

  const dailyPct = data?.price != null && data?.prev_close != null
    ? (data.price / data.prev_close - 1) * 100
    : null;

  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "—";
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  };

  const formatPrice = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "—";
    return `$${value.toFixed(2)}`;
  };

  const formatSmaPrice = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "—";
    return value.toFixed(2);
  };

  const formatSmaPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined) {
      return { text: "—", color: "text-muted-foreground" };
    }
    const isPositive = value >= 0;
    const color = isPositive ? "text-success" : "text-destructive";
    return { text: `${isPositive ? "+" : ""}${value.toFixed(1)}%`, color };
  };


  if (loading) {
    return (
      <Card className="h-full animate-pulse bg-background-raised">
        <CardHeader className="space-y-2 px-panel pt-panel pb-gutter">
          <div className="h-4 w-32 rounded bg-background-muted" />
          <div className="mt-2 h-6 w-40 rounded bg-background-muted" />
        </CardHeader>
        <CardContent className="space-y-3 px-panel pb-panel pt-0">
          <div className="h-3 w-full rounded bg-background-muted" />
          <div className="h-3 w-2/3 rounded bg-background-muted" />
          <div className="h-3 w-3/4 rounded bg-background-muted" />
          <div className="h-3 w-1/2 rounded bg-background-muted" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="h-full bg-background-raised">
        <CardContent className="flex h-full items-center justify-center px-panel pb-panel pt-panel">
          <p className="text-body text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full bg-background-raised">
      <CardHeader className="space-y-2 px-panel pt-panel pb-gutter">
        <div className="flex items-center gap-2">
          {accentColor ? (
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: accentColor }}
              aria-hidden="true"
            />
          ) : null}
          <CardTitle className="text-heading-md text-foreground">{symbol}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-3 px-panel pb-panel pt-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-heading-lg font-semibold text-foreground">
              {formatPrice(data?.price)}
            </p>
          </div>
          <p
            className={`text-heading-sm font-semibold ${
              dailyPct && dailyPct < 0 ? "text-destructive" : "text-success"
            }`}
          >
            {formatPercent(dailyPct)}
          </p>
        </div>

        <div className="rounded-lg border border-border/70 bg-background p-3 space-y-3">
          {[
            {
              title: "SMA distance",
              rows: [
                { label: "10d", value: data?.sma10 },
                { label: "20d", value: data?.sma20 },
                { label: "50d", value: data?.sma50 },
                { label: "200d", value: data?.sma200 },
              ],
            },
            {
              title: "EMA distance",
              rows: [
                { label: "9d", value: data?.ema9 },
                { label: "21d", value: data?.ema21 },
              ],
            },
          ].map((block) => (
            <div key={block.title} className="space-y-1.5">
              <div className="flex items-center justify-between text-body-xs uppercase tracking-[0.25em] text-muted-foreground">
                <span>{block.title}</span>
                <span>Δ%</span>
              </div>
              <div className="space-y-1">
                {block.rows.map(({ label, value }) => {
                  const percentDiff =
                    data?.price && value ? (data.price / value - 1) * 100 : null;
                  const formatted = formatSmaPercent(percentDiff);
                  return (
                    <div
                      key={`${block.title}-${label}`}
                      className="flex items-center justify-between text-body-sm font-mono"
                    >
                      <span className="text-muted-foreground">{label}</span>
                      <div className="flex items-center gap-4">
                        <span>{formatSmaPrice(value)}</span>
                        <span className={cn("text-right", formatted.color)}>
                          {formatted.text}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
