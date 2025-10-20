import { useEffect, useRef } from "react";
import {
  IChartApi,
  ISeriesApi,
  LineData,
  Time,
  UTCTimestamp,
  createChart,
} from "lightweight-charts";
import { BASE as API_BASE } from "../lib/api";

export type SymbolConfig = {
  symbol: string;
  color: string;
};

type StockPoint = {
  time: string;
  close: number;
};

export const INDEX_SERIES: SymbolConfig[] = [
  { symbol: "SPY", color: "#1f78b4" },
  { symbol: "QQQ", color: "#8e5dd0" },
  { symbol: "IWM", color: "#ff8c42" },
];

const PST_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const PST_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  month: "short",
  day: "numeric",
});

const SESSION_PADDING_SECONDS = 5 * 60; // pad edges so 6:30 AM label isn't clipped

function timeToDate(time: Time): Date {
  if (typeof time === "number") {
    return new Date(time * 1000);
  }
  if (typeof time === "string") {
    return new Date(time);
  }
  return new Date(Date.UTC(time.year, time.month - 1, time.day));
}

function formatTimeToPst(time: Time): string {
  const date = timeToDate(time);
  if (typeof time === "number") {
    return PST_TIME_FORMATTER.format(date);
  }
  return PST_DATE_FORMATTER.format(date);
}

const pstTickFormatter = (time: Time) => formatTimeToPst(time);

function getDateKey(iso: string): string {
  const date = new Date(iso);
  return date.toISOString().slice(0, 10);
}

function extractSession(points: StockPoint[]): { session: StockPoint[]; baseline: number | null } {
  if (!points.length) {
    return { session: [], baseline: null };
  }

  const sorted = [...points].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  const dates = sorted.map((p) => getDateKey(p.time));
  const lastDate = dates[dates.length - 1];

  const session = sorted.filter((p) => getDateKey(p.time) === lastDate);
  const priorPoints = sorted.filter((p) => getDateKey(p.time) < lastDate);

  const baseline = priorPoints.length
    ? priorPoints[priorPoints.length - 1].close
    : session.length
      ? session[0].close
      : null;

  return { session, baseline };
}

function normalizeSeries(points: StockPoint[], baseline: number | null): LineData[] {
  if (!points.length || !baseline || baseline === 0) {
    return [];
  }

  return points.map((point) => {
    const timestamp = Math.floor(new Date(point.time).getTime() / 1000) as UTCTimestamp;
    const percentChange = ((point.close - baseline) / baseline) * 100;
    return {
      time: timestamp,
      value: Number(percentChange.toFixed(4)),
    };
  });
}

async function fetchSeries(symbol: string, signal: AbortSignal): Promise<LineData[]> {
  try {
    const base = (API_BASE || "/api").replace(/\/$/, "");
    const url = `${base}/stock/${encodeURIComponent(symbol)}?period=2d&interval=5m`;
    const response = await fetch(url, { signal });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${symbol} data`);
    }

    const payload = (await response.json()) as StockPoint[];
    const filtered = payload.filter((item) => item && typeof item.close === "number" && item.time);

    const { session, baseline } = extractSession(filtered);

    return normalizeSeries(session, baseline);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return [];
    }
    console.error(`Failed to load data for ${symbol}`, error);
    return [];
  }
}

export function IndexComparisonCard() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<Record<string, ISeriesApi<"Line">>>({});

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 225,
      layout: {
        background: { color: "#1f2937" },
        textColor: "#f3f4f6",
      },
      rightPriceScale: {
        borderColor: "#1f2937",
        borderVisible: false,
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      localization: {
        timeFormatter: formatTimeToPst,
      },
      timeScale: {
        borderColor: "#1f2937",
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: pstTickFormatter,
      },
      grid: {
        horzLines: { color: "#374151" },
        vertLines: { color: "#374151" },
      },
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: false,
        horzTouchDrag: false,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: false,
        mouseWheel: false,
        pinch: false,
      },
    });

    chartRef.current = chart;

    INDEX_SERIES.forEach(({ symbol, color }) => {
      const series = chart.addLineSeries({
        color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
      });
      series.applyOptions({
        priceFormat: {
          type: "custom",
          minMove: 0.01,
          formatter: (price: number) => `${price.toFixed(2)}%`,
        },
      });
      seriesRefs.current[symbol] = series;
    });

    const resizeHandler = () => {
      if (!containerRef.current || !chartRef.current) {
        return;
      }
      chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
    };

    window.addEventListener("resize", resizeHandler);

    return () => {
      window.removeEventListener("resize", resizeHandler);
      chart.remove();
      chartRef.current = null;
      seriesRefs.current = {};
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadData() {
      const results = await Promise.all(
        INDEX_SERIES.map(async ({ symbol }) => {
          const data = await fetchSeries(symbol, controller.signal);
          return { symbol, data };
        }),
      );

      if (controller.signal.aborted) {
        return;
      }

      let earliestTime: number | null = null;
      let latestTime: number | null = null;

      results.forEach(({ symbol, data }) => {
        const series = seriesRefs.current[symbol];
        if (!series) {
          return;
        }
        series.setData(data);

        if (data.length === 0) {
          return;
        }

        data.forEach(({ time }) => {
          if (typeof time !== "number") {
            return;
          }
          earliestTime = earliestTime === null ? time : Math.min(earliestTime, time);
          latestTime = latestTime === null ? time : Math.max(latestTime, time);
        });
      });

      if (earliestTime !== null && latestTime !== null && chartRef.current) {
        const timeScale = chartRef.current.timeScale();
        const paddedFrom = Math.max(0, earliestTime - SESSION_PADDING_SECONDS) as UTCTimestamp;
        const paddedTo = (latestTime + SESSION_PADDING_SECONDS) as UTCTimestamp;
        timeScale.setVisibleRange({
          from: paddedFrom,
          to: paddedTo,
        });
      }
    }

    loadData();

    return () => {
      controller.abort();
    };
  }, []);

  return (
    <div className="bg-gray-800 rounded shadow p-3.5">
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="font-semibold text-gray-100 text-[19px]">Index Divergence</h2>
        <div className="flex gap-3 text-[13px] text-gray-400">
          {INDEX_SERIES.map(({ symbol, color }) => (
            <div key={symbol} className="flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: color }}
              />
              {symbol}
            </div>
          ))}
        </div>
      </div>
      <p className="text-[13px] text-gray-400 mb-3.5">
        Five-minute performance for the latest full trading day vs previous close.
      </p>
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
