import type { OhlcPoint } from "./api";

export type SectorDefinition = {
  id: string;
  name: string;
  tickers: string[];
};

export type TrendSnapshot = {
  change: number | null;
};

export type TickerSeries = OhlcPoint[] | null | undefined;

export type LeaderboardLeader = {
  ticker: string;
  change: number | null;
};

export type LeaderboardRow = {
  id: string;
  name: string;
  tickers: string[];
  metrics: {
    oneDayChange: number | null;
    fiveDayChange: number | null;
    sparkline: number[];
    relVol10: number | null;
    volume: number | null;
    avgVolume10: number | null;
    volumeMomentum: number | null;
    leaders: LeaderboardLeader[];
  };
};

export type LeaderboardSortKey = "relVol10" | "oneDayChange" | "fiveDayChange";
export type LeaderboardSortDirection = "asc" | "desc";
export type LeaderboardSortPreset = {
  key: LeaderboardSortKey;
  direction: LeaderboardSortDirection;
};

export interface BuildLeaderboardArgs {
  sectors: SectorDefinition[];
  trendMap: Record<string, TrendSnapshot | undefined>;
  seriesMap: Record<string, TickerSeries>;
}

export type VolumeStats = {
  latest: number | null;
  avg10: number | null;
};

type DailyChange = {
  date: string;
  change: number;
};

function toFinite(value: number | null | undefined): number | null {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function toDateKey(value: string): string {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  if (value.includes("T")) {
    return value.slice(0, value.indexOf("T"));
  }
  return value;
}

function computeDailyReturns(series: OhlcPoint[]): DailyChange[] {
  if (!series.length) {
    return [];
  }
  const sorted = [...series]
    .filter((point) => typeof point.close === "number" && point.close !== null)
    .sort((a, b) => {
      const aTime = Date.parse(a.time);
      const bTime = Date.parse(b.time);
      if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
        return a.time.localeCompare(b.time);
      }
      return aTime - bTime;
    });

  const changes: DailyChange[] = [];

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const prevClose = toFinite(prev.close);
    const currClose = toFinite(curr.close);
    if (prevClose === null || currClose === null || prevClose === 0) {
      continue;
    }
    const pct = ((currClose - prevClose) / prevClose) * 100;
    changes.push({
      date: toDateKey(curr.time),
      change: pct,
    });
  }

  return changes;
}

export function computeVolumeStats(series: OhlcPoint[] | undefined | null): VolumeStats {
  if (!series || !series.length) {
    return { latest: null, avg10: null };
  }

  const valid = series
    .filter((point) => typeof point.volume === "number" && point.volume !== null)
    .sort((a, b) => {
      const aTime = Date.parse(a.time);
      const bTime = Date.parse(b.time);
      if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
        return a.time.localeCompare(b.time);
      }
      return aTime - bTime;
    });

  if (!valid.length) {
    return { latest: null, avg10: null };
  }

  const recent = valid.slice(-10);
  const latest = recent[recent.length - 1]?.volume ?? valid[valid.length - 1].volume ?? null;
  const avg =
    recent.length > 0
      ? recent.reduce((sum, point) => sum + (point.volume ?? 0), 0) / recent.length
      : null;

  return {
    latest: toFinite(latest),
    avg10: toFinite(avg),
  };
}

export function computeFiveDayPercentChange(
  series: OhlcPoint[] | null | undefined,
  window = 5
): number | null {
  if (!series || !series.length || window < 1) {
    return null;
  }

  const sorted = [...series]
    .filter((point) => typeof point.close === "number" && point.close !== null)
    .sort((a, b) => {
      const aTime = Date.parse(a.time);
      const bTime = Date.parse(b.time);
      if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
        return a.time.localeCompare(b.time);
      }
      return aTime - bTime;
    });

  if (sorted.length <= window) {
    return null;
  }

  const latest = toFinite(sorted[sorted.length - 1]?.close ?? null);
  const base = toFinite(sorted[sorted.length - 1 - window]?.close ?? null);

  if (latest === null || base === null || base === 0) {
    return null;
  }

  const pct = ((latest - base) / base) * 100;
  return toFinite(pct);
}

function computeSparkline(
  tickers: string[],
  seriesMap: Record<string, TickerSeries>
): number[] {
  const buckets = new Map<string, number[]>();

  tickers.forEach((ticker) => {
    const series = seriesMap[ticker];
    if (!series || !series.length) {
      return;
    }
    const returns = computeDailyReturns(series);
    if (!returns.length) {
      return;
    }
    const recent = returns.slice(-10);
    recent.forEach(({ date, change }) => {
      const list = buckets.get(date);
      if (list) {
        list.push(change);
      } else {
        buckets.set(date, [change]);
      }
    });
  });

  const orderedDates = Array.from(buckets.keys()).sort();
  if (!orderedDates.length) {
    return [];
  }

  const lastTen = orderedDates.slice(-10);
  return lastTen.map((date) => {
    const values = buckets.get(date) ?? [];
    if (!values.length) {
      return 0;
    }
    const sum = values.reduce((acc, value) => acc + value, 0);
    return sum / values.length;
  });
}

export function buildSectorLeaderboard({
  sectors,
  trendMap,
  seriesMap,
}: BuildLeaderboardArgs): LeaderboardRow[] {
  return sectors.map((sector) => {
    const changes: number[] = [];
    const fiveDayChanges: number[] = [];
    const leaderEntries: LeaderboardLeader[] = [];

    let totalVolume = 0;
    let totalAvgVolume = 0;
    let latestVolumeCount = 0;
    let avgVolumeCount = 0;

    sector.tickers.forEach((ticker) => {
      const change = toFinite(trendMap[ticker]?.change ?? null);
      if (change !== null) {
        changes.push(change);
        leaderEntries.push({ ticker, change });
      } else {
        leaderEntries.push({ ticker, change: null });
      }

      const fiveDay = computeFiveDayPercentChange(seriesMap[ticker]);
      if (fiveDay !== null) {
        fiveDayChanges.push(fiveDay);
      }

      const { latest, avg10 } = computeVolumeStats(seriesMap[ticker]);
      if (latest !== null) {
        totalVolume += latest;
        latestVolumeCount += 1;
      }
      if (avg10 !== null) {
        totalAvgVolume += avg10;
        avgVolumeCount += 1;
      }
    });

    const oneDayChange = changes.length
      ? changes.reduce((acc, value) => acc + value, 0) / changes.length
      : null;
    const fiveDayChange = fiveDayChanges.length
      ? fiveDayChanges.reduce((acc, value) => acc + value, 0) / fiveDayChanges.length
      : null;

    const leaders = leaderEntries
      .filter((entry) => entry.change !== null)
      .sort((a, b) => (b.change ?? 0) - (a.change ?? 0))
      .slice(0, 3);

    const volume = latestVolumeCount ? totalVolume : null;
    const avgVolume10 = avgVolumeCount ? totalAvgVolume : null;
    const relVol10 =
      volume !== null && avgVolume10 !== null && avgVolume10 !== 0
        ? volume / avgVolume10
        : null;
    const volumeMomentum =
      volume !== null && avgVolume10 !== null && avgVolume10 !== 0
        ? (volume - avgVolume10) / avgVolume10
        : null;

    const sparkline = computeSparkline(sector.tickers, seriesMap);

    return {
      id: sector.id,
      name: sector.name,
      tickers: sector.tickers,
      metrics: {
        oneDayChange,
        fiveDayChange: toFinite(fiveDayChange),
        sparkline,
        relVol10: toFinite(relVol10),
        volume: toFinite(volume),
        avgVolume10: toFinite(avgVolume10),
        volumeMomentum: toFinite(volumeMomentum),
        leaders,
      },
    };
  });
}

function accessorFactory(key: LeaderboardSortKey) {
  return (row: LeaderboardRow): number | null => {
    switch (key) {
      case "relVol10":
        return toFinite(row.metrics.relVol10);
      case "oneDayChange":
        return toFinite(row.metrics.oneDayChange);
      case "fiveDayChange":
        return toFinite(row.metrics.fiveDayChange);
      default:
        return null;
    }
  };
}

export function sortLeaderboardRows(
  rows: LeaderboardRow[],
  preset: LeaderboardSortPreset
): LeaderboardRow[] {
  const accessor = accessorFactory(preset.key);
  const direction = preset.direction ?? "desc";
  const factor = direction === "asc" ? 1 : -1;

  return [...rows].sort((a, b) => {
    const valueA = accessor(a);
    const valueB = accessor(b);

    if (valueA === null && valueB === null) {
      return a.name.localeCompare(b.name);
    }
    if (valueA === null) {
      return 1;
    }
    if (valueB === null) {
      return -1;
    }
    if (valueA !== valueB) {
      return factor * (valueA - valueB);
    }
    return a.name.localeCompare(b.name);
  });
}

export function formatCompactNumber(value: number | null | undefined): string {
  const numeric = toFinite(value);
  if (numeric === null) {
    return "—";
  }
  const abs = Math.abs(numeric);
  if (abs >= 1_000_000_000) {
    return `${(numeric / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  }
  if (abs >= 1_000_000) {
    return `${(numeric / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (abs >= 1_000) {
    return `${(numeric / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return numeric.toFixed(0);
}
