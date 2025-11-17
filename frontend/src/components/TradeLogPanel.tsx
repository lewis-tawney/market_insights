import React, { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useJournalTrades } from "@/lib/hooks/journal";
import {
  createJournalTrade,
  deleteJournalTrade,
  JournalTrade,
} from "@/lib/api";
import { Trash2 } from "lucide-react";
import { validateTradePayload } from "@/lib/tradeValidation";
import TradeDetailPanel from "./TradeDetailPanel";

const INITIAL_FORM = {
  ticker: "",
  direction: "long" as const,
  status: "open" as const,
  entry_price: "",
  position_size: "",
  entry_time: new Date().toISOString().slice(0, 16),
};

export default function TradeLogPanel() {
  const { trades, loading, error, refetch } = useJournalTrades({ limit: 20 });
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [selectedTrade, setSelectedTrade] = useState<JournalTrade | null>(null);

  const entries = useMemo(() => (trades ?? []), [trades]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setFormErrors([]);
    setFormMessage(null);
    try {
      const payload = {
        ticker: form.ticker.trim().toUpperCase(),
        direction: form.direction,
        status: form.status,
        entry_price: Number(form.entry_price),
        position_size: Number(form.position_size),
        entry_time: new Date(form.entry_time).toISOString(),
      };
      const errors = validateTradePayload(payload);
      if (errors.length) {
        setFormErrors(errors);
        return;
      }
      await createJournalTrade(payload);
      setForm(INITIAL_FORM);
      await refetch();
      setFormMessage("Trade saved.");
    } catch (err: any) {
      console.error(err);
      setFormMessage(err?.message ?? "Unable to save trade.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (trade: JournalTrade) => {
    if (!confirm(`Delete trade ${trade.ticker}?`)) {
      return;
    }
    await deleteJournalTrade(trade.id);
    await refetch();
  };

  const openDetail = (trade: JournalTrade) => {
    setSelectedTrade(trade);
  };

  return (
    <div className="space-y-4">
      <form
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={handleSubmit}
      >
        <Input
          placeholder="Ticker"
          value={form.ticker}
          onChange={(event) => setForm({ ...form, ticker: event.target.value })}
        />
        <select
          className="rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none transition hover:border-foreground"
          value={form.direction}
          onChange={(event) =>
            setForm({ ...form, direction: event.target.value as typeof form.direction })
          }
        >
          <option value="long">Long</option>
          <option value="short">Short</option>
        </select>
        <select
          className="rounded-md border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none transition hover:border-foreground"
          value={form.status}
          onChange={(event) => setForm({ ...form, status: event.target.value as typeof form.status })}
        >
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
        <Input
          placeholder="Entry price"
          type="number"
          min="0"
          step="0.01"
          value={form.entry_price}
          onChange={(event) => setForm({ ...form, entry_price: event.target.value })}
        />
        <Input
          placeholder="Position size"
          type="number"
          min="0"
          step="0.01"
          value={form.position_size}
          onChange={(event) => setForm({ ...form, position_size: event.target.value })}
        />
        <Input
          placeholder="Entry time"
          type="datetime-local"
          value={form.entry_time}
          onChange={(event) => setForm({ ...form, entry_time: event.target.value })}
        />
        <Button type="submit" disabled={submitting} className="col-span-full lg:col-auto">
          {submitting ? "Saving..." : "Log trade"}
        </Button>
      </form>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="min-w-full text-sm">
          <thead className="bg-background px">
            <tr>
              <th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
                Entry
              </th>
              <th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
                Ticker
              </th>
              <th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
                Direction
              </th>
              <th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
                Status
              </th>
              <th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
                Entry
              </th>
              <th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
                P&amp;L %
              </th>
              <th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-left text-sm text-muted-foreground">
                  {loading ? "Loading trades..." : "No trades logged yet."}
                </td>
              </tr>
            ) : (
              entries.map((trade) => (
              <tr
                key={trade.id}
                className="border-b border-border hover:bg-muted cursor-pointer"
                onClick={() => openDetail(trade)}
              >
                  <td className="px-3 py-2">
                    {new Date(trade.entry_time).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 font-medium">{trade.ticker}</td>
                  <td className="px-3 py-2 capitalize">{trade.direction}</td>
                  <td className="px-3 py-2 capitalize">{trade.status}</td>
                  <td className="px-3 py-2">${trade.entry_price.toFixed(2)}</td>
                  <td
                    className={`px-3 py-2 font-semibold ${
                      trade.percent_pl && trade.percent_pl > 0
                        ? "text-emerald-400"
                        : trade.percent_pl && trade.percent_pl < 0
                        ? "text-rose-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {trade.percent_pl?.toFixed(2) ?? "-"}%
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDelete(trade);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      {formErrors.length > 0 && (
        <div className="space-y-1 rounded border border-rose-500/60 bg-rose-500/10 p-3 text-xs text-rose-800">
          {formErrors.map((err) => (
            <p key={err}>{err}</p>
          ))}
        </div>
      )}
      {formMessage && (
        <p className="text-sm text-muted-foreground">{formMessage}</p>
      )}
      {selectedTrade && (
        <TradeDetailPanel
          trade={selectedTrade}
          onClose={() => setSelectedTrade(null)}
          onDeleted={() => {
            refetch();
            setSelectedTrade(null);
          }}
          onUpdated={() => {
            refetch();
          }}
        />
      )}
    </div>
  );
}
