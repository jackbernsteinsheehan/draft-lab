"use client";

import { useMemo, useState } from "react";
import { positionBadgeClass, strategyBadgeClass } from "@/lib/ui";
import { buildRoster } from "@/lib/roster";

export type SavedDraft = {
  id: string;
  num_teams: number;
  num_rounds: number;
  user_slot: number;
  user_team: string;
  picks: {
    overall: number;
    round: number;
    slot: number;
    team: string;
    player_id: number;
  }[];
  strategy: string;
  strategy_tags: string[];
  created_at: string;
};

type PlayerMap = Record<number, { name: string; position: string }>;

export default function AnalyzeView({
  drafts,
  playerMap,
}: {
  drafts: SavedDraft[];
  playerMap: PlayerMap;
}) {
  const [strategyFilter, setStrategyFilter] = useState<string>("ALL");

  const strategies = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of drafts) counts[d.strategy] = (counts[d.strategy] ?? 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [drafts]);

  const filtered = useMemo(
    () =>
      strategyFilter === "ALL"
        ? drafts
        : drafts.filter((d) => d.strategy === strategyFilter),
    [drafts, strategyFilter],
  );

  return (
    <main className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Draft analysis</h1>
          <p className="mt-1 text-sm text-muted">
            {drafts.length} saved {drafts.length === 1 ? "draft" : "drafts"}
            {drafts.length > 0 ? " · tap a draft to see its analysis" : ""}.
          </p>
        </div>
        <a
          href="/draft"
          className="text-sm px-3 py-1.5 rounded-md bg-foreground text-background hover:opacity-90 transition"
        >
          New draft
        </a>
      </header>

      {drafts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted">
            No drafts saved yet. Complete a draft and click “Save draft”.
          </p>
        </div>
      ) : (
        <>
          <section className="rounded-xl border border-border bg-surface p-4">
            <div className="text-xs uppercase tracking-widest text-muted mb-3">
              Filter by strategy
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip
                label="All"
                count={drafts.length}
                active={strategyFilter === "ALL"}
                onClick={() => setStrategyFilter("ALL")}
              />
              {strategies.map(([s, n]) => (
                <Chip
                  key={s}
                  label={s}
                  count={n}
                  active={strategyFilter === s}
                  colorClass={strategyBadgeClass(s)}
                  onClick={() => setStrategyFilter(s)}
                />
              ))}
            </div>
          </section>

          <ul className="grid gap-3 md:grid-cols-2">
            {filtered.map((d) => (
              <DraftCard key={d.id} draft={d} playerMap={playerMap} />
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

function Chip({
  label,
  count,
  active,
  colorClass,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  colorClass?: string;
  onClick: () => void;
}) {
  const base =
    "text-xs px-2.5 py-1 rounded-full border transition flex items-center gap-1.5";
  if (active) {
    return (
      <button
        onClick={onClick}
        className={`${base} bg-foreground text-background border-foreground`}
      >
        <span>{label}</span>
        <span className="tabular-nums opacity-70">{count}</span>
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className={`${base} border-border hover:bg-surface-2 ${colorClass ?? ""}`}
    >
      <span>{label}</span>
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}

function DraftCard({ draft, playerMap }: { draft: SavedDraft; playerMap: PlayerMap }) {
  const userPicksInOrder = draft.picks
    .filter((p) => p.team === draft.user_team)
    .sort((a, b) => a.overall - b.overall)
    .map((p) => {
      const info = playerMap[p.player_id];
      return {
        player_id: p.player_id,
        overall: p.overall,
        round: p.round,
        name: info?.name ?? `#${p.player_id}`,
        position: info?.position ?? "?",
      };
    });

  const slots = buildRoster(userPicksInOrder, draft.num_rounds);
  const starters = slots.filter((s) => !s.isBench);
  const bench = slots.filter((s) => s.isBench);

  return (
    <li className="rounded-xl border border-border bg-surface overflow-hidden">
      <a
        href={`/analyze/${draft.id}`}
        className="block hover:bg-surface-2/40 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
      >
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded ${strategyBadgeClass(draft.strategy)}`}
          >
            {draft.strategy}
          </span>
          {draft.strategy_tags
            .filter((t) => t !== draft.strategy)
            .map((t) => (
              <span
                key={t}
                className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-2 text-muted"
              >
                {t}
              </span>
            ))}
        </div>
        <div className="mt-1.5 text-xs text-muted">
          {new Date(draft.created_at).toLocaleString()} · {draft.num_teams}-team
          · {draft.num_rounds} rounds · slot {draft.user_slot}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
        <SlotColumn title="Starters" slots={starters} />
        <SlotColumn title="Bench" slots={bench} />
      </div>
      </a>
    </li>
  );
}

type CardPlayer = { player_id: number; name: string; position: string };

function SlotColumn({
  title,
  slots,
}: {
  title: string;
  slots: ReturnType<typeof buildRoster<CardPlayer>>;
}) {
  if (slots.length === 0) return null;
  return (
    <div>
      <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted border-b border-border bg-surface-2/40">
        {title}
      </div>
      <ul className="divide-y divide-border">
        {slots.map((slot, i) => (
          <li key={`${slot.id}-${i}`} className="flex items-center gap-2 px-4 py-1.5 text-xs">
            <span className="w-10 shrink-0 text-[10px] font-semibold tracking-wider text-muted">
              {slot.label}
            </span>
            {slot.player ? (
              <>
                <span
                  className={`text-[9px] font-semibold tracking-wider px-1 py-px rounded ${positionBadgeClass(slot.player.position)}`}
                >
                  {slot.player.position}
                </span>
                <span className="truncate">{slot.player.name}</span>
              </>
            ) : (
              <span className="text-muted/60 italic">Empty</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
