import { useEffect, useRef, useState } from "react";
import {
  CandlestickData,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  createChart,
} from "lightweight-charts";
import { BASE as API_BASE } from "../lib/api";

interface StockCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ChartComponentProps {
  symbol: string;
  period?: string;
}

export function ChartComponent({ symbol, period = "1mo" }: ChartComponentProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { color: "#ffffff" },
        textColor: "#333333",
      },
      grid: {
        horzLines: { color: "#e5e7eb" },
        vertLines: { color: "#e5e7eb" },
      },
      rightPriceScale: { borderColor: "#e5e7eb" },
      timeScale: { borderColor: "#e5e7eb" },
    });

    const series = chart.addCandlestickSeries({
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderUpColor: "#26a69a",
      borderDownColor: "#ef5350",
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const resizeHandler = () => {
      if (!containerRef.current || !chartRef.current) {
        return;
      }
      chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
    };

    window.addEventListener("resize", resizeHandler);

    setIsReady(true);

    return () => {
      window.removeEventListener("resize", resizeHandler);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isReady || !seriesRef.current) {
      return undefined;
    }

    const controller = new AbortController();

    const fetchData = async () => {
      if (!seriesRef.current) {
        return;
      }

      try {
        const base = (API_BASE || "/api").replace(/\/$/, "");
        const url = `${base}/stock/${encodeURIComponent(symbol)}?period=${encodeURIComponent(period)}`;
        const response = await fetch(url, { signal: controller.signal });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const payload: StockCandle[] = await response.json();
        const candles: CandlestickData[] = payload.map((item) => ({
          time: (Math.floor(new Date(item.time).getTime() / 1000) as unknown) as UTCTimestamp,
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
        }));

        seriesRef.current.setData(candles);
      } catch (error) {
        console.error("Failed to load stock data", error);
        seriesRef.current.setData([]);
      }
    };

    fetchData();
    return () => controller.abort();
  }, [symbol, period, isReady]);

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">{symbol} Chart</h2>
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
