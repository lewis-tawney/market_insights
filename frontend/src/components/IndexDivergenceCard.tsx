import { useEffect, useRef } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  IChartApi,
  ISeriesApi,
  LineData,
  LineSeries,
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

const DEFAULT_CHART_HEIGHT = 320;
const CHART_BG = "#141823";
const CHART_GRID = "#2a3040";
const CHART_TEXT = "#dee5ff";

const PST_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  month: "short",
  day: "numeric",
});

const DAILY_PERIOD = "6mo";
const DAILY_INTERVAL = "1d";

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
  return PST_DATE_FORMATTER.format(date);
}

const pstTickFormatter = (time: Time) => formatTimeToPst(time);

function normalizeDailySeries(points: StockPoint[]): LineData[] {
  const ordered = points
    .filter((point) => point && typeof point.close === "number" && point.time)
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  if (!ordered.length) {
    return [];
  }

  const baseline = ordered[0].close;
  if (!baseline || baseline === 0) {
    return [];
  }

  return ordered.map((point) => {
    const timestamp = Math.floor(new Date(point.time).getTime() / 1000) as UTCTimestamp;
    const percentChange = ((point.close - baseline) / baseline) * 100;
    return {
      time: timestamp,
      value: Number(percentChange.toFixed(2)),
    };
  });
}

async function fetchSeries(symbol: string, signal: AbortSignal): Promise<LineData[]> {
  try {
    const base = (API_BASE || "/api").replace(/\/$/, "");
    const url = `${base}/stock/${encodeURIComponent(symbol)}?period=${DAILY_PERIOD}&interval=${DAILY_INTERVAL}`;
    const response = await fetch(url, { signal });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${symbol} data`);
    }

    const payload = (await response.json()) as StockPoint[];
    return normalizeDailySeries(payload);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return [];
    }
    console.error(`Failed to load data for ${symbol}`, error);
    return [];
  }
}

export function IndexDivergenceCard() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<Record<string, ISeriesApi<"Line">>>({});

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight || DEFAULT_CHART_HEIGHT,
      layout: {
        background: { color: CHART_BG },
        textColor: CHART_TEXT,
      },
      rightPriceScale: {
        borderColor: CHART_GRID,
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      localization: {
        timeFormatter: formatTimeToPst,
      },
      timeScale: {
        borderColor: CHART_GRID,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: pstTickFormatter,
      },
      grid: {
        horzLines: { color: CHART_GRID },
        vertLines: { color: CHART_GRID },
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
      const series = chart.addSeries(LineSeries, {
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
      chartRef.current.applyOptions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight || DEFAULT_CHART_HEIGHT,
      });
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

      let hasData = false;

      results.forEach(({ symbol, data }) => {
        const series = seriesRefs.current[symbol];
        if (!series) {
          return;
        }
        series.setData(data);
        if (data.length > 0) {
          hasData = true;
        }
      });

      if (hasData && chartRef.current) {
        chartRef.current.timeScale().fitContent();
      }
    }

    loadData();

    return () => {
      controller.abort();
    };
  }, []);

  return (
    <Card className="bg-background-raised">
      <CardHeader className="gap-3 px-panel pt-panel pb-gutter">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <CardTitle className="text-heading-md">Index Divergence</CardTitle>
          <div className="flex flex-wrap items-center gap-3 text-body text-muted-foreground">
            {INDEX_SERIES.map(({ symbol, color }) => (
              <span key={symbol} className="inline-flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                {symbol}
              </span>
            ))}
          </div>
        </div>
        <CardDescription className="text-body text-muted-foreground">
          Daily performance over the last six months, normalised to each index&apos;s first
          close.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 px-panel pb-panel pt-0">
        <div
          ref={containerRef}
          className="mt-2 h-[260px] w-full min-w-0 overflow-hidden rounded-lg border border-border/80 bg-background md:h-[320px] xl:h-[360px]"
        />
      </CardContent>
    </Card>
  );
}
