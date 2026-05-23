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

type Config = { numTeams: number; numRounds: number; userSlot: number };

export default function DraftRoom({ players }: { players: Player[] }) {
  const [state, setState] = useState<DraftState | null>(null);

  if (!state) return <Setup players={players} onStart={(cfg) => setState(initDraft({ ...cfg, players }))} />;
  return <LiveDraft state={state} setState={setState} onReset={() => setState(null)} />;
}

function Setup({ players, onStart }: { players: Player[]; onStart: (cfg: Config) => void }) {
  const [numTeams, setNumTeams] = useState(12);
  const [numRounds, setNumRounds] = useState(15);
  const [userSlot, setUserSlot] = useState(1);

  return (
    <main className="min-h-screen p-8 max-w-xl mx-auto space-y-6">
      <h1 className="text-3xl font-semibold">Mock Draft</h1>
      <p className="text-sm text-zinc-500">
        {players.length} active players loaded.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onStart({ numTeams, numRounds, userSlot: Math.min(userSlot, numTeams) });
        }}
        className="space-y-4"
      >
        <Field label="Teams">
          <input
            type="number"
            min={2}
            max={16}
            value={numTeams}
            onChange={(e) => setNumTeams(Number(e.target.value))}
            className="border rounded px-2 py-1 w-24 bg-transparent"
          />
        </Field>
        <Field label="Rounds">
          <input
            type="number"
            min={1}
            max={25}
            value={numRounds}
            onChange={(e) => setNumRounds(Number(e.target.value))}
            className="border rounded px-2 py-1 w-24 bg-transparent"
          />
        </Field>
        <Field label="Your Slot">
          <input
            type="number"
            min={1}
            max={numTeams}
            value={userSlot}
            onChange={(e) => setUserSlot(Number(e.target.value))}
            className="border rounded px-2 py-1 w-24 bg-transparent"
          />
        </Field>
        <button
          type="submit"
          disabled={players.length === 0}
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
        >
          Start Draft
        </button>
      </form>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="text-sm text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

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

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list: Player[] = [];
    for (const pid of state.available) {
      const p = state.players[pid];
      if (posFilter !== "ALL" && p.position !== posFilter) continue;
      if (q && !p.name.toLowerCase().includes(q)) continue;
      list.push(p);
    }
    list.sort((a, b) => {
      const aAdp = a.adp ?? Number.POSITIVE_INFINITY;
      const bAdp = b.adp ?? Number.POSITIVE_INFINITY;
      if (aAdp !== bAdp) return aAdp - bAdp;
      return a.name.localeCompare(b.name);
    });
    return list.slice(0, 200);
  }, [state, filter, posFilter]);

  const order = snakeOrder(state.draft_order, state.num_rounds);

  return (
    <main className="min-h-screen p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Mock Draft</h1>
          <p className="text-sm text-zinc-500">
            {done
              ? "Draft complete."
              : slot
                ? `Round ${slot.round}, Pick ${slot.overall} — ${userTurn ? "You're on the clock" : `${slot.team} is picking…`}`
                : ""}
          </p>
        </div>
        <button onClick={onReset} className="text-sm px-3 py-1 rounded border">
          Reset
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <section className="border rounded p-3 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <input
              placeholder="Search players…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="border rounded px-2 py-1 flex-1 min-w-[160px] bg-transparent"
            />
            <select
              value={posFilter}
              onChange={(e) => setPosFilter(e.target.value)}
              className="border rounded px-2 py-1 bg-transparent"
            >
              {["ALL", "QB", "RB", "WR", "TE", "K", "DST"].map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <ul className="divide-y max-h-[60vh] overflow-auto">
            {filtered.map((p) => (
              <li key={p.player_id} className="flex items-center justify-between py-1.5 px-1 gap-2">
                <div className="min-w-0">
                  <div className="truncate">{p.name}</div>
                  <div className="text-xs text-zinc-500">
                    {p.position} {p.team ? `· ${p.team}` : ""}
                  </div>
                </div>
                <button
                  disabled={!userTurn || done}
                  onClick={() => setState(processPick(state, p.player_id))}
                  className="text-xs px-2 py-1 rounded bg-blue-600 text-white disabled:opacity-30"
                >
                  Draft
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="text-sm text-zinc-500 py-4 text-center">No matches.</li>
            )}
          </ul>
        </section>

        <aside className="border rounded p-3 space-y-2 max-h-[70vh] overflow-auto">
          <h2 className="text-sm font-semibold">Picks</h2>
          <ol className="text-xs space-y-1">
            {order.slice(0, state.picks.length + 1).map((s, idx) => {
              const pick = state.picks[idx];
              const player = pick ? state.players[pick.player_id] : null;
              const isCurrent = idx === state.picks.length && !done;
              return (
                <li
                  key={s.overall}
                  className={`flex justify-between gap-2 px-1 py-0.5 rounded ${
                    isCurrent ? "bg-blue-50 dark:bg-blue-950" : ""
                  }`}
                >
                  <span className="text-zinc-500 tabular-nums w-14">
                    {s.round}.{String(s.slot).padStart(2, "0")}
                  </span>
                  <span className="flex-1 truncate">
                    {s.team} {player ? `→ ${player.name} (${player.position})` : isCurrent ? "…" : ""}
                  </span>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>

      <section className="border rounded p-3">
        <h2 className="text-sm font-semibold mb-2">Your Roster ({state.user_team})</h2>
        <ul className="text-sm grid grid-cols-2 md:grid-cols-3 gap-1">
          {state.rosters[state.user_team].map((pid) => {
            const p = state.players[pid];
            return (
              <li key={pid} className="truncate">
                <span className="text-zinc-500 w-10 inline-block">{p.position}</span>
                {p.name}
              </li>
            );
          })}
          {state.rosters[state.user_team].length === 0 && (
            <li className="text-zinc-500">No picks yet.</li>
          )}
        </ul>
      </section>
    </main>
  );
}
