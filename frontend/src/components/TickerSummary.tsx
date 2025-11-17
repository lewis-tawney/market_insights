import React, { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

import { percent, fixed2 } from "../lib/format";
// Local metrics fetches using env-based API base
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

type Trend = {
  symbol: string;
  as_of: string;
  price: number;
  prev_close?: number;
};

type Momentum = {
  symbol: string;
  as_of: string;
  r5d_pct: number | null;
  r1m_pct: number | null;
  r3m_pct: number | null;
};

type Returns = {
  MTD?: number | null;
  YTD?: number | null;
};

type Rsi = {
  symbol: string;
  as_of: string;
  rsi: number | null;
  state: string | null;
};

type Vix = {
  value: number | null;
  avg7: number | null;
};

interface Props {
  symbol: string;
}

export default function TickerSummary({ symbol }: Props) {
  const [trend, setTrend] = useState<Trend | null>(null);
  const [momentum, setMomentum] = useState<Momentum | null>(null);
  const [rets, setRets] = useState<Returns | null>(null);
  const [rsi, setRsi] = useState<Rsi | null>(null);
  const [vix, setVix] = useState<Vix | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function fetchAll() {
      setLoading(true);
      setError(null);
      try {
        const [tRes, mRes, rRes, rsiRes, vixRes] = await Promise.all([
          getJSON<Trend>(`/metrics/trend?symbol=${encodeURIComponent(symbol)}`),
          getJSON<Momentum>(`/metrics/momentum?symbol=${encodeURIComponent(symbol)}`),
          getJSON<Returns>(`/metrics/returns?symbol=${encodeURIComponent(symbol)}&windows=MTD,YTD`),
          getJSON<Rsi>(`/metrics/rsi?symbol=${encodeURIComponent(symbol)}`),
          getJSON<Vix>(`/metrics/vix`),
        ]);
        if (!alive) return;
        setTrend(tRes);
        setMomentum(mRes);
        setRets(rRes);
        setRsi(rsiRes);
        setVix(vixRes);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    }
    fetchAll();
    return () => {
      alive = false;
    };
  }, [symbol]);

  const dailyPct = useMemo(() => {
    if (!trend?.price || trend?.prev_close == null) return undefined;
    if (!Number.isFinite(trend.prev_close) || trend.prev_close === 0) return undefined;
    return trend.price / trend.prev_close - 1;
  }, [trend]);

  return (
    <Card className="bg-background-raised">
      <CardHeader className="px-panel pt-panel pb-gutter">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="px-3 py-1 text-heading-sm font-semibold">
              {symbol}
            </Badge>
            <p
              className={`text-heading-md font-semibold ${
                dailyPct && dailyPct < 0 ? "text-destructive" : "text-success"
              }`}
            >
              {percent(dailyPct, { sign: true })}
            </p>
          </div>
          <CardDescription className="text-body text-muted-foreground">
            {trend?.as_of || "—"}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-gutter px-panel pb-panel pt-0">
        <div className="flex flex-wrap gap-panel">
          <div>
            <p className="text-body-xs uppercase tracking-[0.3em] text-muted-foreground">
              Last price
            </p>
            <p className="text-heading-xl font-semibold text-foreground">
              {fixed2(trend?.price)}
            </p>
          </div>
          <div className="min-w-[120px]">
            <p className="text-body-xs uppercase tracking-[0.3em] text-muted-foreground text-center">
              RSI
            </p>
            <p
              className={`text-heading-lg text-center font-semibold ${
                (rsi?.rsi ?? 0) > 70
                  ? "text-warning"
                  : (rsi?.rsi ?? 0) < 30
                    ? "text-success"
                    : "text-foreground"
              }`}
            >
              {rsi?.rsi ? rsi.rsi.toFixed(1) : "—"}
            </p>
          </div>
          <div className="min-w-[120px]">
            <p className="text-body-xs uppercase tracking-[0.3em] text-muted-foreground text-center">
              VIX
            </p>
            <p className="text-heading-lg text-center font-semibold text-foreground">
              {vix?.value ? vix.value.toFixed(1) : "—"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-body">
          {[
            { label: "5D", value: momentum?.r5d_pct },
            { label: "1M", value: momentum?.r1m_pct },
            { label: "MTD", value: rets?.MTD },
            { label: "YTD", value: rets?.YTD },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center gap-2">
              <span className="text-muted-foreground">{label}:</span>
              <span className={`${(value ?? 0) < 0 ? "text-destructive" : "text-success"}`}>
                {percent(value ?? undefined)}
              </span>
            </div>
          ))}
        </div>

        {loading ? <p className="text-body-xs text-muted-foreground">Loading…</p> : null}
        {error ? <p className="text-body-xs text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
