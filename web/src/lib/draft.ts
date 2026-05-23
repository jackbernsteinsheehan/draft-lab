export type Player = {
  player_id: number;
  name: string;
  position: string;
  team: string | null;
  bye_week?: number | null;
  adp?: number | null;
};

export type Pick = {
  overall: number;
  round: number;
  slot: number;
  team: string;
  player_id: number;
};

export type DraftState = {
  num_teams: number;
  num_rounds: number;
  draft_order: string[];
  user_team: string;
  players: Record<number, Player>;
  available: Set<number>;
  rosters: Record<string, number[]>;
  picks: Pick[];
};

export type SlotInfo = { overall: number; round: number; slot: number; team: string };

export function snakeOrder(draftOrder: string[], numRounds: number): SlotInfo[] {
  const out: SlotInfo[] = [];
  let overall = 0;
  for (let r = 1; r <= numRounds; r++) {
    const forward = r % 2 === 1;
    for (let i = 0; i < draftOrder.length; i++) {
      const slotIdx = forward ? i : draftOrder.length - 1 - i;
      overall += 1;
      out.push({ overall, round: r, slot: slotIdx + 1, team: draftOrder[slotIdx] });
    }
  }
  return out;
}

export function initDraft(opts: {
  numTeams: number;
  numRounds: number;
  userSlot: number;
  players: Player[];
}): DraftState {
  const { numTeams, numRounds, userSlot, players } = opts;
  const draftOrder = Array.from({ length: numTeams }, (_, i) =>
    i + 1 === userSlot ? "You" : `CPU ${i + 1}`,
  );
  const rosters: Record<string, number[]> = {};
  for (const t of draftOrder) rosters[t] = [];
  const playerMap: Record<number, Player> = {};
  const available = new Set<number>();
  for (const p of players) {
    playerMap[p.player_id] = p;
    available.add(p.player_id);
  }
  return {
    num_teams: numTeams,
    num_rounds: numRounds,
    draft_order: draftOrder,
    user_team: draftOrder[userSlot - 1],
    players: playerMap,
    available,
    rosters,
    picks: [],
  };
}

export function processPick(state: DraftState, playerId: number): DraftState {
  if (!state.available.has(playerId)) throw new Error(`player not available: ${playerId}`);
  const order = snakeOrder(state.draft_order, state.num_rounds);
  const next = order[state.picks.length];
  if (!next) throw new Error("draft already complete");
  const available = new Set(state.available);
  available.delete(playerId);
  return {
    ...state,
    available,
    rosters: {
      ...state.rosters,
      [next.team]: [...state.rosters[next.team], playerId],
    },
    picks: [...state.picks, { ...next, player_id: playerId }],
  };
}

export function onClock(state: DraftState): SlotInfo | null {
  const order = snakeOrder(state.draft_order, state.num_rounds);
  return order[state.picks.length] ?? null;
}

export function isComplete(state: DraftState): boolean {
  return state.picks.length >= state.num_teams * state.num_rounds;
}

const STARTER_TARGETS: Record<string, number> = { QB: 1, RB: 2, WR: 3, TE: 1, K: 1, DST: 1 };
const ROSTER_CAPS: Record<string, number> = { QB: 2, RB: 5, WR: 5, TE: 2, K: 1, DST: 1 };
const PRIORITY = ["RB", "WR", "QB", "TE", "K", "DST"];

function rankAvailable(state: DraftState): Record<string, Player[]> {
  const byPos: Record<string, Player[]> = {};
  for (const pid of state.available) {
    const p = state.players[pid];
    (byPos[p.position] ??= []).push(p);
  }
  for (const list of Object.values(byPos)) {
    list.sort((a, b) => {
      const aAdp = a.adp ?? Number.POSITIVE_INFINITY;
      const bAdp = b.adp ?? Number.POSITIVE_INFINITY;
      if (aAdp !== bAdp) return aAdp - bAdp;
      return a.name.localeCompare(b.name);
    });
  }
  return byPos;
}

export function cpuPick(state: DraftState, team: string): number {
  const roster = state.rosters[team] ?? [];
  const counts: Record<string, number> = {};
  for (const pid of roster) {
    const pos = state.players[pid].position;
    counts[pos] = (counts[pos] ?? 0) + 1;
  }
  const byPos = rankAvailable(state);
  const round = Math.floor(state.picks.length / state.num_teams) + 1;

  const needs = PRIORITY.filter((pos) => (counts[pos] ?? 0) < (STARTER_TARGETS[pos] ?? 0));
  const candidates = needs.length > 0 ? needs : PRIORITY.filter((pos) => (counts[pos] ?? 0) < (ROSTER_CAPS[pos] ?? 0));

  for (const pos of candidates) {
    if ((pos === "K" || pos === "DST") && round < state.num_rounds - 1) continue;
    const pool = byPos[pos];
    if (!pool || pool.length === 0) continue;
    const top = pool.slice(0, Math.min(5, pool.length));
    return top[Math.floor(Math.random() * top.length)].player_id;
  }

  for (const pid of state.available) return pid;
  throw new Error("no players available");
}
