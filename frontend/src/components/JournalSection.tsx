import React, { useEffect, useMemo, useState } from "react";
import { Archive, Pin, Plus, Search, Star, Tag, X } from "lucide-react";

type IdeaStatus = "watching" | "active" | "complete";
type IdeaPriority = "A" | "B" | "C";
type NoteCategory = "prep" | "review";

interface IdeaNote {
  id: string;
  text: string;
  timestamp: string;
  pinned: boolean;
}

interface Idea {
  id: string;
  symbol: string;
  setup: string;
  plan: string;
  tags: string[];
  status: IdeaStatus;
  priority: IdeaPriority;
  carry: boolean;
  levels: {
    trigger: string;
    invalidation: string;
    target: string;
  };
  notes: Record<NoteCategory, IdeaNote[]>;
}

const STATUS_META: Record<
  IdeaStatus,
  { label: string; badge: string; dot: string }
> = {
  watching: {
    label: "Watching",
    badge: "border-sky-500 text-sky-300",
    dot: "bg-sky-400",
  },
  active: {
    label: "In Play",
    badge: "border-emerald-500 text-emerald-300",
    dot: "bg-emerald-400",
  },
  complete: {
    label: "Logged",
    badge: "border-slate-500 text-slate-300",
    dot: "bg-slate-400",
  },
};

const PRIORITY_COLORS: Record<IdeaPriority, string> = {
  A: "bg-rose-400",
  B: "bg-amber-400",
  C: "bg-slate-500",
};

const generateId = () =>
  `id_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`;

const formatTime = (timestamp: string) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
};

const initialIdeas: Idea[] = [
  {
    id: "idea-nvda",
    symbol: "NVDA",
    setup: "Momentum continuation",
    plan: "Look for 950 reclaim with volume; trim into 968 target.",
    tags: ["semis", "mega-cap"],
    status: "active",
    priority: "A",
    carry: true,
    levels: {
      trigger: "950 reclaim",
      invalidation: "938 close",
      target: "968 / 975",
    },
    notes: {
      prep: [
        {
          id: "nvda-pre-1",
          text: "Breadth supportive; SOX holding highs.",
          timestamp: `${new Date().toISOString()}`,
          pinned: true,
        },
        {
          id: "nvda-pre-2",
          text: "Watch 15m higher low before adding.",
          timestamp: `${new Date().toISOString()}`,
          pinned: false,
        },
      ],
      review: [
        {
          id: "nvda-rev-1",
          text: "Trimmed too early; next time trail with VWAP.",
          timestamp: `${new Date().toISOString()}`,
          pinned: false,
        },
      ],
    },
  },
  {
    id: "idea-tsla",
    symbol: "TSLA",
    setup: "Reclaim reversal",
    plan: "If 200 holds on open, work toward 206 gap fill.",
    tags: ["auto", "bounce"],
    status: "watching",
    priority: "B",
    carry: false,
    levels: {
      trigger: "200 hold",
      invalidation: "195.8 break",
      target: "206 / 208",
    },
    notes: {
      prep: [
        {
          id: "tsla-pre-1",
          text: "Need QQQ confirmation; avoid overlap with NVDA.",
          timestamp: `${new Date().toISOString()}`,
          pinned: false,
        },
      ],
      review: [],
    },
  },
  {
    id: "idea-pltr",
    symbol: "PLTR",
    setup: "Base break",
    plan: "Build list for next breakout; focus on 27 trigger.",
    tags: ["software", "growth"],
    status: "watching",
    priority: "C",
    carry: false,
    levels: {
      trigger: "26.90 push",
      invalidation: "25.8 fail",
      target: "29.5",
    },
    notes: {
      prep: [],
      review: [],
    },
  },
];

export default function JournalSection() {
  const [ideas, setIdeas] = useState<Idea[]>(initialIdeas);
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(
    initialIdeas[0]?.id ?? null,
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<IdeaStatus | "all">("all");

  const statusCounts = useMemo(() => {
    return ideas.reduce(
      (acc, idea) => {
        acc[idea.status] += 1;
        return acc;
      },
      { watching: 0, active: 0, complete: 0 },
    );
  }, [ideas]);

  const filteredIdeas = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return ideas.filter((idea) => {
      const matchesStatus =
        statusFilter === "all" || idea.status === statusFilter;
      const matchesTerm =
        term.length === 0 ||
        idea.symbol.toLowerCase().includes(term) ||
        idea.setup.toLowerCase().includes(term) ||
        idea.plan.toLowerCase().includes(term) ||
        idea.tags.some((tag) => tag.toLowerCase().includes(term));
      return matchesStatus && matchesTerm;
    });
  }, [ideas, statusFilter, searchTerm]);

  useEffect(() => {
    if (filteredIdeas.length === 0) {
      return;
    }

    if (
      !selectedIdeaId ||
      !ideas.some((idea) => idea.id === selectedIdeaId) ||
      !filteredIdeas.some((idea) => idea.id === selectedIdeaId)
    ) {
      setSelectedIdeaId(filteredIdeas[0].id);
    }
  }, [filteredIdeas, ideas, selectedIdeaId]);

  const updateIdea = (ideaId: string, updater: (idea: Idea) => Idea) => {
    setIdeas((prev) =>
      prev.map((idea) => (idea.id === ideaId ? updater(idea) : idea)),
    );
  };

  const handleAddIdea = () => {
    const id = generateId();
    const newIdea: Idea = {
      id,
      symbol: "TICK",
      setup: "Define the setup",
      plan: "Add the trading plan in one line.",
      tags: ["draft"],
      status: "watching",
      priority: "B",
      carry: false,
      levels: {
        trigger: "",
        invalidation: "",
        target: "",
      },
      notes: {
        prep: [],
        review: [],
      },
    };
    setIdeas((prev) => [newIdea, ...prev]);
    setSelectedIdeaId(id);
    setStatusFilter("all");
    setSearchTerm("");
  };

  const selectedIdea =
    selectedIdeaId != null
      ? ideas.find((idea) => idea.id === selectedIdeaId) ?? null
      : null;

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900 p-6 text-gray-100 shadow-lg">
      <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Idea Organizer</h2>
          <p className="text-sm text-gray-400">
            Keep the idea stack tidy. Focus on intent, key levels, and living
            notes.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search symbol, setup, tag…"
              className="w-full rounded-md border border-gray-700 bg-gray-850 py-2 pl-9 pr-3 text-sm text-gray-100 placeholder:text-gray-500 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500 sm:w-72"
            />
          </div>
          <button
            type="button"
            onClick={handleAddIdea}
            className="inline-flex items-center gap-2 rounded-md bg-primary-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2 focus:ring-offset-gray-900"
          >
            <Plus className="h-4 w-4" />
            New idea
          </button>
        </div>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        {(["all", "watching", "active", "complete"] as const).map((key) => {
          const label =
            key === "all"
              ? `All (${ideas.length})`
              : `${STATUS_META[key].label} (${statusCounts[key]})`;
          const isActive = statusFilter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key === "all" ? "all" : key)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
                isActive
                  ? "border-accent-400 bg-accent-500/15 text-accent-200"
                  : "border-gray-700 bg-gray-850 text-gray-400 hover:border-accent-400/40 hover:text-accent-200"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-6 xl:flex-row">
        <IdeaStack
          ideas={filteredIdeas}
          selectedIdeaId={selectedIdeaId}
          onSelect={setSelectedIdeaId}
          onCycleStatus={(ideaId, current) => {
            const next: IdeaStatus =
              current === "watching"
                ? "active"
                : current === "active"
                ? "complete"
                : "watching";
            updateIdea(ideaId, (idea) => ({ ...idea, status: next }));
          }}
        />
        <div className="flex-1">
          {selectedIdea ? (
            <IdeaDetail
              idea={selectedIdea}
              onUpdate={(updater) => updateIdea(selectedIdea.id, updater)}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-gray-700 bg-gray-850 p-8 text-center text-sm text-gray-400">
              No idea selected. Create a new one or adjust your filters.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

interface IdeaStackProps {
  ideas: Idea[];
  selectedIdeaId: string | null;
  onSelect: (ideaId: string) => void;
  onCycleStatus: (ideaId: string, current: IdeaStatus) => void;
}

function IdeaStack({
  ideas,
  selectedIdeaId,
  onSelect,
  onCycleStatus,
}: IdeaStackProps) {
  if (ideas.length === 0) {
    return (
      <div className="xl:w-80">
        <div className="rounded-lg border border-dashed border-gray-700 bg-gray-850 p-6 text-center text-sm text-gray-400">
          No ideas match this view. Clear filters or add a new idea.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 xl:w-80">
      {ideas.map((idea) => {
        const isSelected = idea.id === selectedIdeaId;
        const pinnedCount = idea.notes.prep.filter((note) => note.pinned).length;
        return (
          <button
            key={idea.id}
            type="button"
            onClick={() => onSelect(idea.id)}
            className={`w-full rounded-lg border p-4 text-left transition ${
              isSelected
                ? "border-accent-400 bg-gray-850 shadow-md"
                : "border-gray-800 bg-gray-900 hover:border-accent-400/40 hover:bg-gray-850"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${PRIORITY_COLORS[idea.priority]}`}
                />
                <span className="text-sm font-semibold uppercase tracking-wide text-gray-200">
                  {idea.symbol}
                </span>
              </div>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onCycleStatus(idea.id, idea.status);
                }}
                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${STATUS_META[idea.status].badge}`}
              >
                {STATUS_META[idea.status].label}
              </button>
            </div>
            <p className="mt-2 text-sm font-medium text-gray-300">
              {idea.setup}
            </p>
            <p className="mt-1 line-clamp-2 text-sm text-gray-400">
              {idea.plan}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
              {idea.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-gray-850 px-2 py-0.5 uppercase tracking-wide text-[10px] text-gray-300"
                >
                  {tag}
                </span>
              ))}
              {pinnedCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-200">
                  <Star className="h-3 w-3" />
                  {pinnedCount} pinned
                </span>
              )}
              {idea.carry && (
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/20 px-2 py-0.5 text-[11px] font-medium text-indigo-200">
                  Carry
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

interface IdeaDetailProps {
  idea: Idea;
  onUpdate: (updater: (idea: Idea) => Idea) => void;
}

function IdeaDetail({ idea, onUpdate }: IdeaDetailProps) {
  const [noteDrafts, setNoteDrafts] = useState<Record<NoteCategory, string>>({
    prep: "",
    review: "",
  });

  useEffect(() => {
    setNoteDrafts({ prep: "", review: "" });
  }, [idea.id]);

  const handleNoteDraftChange = (kind: NoteCategory, value: string) => {
    setNoteDrafts((prev) => ({ ...prev, [kind]: value.slice(0, 180) }));
  };

  const handleAddNote = (kind: NoteCategory) => {
    const text = noteDrafts[kind].trim();
    if (!text) {
      return;
    }
    onUpdate((prev) => ({
      ...prev,
      notes: {
        ...prev.notes,
        [kind]: [
          {
            id: generateId(),
            text,
            timestamp: new Date().toISOString(),
            pinned: kind === "prep" && prev.notes[kind].length === 0,
          },
          ...prev.notes[kind],
        ],
      },
    }));
    setNoteDrafts((prev) => ({ ...prev, [kind]: "" }));
  };

  const handleTogglePin = (kind: NoteCategory, noteId: string) => {
    onUpdate((prev) => ({
      ...prev,
      notes: {
        ...prev.notes,
        [kind]: prev.notes[kind].map((note) =>
          note.id === noteId ? { ...note, pinned: !note.pinned } : note,
        ),
      },
    }));
  };

  const handleDeleteNote = (kind: NoteCategory, noteId: string) => {
    onUpdate((prev) => ({
      ...prev,
      notes: {
        ...prev.notes,
        [kind]: prev.notes[kind].filter((note) => note.id !== noteId),
      },
    }));
  };

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-850">
      <div className="flex flex-col gap-3 border-b border-gray-800 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <input
              value={idea.symbol}
              onChange={(event) =>
                onUpdate((prev) => ({
                  ...prev,
                  symbol: event.target.value.toUpperCase().slice(0, 6),
                }))
              }
              className="w-28 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm font-semibold uppercase tracking-wide text-gray-100 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
            <select
              value={idea.status}
              onChange={(event) =>
                onUpdate((prev) => ({
                  ...prev,
                  status: event.target.value as IdeaStatus,
                }))
              }
              className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-200 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500"
            >
              {Object.entries(STATUS_META).map(([value, meta]) => (
                <option key={value} value={value}>
                  {meta.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-400">
              Priority
              <select
                value={idea.priority}
                onChange={(event) =>
                  onUpdate((prev) => ({
                    ...prev,
                    priority: event.target.value as IdeaPriority,
                  }))
                }
                className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-sm text-gray-100 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500"
              >
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
              </select>
            </label>
          </div>
          <input
            value={idea.setup}
            onChange={(event) =>
              onUpdate((prev) => ({
                ...prev,
                setup: event.target.value,
              }))
            }
            placeholder="Describe the setup"
            className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              onUpdate((prev) => ({ ...prev, carry: !prev.carry }))
            }
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
              idea.carry
                ? "bg-indigo-500/20 text-indigo-200"
                : "bg-gray-900 text-gray-400 hover:text-indigo-200"
            }`}
          >
            Carry to tomorrow
          </button>
          <button
            type="button"
            onClick={() =>
              onUpdate((prev) => ({ ...prev, status: "complete", carry: false }))
            }
            className="inline-flex items-center gap-1 rounded-md border border-gray-700 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-300 hover:border-accent-400 hover:text-accent-200"
          >
            <Archive className="h-3.5 w-3.5" />
            Mark logged
          </button>
        </div>
      </div>

      <div className="grid gap-6 border-b border-gray-800 p-4 lg:grid-cols-2">
        <div className="space-y-3">
          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-gray-400">
            Plan
            <textarea
              value={idea.plan}
              onChange={(event) =>
                onUpdate((prev) => ({
                  ...prev,
                  plan: event.target.value.slice(0, 320),
                }))
              }
              rows={4}
              className="w-full resize-none rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500"
            />
          </label>
        </div>
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Levels
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-gray-400">
              Trigger
              <input
                value={idea.levels.trigger}
                onChange={(event) =>
                  onUpdate((prev) => ({
                    ...prev,
                    levels: { ...prev.levels, trigger: event.target.value },
                  }))
                }
                className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-gray-400">
              Invalidation
              <input
                value={idea.levels.invalidation}
                onChange={(event) =>
                  onUpdate((prev) => ({
                    ...prev,
                    levels: { ...prev.levels, invalidation: event.target.value },
                  }))
                }
                className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-gray-400">
              Target
              <input
                value={idea.levels.target}
                onChange={(event) =>
                  onUpdate((prev) => ({
                    ...prev,
                    levels: { ...prev.levels, target: event.target.value },
                  }))
                }
                className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500"
              />
            </label>
          </div>
        </div>
        <div className="lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <Tag className="h-3.5 w-3.5 text-gray-500" />
            {idea.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-gray-900 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-300"
              >
                {tag}
                <button
                  type="button"
                  onClick={() =>
                    onUpdate((prev) => ({
                      ...prev,
                      tags: prev.tags.filter((existing) => existing !== tag),
                    }))
                  }
                  className="text-gray-500 hover:text-rose-400"
                  aria-label="Remove tag"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => {
                const nextTag = prompt("New tag")?.trim();
                if (nextTag) {
                  onUpdate((prev) => ({
                    ...prev,
                    tags: [...prev.tags, nextTag],
                  }));
                }
              }}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-700 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 hover:border-accent-400 hover:text-accent-200"
            >
              <Plus className="h-3 w-3" />
              Add tag
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 p-4 lg:grid-cols-2">
        {(["prep", "review"] as const).map((kind) => {
          const isPrep = kind === "prep";
          const notes = idea.notes[kind];
          const pinned = notes.filter((note) => note.pinned);
          const others = notes.filter((note) => !note.pinned);
          const draft = noteDrafts[kind];
          return (
            <div key={kind} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-200">
                  {isPrep ? "Prep Notes" : "Review Log"}
                </h3>
                <span className="text-xs text-gray-500">
                  {notes.length} note{notes.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="space-y-2">
                {[...pinned, ...others].map((note) => (
                  <div
                    key={note.id}
                    className="rounded-md border border-gray-800 bg-gray-850 p-3"
                  >
                    <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
                      <span>{formatTime(note.timestamp)}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleTogglePin(kind, note.id)}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                            note.pinned
                              ? "bg-amber-500/20 text-amber-200"
                              : "bg-gray-900 text-gray-400 hover:text-amber-200"
                          }`}
                        >
                          <Pin className="h-3 w-3" />
                          Pin
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteNote(kind, note.id)}
                          className="text-gray-500 hover:text-rose-400"
                          aria-label="Delete note"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-gray-200">{note.text}</p>
                  </div>
                ))}
                <div className="rounded-md border border-dashed border-gray-700 bg-gray-900/60 p-3">
                  <textarea
                    value={draft}
                    onChange={(event) =>
                      handleNoteDraftChange(kind, event.target.value)
                    }
                    placeholder={
                      isPrep
                        ? "Quick bullet for the morning checklist…"
                        : "Log a lesson or outcome…"
                    }
                    rows={2}
                    className="w-full resize-none rounded-md border border-gray-700 bg-gray-850 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500"
                  />
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                    <span>{180 - draft.length} chars</span>
                    <button
                      type="button"
                      onClick={() => handleAddNote(kind)}
                      className="inline-flex items-center gap-1 rounded-md bg-accent-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent-200 hover:bg-accent-500/25"
                    >
                      <Plus className="h-3 w-3" />
                      Add note
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
