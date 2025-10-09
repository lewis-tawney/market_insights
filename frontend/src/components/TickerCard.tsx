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
    if (value === null || value === undefined) return "—";
    const absValue = Math.abs(value);
    const arrow = value >= 0 ? "↑" : "↓";
    const color = value >= 0 ? "text-green-600" : "text-red-600";
    return { text: `${arrow}${absValue.toFixed(1)}%`, color };
  };

  const getHeatmapColor = (percent: number | null | undefined) => {
    if (percent === null || percent === undefined) return "";
    const absPercent = Math.abs(percent);
    if (absPercent >= 10) return "bg-red-50";
    if (absPercent >= 5) return "bg-orange-50";
    if (absPercent >= 2) return "bg-yellow-50";
    return "";
  };

  if (loading) {
    return (
      <div className="rounded-xl border bg-white shadow p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
          <div className="h-6 bg-gray-200 rounded w-1/2 mb-4"></div>
          <div className="space-y-2">
            <div className="h-3 bg-gray-200 rounded"></div>
            <div className="h-3 bg-gray-200 rounded"></div>
            <div className="h-3 bg-gray-200 rounded"></div>
            <div className="h-3 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border bg-white shadow p-4">
        <div className="text-red-600 text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white shadow p-4">
      {/* Header */}
      <div className="mb-3">
        <div className="flex items-center gap-2">
          {accentColor ? (
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: accentColor }}
            />
          ) : null}
          <div className="text-lg font-semibold text-gray-800">{symbol}</div>
        </div>
      </div>

      {/* Price and Daily Change */}
      <div className="flex items-end gap-3 mb-4">
        <div className="text-2xl font-mono font-semibold">
          {formatPrice(data?.price)}
        </div>
        <div className={`text-lg font-semibold ${
          dailyPct && dailyPct < 0 ? "text-red-600" : "text-green-700"
        }`}>
          {formatPercent(dailyPct)}
        </div>
      </div>

      {/* SMA Distance from Price */}
      <div className="space-y-1">
        <div className="text-sm font-medium text-gray-700 mb-2 text-center">SMA</div>

        <div className="space-y-1">
          {(() => {
            const sma10Percent = data?.price && data?.sma10 ? (data.price / data.sma10 - 1) * 100 : null;
            const sma10Formatted = formatSmaPercent(sma10Percent);
            return (
              <div className={`flex items-center justify-between text-sm px-2 py-1 rounded ${getHeatmapColor(sma10Percent)}`}>
                <span className="text-gray-600 font-mono w-10 text-left">10d</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs">{formatSmaPrice(data?.sma10)}</span>
                  <span className={`text-xs font-mono ${sma10Formatted.color}`}>
                    {sma10Formatted.text}
                  </span>
                </div>
              </div>
            );
          })()}

          {(() => {
            const sma20Percent = data?.price && data?.sma20 ? (data.price / data.sma20 - 1) * 100 : null;
            const sma20Formatted = formatSmaPercent(sma20Percent);
            return (
              <div className={`flex items-center justify-between text-sm px-2 py-1 rounded ${getHeatmapColor(sma20Percent)}`}>
                <span className="text-gray-600 font-mono w-10 text-left">20d</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs">{formatSmaPrice(data?.sma20)}</span>
                  <span className={`text-xs font-mono ${sma20Formatted.color}`}>
                    {sma20Formatted.text}
                  </span>
                </div>
              </div>
            );
          })()}

          {(() => {
            const sma50Percent = data?.price && data?.sma50 ? (data.price / data.sma50 - 1) * 100 : null;
            const sma50Formatted = formatSmaPercent(sma50Percent);
            return (
              <div className={`flex items-center justify-between text-sm px-2 py-1 rounded ${getHeatmapColor(sma50Percent)}`}>
                <span className="text-gray-600 font-mono w-10 text-left">50d</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs">{formatSmaPrice(data?.sma50)}</span>
                  <span className={`text-xs font-mono ${sma50Formatted.color}`}>
                    {sma50Formatted.text}
                  </span>
                </div>
              </div>
            );
          })()}

          {(() => {
            const sma200Percent = data?.price && data?.sma200 ? (data.price / data.sma200 - 1) * 100 : null;
            const sma200Formatted = formatSmaPercent(sma200Percent);
            return (
              <div className={`flex items-center justify-between text-sm px-2 py-1 rounded ${getHeatmapColor(sma200Percent)}`}>
                <span className="text-gray-600 font-mono w-10 text-left">200d</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs">{formatSmaPrice(data?.sma200)}</span>
                  <span className={`text-xs font-mono ${sma200Formatted.color}`}>
                    {sma200Formatted.text}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* EMA */}
      <div className="space-y-1">
        <div className="text-sm font-medium text-gray-700 mb-2 text-center">EMA</div>
        
        <div className="space-y-1">
          {(() => {
            const ema9Percent = data?.price && data?.ema9 ? (data.price / data.ema9 - 1) * 100 : null;
            const ema9Formatted = formatSmaPercent(ema9Percent);
            return (
              <div className={`flex items-center justify-between text-sm px-2 py-1 rounded ${getHeatmapColor(ema9Percent)}`}>
                <span className="text-gray-600 font-mono w-10 text-left">9d</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs">{formatSmaPrice(data?.ema9)}</span>
                  <span className={`text-xs font-mono ${ema9Formatted.color}`}>
                    {ema9Formatted.text}
                  </span>
                </div>
              </div>
            );
          })()}

          {(() => {
            const ema21Percent = data?.price && data?.ema21 ? (data.price / data.ema21 - 1) * 100 : null;
            const ema21Formatted = formatSmaPercent(ema21Percent);
            return (
              <div className={`flex items-center justify-between text-sm px-2 py-1 rounded ${getHeatmapColor(ema21Percent)}`}>
                <span className="text-gray-600 font-mono w-10 text-left">21d</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs">{formatSmaPrice(data?.ema21)}</span>
                  <span className={`text-xs font-mono ${ema21Formatted.color}`}>
                    {ema21Formatted.text}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
