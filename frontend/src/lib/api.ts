// frontend/src/lib/api.ts
// Resolve API base: env override or default to '/api' for Vite proxy/nginx
export const BASE = (import.meta as any).env?.VITE_API_BASE ?? "/api";

function join(base: string, path: string): string {
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // one hour
const CACHE_PREFIX = "market-insights:api-cache:";

type CacheEntry = {
  expiresAt: number;
  data: unknown;
};

const memoryCache = new Map<string, CacheEntry>();
const inflightRequests = new Map<string, Promise<unknown>>();

function getCacheKey(base: string, path: string): string {
  return `${CACHE_PREFIX}${base}::${path}`;
}

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    return window.localStorage;
  } catch {
    return null;
  }
}

function readCache<T>(key: string): T | undefined {
  const now = Date.now();
  const entry = memoryCache.get(key);
  if (entry) {
    if (entry.expiresAt > now) {
      return entry.data as T;
    }
    memoryCache.delete(key);
  }

  const storage = getStorage();
  if (!storage) {
    return undefined;
  }

  const raw = storage.getItem(key);
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as CacheEntry;
    if (parsed.expiresAt > now) {
      memoryCache.set(key, parsed);
      return parsed.data as T;
    }
    storage.removeItem(key);
  } catch {
    storage.removeItem(key);
  }
  return undefined;
}

function writeCache<T>(key: string, data: T): void {
  const entry: CacheEntry = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  memoryCache.set(key, entry);

  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(key, JSON.stringify(entry));
  } catch {
    storage.removeItem(key);
  }
}

function requestWithInflight<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inflightRequests.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = factory()
    .then((result) => {
      inflightRequests.delete(key);
      return result;
    })
    .catch((error) => {
      inflightRequests.delete(key);
      throw error;
    });

  inflightRequests.set(key, promise);
  return promise;
}

export async function getJSON<T>(path: string): Promise<T> {
  const cacheKey = getCacheKey(BASE, path);
  const cached = readCache<T>(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  return requestWithInflight(cacheKey, async () => {
    const url = join(BASE, path);
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
    }
    const data = (await res.json()) as T;
    writeCache(cacheKey, data);
    return data;
  });
}

export interface TrendResponse {
  symbol: string;
  as_of: string;
  price: number;
  prev_close?: number | null;
  sma10?: number | null;
  sma20?: number | null;
  sma50?: number | null;
  sma200?: number | null;
  ema9?: number | null;
  ema21?: number | null;
  slope10?: number | null;
  slope20?: number | null;
  slope50?: number | null;
  slope200?: number | null;
  above10?: boolean | null;
  above20?: boolean | null;
  above50?: boolean | null;
  above200?: boolean | null;
}

export interface TrendLiteResponse {
  symbol: string;
  as_of: string | null;
  price: number | null;
  prev_close: number | null;
  pct_change: number | null;
  error?: string | null;
  above10?: boolean | null;
  above20?: boolean | null;
  above50?: boolean | null;
  above200?: boolean | null;
}

export interface VixResponse {
  as_of: string;
  value: number | null;
  avg7: number | null;
}

export interface OhlcPoint {
  time: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export interface MomentumResponse {
  symbol: string;
  as_of: string | null;
  r5d_pct: number | null;
  r1m_pct: number | null;
  r3m_pct: number | null;
}

// Metrics endpoints
export async function fetchTrend(symbol: string): Promise<TrendResponse> {
  return getJSON<TrendResponse>(`/metrics/trend?symbol=${encodeURIComponent(symbol)}`);
}

export async function fetchRSI(symbol: string) {
  return getJSON(`/metrics/rsi?symbol=${encodeURIComponent(symbol)}`);
}

export async function fetchMomentum(symbol: string) {
  return getJSON<MomentumResponse>(`/metrics/momentum?symbol=${encodeURIComponent(symbol)}`);
}

export async function fetchReturns(symbol: string, windows = "MTD,YTD") {
  return getJSON(`/metrics/returns?symbol=${encodeURIComponent(symbol)}&windows=${encodeURIComponent(windows)}`);
}

export async function fetchVIX(): Promise<VixResponse> {
  return getJSON<VixResponse>(`/metrics/vix`);
}

export async function fetchOhlcSeries(
  symbol: string,
  options: { period?: string; interval?: string } = {}
): Promise<OhlcPoint[]> {
  const period = options.period ?? "1mo";
  const interval = options.interval ?? "1d";
  const encodedSymbol = encodeURIComponent(symbol);
  const query = `period=${encodeURIComponent(period)}&interval=${encodeURIComponent(interval)}`;
  return getJSON<OhlcPoint[]>(`/stock/${encodedSymbol}?${query}`);
}

// -------- Sector volume aggregator (server-side) --------
export interface SectorIn {
  id: string;
  name: string;
  tickers: string[];
}

export interface TickerLeaderDTO {
  ticker: string;
  relVol10: number | null;
  change1d: number | null;
}

export interface SectorVolumeDTO {
  id: string;
  name: string;
  members: string[];
  relVol10_median: number | null;
  dollarVol_today_sum: number | null;
  avgDollarVol10_sum: number | null;
  change1d_median: number | null;
  leaders: TickerLeaderDTO[];
  spark10: number[];
  lastUpdated: string | null;
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const url = join(BASE, path);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }
  return (await res.json()) as T;
}

export async function fetchSectorVolumeAggregate(sectors: SectorIn[]): Promise<SectorVolumeDTO[]> {
  return postJSON<SectorVolumeDTO[]>(`/metrics/sectors/volume`, { sectors });
}

const TREND_LITE_BATCH_SIZE = 40;

function chunkSymbols(symbols: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += size) {
    chunks.push(symbols.slice(i, i + size));
  }
  return chunks;
}

export async function fetchTrendLiteBulk(symbols: string[]): Promise<Record<string, TrendLiteResponse>> {
  if (!symbols.length) {
    return {};
  }
  const unique: string[] = [];
  const seen = new Set<string>();
  symbols.forEach((sym) => {
    const upper = sym.trim().toUpperCase();
    if (!upper || seen.has(upper)) {
      return;
    }
    seen.add(upper);
    unique.push(upper);
  });

  const chunks = chunkSymbols(unique, TREND_LITE_BATCH_SIZE);
  const responses = await Promise.all(
    chunks.map((chunk) => {
      const param = encodeURIComponent(chunk.join(","));
      return getJSON<TrendLiteResponse[]>(`/metrics/trend/lite?symbols=${param}`);
    })
  );

  const merged: Record<string, TrendLiteResponse> = {};
  responses.flat().forEach((entry) => {
    merged[entry.symbol] = entry;
  });
  return merged;
}

// Breadth endpoints removed - not needed

// Back-compat api object (if imported elsewhere)
export const api = {
  trend: fetchTrend,
  rsi: fetchRSI,
  momentum: fetchMomentum,
  returns: fetchReturns,
  vix: fetchVIX,
};
