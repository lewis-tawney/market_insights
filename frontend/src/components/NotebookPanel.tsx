import React, { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useJournalTrades } from "@/lib/hooks/journal";
import {
  attachTradesToDailyNote,
  attachTradesToWeeklyNote,
  createOrUpdateDailyNote,
  createOrUpdateWeeklyNote,
  DailyNoteWithTrades,
  fetchDailyNoteWithTrades,
  fetchWeeklyNoteWithTrades,
  detachTradeFromDailyNote,
  detachTradeFromWeeklyNote,
  JournalTrade,
  WeeklyNoteWithTrades,
} from "@/lib/api";
import { useDailyNote, useWeeklyNote } from "@/lib/hooks/journal";

const INITIAL_DRAFT = "";

export default function NotebookPanel() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [dailyDate, setDailyDate] = useState(today);
  const [dailyPremarket, setDailyPremarket] = useState(INITIAL_DRAFT);
  const [dailyEod, setDailyEod] = useState(INITIAL_DRAFT);
  const [dailyTrades, setDailyTrades] = useState<JournalTrade[]>([]);
  const [selectedDailyCandidateIds, setSelectedDailyCandidateIds] = useState<string[]>([]);

  const { note: dailyNote, loading: dailyLoading, error: dailyError, refresh: refreshDaily } =
    useDailyNote(dailyDate);

  const [weeklyWeek, setWeeklyWeek] = useState(today);
  const [weeklyText, setWeeklyText] = useState(INITIAL_DRAFT);
  const [weeklyTrades, setWeeklyTrades] = useState<JournalTrade[]>([]);
  const [selectedWeeklyCandidateIds, setSelectedWeeklyCandidateIds] = useState<string[]>([]);

  const {
    note: weeklyNote,
    loading: weeklyLoading,
    error: weeklyError,
    refresh: refreshWeekly,
  } = useWeeklyNote(weeklyWeek);

  const dailySelectionParams = useMemo(
    () =>
      dailyDate
        ? {
            start_date: dailyDate,
            end_date: dailyDate,
            limit: 20,
          }
        : undefined,
    [dailyDate],
  );

  const weeklySelectionParams = useMemo(
    () =>
      weeklyWeek
        ? {
            start_date: weeklyWeek,
            end_date: weeklyWeek,
            limit: 20,
          }
        : undefined,
    [weeklyWeek],
  );

  const {
    trades: dailyCandidateTrades,
    loading: dailyCandidateLoading,
    error: dailyCandidateError,
  } = useJournalTrades(dailySelectionParams);

  const {
    trades: weeklyCandidateTrades,
    loading: weeklyCandidateLoading,
    error: weeklyCandidateError,
  } = useJournalTrades(weeklySelectionParams);

  useEffect(() => {
    setDailyPremarket(dailyNote?.premarket_notes ?? "");
    setDailyEod(dailyNote?.eod_notes ?? "");
  }, [dailyNote?.id]);

  useEffect(() => {
    setWeeklyText(weeklyNote?.text ?? "");
  }, [weeklyNote?.id]);

  useEffect(() => {
    setSelectedDailyCandidateIds([]);
  }, [dailyDate]);

  useEffect(() => {
    setSelectedWeeklyCandidateIds([]);
  }, [weeklyWeek]);

  const loadDailyTrades = useCallback(async () => {
    if (!dailyNote?.id) {
      setDailyTrades([]);
      return;
    }
    try {
      const payload = await fetchDailyNoteWithTrades(dailyNote.id);
      setDailyTrades(payload.trades);
    } catch (err) {
      console.error(err);
    }
  }, [dailyNote?.id]);

  const loadWeeklyTrades = useCallback(async () => {
    if (!weeklyNote?.id) {
      setWeeklyTrades([]);
      return;
    }
    try {
      const payload = await fetchWeeklyNoteWithTrades(weeklyNote.id);
      setWeeklyTrades(payload.trades);
    } catch (err) {
      console.error(err);
    }
  }, [weeklyNote?.id]);

  useEffect(() => {
    loadDailyTrades();
  }, [loadDailyTrades]);

  useEffect(() => {
    loadWeeklyTrades();
  }, [loadWeeklyTrades]);

  const toggleDailyCandidate = (tradeId: string) => {
    setSelectedDailyCandidateIds((prev) =>
      prev.includes(tradeId) ? prev.filter((id) => id !== tradeId) : [...prev, tradeId],
    );
  };

  const toggleWeeklyCandidate = (tradeId: string) => {
    setSelectedWeeklyCandidateIds((prev) =>
      prev.includes(tradeId) ? prev.filter((id) => id !== tradeId) : [...prev, tradeId],
    );
  };

  const handleSaveDaily = async () => {
    await createOrUpdateDailyNote({
      date: dailyDate,
      premarket_notes: dailyPremarket || null,
      eod_notes: dailyEod || null,
    });
    await refreshDaily();
    await loadDailyTrades();
  };

  const handleSaveWeekly = async () => {
    await createOrUpdateWeeklyNote({
      week_start_date: weeklyWeek,
      text: weeklyText || null,
    });
    await refreshWeekly();
    await loadWeeklyTrades();
  };

  const handleAttachDaily = async () => {
    if (!dailyNote?.id || !selectedDailyCandidateIds.length) {
      return;
    }
    await attachTradesToDailyNote(dailyNote.id, {
      trade_ids: selectedDailyCandidateIds,
      role: "review",
    });
    setSelectedDailyCandidateIds([]);
    await loadDailyTrades();
  };

  const handleAttachWeekly = async () => {
    if (!weeklyNote?.id || !selectedWeeklyCandidateIds.length) {
      return;
    }
    await attachTradesToWeeklyNote(weeklyNote.id, {
      trade_ids: selectedWeeklyCandidateIds,
      role: "review",
    });
    setSelectedWeeklyCandidateIds([]);
    await loadWeeklyTrades();
  };

  const handleDetachDaily = async (id: string) => {
    if (!dailyNote?.id) {
      return;
    }
    await detachTradeFromDailyNote(dailyNote.id, id);
    await loadDailyTrades();
  };

  const handleDetachWeekly = async (id: string) => {
    if (!weeklyNote?.id) {
      return;
    }
    await detachTradeFromWeeklyNote(weeklyNote.id, id);
    await loadWeeklyTrades();
  };

  const formatTradeLabel = (trade: JournalTrade) => {
    const entry = new Date(trade.entry_time).toLocaleString();
    const percent = trade.percent_pl?.toFixed(2) ?? "-";
    return `${trade.ticker} • ${entry} • ${percent}%`;
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-panel shadow-card">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-heading-md font-semibold">Daily note</h3>
            <Input
              type="date"
              value={dailyDate}
              onChange={(event) => setDailyDate(event.target.value)}
            />
            <Button size="sm" onClick={handleSaveDaily}>
              Save note
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Textarea
              placeholder="Premarket notes"
              value={dailyPremarket}
              onChange={(event) => setDailyPremarket(event.target.value)}
              className="h-24"
            />
            <Textarea
              placeholder="End-of-day notes"
              value={dailyEod}
              onChange={(event) => setDailyEod(event.target.value)}
              className="h-24"
            />
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Linked trades</p>
            <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
              {dailyTrades.length === 0 ? (
                <span>No trades linked yet.</span>
              ) : (
                dailyTrades.map((trade) => (
                  <span
                    key={trade.id}
                    className="flex items-center gap-2 rounded-full border border-border px-3 py-1"
                  >
                    {trade.ticker}
                    <button
                      type="button"
                      onClick={() => handleDetachDaily(trade.id)}
                      className="text-xs text-rose-400"
                    >
                      Remove
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-sm font-medium text-muted-foreground">Attach trades</p>
            <div className="mt-2 grid gap-2">
              {dailyCandidateLoading && <p className="text-sm text-muted-foreground">Loading trades…</p>}
              {!dailyCandidateLoading && dailyCandidateTrades.length === 0 && (
                <p className="text-sm text-muted-foreground">No candidate trades for this date.</p>
              )}
              {dailyCandidateTrades.map((trade) => (
                <label
                  key={trade.id}
                  className="flex cursor-pointer items-center justify-between rounded border border-border px-3 py-2 text-sm transition hover:border-foreground"
                >
                  <span className="truncate text-muted-foreground">{formatTradeLabel(trade)}</span>
                  <input
                    type="checkbox"
                    checked={selectedDailyCandidateIds.includes(trade.id)}
                    onChange={() => toggleDailyCandidate(trade.id)}
                  />
                </label>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Button
                size="sm"
                onClick={handleAttachDaily}
                disabled={!dailyNote?.id || selectedDailyCandidateIds.length === 0}
              >
                Attach selected
              </Button>
              <span className="text-xs text-muted-foreground">
                {selectedDailyCandidateIds.length} trade(s) selected
              </span>
            </div>
            {dailyCandidateError && (
              <p className="mt-2 text-sm text-rose-400">{dailyCandidateError}</p>
            )}
          </div>
        </div>
        {dailyLoading && <p className="mt-2 text-sm text-muted-foreground">Loading…</p>}
        {dailyError && <p className="mt-2 text-sm text-rose-400">{dailyError}</p>}
      </div>

      <div className="rounded-lg border border-border bg-card p-panel shadow-card">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-heading-md font-semibold">Weekly reflection</h3>
            <Input
              type="date"
              value={weeklyWeek}
              onChange={(event) => setWeeklyWeek(event.target.value)}
            />
            <Button size="sm" onClick={handleSaveWeekly}>
              Save week
            </Button>
          </div>
          <Textarea
            placeholder="Weekly notes"
            value={weeklyText}
            onChange={(event) => setWeeklyText(event.target.value)}
            className="h-32"
          />
          <p className="text-sm text-muted-foreground">
            Trade count: {weeklyNote?.trade_count ?? 0}
          </p>
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Linked trades</p>
            {weeklyTrades.length === 0 ? (
              <p className="text-sm text-muted-foreground">No trades linked.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {weeklyTrades.map((trade) => (
                  <span
                    key={trade.id}
                    className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
                  >
                    {trade.ticker}
                    <button
                      type="button"
                      onClick={() => handleDetachWeekly(trade.id)}
                      className="text-rose-400"
                    >
                      Remove
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-lg border border-border bg-background p-3">
            <p className="text-sm font-medium text-muted-foreground">Attach trades</p>
            <div className="mt-2 grid gap-2">
              {weeklyCandidateLoading && (
                <p className="text-sm text-muted-foreground">Loading trades…</p>
              )}
              {!weeklyCandidateLoading && weeklyCandidateTrades.length === 0 && (
                <p className="text-sm text-muted-foreground">No candidate trades for this week.</p>
              )}
              {weeklyCandidateTrades.map((trade) => (
                <label
                  key={trade.id}
                  className="flex cursor-pointer items-center justify-between rounded border border-border px-3 py-2 text-sm transition hover:border-foreground"
                >
                  <span className="truncate text-muted-foreground">{formatTradeLabel(trade)}</span>
                  <input
                    type="checkbox"
                    checked={selectedWeeklyCandidateIds.includes(trade.id)}
                    onChange={() => toggleWeeklyCandidate(trade.id)}
                  />
                </label>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Button
                size="sm"
                onClick={handleAttachWeekly}
                disabled={!weeklyNote?.id || selectedWeeklyCandidateIds.length === 0}
              >
                Attach selected
              </Button>
              <span className="text-xs text-muted-foreground">
                {selectedWeeklyCandidateIds.length} trade(s) selected
              </span>
            </div>
            {weeklyCandidateError && (
              <p className="mt-2 text-sm text-rose-400">{weeklyCandidateError}</p>
            )}
          </div>
        </div>
        {weeklyLoading && <p className="mt-2 text-sm text-muted-foreground">Loading…</p>}
        {weeklyError && <p className="mt-2 text-sm text-rose-400">{weeklyError}</p>}
      </div>
    </div>
  );
}
