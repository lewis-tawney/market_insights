import React, { useEffect, useState } from "react";
import { fetchTrend } from "../lib/api";
import type { TrendResponse } from "../lib/api";

interface TrendCardProps {
  symbol: string;
}

export function TrendCard({ symbol }: TrendCardProps) {
  const [data, setData] = useState<TrendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const trendData = await fetchTrend(symbol);
        if (!alive) return;
        setData(trendData);
        setError(null);
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || "Failed to load trend data");
      }
    })();
    return () => {
      alive = false;
    };
  }, [symbol]);

  const formatPercent = (value?: number | null) => {
    if (value === undefined || value === null) return "—";
    return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
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
    const pctDiff =
      price != null && sma ? (price - sma) / sma : null;
    const isAbove = above ?? (pctDiff != null && pctDiff > 0);
    return (
      <div className="flex items-center text-xs">
        <div className="text-gray-600 w-14 flex-shrink-0">{label}</div>
        <div className="font-mono w-14 text-right flex-shrink-0">
          {sma ? sma.toFixed(2) : "—"}
        </div>
        <span
          className={`px-1 py-0.5 rounded text-xs w-14 text-center mx-1 flex-shrink-0 ${
            isAbove ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-700"
          }`}
        >
          {isAbove ? "Above" : "Below"}
        </span>
        <div className="font-mono w-14 text-right text-gray-600 flex-shrink-0">
          {formatPercent(pctDiff)}
        </div>
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
