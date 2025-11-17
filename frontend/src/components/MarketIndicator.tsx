import React, { useEffect, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { fixed2 } from "../lib/format";
// Breadth functionality removed
import type { TrendResponse, VixResponse } from "../lib/api";

const BASE = "/api";
function join(base: string, path: string): string {
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}
async function getJSON<T>(path: string): Promise<T> {
  const url = join(BASE, path);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const text = await res.text();
    throw new Error(`Expected JSON, got: ${text.slice(0, 120)}...`);
  }
  return res.json();
}

type Vix = VixResponse;
type Rsi = { symbol: string; as_of: string; rsi: number; state: string };

export function VixCard(): React.ReactElement {
  const [data, setData] = useState<Vix | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await getJSON<VixResponse>(`/metrics/vix`);
        if (!alive) return;
        setData(d);
      } catch (e: any) {
        if (alive) setError(e?.message || "Failed");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return (
    <Card className="bg-background-raised">
      <CardHeader className="space-y-1 px-panel pt-panel pb-gutter">
        <CardTitle className="text-heading-sm">Volatility (VIX)</CardTitle>
        <CardDescription className="text-body text-muted-foreground">
          Spot and 7-day smoothing from volatility feed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-panel pb-panel pt-0">
        <div>
          <p className="text-body-xs uppercase tracking-[0.3em] text-muted-foreground">
            Index
          </p>
          <p className="text-heading-lg font-mono text-foreground">
            {fixed2(data?.value ?? undefined)}
          </p>
        </div>
        <p className="text-body text-muted-foreground">
          7-day avg:{" "}
          <span className="font-semibold text-foreground">
            {fixed2(data?.avg7 ?? undefined)}
          </span>
        </p>
        {error ? <p className="text-body-xs text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

// BreadthCard removed - breadth functionality not needed

interface RsiCardProps {
  symbol: string;
}
export function RsiCard({ symbol }: RsiCardProps) {
  const [data, setData] = useState<Rsi | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await getJSON<Rsi>(`/metrics/rsi?symbol=${encodeURIComponent(symbol)}`);
        if (!alive) return;
        setData(d);
      } catch (e: any) {
        if (alive) setError(e?.message || "Failed");
      }
    })();
    return () => {
      alive = false;
    };
  }, [symbol]);
  const isExtreme = data?.rsi !== undefined && (data.rsi > 70 || data.rsi < 30);
  const statusTone = !data?.rsi
    ? "text-muted-foreground"
    : isExtreme
      ? "text-warning"
      : "text-foreground";
  return (
    <Card className="bg-background-raised">
      <CardHeader className="space-y-1 px-panel pt-panel pb-gutter">
        <CardTitle className="text-heading-sm">RSI (14)</CardTitle>
        <CardDescription className="text-body text-muted-foreground">
          {symbol} swing state from the trend engine.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-panel pb-panel pt-0">
        <p className={`text-heading-lg font-mono ${statusTone}`}>{fixed2(data?.rsi)}</p>
        <p className="text-body text-muted-foreground">{data?.state ?? "—"}</p>
        <div className="mt-1 h-2 w-full rounded-full bg-background-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.max(0, Math.min(100, data?.rsi ?? 0))}%` }}
          />
        </div>
        {error ? <p className="text-body-xs text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}

interface TrendCardProps { symbol: string }
export function TrendCard({ symbol }: TrendCardProps) {
  const [data, setData] = useState<TrendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await getJSON<TrendResponse>(`/metrics/trend?symbol=${encodeURIComponent(symbol)}`);
        if (!alive) return;
        setData(d);
      } catch (e: any) {
        if (alive) setError(e?.message || "Failed");
      }
    })();
    return () => { alive = false };
  }, [symbol]);

  const formatPercent = (value?: number) => {
    if (value === undefined || value === null) {
      return { text: "—", color: "text-muted-foreground" };
    }
    const color = value >= 0 ? "text-success" : "text-destructive";
    return { text: `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`, color };
  };

  const Row = ({
    label,
    sma,
    price,
  }: {
    label: string;
    sma?: number | null;
    price?: number | null;
  }) => {
    // Calculate percentage distance from SMA: (current_price - sma) / sma * 100
    const percentDiff =
      price != null && sma != null && sma !== 0 ? ((price - sma) / sma) * 100 : undefined;

    return (
      <div className="flex items-center text-body">
        <div className="w-16 flex-shrink-0 text-body font-semibold text-muted-foreground">
          {label}
        </div>
        <div className="w-20 flex-shrink-0 text-right font-mono text-foreground">
          {sma ? sma.toFixed(1) : "—"}
        </div>
        <div
          className={`w-20 flex-shrink-0 text-right font-mono ${formatPercent(percentDiff).color}`}
        >
          {formatPercent(percentDiff).text}
        </div>
      </div>
    );
  };

  return (
    <Card className="bg-background-raised">
      <CardHeader className="space-y-1 px-panel pt-panel pb-gutter">
        <CardTitle className="text-heading-sm">Trend</CardTitle>
        <CardDescription className="text-body text-muted-foreground">
          SMA distances for {symbol}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5 px-panel pb-panel pt-0">
        <Row label="SMA 10" sma={data?.sma10} price={data?.price} />
        <Row label="SMA 20" sma={data?.sma20} price={data?.price} />
        <Row label="SMA 50" sma={data?.sma50} price={data?.price} />
        <Row label="SMA 200" sma={data?.sma200} price={data?.price} />
        {error ? <p className="pt-2 text-body-xs text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
