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
const ROSTER_CAPS: Record<string, number> = { QB: 2, RB: 6, WR: 6, TE: 2, K: 1, DST: 1 };

// ADP-driven CPU pick.
//
// 1. Score every available player as (-adp + need_bonus). Players with no ADP
//    get a large penalty so they're only picked once ranked players run out.
// 2. Drop players whose roster cap is already full, and gate K/DST until the
//    last two rounds.
// 3. Sample from the top N by score with a steep weighting so most picks are
//    "BPA-ish" but the draft still varies run-to-run.
export function cpuPick(state: DraftState, team: string): number {
  const roster = state.rosters[team] ?? [];
  const counts: Record<string, number> = {};
  for (const pid of roster) {
    const pos = state.players[pid].position;
    counts[pos] = (counts[pos] ?? 0) + 1;
  }
  const round = Math.floor(state.picks.length / state.num_teams) + 1;
  const currentPickOverall = state.picks.length + 1;

  type Scored = { pid: number; score: number };
  const scored: Scored[] = [];
  let fallback: number | null = null;

  for (const pid of state.available) {
    const p = state.players[pid];
    if (fallback === null) fallback = pid;

    const pos = p.position;
    const have = counts[pos] ?? 0;
    const cap = ROSTER_CAPS[pos] ?? 99;
    if (have >= cap) continue;

    // Don't draft K/DST before the last two rounds.
    if ((pos === "K" || pos === "DST") && round < state.num_rounds - 1) continue;

    const adp = p.adp ?? 9999;
    // Base value: how far ahead of ADP we'd be reaching (negative = good value).
    let score = -adp;

    // Positional need bonus shrinks as starters fill.
    const target = STARTER_TARGETS[pos] ?? 0;
    if (have < target) {
      // Bigger bonus for the more under-filled positions.
      score += (target - have) * 8;
    } else if (have >= target && (pos === "QB" || pos === "TE")) {
      // Strongly discourage stacking a second QB/TE before bench depth.
      score -= 40;
    }

    // Mild reach penalty: if a player's ADP is far past the current pick, don't
    // grab them just because they fit a need.
    if (adp > currentPickOverall + 24) {
      score -= (adp - currentPickOverall - 24) * 0.5;
    }

    scored.push({ pid, score });
  }

  if (scored.length === 0) {
    if (fallback === null) throw new Error("no players available");
    return fallback;
  }

  scored.sort((a, b) => b.score - a.score);

  // Weighted random among the top candidates so identical states don't always
  // produce identical drafts. Weights drop off geometrically.
  const topN = Math.min(5, scored.length);
  const top = scored.slice(0, topN);
  const weights = top.map((_, i) => Math.pow(0.55, i));
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * totalWeight;
  for (let i = 0; i < top.length; i++) {
    r -= weights[i];
    if (r <= 0) return top[i].pid;
  }
  return top[0].pid;
}
