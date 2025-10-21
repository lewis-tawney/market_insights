import React, { useEffect, useState } from "react";
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
    if (value === null || value === undefined) return { text: "—", color: "text-gray-400" };
    const color = value >= 0 ? "text-green-400" : "text-red-400";
    return { text: `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`, color };
  };


  if (loading) {
    return (
      <div className="bg-gray-800 rounded shadow p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-600 rounded w-1/4 mb-2"></div>
          <div className="h-6 bg-gray-600 rounded w-1/2 mb-4"></div>
          <div className="space-y-2">
            <div className="h-3 bg-gray-600 rounded"></div>
            <div className="h-3 bg-gray-600 rounded"></div>
            <div className="h-3 bg-gray-600 rounded"></div>
            <div className="h-3 bg-gray-600 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-800 rounded shadow p-4">
        <div className="text-red-400 text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded shadow p-4">
      {/* Header */}
      <div className="mb-3">
        <div className="flex items-center gap-2">
          {accentColor ? (
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: accentColor }}
            />
          ) : null}
          <div className="text-xl font-bold text-gray-100">{symbol}</div>
        </div>
      </div>

      {/* Price and Daily Change */}
      <div className="flex items-end gap-3 mb-4">
        <div className="text-3xl font-bold text-gray-100">
          {formatPrice(data?.price)}
        </div>
        <div className={`text-lg font-semibold ${
          dailyPct && dailyPct < 0 ? "text-red-400" : "text-primary-500"
        }`}>
          {formatPercent(dailyPct)}
        </div>
      </div>

      {/* SMA Distance from Price */}
      <div className="space-y-1">
        <div className="text-sm text-gray-400 mb-1 text-center">SMA</div>

        <div className="space-y-0.5">
          <div className="flex items-center justify-between text-xs px-2 py-0.5">
            <span className="text-gray-400 font-mono w-8 text-left">10d</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-gray-200">{formatSmaPrice(data?.sma10)}</span>
              <span className={`text-xs font-mono ${formatSmaPercent(data?.price && data?.sma10 ? (data.price / data.sma10 - 1) * 100 : null).color}`}>
                {formatSmaPercent(data?.price && data?.sma10 ? (data.price / data.sma10 - 1) * 100 : null).text}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs px-2 py-0.5">
            <span className="text-gray-400 font-mono w-8 text-left">20d</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-gray-200">{formatSmaPrice(data?.sma20)}</span>
              <span className={`text-xs font-mono ${formatSmaPercent(data?.price && data?.sma20 ? (data.price / data.sma20 - 1) * 100 : null).color}`}>
                {formatSmaPercent(data?.price && data?.sma20 ? (data.price / data.sma20 - 1) * 100 : null).text}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs px-2 py-0.5">
            <span className="text-gray-400 font-mono w-8 text-left">50d</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-gray-200">{formatSmaPrice(data?.sma50)}</span>
              <span className={`text-xs font-mono ${formatSmaPercent(data?.price && data?.sma50 ? (data.price / data.sma50 - 1) * 100 : null).color}`}>
                {formatSmaPercent(data?.price && data?.sma50 ? (data.price / data.sma50 - 1) * 100 : null).text}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs px-2 py-0.5">
            <span className="text-gray-400 font-mono w-8 text-left">200d</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-gray-200">{formatSmaPrice(data?.sma200)}</span>
              <span className={`text-xs font-mono ${formatSmaPercent(data?.price && data?.sma200 ? (data.price / data.sma200 - 1) * 100 : null).color}`}>
                {formatSmaPercent(data?.price && data?.sma200 ? (data.price / data.sma200 - 1) * 100 : null).text}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* EMA */}
      <div className="space-y-1">
        <div className="text-sm text-gray-400 mb-1 text-center">EMA</div>
        
        <div className="space-y-0.5">
          <div className="flex items-center justify-between text-xs px-2 py-0.5">
            <span className="text-gray-400 font-mono w-8 text-left">9d</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-gray-200">{formatSmaPrice(data?.ema9)}</span>
              <span className={`text-xs font-mono ${formatSmaPercent(data?.price && data?.ema9 ? (data.price / data.ema9 - 1) * 100 : null).color}`}>
                {formatSmaPercent(data?.price && data?.ema9 ? (data.price / data.ema9 - 1) * 100 : null).text}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs px-2 py-0.5">
            <span className="text-gray-400 font-mono w-8 text-left">21d</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-gray-200">{formatSmaPrice(data?.ema21)}</span>
              <span className={`text-xs font-mono ${formatSmaPercent(data?.price && data?.ema21 ? (data.price / data.ema21 - 1) * 100 : null).color}`}>
                {formatSmaPercent(data?.price && data?.ema21 ? (data.price / data.ema21 - 1) * 100 : null).text}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
