import { useCallback, useEffect, useMemo, useState } from "react";

import {
  DailyNote,
  fetchDailyNoteByDate,
  fetchJournalTrade,
  fetchJournalTrades,
  fetchJournalSetups,
  fetchJournalTickers,
  fetchTickerProfile,
  fetchWeeklyNoteByStart,
  JournalSetup,
  JournalTicker,
  JournalTrade,
  JournalTradeListParams,
  TickerProfile,
  TickerProfileFilters,
  WeeklyNote,
} from "../api";

function safeErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string") {
    const msg = (err as { message?: string }).message?.trim();
    if (msg) {
      return msg;
    }
  }
  return fallback;
}

function normalizeDateInput(input: Date | string | null): string | null {
  if (!input) {
    return null;
  }
  if (input instanceof Date) {
    return input.toISOString().slice(0, 10);
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  // Assume already ISO formatted
  if (trimmed.length === 10) {
    return trimmed;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().slice(0, 10);
}

export function useJournalTrades(params?: JournalTradeListParams) {
  const [trades, setTrades] = useState<JournalTrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const serializedParams = useMemo(() => JSON.stringify(params ?? {}), [params]);
  const parsedParams = useMemo(
    () => (params ? { ...params } : {}),
    [serializedParams],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJournalTrades(parsedParams);
      setTrades(data);
    } catch (err) {
      setTrades([]);
      setError(safeErrorMessage(err, "Unable to load trades."));
    } finally {
      setLoading(false);
    }
  }, [parsedParams]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await fetchJournalTrades(parsedParams);
        if (!alive) {
          return;
        }
        setTrades(data);
      } catch (err) {
        if (!alive) {
          return;
        }
        setError(safeErrorMessage(err, "Unable to load trades."));
        setTrades([]);
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [parsedParams]);

  return {
    trades,
    loading,
    error,
    refetch: load,
  };
}

export function useJournalTrade(tradeId: string | null) {
  const [trade, setTrade] = useState<JournalTrade | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!tradeId) {
      setTrade(null);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJournalTrade(tradeId);
      setTrade(data);
      return data;
    } catch (err) {
      setError(safeErrorMessage(err, "Unable to load trade."));
      setTrade(null);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [tradeId]);

  useEffect(() => {
    if (!tradeId) {
      setTrade(null);
      setError(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await fetchJournalTrade(tradeId);
        if (!alive) {
          return;
        }
        setTrade(data);
      } catch (err) {
        if (!alive) {
          return;
        }
        setError(safeErrorMessage(err, "Unable to load trade."));
        setTrade(null);
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [tradeId]);

  return { trade, loading, error, refresh };
}

export function useJournalSetups() {
  const [setups, setSetups] = useState<JournalSetup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJournalSetups();
      setSetups(data);
    } catch (err) {
      setError(safeErrorMessage(err, "Unable to load setups."));
      setSetups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await fetchJournalSetups();
        if (!alive) {
          return;
        }
        setSetups(data);
      } catch (err) {
        if (!alive) {
          return;
        }
        setError(safeErrorMessage(err, "Unable to load setups."));
        setSetups([]);
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return { setups, loading, error, refetch: load };
}

export function useTickerProfile(symbol: string | null, filters?: TickerProfileFilters) {
  const [profile, setProfile] = useState<TickerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtersKey = useMemo(() => JSON.stringify(filters ?? {}), [filters]);
  const parsedFilters = useMemo(() => (filters ? { ...filters } : undefined), [filtersKey]);

  const load = useCallback(async () => {
    if (!symbol) {
      setProfile(null);
      setError(null);
      setLoading(false);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTickerProfile(symbol, parsedFilters);
      setProfile(data);
      return data;
    } catch (err) {
      setError(safeErrorMessage(err, "Unable to load ticker profile."));
      setProfile(null);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [symbol, parsedFilters]);

  useEffect(() => {
    if (!symbol) {
      setProfile(null);
      setLoading(false);
      setError(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await fetchTickerProfile(symbol, parsedFilters);
        if (!alive) {
          return;
        }
        setProfile(data);
      } catch (err) {
        if (!alive) {
          return;
        }
        setError(safeErrorMessage(err, "Unable to load ticker profile."));
        setProfile(null);
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [symbol, parsedFilters]);

  return { profile, loading, error, refetch: load };
}

export function useDailyNote(dateInput: Date | string | null) {
  const normalized = useMemo(() => normalizeDateInput(dateInput), [dateInput]);
  const [note, setNote] = useState<DailyNote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!normalized) {
      setNote(null);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDailyNoteByDate(normalized);
      setNote(data);
      return data;
    } catch (err) {
      setError(safeErrorMessage(err, "Unable to load daily note."));
      setNote(null);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [normalized]);

  useEffect(() => {
    if (!normalized) {
      setNote(null);
      setLoading(false);
      setError(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await fetchDailyNoteByDate(normalized);
        if (!alive) {
          return;
        }
        setNote(data);
      } catch (err) {
        if (!alive) {
          return;
        }
        setError(safeErrorMessage(err, "Unable to load daily note."));
        setNote(null);
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [normalized]);

  return { note, loading, error, refresh };
}

export function useWeeklyNote(weekStartInput: Date | string | null) {
  const normalized = useMemo(() => normalizeDateInput(weekStartInput), [weekStartInput]);
  const [note, setNote] = useState<WeeklyNote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!normalized) {
      setNote(null);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWeeklyNoteByStart(normalized);
      setNote(data);
      return data;
    } catch (err) {
      setError(safeErrorMessage(err, "Unable to load weekly note."));
      setNote(null);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [normalized]);

  useEffect(() => {
    if (!normalized) {
      setNote(null);
      setLoading(false);
      setError(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await fetchWeeklyNoteByStart(normalized);
        if (!alive) {
          return;
        }
        setNote(data);
      } catch (err) {
        if (!alive) {
          return;
        }
        setError(safeErrorMessage(err, "Unable to load weekly note."));
        setNote(null);
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [normalized]);

  return { note, loading, error, refresh };
}

export function useJournalTickers() {
  const [tickers, setTickers] = useState<JournalTicker[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJournalTickers();
      setTickers(data);
    } catch (err) {
      setTickers([]);
      setError(safeErrorMessage(err, "Unable to load tickers."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await fetchJournalTickers();
        if (!alive) {
          return;
        }
        setTickers(data);
      } catch (err) {
        if (!alive) {
          return;
        }
        setTickers([]);
        setError(safeErrorMessage(err, "Unable to load tickers."));
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return { tickers, loading, error, refetch: load };
}
