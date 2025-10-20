import React, { useMemo, useState, useEffect } from "react";
import type { GroupData } from "../lib/mockGroupData";

const formatPercent = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`;
const formatMillions = (value: number) => `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}M`;

const metricOptions = [
  { id: "composite", label: "Composite" },
  { id: "trend4w", label: "4W Trend" },
  { id: "breakoutDensity", label: "Breakout Density" },
  { id: "volumePulse", label: "Volume Pulse" },
  { id: "breadth", label: "Breadth" },
] as const;

type MetricOption = (typeof metricOptions)[number]["id"];

type LeaderboardProps = {
  groups: GroupData[];
  selectedGroupId?: string;
  onSelect: (groupId: string) => void;
};

const MicroBar = ({ value }: { value: number }) => {
  const magnitude = Math.min(Math.abs(value) / 0.15, 1);
  const width = `${Math.max(magnitude * 100, 10)}%`;
  const positive = value >= 0;

  return (
    <div className="h-2.5 w-full rounded-full bg-gray-800">
      <div className={`h-full rounded-full ${positive ? "bg-emerald-500" : "bg-rose-500"}`} style={{ width }} />
    </div>
  );
};

const BreadthStack = ({ above20, above50, newHighsToday }: GroupData["breadth"]) => {
  const width20 = Math.max(above20 * 100, 4);
  const width50 = Math.max(above50 * 100, 2);
  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-gray-800">
        <div className="absolute left-0 top-0 h-full rounded-l-full bg-emerald-500/70" style={{ width: `${width50}%` }} />
        <div className="absolute left-0 top-0 h-full rounded-r-full bg-emerald-400/50" style={{ width: `${width20}%` }} />
      </div>
      <div className="relative h-2 w-full">
        <div className="absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 bg-gray-800" />
        <div
          className="absolute top-1/2 h-2 w-1 rounded-full bg-emerald-400"
          style={{ left: `${Math.min(newHighsToday * 100, 96)}%` }}
        />
      </div>
    </div>
  );
};

const VolumeDot = ({ volumePulse }: { volumePulse: number }) => {
  const size = 12 + volumePulse * 14;
  return (
    <div
      className="flex h-full items-center justify-center"
      title={`Volume pulse: ${formatPercent(volumePulse)}`}
    >
      <span
        className="inline-flex rounded-full bg-sky-500/80 shadow-lg shadow-sky-500/20"
        style={{ width: size, height: size }}
      />
    </div>
  );
};

const LiquidityPill = ({ liquidity, dimmed }: { liquidity: number; dimmed: boolean }) => (
  <span
    className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-semibold ${
      dimmed ? "border-gray-700 bg-gray-800/80 text-gray-500" : "border-gray-700 bg-gray-900 text-gray-200"
    }`}
  >
    {formatMillions(liquidity)}
  </span>
);

const VolatilityBadge = ({ value }: { value: number }) => (
  <span className="inline-flex items-center rounded border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-[11px] font-semibold text-sky-300">
    ATR {formatPercent(value, 1)}
  </span>
);

const BreakoutChip = ({ highs, lows }: GroupData["breakouts"]) => (
  <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-200">
    {highs} NH / {lows} NL
  </span>
);

type LeaderboardRowProps = {
  group: GroupData;
  maxScore: number;
  isSelected: boolean;
  onSelect: () => void;
};

const LeaderboardRow = ({ group, maxScore, isSelected, onSelect }: LeaderboardRowProps) => {
  const backgroundStrength = Math.min(Math.abs(group.returns.w4) / 0.12, 1);
  const backgroundColor = group.returns.w4 >= 0 ? `rgba(34, 197, 94, ${backgroundStrength * 0.18})` : `rgba(244, 63, 94, ${backgroundStrength * 0.15})`;
  const borderColor = group.returns.d >= 0 ? `rgba(16, 185, 129, ${Math.min(Math.abs(group.returns.d) / 0.05, 1)})` : `rgba(248, 113, 113, ${Math.min(Math.abs(group.returns.d) / 0.05, 1)})`;
  const maxBarWidth = Math.max(maxScore, 1);
  const scoreWidth = `${Math.min((group.score / maxBarWidth) * 100, 100)}%`;
  const topTickers = group.topTickers.slice(0, 3);
  const overflowTickers = group.topTickers.slice(3, 10).map((ticker) => ticker.symbol).join(", ");

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative grid w-full grid-cols-[minmax(0,2.5fr)_minmax(0,1fr)_repeat(4,minmax(0,0.7fr))_minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1fr)] items-center gap-3 rounded-xl border border-gray-800 px-4 py-3 text-left transition-colors ${
        isSelected ? "ring-2 ring-emerald-500/60" : "hover:border-emerald-500/40"
      }`}
      style={{ backgroundColor, borderRight: `4px solid ${borderColor}` }}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-900 text-sm font-semibold text-gray-200">
          {group.rank}
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-100">
            {group.name} <span className="text-gray-500">({group.activeCount})</span>
          </div>
          <div className="flex flex-wrap gap-1 text-[11px] text-gray-400">
            {topTickers.map((ticker) => (
              <span
                key={ticker.symbol}
                className={`inline-flex items-center rounded-full px-2 py-0.5 ${
                  ticker.change1d >= 0 ? "bg-emerald-500/10 text-emerald-300" : "bg-rose-500/10 text-rose-300"
                }`}
              >
                {ticker.symbol} {formatPercent(ticker.change1d, 1)}
              </span>
            ))}
            {overflowTickers && (
              <span className="relative inline-flex items-center rounded-full bg-gray-800/80 px-2 py-0.5 text-[11px] text-gray-300">
                +{group.topTickers.length - topTickers.length}
                <span className="pointer-events-none absolute -bottom-2 left-1/2 hidden min-w-[180px] -translate-x-1/2 rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-xs text-gray-300 shadow-xl group-hover:flex">
                  <span className="text-[10px] uppercase tracking-wide text-gray-500">More:</span>
                  <span className="ml-1 text-xs text-gray-200">{overflowTickers}</span>
                </span>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-right text-[11px] uppercase tracking-wide text-gray-500">Score</div>
        <div className="h-6 w-full rounded-full bg-gray-900/60">
          <div
            className="flex h-full items-center justify-end rounded-full bg-emerald-500/80 px-2 text-[11px] font-semibold text-gray-900"
            style={{ width: scoreWidth }}
          >
            {group.score.toFixed(2)}
          </div>
        </div>
      </div>

      <MicroBar value={group.returns.d} />
      <MicroBar value={group.returns.w1} />
      <MicroBar value={group.returns.w4} />
      <MicroBar value={group.returns.w13} />

      <BreadthStack {...group.breadth} />

      <VolumeDot volumePulse={group.volumePulse} />

      <LiquidityPill liquidity={group.liquidity} dimmed={Boolean(group.advFloorBreached)} />

      <VolatilityBadge value={group.volatility} />

      <BreakoutChip {...group.breakouts} />
    </button>
  );
};

type FilterState = {
  minLiquidity: number;
  minBreadth: number;
  onlyNewTop20: boolean;
  hideWeakBreadth: boolean;
};

const defaultFilters: FilterState = {
  minLiquidity: 10,
  minBreadth: 0.35,
  onlyNewTop20: false,
  hideWeakBreadth: false,
};

const filterOptions = [5, 10, 15, 25, 50];
const breadthOptions = [0.2, 0.35, 0.5, 0.65];

const TreemapTile = ({ group }: { group: GroupData }) => {
  const size = Math.max(group.liquidity / 60, 0.8);
  const intensity = Math.min(Math.abs(group.returns.w4) / 0.12, 1);
  const backgroundColor =
    group.returns.w4 >= 0
      ? `rgba(34, 197, 94, ${intensity * 0.35})`
      : `rgba(244, 63, 94, ${intensity * 0.3})`;
  const borderColor = `rgba(56, 189, 248, ${group.breadth.above50})`;
  const triangleClass = group.returns.d >= 0 ? "bg-emerald-400" : "bg-rose-400";

  return (
    <div
      className="relative flex flex-col justify-between overflow-hidden rounded-xl border bg-gray-900/90 p-3 text-xs text-gray-200"
      style={{ flex: `${size} 1 220px`, borderColor, backgroundColor, minWidth: "200px" }}
    >
      <div className={`absolute left-3 top-3 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 ${triangleClass}`} />
      <div className="flex items-start justify-between text-sm font-semibold text-gray-100">
        <span>{group.name}</span>
        <span className="text-xs text-gray-400">{formatMillions(group.liquidity)}</span>
      </div>
      <div className="mt-2 text-xs text-gray-300">4W {formatPercent(group.returns.w4)}</div>
      <div className="mt-3 text-xs text-gray-400">Breadth &gt;50DMA {formatPercent(group.breadth.above50)}</div>
      <div className="mt-4 text-xs text-gray-400">Volume pulse {formatPercent(group.volumePulse)}</div>
    </div>
  );
};

const TreemapView = ({ groups }: { groups: GroupData[] }) => (
  <div className="flex flex-wrap gap-4">
    {groups.map((group) => (
      <TreemapTile key={group.id} group={group} />
    ))}
  </div>
);

export default function GroupLeaderboard({ groups, selectedGroupId, onSelect }: LeaderboardProps) {
  const [metric, setMetric] = useState<MetricOption>("composite");
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [treemapMode, setTreemapMode] = useState(false);

  const filteredGroups = useMemo(() => {
    return groups.filter((group) => {
      if (group.liquidity < filters.minLiquidity) {
        return false;
      }
      if (filters.hideWeakBreadth && group.breadth.above50 < filters.minBreadth) {
        return false;
      }
      if (filters.onlyNewTop20 && !group.entersTop20ThisWeek) {
        return false;
      }
      if (group.breadth.above50 < filters.minBreadth) {
        return false;
      }
      return true;
    });
  }, [filters, groups]);

  const sortedGroups = useMemo(() => {
    const copy = [...filteredGroups];
    const sorters: Record<MetricOption, (group: GroupData) => number> = {
      composite: (group) => group.score,
      trend4w: (group) => group.returns.w4,
      breakoutDensity: (group) => group.breakoutDensity,
      volumePulse: (group) => group.volumePulse,
      breadth: (group) => group.breadth.above50,
    };
    const accessor = sorters[metric];
    return copy.sort((a, b) => accessor(b) - accessor(a));
  }, [filteredGroups, metric]);

  useEffect(() => {
    if (sortedGroups.length === 0) {
      return;
    }
    if (!selectedGroupId || !sortedGroups.some((group) => group.id === selectedGroupId)) {
      onSelect(sortedGroups[0].id);
    }
  }, [sortedGroups, selectedGroupId, onSelect]);

  const selectedGroup = sortedGroups.find((group) => group.id === selectedGroupId) ?? sortedGroups[0];
  const maxScore = Math.max(...sortedGroups.map((group) => group.score), 1);

  return (
    <section className="flex-1 rounded-2xl border border-gray-800 bg-gray-950/70">
      <header className="sticky top-0 z-10 border-b border-gray-800 bg-gray-950/80 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-100">Industry Group Leaderboard</h2>
            <p className="text-sm text-gray-400">Daily floor • price + volume</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-300">
            <span className="rounded-full border border-gray-800 bg-gray-900/80 px-2 py-1">ADV$ ≥ ${filters.minLiquidity}M</span>
            <span className="rounded-full border border-gray-800 bg-gray-900/80 px-2 py-1">Breadth ≥ {formatPercent(filters.minBreadth)}</span>
            {filters.onlyNewTop20 && (
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-emerald-300">New Top-20</span>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {metricOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  metric === option.id
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-gray-900/80 text-gray-400 hover:bg-gray-800"
                }`}
                onClick={() => setMetric(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-gray-300">
            <label className="flex items-center gap-2">
              <span>Min ADV$</span>
              <select
                className="rounded-lg border border-gray-700 bg-gray-900 px-2 py-1"
                value={filters.minLiquidity}
                onChange={(event) => setFilters((prev) => ({ ...prev, minLiquidity: Number(event.target.value) }))}
              >
                {filterOptions.map((value) => (
                  <option key={value} value={value}>
                    ${value}M
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span>Breadth ≥</span>
              <select
                className="rounded-lg border border-gray-700 bg-gray-900 px-2 py-1"
                value={filters.minBreadth}
                onChange={(event) => setFilters((prev) => ({ ...prev, minBreadth: Number(event.target.value) }))}
              >
                {breadthOptions.map((value) => (
                  <option key={value} value={value}>
                    {formatPercent(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-700 bg-gray-900 text-emerald-500 focus:ring-emerald-500"
                checked={filters.onlyNewTop20}
                onChange={(event) => setFilters((prev) => ({ ...prev, onlyNewTop20: event.target.checked }))}
              />
              <span>Only new Top-20</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-700 bg-gray-900 text-emerald-500 focus:ring-emerald-500"
                checked={filters.hideWeakBreadth}
                onChange={(event) => setFilters((prev) => ({ ...prev, hideWeakBreadth: event.target.checked }))}
              />
              <span>Hide weak breadth</span>
            </label>
            <button
              type="button"
              onClick={() => setTreemapMode((prev) => !prev)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                treemapMode ? "bg-sky-500/20 text-sky-200" : "bg-gray-900/80 text-gray-400 hover:bg-gray-800"
              }`}
            >
              {treemapMode ? "Leaderboard" : "Treemap"}
            </button>
          </div>
        </div>
      </header>

      <div className="divide-y divide-gray-800">
        {treemapMode ? (
          <div className="p-5">
            <TreemapView groups={sortedGroups} />
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-5">
            {sortedGroups.map((group) => (
              <LeaderboardRow
                key={group.id}
                group={group}
                maxScore={maxScore}
                isSelected={selectedGroup?.id === group.id}
                onSelect={() => onSelect(group.id)}
              />
            ))}
            {sortedGroups.length === 0 && (
              <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 text-center text-sm text-gray-400">
                No groups match the active filters.
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="border-t border-gray-800 px-5 py-3 text-xs text-gray-500">
        Universe: {sortedGroups.length} groups • Updated 4:10 PM ET
      </footer>
    </section>
  );
}
