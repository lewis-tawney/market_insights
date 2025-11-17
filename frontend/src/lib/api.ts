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

type QueryValue = string | number | boolean | null | undefined;

function buildQuery(params?: Record<string, QueryValue>): string {
  const entries = Object.entries(params ?? {}).filter(([, value]) => {
    if (value === undefined || value === null) {
      return false;
    }
    if (typeof value === "string") {
      return value.trim().length > 0;
    }
    return true;
  });
  if (!entries.length) {
    return "";
  }
  const search = new URLSearchParams();
  for (const [key, value] of entries) {
    search.append(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
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

// ---------------- Journal types ----------------
export type JournalTradeDirection = "long" | "short";
export type JournalTradeStatus = "open" | "closed";

export interface JournalTrade {
  id: string;
  ticker: string;
  direction: JournalTradeDirection;
  status: JournalTradeStatus;
  entry_price: number;
  exit_price: number | null;
  position_size: number;
  entry_time: string;
  exit_time: string | null;
  stop_price: number | null;
  what_they_saw: string | null;
  exit_plan: string | null;
  feelings: string | null;
  notes: string | null;
  percent_pl: number | null;
  dollar_pl: number | null;
  hold_time_seconds: number | null;
  r_multiple: number | null;
  created_at: string;
  updated_at: string;
}

export interface JournalTradeCreatePayload {
  ticker: string;
  direction: JournalTradeDirection;
  status: JournalTradeStatus;
  entry_price: number;
  exit_price?: number | null;
  position_size: number;
  entry_time: string;
  exit_time?: string | null;
  stop_price?: number | null;
  what_they_saw?: string | null;
  exit_plan?: string | null;
  feelings?: string | null;
  notes?: string | null;
}

export type JournalTradeUpdatePayload = Partial<JournalTradeCreatePayload>;

export interface JournalTradeListParams {
  ticker?: string;
  status?: JournalTradeStatus;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

export interface JournalTicker {
  symbol: string;
  name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface JournalTickerUpdatePayload {
  name?: string | null;
  notes?: string | null;
}

export interface JournalSetup {
  id: string;
  name: string;
  description: string | null;
  rules: string[];
  ideal_screenshot_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface JournalSetupCreatePayload {
  name: string;
  description?: string | null;
  rules?: string[];
}

export interface JournalSetupUpdatePayload {
  name?: string;
  description?: string | null;
  rules?: string[];
  ideal_screenshot_id?: string | null;
}

export interface JournalSetupReview {
  id: string;
  ticker_symbol: string;
  setup_id: string | null;
  trade_id: string | null;
  date: string;
  notes: string | null;
  did_take_trade: boolean;
  created_at: string;
  updated_at: string;
}

export interface JournalSetupReviewCreatePayload {
  ticker_symbol: string;
  setup_id?: string | null;
  trade_id?: string | null;
  date: string;
  notes?: string | null;
  did_take_trade: boolean;
}

export type JournalSetupReviewUpdatePayload = Partial<JournalSetupReviewCreatePayload>;

export interface JournalSetupReviewListParams {
  ticker_symbol?: string;
  setup_id?: string;
  did_take_trade?: boolean;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

export interface JournalScreenshot {
  id: string;
  url: string;
  caption: string | null;
  target_type: string;
  target_id: string;
  sort_order: number;
  created_at: string;
}

export interface JournalScreenshotCreatePayload {
  url: string;
  caption?: string | null;
}

export interface TickerProfile {
  ticker: JournalTicker;
  trades: JournalTrade[];
  setup_reviews: JournalSetupReview[];
}

export interface TickerProfileFilters {
  setup_id?: string;
  outcome?: "all" | "winners" | "losers";
}

export interface DailyNote {
  id: string;
  date: string;
  premarket_notes: string | null;
  eod_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailyNoteWithTrades {
  note: DailyNote;
  trades: JournalTrade[];
}

export interface DailyNoteCreateOrUpdatePayload {
  date: string;
  premarket_notes?: string | null;
  eod_notes?: string | null;
}

export interface DailyNoteListParams {
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

export interface DailyNoteAttachTradesPayload {
  trade_ids: string[];
  role?: string;
}

export interface WeeklyNote {
  id: string;
  week_start_date: string;
  week_end_date: string | null;
  text: string | null;
  trade_count: number;
  created_at: string;
  updated_at: string;
}

export interface WeeklyNoteWithTrades {
  note: WeeklyNote;
  trades: JournalTrade[];
}

export interface WeeklyNoteCreateOrUpdatePayload {
  week_start_date: string;
  week_end_date?: string | null;
  text?: string | null;
}

export interface WeeklyNoteListParams {
  start_week?: string;
  end_week?: string;
  limit?: number;
  offset?: number;
}

export interface WeeklyNoteAttachTradesPayload {
  trade_ids: string[];
  role?: string;
}

export async function fetchJournalTrades(
  params?: JournalTradeListParams,
): Promise<JournalTrade[]> {
  const query = buildQuery({
    ticker: params?.ticker,
    status: params?.status,
    start_date: params?.start_date,
    end_date: params?.end_date,
    limit: params?.limit,
    offset: params?.offset,
  });
  return getJSONNoCache<JournalTrade[]>(`/journal/trades${query}`);
}

export async function fetchJournalTrade(id: string): Promise<JournalTrade> {
  return getJSONNoCache<JournalTrade>(`/journal/trades/${encodeURIComponent(id)}`);
}

export async function createJournalTrade(
  payload: JournalTradeCreatePayload,
): Promise<JournalTrade> {
  return requestJSON<JournalTrade>("/journal/trades", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateJournalTrade(
  id: string,
  payload: JournalTradeUpdatePayload,
): Promise<JournalTrade> {
  return requestJSON<JournalTrade>(`/journal/trades/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteJournalTrade(id: string): Promise<void> {
  await requestJSON<void>(`/journal/trades/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function fetchJournalTickers(): Promise<JournalTicker[]> {
  return getJSONNoCache<JournalTicker[]>("/journal/tickers");
}

export async function updateJournalTicker(
  symbol: string,
  payload: JournalTickerUpdatePayload,
): Promise<JournalTicker> {
  return requestJSON<JournalTicker>(`/journal/tickers/${encodeURIComponent(symbol)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function fetchTickerProfile(
  symbol: string,
  filters?: TickerProfileFilters,
): Promise<TickerProfile> {
  const query = buildQuery({
    setup_id: filters?.setup_id,
    outcome: filters?.outcome,
  });
  return getJSONNoCache<TickerProfile>(`/journal/tickers/${encodeURIComponent(symbol)}${query}`);
}

export async function fetchJournalSetups(): Promise<JournalSetup[]> {
  return getJSONNoCache<JournalSetup[]>("/journal/setups");
}

export async function fetchJournalSetup(id: string): Promise<JournalSetup> {
  return getJSONNoCache<JournalSetup>(`/journal/setups/${encodeURIComponent(id)}`);
}

export async function createJournalSetup(
  payload: JournalSetupCreatePayload,
): Promise<JournalSetup> {
  return requestJSON<JournalSetup>("/journal/setups", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateJournalSetup(
  id: string,
  payload: JournalSetupUpdatePayload,
): Promise<JournalSetup> {
  return requestJSON<JournalSetup>(`/journal/setups/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteJournalSetup(id: string): Promise<void> {
  await requestJSON<void>(`/journal/setups/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function fetchJournalSetupReviews(
  params?: JournalSetupReviewListParams,
): Promise<JournalSetupReview[]> {
  const query = buildQuery({
    ticker_symbol: params?.ticker_symbol,
    setup_id: params?.setup_id,
    did_take_trade: params?.did_take_trade,
    start_date: params?.start_date,
    end_date: params?.end_date,
    limit: params?.limit,
    offset: params?.offset,
  });
  return getJSONNoCache<JournalSetupReview[]>(`/journal/setup-reviews${query}`);
}

export async function fetchJournalSetupReview(id: string): Promise<JournalSetupReview> {
  return getJSONNoCache<JournalSetupReview>(`/journal/setup-reviews/${encodeURIComponent(id)}`);
}

export async function createJournalSetupReview(
  payload: JournalSetupReviewCreatePayload,
): Promise<JournalSetupReview> {
  return requestJSON<JournalSetupReview>("/journal/setup-reviews", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateJournalSetupReview(
  id: string,
  payload: JournalSetupReviewUpdatePayload,
): Promise<JournalSetupReview> {
  return requestJSON<JournalSetupReview>(`/journal/setup-reviews/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteJournalSetupReview(id: string): Promise<void> {
  await requestJSON<void>(`/journal/setup-reviews/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function attachTradeScreenshot(
  tradeId: string,
  payload: JournalScreenshotCreatePayload,
): Promise<JournalScreenshot> {
  return requestJSON<JournalScreenshot>(
    `/journal/trades/${encodeURIComponent(tradeId)}/screenshots`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function fetchTradeScreenshots(tradeId: string): Promise<JournalScreenshot[]> {
  return getJSONNoCache<JournalScreenshot[]>(
    `/journal/trades/${encodeURIComponent(tradeId)}/screenshots`,
  );
}

export async function attachSetupReviewScreenshot(
  reviewId: string,
  payload: JournalScreenshotCreatePayload,
): Promise<JournalScreenshot> {
  return requestJSON<JournalScreenshot>(
    `/journal/setup-reviews/${encodeURIComponent(reviewId)}/screenshots`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function fetchSetupReviewScreenshots(
  reviewId: string,
): Promise<JournalScreenshot[]> {
  return getJSONNoCache<JournalScreenshot[]>(
    `/journal/setup-reviews/${encodeURIComponent(reviewId)}/screenshots`,
  );
}

export async function fetchDailyNotes(params?: DailyNoteListParams): Promise<DailyNote[]> {
  const query = buildQuery({
    start_date: params?.start_date,
    end_date: params?.end_date,
    limit: params?.limit,
    offset: params?.offset,
  });
  return getJSONNoCache<DailyNote[]>(`/journal/daily-notes${query}`);
}

export async function fetchDailyNote(id: string): Promise<DailyNote> {
  return getJSONNoCache<DailyNote>(`/journal/daily-notes/${encodeURIComponent(id)}`);
}

export async function fetchDailyNoteWithTrades(id: string): Promise<DailyNoteWithTrades> {
  return getJSONNoCache<DailyNoteWithTrades>(
    `/journal/daily-notes/${encodeURIComponent(id)}/trades`,
  );
}

export async function createOrUpdateDailyNote(
  payload: DailyNoteCreateOrUpdatePayload,
): Promise<DailyNote> {
  return requestJSON<DailyNote>("/journal/daily-notes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function attachTradesToDailyNote(
  noteId: string,
  payload: DailyNoteAttachTradesPayload,
): Promise<DailyNoteWithTrades> {
  return requestJSON<DailyNoteWithTrades>(
    `/journal/daily-notes/${encodeURIComponent(noteId)}/trades`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function detachTradeFromDailyNote(noteId: string, tradeId: string): Promise<void> {
  await requestJSON<void>(
    `/journal/daily-notes/${encodeURIComponent(noteId)}/trades/${encodeURIComponent(tradeId)}`,
    {
      method: "DELETE",
    },
  );
}

export async function fetchDailyNoteByDate(date: string): Promise<DailyNote | null> {
  const notes = await fetchDailyNotes({
    start_date: date,
    end_date: date,
    limit: 1,
  });
  return notes[0] ?? null;
}

export async function fetchWeeklyNotes(params?: WeeklyNoteListParams): Promise<WeeklyNote[]> {
  const query = buildQuery({
    start_week: params?.start_week,
    end_week: params?.end_week,
    limit: params?.limit,
    offset: params?.offset,
  });
  return getJSONNoCache<WeeklyNote[]>(`/journal/weekly-notes${query}`);
}

export async function fetchWeeklyNote(id: string): Promise<WeeklyNote> {
  return getJSONNoCache<WeeklyNote>(`/journal/weekly-notes/${encodeURIComponent(id)}`);
}

export async function fetchWeeklyNoteWithTrades(id: string): Promise<WeeklyNoteWithTrades> {
  return getJSONNoCache<WeeklyNoteWithTrades>(
    `/journal/weekly-notes/${encodeURIComponent(id)}/trades`,
  );
}

export async function createOrUpdateWeeklyNote(
  payload: WeeklyNoteCreateOrUpdatePayload,
): Promise<WeeklyNote> {
  return requestJSON<WeeklyNote>("/journal/weekly-notes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function attachTradesToWeeklyNote(
  noteId: string,
  payload: WeeklyNoteAttachTradesPayload,
): Promise<WeeklyNoteWithTrades> {
  return requestJSON<WeeklyNoteWithTrades>(
    `/journal/weekly-notes/${encodeURIComponent(noteId)}/trades`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function detachTradeFromWeeklyNote(noteId: string, tradeId: string): Promise<void> {
  await requestJSON<void>(
    `/journal/weekly-notes/${encodeURIComponent(noteId)}/trades/${encodeURIComponent(tradeId)}`,
    {
      method: "DELETE",
    },
  );
}

export async function fetchWeeklyNoteByStart(weekStartDate: string): Promise<WeeklyNote | null> {
  const notes = await fetchWeeklyNotes({
    start_week: weekStartDate,
    end_week: weekStartDate,
    limit: 1,
  });
  return notes[0] ?? null;
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
