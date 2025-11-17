import React, { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useJournalSetups } from "@/lib/hooks/journal";
import {
  createJournalSetup,
  deleteJournalSetup,
  JournalSetup,
  updateJournalSetup,
} from "@/lib/api";

const MIN_RULES = 1;

export default function PlaybookPanel() {
  const { setups, loading, error, refetch } = useJournalSetups();
  const [form, setForm] = useState({ name: "", description: "", rules: "" });
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingForm, setEditingForm] = useState({ name: "", description: "", rules: "" });
  const [editErrors, setEditErrors] = useState<string[]>([]);
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name.trim()) {
      return;
    }
    setSubmitting(true);
    try {
      await createJournalSetup({
        name: form.name.trim(),
        description: form.description.trim() || null,
        rules: form.rules
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      });
      setForm({ name: "", description: "", rules: "" });
      await refetch();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (setup: JournalSetup) => {
    if (!confirm(`Delete setup ${setup.name}?`)) {
      return;
    }
    await deleteJournalSetup(setup.id);
    await refetch();
  };

  const startEditing = (setup: JournalSetup) => {
    setEditingId(setup.id);
    setEditingForm({
      name: setup.name,
      description: setup.description ?? "",
      rules: setup.rules.join("\n"),
    });
    setEditErrors([]);
    setEditMessage(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditErrors([]);
    setEditMessage(null);
  };

  const handleSaveEdit = async () => {
    if (!editingId) {
      return;
    }
    const name = editingForm.name.trim();
    const rules = editingForm.rules
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const errors = [];
    if (!name) {
      errors.push("Name is required.");
    }
    if (rules.length < MIN_RULES) {
      errors.push("Add at least one rule.");
    }
    if (errors.length) {
      setEditErrors(errors);
      return;
    }
    setEditSaving(true);
    try {
      await updateJournalSetup(editingId, {
        name,
        description: editingForm.description.trim() || null,
        rules,
      });
      setEditMessage("Saved.");
      await refetch();
      cancelEditing();
    } catch (err: any) {
      setEditMessage(err?.message ?? "Unable to update setup.");
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <form className="space-y-3" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="Setup name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <Input
            placeholder="Description"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </div>
        <Textarea
          placeholder="Rules (one per line)"
          className="h-24"
          value={form.rules}
          onChange={(event) => setForm({ ...form, rules: event.target.value })}
        />
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving..." : "Add setup"}
        </Button>
      </form>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <div className="space-y-3">
        {loading && <p className="text-sm text-muted-foreground">Loading setups...</p>}
        {setups.map((setup) => (
          <div
            key={setup.id}
            className="rounded-lg border border-border bg-card p-4 shadow-sm"
          >
            {editingId === setup.id ? (
              <div className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    placeholder="Setup name"
                    value={editingForm.name}
                    onChange={(event) =>
                      setEditingForm({ ...editingForm, name: event.target.value })
                    }
                  />
                  <Input
                    placeholder="Description"
                    value={editingForm.description}
                    onChange={(event) =>
                      setEditingForm({ ...editingForm, description: event.target.value })
                    }
                  />
                </div>
                <Textarea
                  className="h-24"
                  placeholder="Rules (one per line)"
                  value={editingForm.rules}
                  onChange={(event) =>
                    setEditingForm({ ...editingForm, rules: event.target.value })
                  }
                />
                <div className="flex items-center gap-3">
                  <Button size="sm" onClick={handleSaveEdit} disabled={editSaving}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={cancelEditing}>
                    Cancel
                  </Button>
                </div>
                {editErrors.length > 0 && (
                  <div className="space-y-1 text-xs text-rose-500">
                    {editErrors.map((err) => (
                      <p key={err}>{err}</p>
                    ))}
                  </div>
                )}
                {editMessage && (
                  <p className="text-xs text-muted-foreground">{editMessage}</p>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-foreground">{setup.name}</p>
                    {setup.description && (
                      <p className="text-sm text-muted-foreground">{setup.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => startEditing(setup)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(setup)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
                {setup.rules.length > 0 && (
                  <ul className="mt-3 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                    {setup.rules.map((rule, idx) => (
                      <li key={`${setup.id}-rule-${idx}`}>{rule}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
