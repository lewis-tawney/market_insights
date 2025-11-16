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

export async function getJSONNoCache<T>(path: string): Promise<T> {
  const url = join(BASE, path);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
  }
  return (await res.json()) as T;
}

async function requestJSON<T>(path: string, init: RequestInit): Promise<T> {
  const url = join(BASE, path);
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${text}`);
  }

  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  return JSON.parse(text) as T;
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

export interface TickerMetricDTO {
  ticker: string;
  change1d: number | null;
  change5d: number | null;
  relVol10: number | null;
  dollarVolToday: number | null;
  avgDollarVol10: number | null;
  lastUpdated: string | null;
  dollarVol5d: number | null;
  adr20Pct: number | null;
  ytdGainToHighPct: number | null;
  ytdOffHighPct: number | null;
  ralphScore: number | null;
  inactive: boolean;
  history: Array<{
    date: string;
    close: number | null;
    volume: number | null;
    dollarVolume: number | null;
  }>;
}

export interface SectorVolumeDTO {
  id: string;
  name: string;
  members: string[];
  relVol10_median: number | null;
  dollarVol_today_sum: number | null;
  avgDollarVol10_sum: number | null;
  change1d_median: number | null;
  change1d_weighted: number | null;
  leaders: TickerLeaderDTO[];
  lastUpdated: string | null;
  members_detail: TickerMetricDTO[];
}

export interface SnapshotHealthSummary {
  asOfDate: string | null;
  asOfTimeET: string | null;
  sectors_count: number;
  members_count: number;
  stale: boolean;
}

export interface SectorVolumeResponse {
  asOfDate: string | null;
  asOfTimeET: string | null;
  sectors_count: number;
  members_count: number;
  stale: boolean;
  sectors: SectorVolumeDTO[];
}

export interface SectorRalphRow {
  rank: number;
  symbol: string;
  name: string;
  pctGainToHigh: number | null;
  pctOffHigh: number | null;
  ralphScore: number | null;
  sectorId: string | null;
  isBaseline: boolean;
  avgDollarVol10: number | null;
  sparklineCloses: number[];
}

export async function fetchSectorVolumeAggregate(sectors?: SectorIn[]): Promise<SectorVolumeDTO[]> {
  let response: SectorVolumeResponse;
  if (sectors && sectors.length) {
    const payload = encodeURIComponent(JSON.stringify({ sectors }));
    response = await getJSONNoCache<SectorVolumeResponse>(`/metrics/sectors/volume?payload=${payload}`);
  } else {
    response = await getJSONNoCache<SectorVolumeResponse>(`/metrics/sectors/volume`);
  }
  // Extract the sectors array from the response
  return response.sectors || [];
}

export async function fetchSectorRalph(): Promise<SectorRalphRow[]> {
  return getJSONNoCache<SectorRalphRow[]>(`/metrics/sectors/ralph`);
}

export async function fetchSnapshotHealth(): Promise<SnapshotHealthSummary> {
  return getJSON<SnapshotHealthSummary>(`/health/snapshot`);
}

export interface TaskStatusResponse {
  id: string;
  kind: string;
  status: "queued" | "running" | "succeeded" | "failed";
  message?: string | null;
  started?: string | null;
  ended?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface TaskEnqueueResponse {
  task_id: string;
}

export interface SectorCreateRequest {
  id: string;
  name: string;
  tickers: string[];
}

export async function addSectorTicker(sectorId: string, symbol: string): Promise<TaskEnqueueResponse> {
  return requestJSON<TaskEnqueueResponse>(
    `/sectors/${encodeURIComponent(sectorId)}/tickers`,
    {
      method: "POST",
      body: JSON.stringify({ symbol }),
    },
  );
}

export async function removeSectorTicker(sectorId: string, symbol: string): Promise<TaskEnqueueResponse> {
  return requestJSON<TaskEnqueueResponse>(
    `/sectors/${encodeURIComponent(sectorId)}/tickers/${encodeURIComponent(symbol)}`,
    {
      method: "DELETE",
    },
  );
}

export async function fetchTaskStatus(taskId: string): Promise<TaskStatusResponse> {
  return requestJSON<TaskStatusResponse>(`/tasks/${encodeURIComponent(taskId)}`, {
    method: "GET",
  });
}

export async function createSector(
  payload: SectorCreateRequest,
): Promise<TaskEnqueueResponse> {
  return requestJSON<TaskEnqueueResponse>(`/sectors`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
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
