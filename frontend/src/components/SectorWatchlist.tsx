import React, { useEffect, useMemo, useRef, useState } from "react";
import type { TrendLiteResponse } from "../lib/api";
import { fetchTrendLiteBulk } from "../lib/api";

type Sector = {
  id: string;
  name: string;
  tickers: string[];
};

type TickerState = {
  loading: boolean;
  error: string | null;
  data: TrendLiteResponse | null;
};

const STORAGE_KEY = "market-insights:sector-watchlist";
const TREND_CACHE_KEY = "market-insights:sector-trend-cache";
const TREND_CACHE_VERSION = 2;

type TrendCacheEntry = {
  data: TrendLiteResponse;
  savedAt: string;
};

type TrendCache = {
  version: number;
  date: string;
  entries: Record<string, TrendCacheEntry>;
};

const DEFAULT_SECTORS: Sector[] = [
  {
    id: "ai-infrastructure",
    name: "AI Infrastructure",
    tickers: ["ALAB", "ANET", "CRDO", "CRWV", "DELL", "FLEX", "HPE", "NBIS", "NTAP", "ORCL", "SMCI", "VRT", "WYFI"],
  },
  {
    id: "apparel",
    name: "Apparel",
    tickers: ["AEO", "ANF", "CROX", "DECK", "GIL", "GOOS", "HBI", "LULU", "NKE", "ON", "ONON", "RL", "UAA"],
  },
  {
    id: "auto",
    name: "Auto",
    tickers: ["F", "GM", "HMC", "LI", "RACE", "RIVN", "STLA", "TM", "TSLA"],
  },
  {
    id: "autonomous-vehicles",
    name: "Autonomous Vehicles",
    tickers: ["AEVA", "AUR", "MBLY", "NBIS", "OUST", "PONY", "TSLA", "UBER", "WRD"],
  },
  {
    id: "banks",
    name: "Banks",
    tickers: ["ALLY", "BAC", "C", "DFS", "GS", "JPM", "MTB", "SCHW", "SOFI", "TD", "USB", "WFC"],
  },
  {
    id: "batteries",
    name: "Batteries",
    tickers: ["ABAT", "AMPX", "EOSE", "ENVX", "FLNC", "MVST", "NVX", "QS", "SLDP"],
  },
  {
    id: "biotech",
    name: "Biotech",
    tickers: ["ABBV", "CRSP", "EXAS", "GH", "HALO", "LLY", "MDGL", "MRNA", "NVO", "NVAX", "RVMD", "SRPT", "TWST"],
  },
  {
    id: "china",
    name: "China",
    tickers: ["BABA", "BIDU", "FUTU", "HUYA", "JD", "LI", "PDD", "PONY", "TCEHY", "TIGR", "WB", "XPEV"],
  },
  {
    id: "crypto",
    name: "Crypto",
    tickers: ["COIN", "CRCL", "ETHA", "HOOD", "IBIT", "BMNR", "MARA", "MSTR", "RIOT"],
  },
  {
    id: "cybersecurity",
    name: "Cybersecurity",
    tickers: ["CRWD", "FTNT", "NET", "OKTA", "PANW", "RBRK", "S", "ZS"],
  },
  {
    id: "datacenter",
    name: "Datacenter",
    tickers: ["APLD", "CIFR", "CORZ", "CRWV", "GLXY", "IREN", "NBIS"],
  },
  {
    id: "defense",
    name: "Defense",
    tickers: ["BA", "BWXT", "DRS", "GD", "KD", "KTOS", "LHX", "LMT", "MRCY", "NOC", "RTX"],
  },
  {
    id: "dow",
    name: "DOW",
    tickers: [
      "AAPL",
      "AMGN",
      "AXP",
      "BA",
      "CAT",
      "CRM",
      "CSCO",
      "CVX",
      "DIS",
      "DOW",
      "GS",
      "HD",
      "HON",
      "IBM",
      "INTC",
      "JNJ",
      "JPM",
      "KO",
      "MCD",
      "MMM",
      "MRK",
      "MSFT",
      "NKE",
      "PG",
      "TRV",
      "UNH",
      "V",
      "VZ",
      "WBA",
      "WMT",
    ],
  },
  {
    id: "drones-evtols",
    name: "Drones & eVTOL",
    tickers: ["ACHR", "AVAV", "DRS", "ERJ", "JOBY", "KTOS", "MRCY", "ONDS", "RCAT", "UMAC"],
  },
  {
    id: "evs",
    name: "EVs",
    tickers: ["BLNK", "CHPT", "EVGO", "LCID", "PLUG", "RIVN", "TSLA"],
  },
  {
    id: "fintech",
    name: "Fintech",
    tickers: ["AFRM", "DAVE", "FOUR", "HIPO", "HOOD", "LC", "LMND", "PYPL", "ROOT", "SEZL", "SOFI", "TOST", "TREE", "UPST", "XYZ"],
  },
  {
    id: "food",
    name: "Food",
    tickers: ["CAVA", "CBRL", "CMG", "COCO", "DNUT", "EAT", "JACK", "MCD", "PFGC", "SG", "SHAK", "WING"],
  },
  {
    id: "genomics",
    name: "Genomics",
    tickers: ["A", "ABCL", "ARKG", "CRSP", "EXAS", "GH", "GRAL", "MRNA", "NTLA", "TEM", "PRME"],
  },
  {
    id: "homebuilders",
    name: "Homebuilders",
    tickers: ["DHI", "LEN", "NAIL", "PHM", "TOL"],
  },
  {
    id: "insurance-tech",
    name: "Insurance Tech",
    tickers: ["HIPO", "LMND", "OSCR", "ROOT"],
  },
  {
    id: "leveraged-etfs",
    name: "Leveraged ETFs",
    tickers: ["AAPU", "AMZU", "ARMU", "AVGX", "CONL", "CRWL", "CWVX", "FBL", "IONX", "MSTX", "NVDL", "PTIR", "RBLU", "RKLX", "ROBN", "SMCX", "SNOW", "SOFX", "TEMT", "TSLL", "UBRL"],
  },
  {
    id: "lidar",
    name: "Lidar",
    tickers: ["LAZR", "LIDR", "MVIS", "OUST"],
  },
  {
    id: "lithium",
    name: "Lithium",
    tickers: ["ALB", "LAC", "SGML", "SQM"],
  },
  {
    id: "magnificent-seven",
    name: "Magnificent Seven",
    tickers: ["AAPL", "AMZN", "GOOGL", "META", "MSFT", "NVDA", "TSLA"],
  },
  {
    id: "memes",
    name: "Memes",
    tickers: ["AMC", "GME"],
  },
  {
    id: "nuclear",
    name: "Nuclear",
    tickers: ["CCJ", "CEG", "NNE", "OKLO", "SMR", "UEC", "VST", "UUUU"],
  },
  {
    id: "oil",
    name: "Oil",
    tickers: ["AR", "BP", "CVX", "DVN", "OXY", "SHEL", "XOM"],
  },
  {
    id: "payments",
    name: "Payments",
    tickers: ["FI", "FISV", "MA", "V"],
  },
  {
    id: "psychedelics",
    name: "Psychedelics",
    tickers: ["ATAI", "CMPS", "CYBN", "MNMD"],
  },
  {
    id: "quantum",
    name: "Quantum",
    tickers: ["ASPI", "BTQ", "IONQ", "LAES", "QBTS", "QUBT", "RGTI"],
  },
  {
    id: "real-estate",
    name: "Real Estate",
    tickers: ["CBRE", "DLR", "EQIX", "JLL", "O", "OPEN", "PLD", "RKT", "SPG", "Z"],
  },
  {
    id: "retail",
    name: "Retail",
    tickers: ["AEO", "AMZN", "ANF", "BBY", "BURL", "COST", "CROX", "DECK", "ETSY", "HD", "LOW", "LULU", "M", "NKE", "ONON", "ROST", "RL", "TGT", "TJX", "UAA", "VFC", "WMT"],
  },
  {
    id: "robotics",
    name: "Robotics",
    tickers: ["ARBE", "IRBT", "KITT", "MBOT", "NVDA", "OUST", "PDYN", "RR", "SERV", "SYM", "TER", "TSLA", "ZBRA"],
  },
  {
    id: "semiconductors",
    name: "Semiconductors",
    tickers: ["ADI", "AMAT", "AMD", "AMKR", "ASML", "AVGO", "GFS", "INDI", "INTC", "KLAC", "LRCX", "MRVL", "MU", "NVDA", "NXPI", "ON", "QCOM", "TSM", "TXN", "WDC"],
  },
  {
    id: "software",
    name: "Software",
    tickers: ["ADBE", "APP", "APPN", "ASAN", "CFLT", "CRM", "CRWD", "DDOG", "DOCN", "DOCU", "ESTC", "GTLB", "HUBS", "IGV", "MDB", "MNDY", "MSFT", "NET", "NOW", "OKTA", "ORCL", "PANW", "PATH", "PLTR", "S", "SNOW", "TEAM", "TWLO", "VEEV", "WDAY", "ZM", "ZS"],
  },
  {
    id: "social-media",
    name: "Social Media",
    tickers: ["META", "PINS", "RDDT", "SNAP"],
  },
  {
    id: "solar",
    name: "Solar",
    tickers: ["CSIQ", "DQ", "ENPH", "FSLR", "JKS", "NXT", "RUN", "SEDG"],
  },
  {
    id: "space",
    name: "Space",
    tickers: ["ASTS", "BKSY", "LUNR", "PL", "RDW", "RKLB", "SPCE"],
  },
  {
    id: "telecom",
    name: "Telecom",
    tickers: ["T", "TMUS", "VZ"],
  },
  {
    id: "travel",
    name: "Travel",
    tickers: ["AAL", "ABNB", "ALK", "BKNG", "CCL", "DAL", "EXPE", "JBLU", "NCLH", "RCL", "SAVE", "TCOM"],
  },
];

function sanitizeTicker(value: string): string | null {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) {
    return null;
  }
  const valid = /^[A-Z0-9.^-]{1,12}$/.test(trimmed);
  return valid ? trimmed : null;
}

function loadInitialSectors(): Sector[] {
  if (typeof window === "undefined") {
    return DEFAULT_SECTORS;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_SECTORS;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return DEFAULT_SECTORS;
    }

    const sectors: Sector[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const id = typeof (item as Sector).id === "string" ? (item as Sector).id : null;
      const name = typeof (item as Sector).name === "string" ? (item as Sector).name : null;
      const tickers = Array.isArray((item as Sector).tickers)
        ? Array.from(
            new Set(
              ((item as Sector).tickers || [])
                .filter((t): t is string => typeof t === "string")
                .map((t) => sanitizeTicker(t))
                .filter((t): t is string => Boolean(t))
            )
          )
        : [];

      if (!id || !name) {
        continue;
      }
      sectors.push({ id, name, tickers });
    }

    return sectors.length ? sectors : DEFAULT_SECTORS;
  } catch {
    return DEFAULT_SECTORS;
  }
}

function persistSectors(sectors: Sector[]) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sectors));
  } catch {
    // best effort persistence; ignore failures (e.g., private mode)
  }
}

function getTodayKey(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function loadTrendCache(expectedDate: string): TrendCache {
  if (typeof window === "undefined") {
    return { version: TREND_CACHE_VERSION, date: expectedDate, entries: {} };
  }
  try {
    const raw = window.localStorage.getItem(TREND_CACHE_KEY);
    if (!raw) {
      return { version: TREND_CACHE_VERSION, date: expectedDate, entries: {} };
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { version: TREND_CACHE_VERSION, date: expectedDate, entries: {} };
    }
    if (parsed.version !== TREND_CACHE_VERSION) {
      return { version: TREND_CACHE_VERSION, date: expectedDate, entries: {} };
    }
    if (typeof parsed.date !== "string" || parsed.date !== expectedDate) {
      return { version: TREND_CACHE_VERSION, date: expectedDate, entries: {} };
    }
    const sourceEntries = parsed.entries;
    const entries: Record<string, TrendCacheEntry> = {};
    if (sourceEntries && typeof sourceEntries === "object") {
      for (const [ticker, entry] of Object.entries(sourceEntries as Record<string, TrendCacheEntry>)) {
        if (!entry || typeof entry !== "object") {
          continue;
        }
        const data = (entry as TrendCacheEntry).data;
        if (!data || typeof data !== "object" || typeof (data as TrendLiteResponse).symbol !== "string") {
          continue;
        }
        entries[ticker] = {
          data: data as TrendLiteResponse,
          savedAt:
            typeof (entry as TrendCacheEntry).savedAt === "string"
              ? (entry as TrendCacheEntry).savedAt
              : new Date().toISOString(),
        };
      }
    }
    return { version: TREND_CACHE_VERSION, date: expectedDate, entries };
  } catch {
    return { version: TREND_CACHE_VERSION, date: expectedDate, entries: {} };
  }
}

function saveTrendCache(cache: TrendCache) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(TREND_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // best effort persistence; ignore quota failures
  }
}

function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return `$${value.toFixed(2)}`;
}

function formatPercent(delta: number | null, digits = 2): { text: string; tone: string } {
  if (delta === null || Number.isNaN(delta)) {
    return { text: "—", tone: "text-gray-400" };
  }
  const prefix = delta >= 0 ? "+" : "";
  const tone = delta >= 0 ? "text-green-400" : "text-red-400";
  return { text: `${prefix}${delta.toFixed(digits)}%`, tone };
}

function formatAsOf(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}

function computeChange(data: TrendLiteResponse | null | undefined): number | null {
  if (!data) {
    return null;
  }
  if (typeof data.pct_change === "number" && !Number.isNaN(data.pct_change)) {
    return data.pct_change;
  }
  if (data.price == null || data.prev_close == null || data.prev_close === 0) {
    return null;
  }
  return ((data.price - data.prev_close) / data.prev_close) * 100;
}

type ToneClasses = {
  text: string;
  bg: string;
  border: string;
};

function toneForDelta(value: number | null | undefined): ToneClasses {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return {
      text: "text-gray-300",
      bg: "bg-gray-900/40",
      border: "border-gray-800",
    };
  }
  if (value >= 4) {
    return {
      text: "text-emerald-300",
      bg: "bg-emerald-500/20",
      border: "border-emerald-400/50",
    };
  }
  if (value >= 1.5) {
    return {
      text: "text-emerald-200",
      bg: "bg-emerald-500/10",
      border: "border-emerald-400/30",
    };
  }
  if (value >= 0) {
    return {
      text: "text-emerald-100",
      bg: "bg-emerald-500/5",
      border: "border-emerald-400/20",
    };
  }
  if (value <= -4) {
    return {
      text: "text-rose-300",
      bg: "bg-rose-500/20",
      border: "border-rose-400/50",
    };
  }
  if (value <= -1.5) {
    return {
      text: "text-rose-200",
      bg: "bg-rose-500/10",
      border: "border-rose-400/30",
    };
  }
  return {
    text: "text-rose-100",
    bg: "bg-rose-500/5",
    border: "border-rose-400/20",
  };
}

type SectorSummary = {
  id: string;
  name: string;
  count: number;
  activeCount: number;
  advancers: number;
  decliners: number;
  unchanged: number;
  avgChange: number | null;
  lastUpdated: string | null;
};

function summarizeSector(sector: Sector, tickerStates: Record<string, TickerState>): SectorSummary {
  let activeCount = 0;
  let advancers = 0;
  let decliners = 0;
  let unchanged = 0;
  let cumulativeChange = 0;
  let changeSamples = 0;
  let lastUpdated: string | null = null;

  sector.tickers.forEach((ticker) => {
    const state = tickerStates[ticker];
    if (!state || state.loading || state.error || !state.data) {
      return;
    }
    activeCount += 1;

    const change = computeChange(state.data);
    if (change !== null) {
      cumulativeChange += change;
      changeSamples += 1;
      if (change > 0.1) {
        advancers += 1;
      } else if (change < -0.1) {
        decliners += 1;
      } else {
        unchanged += 1;
      }
    }

    if (state.data.as_of) {
      if (!lastUpdated || new Date(state.data.as_of) > new Date(lastUpdated)) {
        lastUpdated = state.data.as_of;
      }
    }
  });

  const avgChange = changeSamples ? cumulativeChange / changeSamples : null;

  return {
    id: sector.id,
    name: sector.name,
    count: sector.tickers.length,
    activeCount,
    advancers,
    decliners,
    unchanged,
    avgChange,
    lastUpdated,
  };
}

type TrendSignalKey = "above10" | "above20" | "above50" | "above200";

const TREND_SIGNAL_META: Array<{ key: TrendSignalKey; label: string }> = [
  { key: "above10", label: "Above 10-day SMA" },
  { key: "above20", label: "Above 20-day SMA" },
  { key: "above50", label: "Above 50-day SMA" },
  { key: "above200", label: "Above 200-day SMA" },
];

function TrendSignals({ data }: { data: TrendLiteResponse | null | undefined }) {
  return (
    <div className="flex items-center gap-1" aria-label="Trend moving-average alignment">
      {TREND_SIGNAL_META.map(({ key, label }) => {
        const active = Boolean(data?.[key]);
        return (
          <span
            key={key}
            title={label}
            className={`h-2.5 w-2.5 rounded-full ${active ? "bg-emerald-400" : "bg-gray-600"}`}
          />
        );
      })}
    </div>
  );
}

export default function SectorWatchlist(): React.ReactElement {
  const [sectors, setSectors] = useState<Sector[]>(() => loadInitialSectors());
  const [tickerStates, setTickerStates] = useState<Record<string, TickerState>>({});
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [inputErrors, setInputErrors] = useState<Record<string, string | null>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [addingTickerFor, setAddingTickerFor] = useState<string | null>(null);
  const [renameValues, setRenameValues] = useState<Record<string, string>>({});
  const [editingSectorId, setEditingSectorId] = useState<string | null>(null);
  const [renameErrors, setRenameErrors] = useState<Record<string, string | null>>({});
  const lastRefreshKeyRef = useRef<number>(0);
  const [filterTerm, setFilterTerm] = useState("");
  const [sortKey, setSortKey] = useState<"performance" | "breadth" | "name">("performance");
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(() => new Set());
  const sortOptions: Array<{ key: "performance" | "breadth" | "name"; label: string }> = [
    { key: "performance", label: "Performance" },
    { key: "breadth", label: "Breadth" },
    { key: "name", label: "Name" },
  ];

  useEffect(() => {
    persistSectors(sectors);
  }, [sectors]);

  const sectorSummaries = useMemo(
    () => sectors.map((sector) => summarizeSector(sector, tickerStates)),
    [sectors, tickerStates]
  );

  const sectorSummaryMap = useMemo(
    () => Object.fromEntries(sectorSummaries.map((summary) => [summary.id, summary])),
    [sectorSummaries]
  );

  const allTickers = useMemo(() => {
    const dedup = new Set<string>();
    sectors.forEach((sector) => {
      sector.tickers.forEach((ticker) => {
        const sanitized = sanitizeTicker(ticker);
        if (sanitized) {
          dedup.add(sanitized);
        }
      });
    });
    return Array.from(dedup);
  }, [sectors]);

  const leaderboard = useMemo(() => {
    const ready = sectorSummaries.filter(
      (summary) => typeof summary.avgChange === "number" && !Number.isNaN(summary.avgChange)
    );
    const winners = [...ready]
      .sort((a, b) => (b.avgChange ?? 0) - (a.avgChange ?? 0))
      .slice(0, 5);
    const losers = [...ready]
      .sort((a, b) => (a.avgChange ?? 0) - (b.avgChange ?? 0))
      .slice(0, 5);
    return { winners, losers };
  }, [sectorSummaries]);

  const visibleSectors = useMemo(() => {
    const term = filterTerm.trim().toLowerCase();
    const decorated = sectors.map((sector) => ({
      sector,
      summary: sectorSummaryMap[sector.id],
    }));

    const filtered = term
      ? decorated.filter(({ sector }) => {
          if (sector.name.toLowerCase().includes(term)) {
            return true;
          }
          return sector.tickers.some((ticker) => ticker.toLowerCase().includes(term));
        })
      : decorated;

    const sorted = [...filtered].sort((a, b) => {
      const summaryA = a.summary;
      const summaryB = b.summary;
      if (sortKey === "name") {
        return a.sector.name.localeCompare(b.sector.name);
      }
      if (sortKey === "breadth") {
        const ratioA =
          summaryA && summaryA.count
            ? (summaryA.advancers - summaryA.decliners) / summaryA.count
            : Number.NEGATIVE_INFINITY;
        const ratioB =
          summaryB && summaryB.count
            ? (summaryB.advancers - summaryB.decliners) / summaryB.count
            : Number.NEGATIVE_INFINITY;
        return ratioB - ratioA;
      }
      const valueA = summaryA?.avgChange ?? Number.NEGATIVE_INFINITY;
      const valueB = summaryB?.avgChange ?? Number.NEGATIVE_INFINITY;
      return valueB - valueA;
    });

    return sorted;
  }, [sectors, sectorSummaryMap, filterTerm, sortKey]);

  useEffect(() => {
    const refreshRequested = refreshKey !== lastRefreshKeyRef.current;
    lastRefreshKeyRef.current = refreshKey;

    if (!allTickers.length) {
      setTickerStates({});
      if (typeof window !== "undefined") {
        const todayKey = getTodayKey();
        saveTrendCache({ version: TREND_CACHE_VERSION, date: todayKey, entries: {} });
      }
      return;
    }

    const todayKey = getTodayKey();
    let cache = loadTrendCache(todayKey);

    const nextStates: Record<string, TickerState> = {};
    const tickersToFetch: string[] = [];

    allTickers.forEach((ticker) => {
      const cached = cache.entries[ticker];
      if (cached && !refreshRequested) {
        nextStates[ticker] = { data: cached.data, error: null, loading: false };
      } else {
        nextStates[ticker] = {
          data: cached?.data ?? null,
          error: null,
          loading: true,
        };
        tickersToFetch.push(ticker);
      }
    });

    setTickerStates(nextStates);

    if (!tickersToFetch.length) {
      return;
    }

    let alive = true;

    (async () => {
      try {
        const fetchedMap = await fetchTrendLiteBulk(tickersToFetch);

        if (!alive) {
          return;
        }

        setTickerStates((prev) => {
          const updated: Record<string, TickerState> = { ...prev };
          tickersToFetch.forEach((ticker) => {
            const payload = fetchedMap[ticker];
            if (payload) {
              updated[ticker] = {
                data: payload,
                error: payload.error ?? null,
                loading: false,
              };
            } else {
              const previous = prev[ticker];
              updated[ticker] = {
                data: previous?.data ?? null,
                error: "No data returned",
                loading: false,
              };
            }
          });
          return updated;
        });

        const entries = { ...cache.entries };
        let mutated = false;
        const savedAt = new Date().toISOString();
        Object.entries(fetchedMap).forEach(([ticker, payload]) => {
          if (payload && !payload.error && payload.price != null) {
            entries[ticker] = { data: payload, savedAt };
            mutated = true;
          }
        });

        if (mutated) {
          cache = { version: TREND_CACHE_VERSION, date: todayKey, entries };
          saveTrendCache(cache);
        }
      } catch (err: any) {
        if (!alive) {
          return;
        }
        const message = err?.message ?? "Failed to load";
        setTickerStates((prev) => {
          const updated: Record<string, TickerState> = { ...prev };
          tickersToFetch.forEach((ticker) => {
            const previous = prev[ticker];
            updated[ticker] = {
              data: previous?.data ?? null,
              error: message,
              loading: false,
            };
          });
          return updated;
        });
      }
    })();

    return () => {
      alive = false;
    };
  }, [allTickers, refreshKey]);

  const handleAddTicker = (sectorId: string): boolean => {
    const raw = inputValues[sectorId] ?? "";
    const ticker = sanitizeTicker(raw);
    if (!ticker) {
      setInputErrors((prev) => ({
        ...prev,
        [sectorId]: "Enter a valid ticker (A-Z, numbers, ., -, ^)",
      }));
      return false;
    }

    const sector = sectors.find((item) => item.id === sectorId);
    if (!sector) {
      return false;
    }
    if (sector.tickers.includes(ticker)) {
      setInputErrors((prev) => ({
        ...prev,
        [sectorId]: `${ticker} is already tracked.`,
      }));
      return false;
    }

    setSectors((prev) =>
      prev.map((sector) => {
        if (sector.id !== sectorId) {
          return sector;
        }
        if (sector.tickers.includes(ticker)) {
          return sector;
        }
        return { ...sector, tickers: [...sector.tickers, ticker] };
      })
    );
    setInputValues((prev) => ({ ...prev, [sectorId]: "" }));
    setInputErrors((prev) => ({ ...prev, [sectorId]: null }));
    return true;
  };

  const handleRemoveTicker = (sectorId: string, ticker: string) => {
    setSectors((prev) =>
      prev.map((sector) =>
        sector.id === sectorId
          ? { ...sector, tickers: sector.tickers.filter((t) => t !== ticker) }
          : sector
      )
    );
  };

  const handleInputChange = (sectorId: string, value: string) => {
    setInputValues((prev) => ({ ...prev, [sectorId]: value }));
    setInputErrors((prev) => ({ ...prev, [sectorId]: null }));
  };

  const handleRefresh = () => {
    setRefreshKey((key) => key + 1);
  };

  const handleToggleAddTicker = (sectorId: string) => {
    setAddingTickerFor((current) => (current === sectorId ? null : sectorId));
    setInputErrors((prev) => ({ ...prev, [sectorId]: null }));
  };

  const handleCancelAddTicker = (sectorId: string) => {
    setAddingTickerFor((current) => (current === sectorId ? null : current));
    setInputValues((prev) => ({ ...prev, [sectorId]: "" }));
    setInputErrors((prev) => ({ ...prev, [sectorId]: null }));
  };

  const toggleSectorExpansion = (sectorId: string) => {
    setExpandedSectors((prev) => {
      const next = new Set(prev);
      if (next.has(sectorId)) {
        next.delete(sectorId);
      } else {
        next.add(sectorId);
      }
      return next;
    });
  };

  const handleDeleteSector = (sectorId: string) => {
    const sector = sectors.find((item) => item.id === sectorId);
    if (!sector) {
      return;
    }
    const confirmed =
      typeof window !== "undefined"
        ? window.confirm(`Remove ${sector.name}? This will also forget its tickers.`)
        : true;
    if (!confirmed) {
      return;
    }

    setSectors((prev) => prev.filter((item) => item.id !== sectorId));
    setInputValues((prev) => {
      const next = { ...prev };
      delete next[sectorId];
      return next;
    });
    setInputErrors((prev) => {
      const next = { ...prev };
      delete next[sectorId];
      return next;
    });
    setRenameValues((prev) => {
      const next = { ...prev };
      delete next[sectorId];
      return next;
    });
    setRenameErrors((prev) => {
      const next = { ...prev };
      delete next[sectorId];
      return next;
    });
    setExpandedSectors((prev) => {
      if (!prev.has(sectorId)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(sectorId);
      return next;
    });
    if (editingSectorId === sectorId) {
      setEditingSectorId(null);
    }
    if (addingTickerFor === sectorId) {
      setAddingTickerFor(null);
    }
  };

  const handleStartRename = (sectorId: string) => {
    const sector = sectors.find((item) => item.id === sectorId);
    if (!sector) {
      return;
    }
    setEditingSectorId(sectorId);
    setRenameValues((prev) => ({ ...prev, [sectorId]: sector.name }));
    setRenameErrors((prev) => ({ ...prev, [sectorId]: null }));
  };

  const handleRenameChange = (sectorId: string, value: string) => {
    setRenameValues((prev) => ({ ...prev, [sectorId]: value }));
    setRenameErrors((prev) => ({ ...prev, [sectorId]: null }));
  };

  const handleCancelRename = () => {
    if (editingSectorId) {
      setRenameErrors((prev) => {
        if (!(editingSectorId in prev)) {
          return prev;
        }
        const next = { ...prev };
        next[editingSectorId] = null;
        return next;
      });
    }
    setEditingSectorId(null);
  };

  const handleRenameSubmit = (event: React.FormEvent<HTMLFormElement>, sectorId: string) => {
    event.preventDefault();
    const nextName = (renameValues[sectorId] ?? "").trim();
    if (!nextName) {
      setRenameErrors((prev) => ({ ...prev, [sectorId]: "Name is required." }));
      return;
    }

    const duplicate = sectors.some(
      (sector) =>
        sector.id !== sectorId && sector.name.toLowerCase() === nextName.toLowerCase()
    );
    if (duplicate) {
      setRenameErrors((prev) => ({
        ...prev,
        [sectorId]: "Another sector already uses this name.",
      }));
      return;
    }

    setSectors((prev) =>
      prev.map((sector) => (sector.id === sectorId ? { ...sector, name: nextName } : sector))
    );
    setEditingSectorId(null);
  };

  return (
    <section className="mx-auto max-w-6xl space-y-5 text-gray-100">
      <div className="rounded-xl border border-gray-700 bg-gray-800/80 p-4 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-100">Sectors</h3>
            <p className="text-xs text-gray-400">
              Quickly scan breadth and performance by grouping tickers you care about.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <input
              type="search"
              value={filterTerm}
              onChange={(event) => setFilterTerm(event.target.value)}
              placeholder="Filter sectors or tickers"
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs text-gray-100 placeholder:text-gray-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 sm:w-52"
            />
            <div className="flex items-center gap-1 rounded-md border border-gray-700 bg-gray-900/60 p-1">
              {sortOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setSortKey(option.key)}
                  className={`rounded-md px-3 py-1 text-[11px] font-medium transition ${
                    sortKey === option.key
                      ? "bg-primary-500 text-white shadow"
                      : "text-gray-300 hover:text-white"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              className="inline-flex items-center justify-center rounded-md border border-primary-500 px-3 py-1.5 text-xs font-medium text-primary-300 transition hover:bg-primary-500/10"
            >
              Refresh data
            </button>
          </div>
        </div>

        {(leaderboard.winners.length || leaderboard.losers.length) ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Hot today
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {leaderboard.winners.length ? (
                  leaderboard.winners.map((item) => {
                    const tone = toneForDelta(item.avgChange ?? null);
                    return (
                      <span
                        key={`winner-${item.id}`}
                        className={`inline-flex items-center gap-1 rounded-full border ${tone.border} ${tone.bg} px-2 py-1 text-[11px] ${tone.text}`}
                      >
                        {item.name}
                        <span className="font-mono">
                          {formatPercent(item.avgChange ?? null, 1).text}
                        </span>
                      </span>
                    );
                  })
                ) : (
                  <span className="text-[11px] text-gray-500">No data yet</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Lagging
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {leaderboard.losers.length ? (
                  leaderboard.losers.map((item) => {
                    const tone = toneForDelta(item.avgChange ?? null);
                    return (
                      <span
                        key={`loser-${item.id}`}
                        className={`inline-flex items-center gap-1 rounded-full border ${tone.border} ${tone.bg} px-2 py-1 text-[11px] ${tone.text}`}
                      >
                        {item.name}
                        <span className="font-mono">
                          {formatPercent(item.avgChange ?? null, 1).text}
                        </span>
                      </span>
                    );
                  })
                ) : (
                  <span className="text-[11px] text-gray-500">No data yet</span>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {visibleSectors.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 text-center text-sm text-gray-400">
          No sectors match your filter. Clear the search to see everything.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visibleSectors.map(({ sector, summary }) => {
            const hasTickers = sector.tickers.length > 0;
            const isAddingTicker = addingTickerFor === sector.id;
            const isExpanded = expandedSectors.has(sector.id);
            const avgChange = summary?.avgChange ?? null;
            const tone = toneForDelta(avgChange);
            const advancers = summary?.advancers ?? 0;
            const decliners = summary?.decliners ?? 0;
            const totalCount = summary?.count ?? sector.tickers.length;
            const advPct = totalCount ? Math.max(0, Math.min(100, (advancers / totalCount) * 100)) : 0;
            const decPct = totalCount ? Math.max(0, Math.min(100, (decliners / totalCount) * 100)) : 0;
            const flatPct = Math.max(0, 100 - advPct - decPct);
            const tickerSnapshots = sector.tickers
              .map((ticker) => {
                const state = tickerStates[ticker];
                const change = computeChange(state?.data);
                if (change === null || Number.isNaN(change)) {
                  return null;
                }
                return {
                  ticker,
                  change,
                };
              })
              .filter(
                (entry): entry is { ticker: string; change: number } =>
                  entry !== null
              );
            const leaders = [...tickerSnapshots].sort((a, b) => b.change - a.change).slice(0, 3);
            const laggards = [...tickerSnapshots].sort((a, b) => a.change - b.change).slice(0, 3);
            const lastUpdated = summary?.lastUpdated ? formatAsOf(summary.lastUpdated) : "—";
            const activeLabel = summary
              ? `${summary.activeCount}/${summary.count} active`
              : `${sector.tickers.length} tickers`;

            return (
              <article key={sector.id} className="flex flex-col gap-3 rounded-xl border border-gray-800 bg-gray-900/70 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    {editingSectorId === sector.id ? (
                      <form
                        onSubmit={(event) => handleRenameSubmit(event, sector.id)}
                        className="flex flex-col gap-2 sm:flex-row sm:items-center"
                      >
                        <input
                          type="text"
                          value={renameValues[sector.id] ?? ""}
                          onChange={(event) => handleRenameChange(sector.id, event.target.value)}
                          className="w-full rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-gray-100 placeholder:text-gray-600 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 sm:w-52"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            className="inline-flex items-center justify-center rounded-md bg-primary-500 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-primary-600"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelRename}
                            className="inline-flex items-center justify-center rounded-md border border-gray-700 px-2.5 py-1 text-[11px] font-medium text-gray-300 transition hover:border-gray-600"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <div className="text-sm font-semibold uppercase tracking-wide text-gray-200">
                          {sector.name}
                        </div>
                        <div className="text-[11px] text-gray-500">{activeLabel}</div>
                      </>
                    )}
                    {renameErrors[sector.id] ? (
                      <div className="text-[10px] text-red-400">{renameErrors[sector.id]}</div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleToggleAddTicker(sector.id)}
                      className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs transition ${
                        isAddingTicker
                          ? "border-primary-500 text-primary-300"
                          : "border-gray-700 text-gray-200 hover:border-primary-500 hover:text-primary-300"
                      }`}
                      aria-label={`Add symbol to ${sector.name}`}
                    >
                      +
                    </button>
                    {hasTickers ? (
                      <button
                        type="button"
                        onClick={() => toggleSectorExpansion(sector.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-700 text-xs text-gray-300 transition hover:border-gray-600 hover:text-gray-100"
                        aria-label={`${isExpanded ? "Hide" : "Show"} tickers for ${sector.name}`}
                      >
                        {isExpanded ? "▴" : "▾"}
                      </button>
                    ) : null}
                    {editingSectorId !== sector.id ? (
                      <button
                        type="button"
                        onClick={() => handleStartRename(sector.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-700 text-xs text-gray-300 transition hover:border-gray-600 hover:text-gray-100"
                        aria-label={`Rename ${sector.name}`}
                      >
                        ✎
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleDeleteSector(sector.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-red-400/40 text-xs text-red-300 opacity-0 transition hover:border-red-400 hover:bg-red-500/10 hover:text-red-200 focus:opacity-100 group-hover:opacity-100"
                      aria-label={`Remove ${sector.name}`}
                    >
                      ×
                    </button>
                  </div>
                </div>

                {isAddingTicker ? (
                  <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-3">
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (handleAddTicker(sector.id)) {
                          handleCancelAddTicker(sector.id);
                        }
                      }}
                      className="flex flex-col gap-2 sm:flex-row sm:items-center"
                    >
                      <input
                        type="text"
                        value={inputValues[sector.id] ?? ""}
                        onChange={(event) => handleInputChange(sector.id, event.target.value)}
                        placeholder="Add ticker (e.g. AAPL)"
                        className="w-full rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-gray-100 placeholder:text-gray-600 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 sm:flex-1"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          className="inline-flex items-center justify-center rounded-md bg-primary-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-600"
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCancelAddTicker(sector.id)}
                          className="inline-flex items-center justify-center rounded-md border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 transition hover:border-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                    {inputErrors[sector.id] ? (
                      <div className="mt-1 text-[10px] text-red-400">{inputErrors[sector.id]}</div>
                    ) : null}
                  </div>
                ) : null}

                <div className={`rounded-lg border ${tone.border} ${tone.bg} p-3`}>
                  <div className={`text-2xl font-mono ${tone.text}`}>
                    {formatPercent(avgChange, 2).text}
                  </div>
                  <div className="mt-1 text-[11px] text-gray-400">Change vs. prior close</div>
                </div>

                <div className="space-y-3 text-[11px]">
                  <div>
                    <div className="flex items-center justify-between text-gray-400">
                      <span>Adv / Dec</span>
                      <span className="text-gray-300">
                        {advancers} / {decliners}
                      </span>
                    </div>
                    <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-gray-800">
                      <div className="bg-emerald-500/60" style={{ width: `${advPct}%` }} />
                      <div className="bg-rose-500/60" style={{ width: `${decPct}%` }} />
                      <div className="bg-gray-600/40" style={{ width: `${flatPct}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      Leaders
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {leaders.length ? (
                        leaders.map((entry) => {
                          const positive = entry.change >= 0;
                          const chipClass = positive
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                            : "border-rose-500/40 bg-rose-500/10 text-rose-200";
                          return (
                            <span
                              key={`${sector.id}-leader-${entry.ticker}`}
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${chipClass}`}
                            >
                              {entry.ticker}
                              <span className="font-mono">
                                {formatPercent(entry.change, 1).text}
                              </span>
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      Laggards
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {laggards.length ? (
                        laggards.map((entry) => {
                          const negative = entry.change <= 0;
                          const chipClass = negative
                            ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                            : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
                          return (
                            <span
                              key={`${sector.id}-laggard-${entry.ticker}`}
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${chipClass}`}
                            >
                              {entry.ticker}
                              <span className="font-mono">
                                {formatPercent(entry.change, 1).text}
                              </span>
                            </span>
                          );
                        })
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </div>
                  </div>
                  <div className="text-gray-500">Last update: {lastUpdated}</div>
                </div>

                {!hasTickers ? (
                  <div className="rounded-lg border border-dashed border-gray-700 bg-gray-900/40 p-3 text-sm text-gray-500">
                    No tickers yet. Use the + button to start tracking this group.
                  </div>
                ) : null}

                {hasTickers && isExpanded ? (
                  <div className="mt-1 overflow-x-auto">
                    <table className="min-w-full table-fixed border-collapse text-xs">
                      <thead className="bg-gray-900/60 text-[10px] uppercase tracking-wide text-gray-500">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">Ticker</th>
                          <th className="w-24 px-3 py-2 text-right font-semibold">Price</th>
                          <th className="w-20 px-3 py-2 text-right font-semibold">Change</th>
                          <th className="w-24 px-3 py-2 text-center font-semibold">Trend</th>
                          <th className="px-3 py-2 text-left font-semibold">Last update</th>
                          <th className="w-14 px-3 py-2 text-right font-semibold"> </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sector.tickers.map((ticker) => {
                          const state = tickerStates[ticker];
                          const changePct = computeChange(state?.data);
                          const changeDisplay = formatPercent(changePct);
                          const status = state?.loading
                            ? { text: "Loading…", tone: "text-gray-500" }
                            : state?.error
                            ? { text: state.error, tone: "text-red-400" }
                            : { text: formatAsOf(state?.data?.as_of), tone: "text-gray-500" };

                          return (
                            <tr key={ticker} className="group border-t border-gray-800">
                              <td className="whitespace-nowrap px-3 py-1.5 font-mono text-sm text-gray-100">
                                {ticker}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono text-sm text-gray-200">
                                {formatPrice(state?.data?.price ?? null)}
                              </td>
                              <td className={`px-3 py-1.5 text-right font-mono text-xs ${changeDisplay.tone}`}>
                                {changeDisplay.text}
                              </td>
                              <td className="px-3 py-1.5 text-center">
                                <TrendSignals data={state?.data} />
                              </td>
                              <td className={`px-3 py-1.5 text-[11px] ${status.tone}`}>{status.text}</td>
                              <td className="px-3 py-1.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveTicker(sector.id, ticker)}
                                  className="rounded px-1 py-0.5 text-[10px] text-gray-500 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                                  aria-label={`Remove ${ticker}`}
                                >
                                  ✕
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
