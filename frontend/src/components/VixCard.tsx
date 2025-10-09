import React, { useEffect, useState } from "react";
import { fetchVIX } from "../lib/api";
import type { VixResponse } from "../lib/api";

export function VixCard() {
  const [data, setData] = useState<VixResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const vixData = await fetchVIX();
        if (!alive) return;
        setData(vixData);
      } catch (err: any) {
        if (!alive) return;
        setError(err?.message || "Failed to load VIX data");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const formatValue = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "—";
    return value.toFixed(1);
  };

  const getVixLevel = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "text-gray-400";
    if (value < 20) return "text-green-600";
    if (value < 30) return "text-yellow-600";
    return "text-red-600";
  };

  const getVixLabel = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "—";
    if (value < 20) return "Low";
    if (value < 30) return "Moderate";
    return "High";
  };

  if (loading) {
    return (
      <div className="rounded-xl border bg-white shadow p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
          <div className="h-6 bg-gray-200 rounded w-1/2 mb-2"></div>
          <div className="h-3 bg-gray-200 rounded w-2/3"></div>
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
    <div className="rounded-xl border bg-white shadow p-3">
      {/* Header */}
      <div className="mb-2">
        <div className="text-sm font-semibold text-gray-800">VIX</div>
      </div>

      {/* VIX Value */}
      <div className="mb-2">
        <div className={`text-lg font-mono font-semibold ${getVixLevel(data?.value)}`}>
          {formatValue(data?.value)}
        </div>
        <div className={`text-xs ${getVixLevel(data?.value)}`}>
          {getVixLabel(data?.value)}
        </div>
      </div>

      {/* 7-Day Average */}
      <div className="text-xs">
        <div className="text-gray-600">7D: {formatValue(data?.avg7)}</div>
      </div>
    </div>
  );
}
