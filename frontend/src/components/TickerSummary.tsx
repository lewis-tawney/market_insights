import React, { useEffect, useMemo, useState } from "react";
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
    <div className="rounded-xl border bg-white shadow p-4">
      <div className="text-sm text-gray-600 mb-3">{trend?.as_of || "—"}</div>

      {/* Top row with price and technical indicators */}
      <div className="flex gap-6 mb-3">
        {/* Price section - same width as performance metrics below */}
        <div className="flex items-end gap-3">
          <div className="text-2xl font-semibold tracking-tight">{symbol}</div>
          <div className="text-2xl font-mono">{fixed2(trend?.price)}</div>
          <div className={`text-lg font-semibold ${dailyPct && dailyPct < 0 ? "text-red-600" : "text-green-700"}`}>
            {percent(dailyPct, { sign: true })}
          </div>
        </div>

        {/* RSI section */}
        <div className="flex-1">
          <div className="text-center">
            <div className="text-sm text-gray-500 mb-1">RSI</div>
            <div className={`text-2xl font-bold ${(rsi?.rsi ?? 0) > 70 ? "text-red-600" : (rsi?.rsi ?? 0) < 30 ? "text-green-700" : "text-gray-700"}`}>
              {rsi?.rsi ? rsi.rsi.toFixed(1) : "—"}
            </div>
          </div>
        </div>

        {/* VIX section */}
        <div className="flex-1">
          <div className="text-center">
            <div className="text-sm text-gray-500 mb-1">VIX</div>
            <div className="text-2xl font-bold text-gray-700">
              {vix?.value ? vix.value.toFixed(1) : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Performance metrics row */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1">
          <span className="text-gray-500">5D:</span>
          <span className={`${(momentum?.r5d_pct ?? 0) < 0 ? "text-red-600" : "text-green-700"}`}>
            {percent(momentum?.r5d_pct ?? undefined)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-500">1M:</span>
          <span className={`${(momentum?.r1m_pct ?? 0) < 0 ? "text-red-600" : "text-green-700"}`}>
            {percent(momentum?.r1m_pct ?? undefined)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-500">MTD:</span>
          <span className={`${(rets?.MTD ?? 0) < 0 ? "text-red-600" : "text-green-700"}`}>
            {percent(rets?.MTD ?? undefined)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-500">YTD:</span>
          <span className={`${(rets?.YTD ?? 0) < 0 ? "text-red-600" : "text-green-700"}`}>
            {percent(rets?.YTD ?? undefined)}
          </span>
        </div>
      </div>

      {loading && <div className="mt-2 text-xs text-gray-500">Loading…</div>}
      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
    </div>
  );
}
