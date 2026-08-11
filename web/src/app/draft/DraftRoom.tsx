"use client";

import { useEffect, useMemo, useState } from "react";
import {
  cpuPick,
  initDraft,
  isComplete,
  onClock,
  processPick,
  snakeOrder,
  type DraftState,
  type Player,
} from "@/lib/draft";
import { classifyStrategy } from "@/lib/strategy";
import { createClient } from "@/lib/supabase/client";
import { positionBadgeClass } from "@/lib/ui";
import { buildRoster } from "@/lib/roster";

type Config = { numTeams: number; numRounds: number; userSlot: number };
type AdpCoverage = {
  matched: number;
  ffcRows: number;
  total: number;
  source: "fantasypros" | "ffc" | "none";
};

export default function DraftRoom({
  players,
  adpCoverage,
}: {
  players: Player[];
  adpCoverage?: AdpCoverage;
}) {
  const [state, setState] = useState<DraftState | null>(null);

  if (!state)
    return (
      <Setup
        players={players}
        adpCoverage={adpCoverage}
        onStart={(cfg) => setState(initDraft({ ...cfg, players }))}
      />
    );
  return <LiveDraft state={state} setState={setState} onReset={() => setState(null)} />;
}

/* ──────────────────────────────────────────────────────────── Setup ─── */

function Setup({
  players,
  adpCoverage,
  onStart,
}: {
  players: Player[];
  adpCoverage?: AdpCoverage;
  onStart: (cfg: Config) => void;
}) {
  const [numTeams, setNumTeams] = useState(12);
  const [numRounds, setNumRounds] = useState(15);
  const [userSlot, setUserSlot] = useState(1);

  return (
    <main className="max-w-2xl mx-auto px-6 py-12 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">New mock draft</h1>
        <p className="mt-2 text-sm text-muted">
          {players.length.toLocaleString()} active players loaded
          {adpCoverage
            ? ` · ${adpCoverage.matched} ADP-rated (${
                adpCoverage.source === "fantasypros"
                  ? "FantasyPros via nflverse"
                  : adpCoverage.source === "ffc"
                    ? "FantasyFootballCalculator"
                    : "no source"
              })`
            : ""}
          .
        </p>
        {adpCoverage && adpCoverage.matched === 0 && (
          <p className="mt-2 text-xs text-amber-600">
            No ADP could be matched — CPU will fall back to position need only.
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onStart({ numTeams, numRounds, userSlot: Math.min(userSlot, numTeams) });
        }}
        className="rounded-xl border border-border bg-surface p-6 space-y-5"
      >
        <Field label="Teams" hint="Standard leagues are 10 or 12.">
          <NumberInput value={numTeams} min={2} max={16} onChange={setNumTeams} />
        </Field>
        <Field label="Rounds" hint="15 covers starters + bench in a standard league.">
          <NumberInput value={numRounds} min={1} max={25} onChange={setNumRounds} />
        </Field>
        <Field label="Your slot" hint="Position in the snake order (1 = first overall).">
          <SlotPicker numTeams={numTeams} value={userSlot} onChange={setUserSlot} />
        </Field>

        <div className="pt-2">
          <button
            type="submit"
            disabled={players.length === 0}
            className="w-full px-4 py-2.5 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition disabled:opacity-40"
          >
            Start draft
          </button>
        </div>
      </form>
    </main>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium">{label}</label>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-28 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
    />
  );
}

function SlotPicker({
  numTeams,
  value,
  onChange,
}: {
  numTeams: number;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: numTeams }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`size-8 rounded-md text-xs tabular-nums border transition ${
            n === value
              ? "bg-foreground text-background border-foreground"
              : "border-border text-muted hover:bg-surface-2"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────── Save button ── */

function SaveDraftButton({ state }: { state: DraftState }) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const onSave = async () => {
    setStatus("saving");
    setError(null);
    const userPicks = state.picks.filter((p) => p.team === state.user_team);
    const { primary, tags } = classifyStrategy(userPicks, state.players);
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setStatus("error");
      setError("Sign in to save drafts.");
      return;
    }
    const { error: insertError } = await supabase.from("drafts").insert({
      user_id: auth.user.id,
      num_teams: state.num_teams,
      num_rounds: state.num_rounds,
      user_slot: state.draft_order.indexOf(state.user_team) + 1,
      user_team: state.user_team,
      picks: state.picks,
      strategy: primary,
      strategy_tags: tags,
    });
    if (insertError) {
      setStatus("error");
      setError(insertError.message);
      return;
    }
    setStatus("saved");
  };

  if (status === "saved") {
    return (
      <a
        href="/analyze"
        className="text-sm px-3 py-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      >
        Saved — view analysis →
      </a>
    );
  }
  return (
    <button
      onClick={onSave}
      disabled={status === "saving"}
      className="text-sm px-3 py-1.5 rounded-md bg-foreground text-background hover:opacity-90 transition disabled:opacity-50"
      title={error ?? undefined}
    >
      {status === "saving" ? "Saving…" : status === "error" ? "Retry save" : "Save draft"}
    </button>
  );
}

/* ─────────────────────────────────────────────────────── Live draft ─── */

function LiveDraft({
  state,
  setState,
  onReset,
}: {
  state: DraftState;
  setState: (s: DraftState) => void;
  onReset: () => void;
}) {
  const [filter, setFilter] = useState("");
  const [posFilter, setPosFilter] = useState<string>("ALL");

  const slot = onClock(state);
  const userTurn = slot?.team === state.user_team;
  const done = isComplete(state);

  useEffect(() => {
    if (done || userTurn || !slot) return;
    const t = setTimeout(() => {
      const pid = cpuPick(state, slot.team);
      setState(processPick(state, pid));
    }, 350);
    return () => clearTimeout(t);
  }, [state, slot, userTurn, done, setState]);

  // Stable overall rank assigned once from the initial pool, ordered by ADP.
  // Players without ADP rank after everyone with ADP, by position priority.
  const overallRank = useMemo(() => {
    const posRank: Record<string, number> = { RB: 0, WR: 1, TE: 2, QB: 3, K: 4, DST: 5 };
    const all = Object.values(state.players).slice();
    all.sort((a, b) => {
      const aAdp = a.adp ?? Number.POSITIVE_INFINITY;
      const bAdp = b.adp ?? Number.POSITIVE_INFINITY;
      if (aAdp !== bAdp) return aAdp - bAdp;
      const aPos = posRank[a.position] ?? 99;
      const bPos = posRank[b.position] ?? 99;
      if (aPos !== bPos) return aPos - bPos;
      return a.name.localeCompare(b.name);
    });
    const map: Record<number, number> = {};
    all.forEach((p, i) => {
      map[p.player_id] = i + 1;
    });
    return map;
  }, [state.players]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list: Player[] = [];
    for (const pid of state.available) {
      const p = state.players[pid];
      if (posFilter !== "ALL" && p.position !== posFilter) continue;
      if (q && !p.name.toLowerCase().includes(q)) continue;
      list.push(p);
    }
    const posRank: Record<string, number> = { RB: 0, WR: 1, TE: 2, QB: 3, K: 4, DST: 5 };
    list.sort((a, b) => {
      const aAdp = a.adp ?? Number.POSITIVE_INFINITY;
      const bAdp = b.adp ?? Number.POSITIVE_INFINITY;
      if (aAdp !== bAdp) return aAdp - bAdp;
      const aPos = posRank[a.position] ?? 99;
      const bPos = posRank[b.position] ?? 99;
      if (aPos !== bPos) return aPos - bPos;
      return a.name.localeCompare(b.name);
    });
    return list.slice(0, 200);
  }, [state, filter, posFilter]);

  const order = snakeOrder(state.draft_order, state.num_rounds);

  // Display the pick as "round.pick-in-round" so it counts up linearly regardless of
  // snake direction (e.g. 4.12 → 4.13 → 5.01).
  const pickLabel = (s: { overall: number; round: number }) => {
    const inRound = s.overall - (s.round - 1) * state.num_teams;
    return `${s.round}.${String(inRound).padStart(2, "0")}`;
  };

  return (
    <main className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-4">
      <StatusBar
        state={state}
        slot={slot}
        userTurn={userTurn}
        done={done}
        onReset={onReset}
        pickLabel={pickLabel}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
        {/* ── Available players ─────────────────────────────────────── */}
        <section className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="border-b border-border px-3 py-2.5 flex flex-wrap items-center gap-2">
            <input
              placeholder="Search players…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="flex-1 min-w-[160px] rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <div className="flex gap-1">
              {["ALL", "QB", "RB", "WR", "TE", "K", "DST"].map((p) => (
                <button
                  key={p}
                  onClick={() => setPosFilter(p)}
                  className={`text-xs px-2 py-1 rounded-md border transition ${
                    posFilter === p
                      ? "bg-foreground text-background border-foreground"
                      : "border-border text-muted hover:bg-surface-2"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <ul className="divide-y divide-border max-h-[68vh] overflow-auto scroll-thin">
            {filtered.map((p) => (
              <li
                key={p.player_id}
                className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-surface-2 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs text-muted tabular-nums w-8 text-right">
                    {overallRank[p.player_id]}
                  </span>
                  <span
                    className={`text-[10px] font-semibold tracking-wider px-1.5 py-0.5 rounded ${positionBadgeClass(p.position)}`}
                  >
                    {p.position}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted">
                      {p.team ?? "FA"}
                      {p.adp != null ? ` · ADP ${p.adp.toFixed(1)}` : ""}
                      {p.bye_week != null ? ` · Bye ${p.bye_week}` : ""}
                    </div>
                  </div>
                </div>
                <button
                  disabled={!userTurn || done}
                  onClick={() => setState(processPick(state, p.player_id))}
                  className="text-xs px-2.5 py-1.5 rounded-md bg-foreground text-background hover:opacity-90 transition disabled:opacity-20"
                >
                  Draft
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="text-sm text-muted py-8 text-center">No matches.</li>
            )}
          </ul>
        </section>

        {/* ── Pick log ──────────────────────────────────────────────── */}
        <aside className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="border-b border-border px-3 py-2.5 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Pick log</h2>
            <span className="text-xs text-muted tabular-nums">
              {state.picks.length} / {state.num_teams * state.num_rounds}
            </span>
          </div>
          <ol className="text-xs max-h-[68vh] overflow-auto scroll-thin">
            {order.slice(0, state.picks.length + 1).map((s, idx) => {
              const pick = state.picks[idx];
              const player = pick ? state.players[pick.player_id] : null;
              const isCurrent = idx === state.picks.length && !done;
              const isYou = s.team === state.user_team;
              return (
                <li
                  key={s.overall}
                  className={`flex items-center gap-2 px-3 py-1.5 border-b border-border/60 last:border-b-0 ${
                    isCurrent ? "bg-accent/10" : isYou ? "bg-surface-2/60" : ""
                  }`}
                >
                  <span className="text-muted tabular-nums w-12 shrink-0">
                    {pickLabel(s)}
                  </span>
                  <span className="text-muted w-14 shrink-0 truncate">
                    {s.team}
                  </span>
                  <span className="flex-1 min-w-0 flex items-center gap-1.5">
                    {player ? (
                      <>
                        <span
                          className={`text-[9px] font-semibold tracking-wider px-1 py-px rounded ${positionBadgeClass(player.position)}`}
                        >
                          {player.position}
                        </span>
                        <span className="truncate">{player.name}</span>
                      </>
                    ) : isCurrent ? (
                      <span className="text-accent">on the clock…</span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>

      {/* ── Your roster ─────────────────────────────────────────────── */}
      <Roster state={state} />
    </main>
  );
}

function StatusBar({
  state,
  slot,
  userTurn,
  done,
  onReset,
  pickLabel,
}: {
  state: DraftState;
  slot: { overall: number; round: number; slot: number; team: string } | null;
  userTurn: boolean;
  done: boolean;
  onReset: () => void;
  pickLabel: (s: { overall: number; round: number }) => string;
}) {
  return (
    <header className="rounded-xl border border-border bg-surface px-4 py-3 flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-4">
        <div className="text-xs uppercase tracking-widest text-muted">
          {done ? "Complete" : userTurn ? "Your turn" : "Drafting"}
        </div>
        {slot && !done && (
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums">
              {pickLabel(slot)}
            </span>
            <span className="text-sm text-muted">
              · {userTurn ? "You're on the clock" : `${slot.team} is picking…`}
            </span>
          </div>
        )}
        {done && (
          <div className="text-sm text-muted">Draft complete — review your roster.</div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <a
          href="#roster"
          className="text-sm px-3 py-1.5 rounded-md border border-border hover:bg-surface-2 transition"
        >
          View roster ↓
        </a>
        {done && <SaveDraftButton state={state} />}
        <button
          onClick={onReset}
          className="text-sm px-3 py-1.5 rounded-md border border-border hover:bg-surface-2 transition"
        >
          Reset
        </button>
      </div>
    </header>
  );
}

function Roster({ state }: { state: DraftState }) {
  const [team, setTeam] = useState(state.user_team);
  // Fall back to the user's team if the selection ever goes stale (e.g. reset).
  const activeTeam = state.rosters[team] ? team : state.user_team;

  const picks = (state.rosters[activeTeam] ?? [])
    .map((pid) => state.players[pid])
    .filter(Boolean);
  const slots = buildRoster(picks, state.num_rounds);
  const starters = slots.filter((s) => !s.isBench);
  const bench = slots.filter((s) => s.isBench);

  return (
    <section
      id="roster"
      className="rounded-xl border border-border bg-surface overflow-hidden scroll-mt-4"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border overflow-x-auto scroll-thin">
        {state.draft_order.map((t) => {
          const isActive = t === activeTeam;
          const isYou = t === state.user_team;
          return (
            <button
              key={t}
              onClick={() => setTeam(t)}
              className={`shrink-0 text-xs px-2.5 py-1 rounded-md border transition ${
                isActive
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted hover:bg-surface-2"
              }`}
            >
              {isYou ? "You" : t}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold">
          {activeTeam === state.user_team ? "Your roster" : `${activeTeam}'s roster`}
        </h2>
        <span className="text-xs text-muted tabular-nums">
          {picks.length} / {state.num_rounds}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
        <SlotList title="Starters" slots={starters} />
        <SlotList title="Bench" slots={bench} />
      </div>
    </section>
  );
}

function SlotList({
  title,
  slots,
}: {
  title: string;
  slots: ReturnType<typeof buildRoster<Player>>;
}) {
  if (slots.length === 0) return null;
  return (
    <div>
      <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted border-b border-border bg-surface-2/40">
        {title}
      </div>
      <ul className="divide-y divide-border">
        {slots.map((slot, i) => (
          <li
            key={`${slot.id}-${i}`}
            className="flex items-center gap-3 px-4 py-2 text-sm"
          >
            <span className="w-12 shrink-0 text-[10px] font-semibold tracking-wider text-muted">
              {slot.label}
            </span>
            {slot.player ? (
              <>
                <span
                  className={`text-[10px] font-semibold tracking-wider px-1.5 py-0.5 rounded ${positionBadgeClass(slot.player.position)}`}
                >
                  {slot.player.position}
                </span>
                <span className="truncate flex-1">{slot.player.name}</span>
                <span className="text-xs text-muted shrink-0">
                  {slot.player.team ?? "FA"}
                </span>
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
