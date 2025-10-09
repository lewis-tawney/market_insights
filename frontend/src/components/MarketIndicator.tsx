import React, { useEffect, useState } from "react";
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

type BreadthData = {
  date: string;
  n_elig: number;
  n_up4: number;
  n_dn4: number;
  up10: number;
  dn10: number;
  r5: number;
  r10: number;
  n_up25m: number;
  n_dn25m: number;
  n_up50m: number;
  n_dn50m: number;
  n_up25q: number;
  n_dn25q: number;
  n_up13x34: number;
  n_dn13x34: number;
  d34_13: number;
};

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
    <div className="rounded-xl border bg-white shadow p-4">
      <div className="text-sm text-gray-600">Volatility (VIX)</div>
      <div className="mt-1 text-2xl font-mono">{fixed2(data?.value ?? undefined)}</div>
      <div className="text-sm text-gray-600">7-Day Avg: {fixed2(data?.avg7 ?? undefined)}</div>
      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
    </div>
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
  const statusTone = !data?.rsi ? "text-gray-700" : data.rsi > 70 || data.rsi < 30 ? "text-red-600" : "text-gray-700";
  return (
    <div className="rounded-xl border bg-white shadow p-4">
      <div className="text-sm text-gray-600">RSI (14)</div>
      <div className={`mt-1 text-2xl font-mono ${statusTone}`}>{fixed2(data?.rsi)}</div>
      <div className="text-sm text-gray-600">{data?.state ?? "—"}</div>
      <div className="mt-2 h-2 w-full rounded bg-gray-100">
        <div className="h-2 rounded bg-blue-500" style={{ width: `${Math.max(0, Math.min(100, data?.rsi ?? 0))}%` }} />
      </div>
      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
    </div>
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
    if (value === undefined || value === null) return "—";
    return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
  };

  const Row = ({
    label,
    sma,
    above,
    price,
  }: {
    label: string;
    sma?: number | null;
    above?: boolean | null;
    price?: number | null;
  }) => {
    // Calculate percentage distance from SMA: (current_price - sma) / sma * 100
    const percentDiff =
      price != null && sma != null && sma !== 0 ? ((price - sma) / sma) * 100 : undefined;
    const isAbove = above ?? (percentDiff !== undefined && percentDiff > 0);

    return (
      <div className="flex items-center text-xs">
        <div className="text-gray-600 w-14 flex-shrink-0">{label}</div>
        <div className="font-mono w-14 text-right flex-shrink-0">{sma ? sma.toFixed(1) : "—"}</div>
        <span className={`px-1 py-0.5 rounded text-xs w-14 text-center mx-1 flex-shrink-0 ${isAbove ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-700"}`}>
          {isAbove ? "Above" : "Below"}
        </span>
        <div className="font-mono w-14 text-right text-gray-600 flex-shrink-0">{formatPercent(percentDiff)}</div>
      </div>
    );
  };

  return (
    <div className="rounded-xl border bg-white shadow p-4">
      <div className="text-sm text-gray-600">Trend</div>
      <div className="mt-2 space-y-1">
        <Row label="SMA 10" sma={data?.sma10} above={data?.above10} price={data?.price} />
        <Row label="SMA 20" sma={data?.sma20} above={data?.above20} price={data?.price} />
        <Row label="SMA 50" sma={data?.sma50} above={data?.above50} price={data?.price} />
        <Row label="SMA 200" sma={data?.sma200} above={data?.above200} price={data?.price} />
      </div>
      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
    </div>
  );
}
