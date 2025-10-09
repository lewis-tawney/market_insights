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

  const getSmaStatus = (above: boolean | null | undefined) => {
    if (above === null || above === undefined) return "text-gray-400";
    return above ? "text-green-600" : "text-red-600";
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

      {/* SMAs */}
      <div className="space-y-1">
        <div className="text-sm font-medium text-gray-700 mb-2">SMA</div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">10</span>
            <div className="flex items-center gap-1">
              <span className="font-mono text-xs">{formatPrice(data?.sma10)}</span>
              <span className={`text-xs ${getSmaStatus(data?.above10)}`}>
                {data?.price && data?.sma10 ?
                  `${((data.price / data.sma10 - 1) * 100) >= 0 ? '+' : ''}${((data.price / data.sma10 - 1) * 100).toFixed(1)}%` : "—"}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">20</span>
            <div className="flex items-center gap-1">
              <span className="font-mono text-xs">{formatPrice(data?.sma20)}</span>
              <span className={`text-xs ${getSmaStatus(data?.above20)}`}>
                {data?.price && data?.sma20 ?
                  `${((data.price / data.sma20 - 1) * 100) >= 0 ? '+' : ''}${((data.price / data.sma20 - 1) * 100).toFixed(1)}%` : "—"}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">50</span>
            <div className="flex items-center gap-1">
              <span className="font-mono text-xs">{formatPrice(data?.sma50)}</span>
              <span className={`text-xs ${getSmaStatus(data?.above50)}`}>
                {data?.price && data?.sma50 ?
                  `${((data.price / data.sma50 - 1) * 100) >= 0 ? '+' : ''}${((data.price / data.sma50 - 1) * 100).toFixed(1)}%` : "—"}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">200</span>
            <div className="flex items-center gap-1">
              <span className="font-mono text-xs">{formatPrice(data?.sma200)}</span>
              <span className={`text-xs ${getSmaStatus(data?.above200)}`}>
                {data?.price && data?.sma200 ?
                  `${((data.price / data.sma200 - 1) * 100) >= 0 ? '+' : ''}${((data.price / data.sma200 - 1) * 100).toFixed(1)}%` : "—"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
