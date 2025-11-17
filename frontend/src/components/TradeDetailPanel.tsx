import React, { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, X } from "lucide-react";

import {
  deleteJournalTrade,
  fetchTradeScreenshots,
  JournalScreenshot,
  JournalTrade,
  updateJournalTrade,
} from "@/lib/api";
import { validateTradePayload } from "@/lib/tradeValidation";

interface TradeDetailPanelProps {
  trade: JournalTrade;
  onClose: () => void;
  onDeleted?: () => void;
  onUpdated?: () => void;
}

const formatDisplayTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "—";

const formatInputTime = (value?: string | null) =>
  value ? new Date(value).toISOString().slice(0, 16) : "";

export default function TradeDetailPanel({
  trade,
  onClose,
  onDeleted,
  onUpdated,
}: TradeDetailPanelProps) {
  const [screenshots, setScreenshots] = useState<JournalScreenshot[]>([]);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const initialForm = useMemo(
    () => ({
      ticker: trade.ticker,
      direction: trade.direction,
      status: trade.status,
      entry_price: trade.entry_price,
      exit_price: trade.exit_price,
      position_size: trade.position_size,
      stop_price: trade.stop_price,
      entry_time: trade.entry_time,
      exit_time: trade.exit_time,
      what_they_saw: trade.what_they_saw ?? "",
      exit_plan: trade.exit_plan ?? "",
      feelings: trade.feelings ?? "",
      notes: trade.notes ?? "",
    }),
    [trade],
  );
  const [form, setForm] = useState(initialForm);

  useEffect(() => setForm(initialForm), [initialForm]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await fetchTradeScreenshots(trade.id);
        if (alive) {
          setScreenshots(data);
        }
      } catch (err) {
        console.error(err);
      }
    })();
    return () => {
      alive = false;
    };
  }, [trade.id]);

  const handleDelete = async () => {
    if (!confirm(`Delete trade ${trade.ticker}?`)) {
      return;
    }
    setDeleting(true);
    try {
      await deleteJournalTrade(trade.id);
      onDeleted?.();
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async () => {
    const payload = {
      ticker: form.ticker.trim().toUpperCase(),
      direction: form.direction,
      status: form.status,
      entry_price: Number(form.entry_price),
      exit_price: form.exit_price != null ? Number(form.exit_price) : null,
      position_size: Number(form.position_size),
      stop_price: form.stop_price != null ? Number(form.stop_price) : null,
      entry_time: new Date(form.entry_time).toISOString(),
      exit_time: form.exit_time ? new Date(form.exit_time).toISOString() : null,
      what_they_saw: form.what_they_saw || null,
      exit_plan: form.exit_plan || null,
      feelings: form.feelings || null,
      notes: form.notes || null,
    };

    const validation = validateTradePayload(payload);
    if (validation.length) {
      setErrors(validation);
      return;
    }

    setSaving(true);
    setErrors([]);
    setMessage(null);
    try {
      await updateJournalTrade(trade.id, payload);
      setMessage("Saved.");
      setEditing(false);
      onUpdated?.();
    } catch (err: any) {
      setMessage(err?.message ?? "Unable to save trade.");
    } finally {
      setSaving(false);
    }
  };

  const summaryRow = (label: string, value: string | null) => (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value ?? "—"}</span>
    </div>
  );

  const renderSummary = (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {summaryRow("Ticker", trade.ticker)}
        {summaryRow("Direction", trade.direction)}
        {summaryRow("Status", trade.status)}
        {summaryRow("Entry", formatDisplayTime(trade.entry_time))}
        {summaryRow("Exit", formatDisplayTime(trade.exit_time))}
        {summaryRow("Entry price", `$${trade.entry_price.toFixed(2)}`)}
        {summaryRow(
          "Percent P&L",
          trade.percent_pl !== null ? `${trade.percent_pl.toFixed(2)}%` : "—",
        )}
        {summaryRow(
          "Dollar P&L",
          trade.dollar_pl !== null ? `$${trade.dollar_pl.toFixed(2)}` : "—",
        )}
        {summaryRow(
          "Hold (sec)",
          trade.hold_time_seconds !== null ? trade.hold_time_seconds.toString() : "—",
        )}
        {summaryRow("R", trade.r_multiple !== null ? trade.r_multiple.toFixed(2) : "—")}
      </div>
      <div className="space-y-2 text-sm">
        {trade.what_they_saw && (
          <p>
            <span className="font-semibold">What they saw:</span> {trade.what_they_saw}
          </p>
        )}
        {trade.exit_plan && (
          <p>
            <span className="font-semibold">Exit plan:</span> {trade.exit_plan}
          </p>
        )}
        {trade.feelings && (
          <p>
            <span className="font-semibold">Feelings:</span> {trade.feelings}
          </p>
        )}
        {trade.notes && (
          <p>
            <span className="font-semibold">Notes:</span> {trade.notes}
          </p>
        )}
      </div>
    </div>
  );

  const renderForm = (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          Ticker
          <Input
            value={form.ticker}
            onChange={(event) =>
              setForm({ ...form, ticker: event.target.value.toUpperCase() })
            }
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Direction
          <select
            className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm"
            value={form.direction}
            onChange={(event) =>
              setForm({ ...form, direction: event.target.value as JournalTrade["direction"] })
            }
          >
            <option value="long">Long</option>
            <option value="short">Short</option>
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Status
          <select
            className="mt-1 w-full rounded border border-border bg-background px-3 py-2 text-sm"
            value={form.status}
            onChange={(event) =>
              setForm({ ...form, status: event.target.value as JournalTrade["status"] })
            }
          >
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Entry price
          <Input
            type="number"
            step="0.01"
            value={form.entry_price}
            onChange={(event) => setForm({ ...form, entry_price: Number(event.target.value) })}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Exit price
          <Input
            type="number"
            step="0.01"
            value={form.exit_price ?? ""}
            onChange={(event) =>
              setForm({
                ...form,
                exit_price: event.target.value ? Number(event.target.value) : null,
              })
            }
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Position size
          <Input
            type="number"
            step="0.01"
            value={form.position_size}
            onChange={(event) => setForm({ ...form, position_size: Number(event.target.value) })}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Stop price
          <Input
            type="number"
            step="0.01"
            value={form.stop_price ?? ""}
            onChange={(event) =>
              setForm({
                ...form,
                stop_price: event.target.value ? Number(event.target.value) : null,
              })
            }
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Entry time
          <Input
            type="datetime-local"
            value={formatInputTime(form.entry_time)}
            onChange={(event) => setForm({ ...form, entry_time: event.target.value })}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Exit time
          <Input
            type="datetime-local"
            value={formatInputTime(form.exit_time)}
            onChange={(event) => setForm({ ...form, exit_time: event.target.value })}
          />
        </label>
      </div>
      <Textarea
        className="h-16"
        placeholder="What they saw"
        value={form.what_they_saw}
        onChange={(event) => setForm({ ...form, what_they_saw: event.target.value })}
      />
      <Textarea
        className="h-16"
        placeholder="Exit plan"
        value={form.exit_plan}
        onChange={(event) => setForm({ ...form, exit_plan: event.target.value })}
      />
      <Textarea
        className="h-16"
        placeholder="Feelings"
        value={form.feelings}
        onChange={(event) => setForm({ ...form, feelings: event.target.value })}
      />
      <Textarea
        className="h-16"
        placeholder="Notes"
        value={form.notes}
        onChange={(event) => setForm({ ...form, notes: event.target.value })}
      />
    </div>
  );

  const body = editing ? renderForm : renderSummary;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-panel shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-heading-md font-semibold">Trade detail</h3>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            <button
              onClick={onClose}
              className="rounded-full border border-border p-1 text-muted-foreground hover:border-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        {message && <p className="mt-2 text-xs text-muted-foreground">{message}</p>}
        {errors.length > 0 && (
          <div className="mt-2 space-y-1 rounded border border-rose-500/60 bg-rose-500/10 p-3 text-xs text-rose-800">
            {errors.map((err) => (
              <p key={err}>{err}</p>
            ))}
          </div>
        )}
        <div className="mt-4">{body}</div>
        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Screenshots
          </p>
          {screenshots.length === 0 ? (
            <p className="text-sm text-muted-foreground">No screenshots yet.</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {screenshots.map((shot) => (
                <a
                  key={shot.id}
                  href={shot.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-border p-3 text-sm text-muted-foreground transition hover:border-foreground"
                >
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    {shot.caption || "Screenshot"}
                  </p>
                  <p className="text-xs text-foreground">View</p>
                </a>
              ))}
            </div>
          )}
        </div>
        <div className="mt-6 flex items-center gap-3">
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete trade"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
