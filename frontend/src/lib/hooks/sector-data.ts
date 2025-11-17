import { useCallback, useEffect, useRef, useState } from "react";

import {
  addSectorTicker,
  createSector,
  fetchSectorRalph,
  fetchSectorVolumeAggregate,
  fetchSnapshotHealth,
  fetchTaskStatus,
  removeSectorTicker,
  type SectorIn,
  type SectorRalphRow,
  type SectorVolumeDTO,
  type SnapshotHealthSummary,
  type TaskStatusResponse,
  type TickerMetricDTO,
} from "../api";

export type SortDirection = "asc" | "desc";

export type DecoratedSector = SectorVolumeDTO & {
  fiveDayChange: number | null;
};

export type DecoratedTicker = TickerMetricDTO & {
  change5d: number | null;
};

export type PendingMutation = {
  taskId: string;
  status: "pending" | "failed";
  message?: string;
  action: "add" | "remove" | "create";
  symbol?: string;
  sectorName?: string;
};

export const TICKER_PATTERN = /^[A-Z0-9.-]{1,10}$/;
const SECTOR_STORAGE_KEY = "market-insights:sector-definitions";

export function normalizeTickerInput(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function loadStoredSectorDefinitions(): SectorIn[] | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(SECTOR_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }

    const sanitized = parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }

        const { id, name, tickers } = entry as {
          id?: unknown;
          name?: unknown;
          tickers?: unknown;
        };

        if (typeof id !== "string" || typeof name !== "string") {
          return null;
        }

        const cleaned = Array.isArray(tickers)
          ? Array.from(
              new Set(
                tickers
                  .map((ticker) =>
                    typeof ticker === "string" ? normalizeTickerInput(ticker) : null,
                  )
                  .filter((ticker): ticker is string => Boolean(ticker)),
              ),
            )
          : [];

        return { id, name, tickers: cleaned } satisfies SectorIn;
      })
      .filter((sector): sector is SectorIn => sector !== null);

    return sanitized.length ? sanitized : null;
  } catch {
    return null;
  }
}

export function persistSectorDefinitions(definitions: SectorIn[] | null): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (!definitions || !definitions.length) {
      window.localStorage.removeItem(SECTOR_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(SECTOR_STORAGE_KEY, JSON.stringify(definitions));
  } catch {
    // ignore storage errors
  }
}

function tickerFiveDayChange(metric: TickerMetricDTO): number | null {
  if (typeof metric.change5d === "number" && Number.isFinite(metric.change5d)) {
    return metric.change5d;
  }
  if (!Array.isArray(metric.history) || metric.history.length < 6) {
    return null;
  }
  const closes = metric.history
    .map((entry) =>
      typeof entry?.close === "number" && Number.isFinite(entry.close) ? entry.close : null,
    )
    .filter((value): value is number => value !== null);
  if (closes.length < 6) {
    return null;
  }
  const end = closes[closes.length - 1];
  const start = closes[closes.length - 6];
  if (!start) {
    return null;
  }
  return ((end / start) - 1) * 100;
}

export function decorateTicker(metric: TickerMetricDTO): DecoratedTicker {
  return {
    ...metric,
    change5d: tickerFiveDayChange(metric),
  };
}

function computeSectorFiveDayChange(metrics: TickerMetricDTO[]): number | null {
  const values = metrics
    .map((metric) => tickerFiveDayChange(metric))
    .filter((value): value is number => value !== null && Number.isFinite(value));
  if (!values.length) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function useSectorSnapshot(
  definitions: SectorIn[] | null,
  refreshKey: number,
) {
  const [sectors, setSectors] = useState<DecoratedSector[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const payload = await fetchSectorVolumeAggregate(definitions ?? undefined);
        if (!alive) {
          return;
        }
        const decorated: DecoratedSector[] = payload.map((sector) => ({
          ...sector,
          fiveDayChange: computeSectorFiveDayChange(sector.members_detail ?? []),
        }));
        setSectors(decorated);
      } catch (err: any) {
        if (!alive) {
          return;
        }
        const message =
          typeof err?.message === "string" && err.message.trim()
            ? err.message.trim()
            : "Unable to load sectors.";
        setError(message);
        setSectors([]);
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [definitions, refreshKey]);

  return { sectors, loading, error };
}

export function useSnapshotMeta(refreshKey: number) {
  const [metadata, setMetadata] = useState<SnapshotHealthSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const meta = await fetchSnapshotHealth();
        if (!alive) return;
        setMetadata(meta);
      } catch (err: any) {
        if (!alive) return;
        setError(
          typeof err?.message === "string" && err.message.trim()
            ? err.message.trim()
            : "Unable to load snapshot metadata.",
        );
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [refreshKey]);

  return { metadata, loading, error };
}

export function useRalphData(enabled: boolean, refreshKey: number) {
  const [rows, setRows] = useState<SectorRalphRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const payload = await fetchSectorRalph();
        if (!alive) return;
        setRows(payload);
      } catch (err: any) {
        if (!alive) return;
        setRows([]);
        setError(
          typeof err?.message === "string" && err.message.trim()
            ? err.message.trim()
            : "Unable to load RALPH data.",
        );
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [enabled, refreshKey]);

  return { rows, loading, error };
}

async function pollTaskOnce(taskId: string): Promise<TaskStatusResponse> {
  return fetchTaskStatus(taskId);
}

export function useSectorMutations(onRefresh: () => void) {
  const [pendingTasks, setPendingTasks] = useState<Record<string, PendingMutation>>({});
  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const pollTask = useCallback(
    async (sectorId: string, taskId: string, meta: { action: PendingMutation["action"]; symbol?: string; sectorName?: string }) => {
      let delay = 1500;
      const maxAttempts = 10;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        let response: TaskStatusResponse;
        try {
          response = await pollTaskOnce(taskId);
        } catch (err: any) {
          if (!isMounted.current) return;
          setPendingTasks((prev) => ({
            ...prev,
            [sectorId]: {
              taskId,
              status: "failed",
              action: meta.action,
              symbol: meta.symbol,
              sectorName: meta.sectorName,
              message:
                typeof err?.message === "string" && err.message.trim()
                  ? err.message.trim()
                  : "Unable to fetch task status.",
            },
          }));
          return;
        }

        if (response.status === "succeeded") {
          if (!isMounted.current) return;
          setPendingTasks((prev) => {
            const next = { ...prev };
            delete next[sectorId];
            return next;
          });
          onRefresh();
          return;
        }

        if (response.status === "failed") {
          if (!isMounted.current) return;
          setPendingTasks((prev) => ({
            ...prev,
            [sectorId]: {
              taskId,
              status: "failed",
              action: meta.action,
              symbol: meta.symbol,
              sectorName: meta.sectorName,
              message: response.message ?? "Task failed.",
            },
          }));
          return;
        }

        delay = Math.min(delay * 1.5, 5000);
      }
    },
    [onRefresh],
  );

  const enqueueMutation = useCallback(
    async (
      sectorId: string,
      action: PendingMutation["action"],
      request: () => Promise<{ task_id: string }>,
      meta?: { symbol?: string; sectorName?: string },
    ) => {
      const { task_id } = await request();
      if (!isMounted.current) {
        return;
      }
      setPendingTasks((prev) => ({
        ...prev,
        [sectorId]: {
          taskId: task_id,
          status: "pending",
          action,
          symbol: meta?.symbol,
          sectorName: meta?.sectorName,
        },
      }));
      pollTask(sectorId, task_id, { action, symbol: meta?.symbol, sectorName: meta?.sectorName });
    },
    [pollTask],
  );

  const addTickerToSector = useCallback(
    async (sectorId: string, symbol: string) => {
      await enqueueMutation(
        sectorId,
        "add",
        () => addSectorTicker(sectorId, symbol),
        { symbol },
      );
    },
    [enqueueMutation],
  );

  const removeTickerFromSector = useCallback(
    async (sectorId: string, symbol: string) => {
      await enqueueMutation(
        sectorId,
        "remove",
        () => removeSectorTicker(sectorId, symbol),
        { symbol },
      );
    },
    [enqueueMutation],
  );

  const createSectorTask = useCallback(
    async (payload: SectorIn) => {
      await enqueueMutation(
        payload.id,
        "create",
        () => createSector({ id: payload.id, name: payload.name, tickers: payload.tickers }),
        { sectorName: payload.name },
      );
    },
    [enqueueMutation],
  );

  return { pendingTasks, addTickerToSector, removeTickerFromSector, createSectorTask };
}
