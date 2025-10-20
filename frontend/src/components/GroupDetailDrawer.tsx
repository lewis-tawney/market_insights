import React from "react";
import type { GroupData, GroupMember, GroupNearBreakout } from "../lib/mockGroupData";

type DetailProps = {
  group?: GroupData;
};

const formatPercent = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`;
const formatMillions = (value: number) => `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}M`;

const valueToWidth = (value: number) => {
  const width = Math.min(Math.abs(value) / 0.15, 1);
  return `${Math.max(width * 100, 4)}%`;
};

const ReturnBar = ({ label, value }: { label: string; value: number }) => {
  const positive = value >= 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs font-medium text-gray-400">
        <span>{label}</span>
        <span className={positive ? "text-emerald-400" : "text-rose-400"}>{formatPercent(value, 1)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
        <div
          className={`h-full ${positive ? "bg-emerald-500/80" : "bg-rose-500/80"}`}
          style={{ width: valueToWidth(value) }}
        />
      </div>
    </div>
  );
};

const Sparkline = ({ member }: { member: GroupMember }) => {
  const min = Math.min(...member.spark);
  const max = Math.max(...member.spark);
  const range = max - min || 1;
  const points = member.spark.map((point, index) => {
    const x = (index / (member.spark.length - 1)) * 100;
    const y = 100 - ((point - min) / range) * 100;
    return `${x},${y}`;
  });

  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-8 w-20 text-emerald-400">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        points={points.join(" ")}
        className="opacity-90"
      />
    </svg>
  );
};

const MemberChip = ({ member }: { member: GroupMember }) => {
  const positive = member.change1d >= 0;
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2">
      <div className="text-sm font-semibold text-gray-100">{member.symbol}</div>
      <div className="flex items-center gap-3">
        <div className={`text-sm font-medium ${positive ? "text-emerald-400" : "text-rose-400"}`}>
          {(member.change1d * 100).toFixed(1)}%
        </div>
        <div className="text-[11px] text-gray-400">×{member.volumeMultiple.toFixed(1)} vol</div>
        <Sparkline member={member} />
      </div>
    </div>
  );
};

const NearBreakoutRow = ({ idea }: { idea: GroupNearBreakout }) => (
  <div className="flex items-center justify-between rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-200">
    <div className="font-medium text-amber-200">{idea.symbol}</div>
    <div className="flex items-center gap-3 text-xs uppercase tracking-wide">
      <span>{(idea.distanceFromHigh * 100).toFixed(1)}% to {idea.reference.toUpperCase()} high</span>
      <span className="text-amber-300">vol ×{idea.volumeMultiple.toFixed(1)}</span>
    </div>
  </div>
);

const DistributionChart = ({ buckets }: { buckets: { label: string; value: number }[] }) => {
  const maxValue = Math.max(...buckets.map((bucket) => bucket.value), 1);
  return (
    <div className="space-y-2">
      {buckets.map((bucket) => (
        <div key={bucket.label} className="flex items-center gap-3 text-sm text-gray-300">
          <span className="w-24 shrink-0 text-xs uppercase tracking-wide text-gray-500">{bucket.label}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-800">
            <div
              className="h-full rounded-full bg-sky-500/70"
              style={{ width: `${(bucket.value / maxValue) * 100}%` }}
            />
          </div>
          <span className="w-8 text-right text-xs text-gray-400">{bucket.value}</span>
        </div>
      ))}
    </div>
  );
};

const TapeChecks = ({
  newHighsToday,
  above50dmaRising,
  newToTop20,
}: GroupData["tapeChecks"]) => (
  <div className="grid grid-cols-1 gap-2 text-xs text-gray-300 sm:grid-cols-2">
    <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2">
      <span className="text-gray-400">NH today</span>
      <span className="font-semibold text-emerald-400">{newHighsToday}</span>
    </div>
    <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2">
      <span className="text-gray-400">&gt;50DMA rising</span>
      <span className={`font-semibold ${above50dmaRising ? "text-emerald-400" : "text-rose-400"}`}>
        {above50dmaRising ? "Yes" : "No"}
      </span>
    </div>
    <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2">
      <span className="text-gray-400">New this week</span>
      <span className={`font-semibold ${newToTop20 ? "text-emerald-400" : "text-gray-500"}`}>
        {newToTop20 ? "Rotation Up" : "--"}
      </span>
    </div>
  </div>
);

const RiskGates = ({ above200dma }: GroupData["risk"]) => {
  const warning = above200dma < 0.4;
  return (
    <div className="space-y-3">
      {warning && (
        <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          Less than 40% of members above the 200DMA. Treat setups as tactical only.
        </div>
      )}
      <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-2 text-xs text-gray-300">
        <span>&gt;200DMA</span>
        <span className="font-semibold text-gray-100">{formatPercent(above200dma)}</span>
      </div>
    </div>
  );
};

const ScoreBreakdown = ({ group }: { group: GroupData }) => {
  const rows = [
    { label: "1D", value: group.scoreComponents.return1d },
    { label: "1W", value: group.scoreComponents.return1w },
    { label: "4W", value: group.scoreComponents.return4w },
    { label: "13W", value: group.scoreComponents.return13w },
    { label: "Breadth", value: group.scoreComponents.breadth },
    { label: "Volume", value: group.scoreComponents.volumePulse },
  ];

  if (group.scoreComponents.persistenceBonus) {
    rows.push({ label: "Persistence", value: group.scoreComponents.persistenceBonus });
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Score mix</h4>
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between text-sm text-gray-300">
            <span>{row.label}</span>
            <span className={row.value >= 0 ? "text-emerald-400" : "text-rose-400"}>
              {row.value.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export function GroupDetailDrawer({ group }: DetailProps) {
  if (!group) {
    return (
      <aside className="hidden w-[420px] shrink-0 border-l border-gray-800 bg-gray-950/70 px-6 py-8 text-sm text-gray-400 xl:block">
        Select a group from the leaderboard to inspect detail.
      </aside>
    );
  }

  const actionBadges: string[] = [];
  const meetsAPlus =
    group.returns.w4 > 0.05 &&
    group.returns.w1 > 0.02 &&
    group.breadth.above50 > 0.6 &&
    group.breakoutDensity >= 0.1 &&
    group.volumePulse > 0.5;
  if (meetsAPlus) actionBadges.push("A+ Setup");

  if (group.entersTop20ThisWeek && group.breadthTrendStreak > 0) {
    actionBadges.push("Rotation Up");
  }

  const weakening =
    group.returns.w4 > 0 &&
    group.breadthTrendStreak < 0 &&
    group.breadth.above50 < group.breadth.above20 &&
    group.breakouts.highs < group.breakouts.lows;
  if (weakening) actionBadges.push("Weakening");

  return (
    <aside className="hidden w-[420px] shrink-0 border-l border-gray-800 bg-gray-950/70 xl:block">
      <div className="flex h-full flex-col overflow-hidden">
        <div className="border-b border-gray-800 bg-gray-950/80 px-6 py-5">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-gray-500">
            <span>Group detail</span>
            <span className="text-gray-400">Rank #{group.rank}</span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <div>
              <div className="text-lg font-semibold text-gray-100">{group.name}</div>
              <div className="text-sm text-gray-400">{group.activeCount} actives • score mix</div>
            </div>
            <div className="text-4xl font-bold text-emerald-400">{group.score.toFixed(2)}</div>
          </div>
          {actionBadges.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {actionBadges.map((badge) => (
                <span key={badge} className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
                  {badge}
                </span>
              ))}
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <ReturnBar label="1D" value={group.returns.d} />
            <ReturnBar label="1W" value={group.returns.w1} />
            <ReturnBar label="4W" value={group.returns.w4} />
            <ReturnBar label="13W" value={group.returns.w13} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-gray-300">
            <div className="space-y-1 rounded-lg border border-gray-800 bg-gray-900/50 p-3">
              <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-gray-500">
                <span>&gt;20DMA</span>
                <span className="text-gray-100">{formatPercent(group.breadth.above20)}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-gray-500">
                <span>&gt;50DMA</span>
                <span className="text-gray-100">{formatPercent(group.breadth.above50)}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-gray-500">
                <span>NH density</span>
                <span className="text-gray-100">{formatPercent(group.breakoutDensity)}</span>
              </div>
            </div>
            <div className="space-y-1 rounded-lg border border-gray-800 bg-gray-900/50 p-3">
              <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-gray-500">
                <span>Vol pulse</span>
                <span className="text-gray-100">{formatPercent(group.volumePulse)}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-gray-500">
                <span>Median ADV</span>
                <span className="text-gray-100">{formatMillions(group.liquidity)}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-gray-500">
                <span>ATR% 20d</span>
                <span className="text-gray-100">{formatPercent(group.volatility)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          <ScoreBreakdown group={group} />

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Leaders</h4>
            <div className="mt-3 grid gap-3">
              {group.topTickers.slice(0, 6).map((member) => (
                <MemberChip key={member.symbol} member={member} />
              ))}
            </div>
          </div>

          {group.nearBreakouts.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Near breakouts</h4>
              <div className="mt-3 space-y-2">
                {group.nearBreakouts.map((idea) => (
                  <NearBreakoutRow key={idea.symbol} idea={idea} />
                ))}
              </div>
            </div>
          )}

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Distribution (4W returns)</h4>
            <div className="mt-3 rounded-xl border border-gray-800 bg-gray-900/70 p-4">
              <DistributionChart buckets={group.distribution} />
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Tape checks</h4>
            <div className="mt-3">
              <TapeChecks {...group.tapeChecks} />
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Risk gates</h4>
            <div className="mt-3">
              <RiskGates {...group.risk} />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default GroupDetailDrawer;
