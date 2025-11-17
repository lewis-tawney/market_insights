import React, { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import TradeDetailPanel from "./TradeDetailPanel";
import { Textarea } from "@/components/ui/textarea";
import {
  useJournalSetups,
  useJournalTickers,
  useTickerProfile,
} from "@/lib/hooks/journal";
import { JournalTrade, TickerProfileFilters, updateJournalTicker } from "@/lib/api";

const OUTCOMES: Array<{ value: TickerProfileFilters["outcome"]; label: string }> = [
  { value: "all", label: "All" },
  { value: "winners", label: "Winners" },
  { value: "losers", label: "Losers" },
];

export default function TickerProfilesPanel() {
  const { tickers, loading: tickersLoading } = useJournalTickers();
  const { setups } = useJournalSetups();
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<TickerProfileFilters["outcome"]>("all");
  const [setupFilter, setSetupFilter] = useState<string | undefined>(undefined);
  const [detailTrade, setDetailTrade] = useState<JournalTrade | null>(null);

  useEffect(() => {
    if (!selectedSymbol && tickers.length > 0) {
      setSelectedSymbol(tickers[0].symbol);
    }
  }, [tickers, selectedSymbol]);

  useEffect(() => {
    if (selectedSymbol && !tickers.some((ticker) => ticker.symbol === selectedSymbol)) {
      setSelectedSymbol(tickers[0]?.symbol ?? null);
    }
  }, [tickers, selectedSymbol]);

  const filters = useMemo<TickerProfileFilters>(() => ({
    outcome,
    setup_id: setupFilter ?? undefined,
  }), [outcome, setupFilter]);

  const {
    profile,
    loading: profileLoading,
    error: profileError,
    refetch: refetchProfile,
  } = useTickerProfile(selectedSymbol, filters);

  const handleTradeClick = (trade: JournalTrade) => {
    setDetailTrade(trade);
  };

  const [notesEditing, setNotesEditing] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesMessage, setNotesMessage] = useState<string | null>(null);
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

  useEffect(() => {
    setNotesDraft(profile?.ticker.notes ?? "");
  }, [profile?.ticker.notes]);

  const handleSaveNotes = async () => {
    if (!profile) {
      return;
    }
    setNotesSaving(true);
    setNotesError(null);
    try {
      await updateJournalTicker(profile.ticker.symbol, {
        notes: notesDraft.trim() || null,
      });
      setNotesMessage("Notes saved.");
      setNotesEditing(false);
      await refetchProfile();
    } catch (err: any) {
      setNotesError(err?.message ?? "Unable to save notes.");
    } finally {
      setNotesSaving(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <div className="space-y-3 rounded-lg border border-border bg-card p-panel">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Tickers</h4>
          <span className="text-xs text-muted-foreground">
            {tickers.length} total
          </span>
        </div>
        <div className="space-y-2 max-h-[360px] overflow-y-auto">
          {tickersLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {tickers.map((ticker) => (
            <button
              key={ticker.symbol}
              onClick={() => setSelectedSymbol(ticker.symbol)}
              className={`w-full rounded px-3 py-2 text-left text-sm transition hover:bg-background-raised ${
                selectedSymbol === ticker.symbol ? "bg-background-raised font-semibold" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <span>{ticker.symbol}</span>
                <span className="text-xs text-muted-foreground">{ticker.notes ?? ""}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-4 rounded-lg border border-border bg-card p-panel">
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="max-w-[140px] rounded border border-border bg-transparent px-3 py-2 text-sm"
            value={outcome}
            onChange={(event) => setOutcome(event.target.value as TickerProfileFilters["outcome"])}
          >
            {OUTCOMES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
          <select
            className="max-w-[180px] rounded border border-border bg-transparent px-3 py-2 text-sm"
            value={setupFilter ?? ""}
            onChange={(event) => setSetupFilter(event.target.value || undefined)}
          >
            <option value="">All setups</option>
            {setups.map((setup) => (
              <option key={setup.id} value={setup.id}>
                {setup.name}
              </option>
            ))}
          </select>
        </div>
        {profileLoading && <p className="text-sm text-muted-foreground">Loading profile…</p>}
        {profileError && <p className="text-sm text-rose-400">{profileError}</p>}
        {!profile && !profileLoading && (
          <p className="text-sm text-muted-foreground">Select a ticker to view details.</p>
        )}
        {profile && (
          <div className="space-y-4">
            <div className="space-y-1 text-sm">
              <p className="text-lg font-semibold">{profile.ticker.symbol}</p>
              {profile.ticker.notes && (
                <p className="text-muted-foreground">{profile.ticker.notes}</p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Notes
                </p>
                {!notesEditing ? (
                  <Button size="xs" variant="ghost" onClick={() => setNotesEditing(true)}>
                    Edit notes
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button size="xs" onClick={handleSaveNotes} disabled={notesSaving}>
                      Save
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => {
                        setNotesEditing(false);
                        setNotesDraft(profile.ticker.notes ?? "");
                        setNotesError(null);
                        setNotesMessage(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
              <Textarea
                className="h-24"
                value={notesDraft}
                onChange={(event) => setNotesDraft(event.target.value)}
                readOnly={!notesEditing}
              />
              {notesError && (
                <p className="text-xs text-rose-400">{notesError}</p>
              )}
              {notesMessage && (
                <p className="text-xs text-muted-foreground">{notesMessage}</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Trades
              </p>
              <div className="mt-2 space-y-2 text-sm">
                {profile.trades.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No trades recorded.</p>
                ) : (
                  <div className="space-y-1">
                    {profile.trades.slice(0, 8).map((trade) => (
                      <button
                        key={trade.id}
                        className="flex w-full items-center justify-between rounded border border-border px-3 py-2 text-left text-sm transition hover:bg-background"
                        onClick={() => handleTradeClick(trade)}
                      >
                        <span>{new Date(trade.entry_time).toLocaleDateString()}</span>
                        <span>{trade.status}</span>
                        <span>{trade.percent_pl?.toFixed(1) ?? "-"}%</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Setup reviews
              </p>
              <div className="mt-2 space-y-2 text-sm">
                {profile.setup_reviews.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No reviews yet.</p>
                ) : (
                  profile.setup_reviews.slice(0, 6).map((review) => (
                    <div
                      key={review.id}
                      className="rounded border border-border px-3 py-2 text-sm"
                    >
                      <p className="text-sm font-semibold">{review.setup_id ?? "General"}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(review.date).toLocaleDateString()} • {review.notes}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      {detailTrade && (
        <TradeDetailPanel
          trade={detailTrade}
          onClose={() => setDetailTrade(null)}
          onDeleted={() => setDetailTrade(null)}
        />
      )}
    </div>
  );
}
