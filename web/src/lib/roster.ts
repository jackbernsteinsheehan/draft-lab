// ESPN-style starting-lineup roster assignment.
//
// Walks drafted players in pick order and fills the first matching empty
// starter slot; anything left over goes to the bench. Mirrors how ESPN's
// roster panel auto-slots picks in a draft room.

export type SlotId =
  | "QB"
  | "RB1"
  | "RB2"
  | "WR1"
  | "WR2"
  | "TE"
  | "FLEX"
  | "DST"
  | "K"
  | "BE";

export type RosterSlot<P> = {
  id: SlotId;
  label: string;       // What to render in the slot column (e.g. "RB", "FLEX").
  isBench: boolean;
  player: P | null;
};

const STARTERS: { id: SlotId; label: string }[] = [
  { id: "QB",   label: "QB" },
  { id: "RB1",  label: "RB" },
  { id: "RB2",  label: "RB" },
  { id: "WR1",  label: "WR" },
  { id: "WR2",  label: "WR" },
  { id: "TE",   label: "TE" },
  { id: "FLEX", label: "FLEX" },
  { id: "DST",  label: "D/ST" },
  { id: "K",    label: "K" },
];

export const STARTER_COUNT = STARTERS.length; // 9

const MATCHERS: Record<SlotId, (pos: string) => boolean> = {
  QB:   (p) => p === "QB",
  RB1:  (p) => p === "RB",
  RB2:  (p) => p === "RB",
  WR1:  (p) => p === "WR",
  WR2:  (p) => p === "WR",
  TE:   (p) => p === "TE",
  FLEX: (p) => p === "RB" || p === "WR" || p === "TE",
  DST:  (p) => p === "DST",
  K:    (p) => p === "K",
  BE:   () => true,
};

// `players` must be in pick order. `totalRounds` controls bench size
// (numRounds - 9, min 0).
export function buildRoster<P extends { position: string }>(
  players: P[],
  totalRounds: number,
): RosterSlot<P>[] {
  const benchSize = Math.max(0, totalRounds - STARTER_COUNT);
  const slots: RosterSlot<P>[] = STARTERS.map((s) => ({ ...s, isBench: false, player: null }));
  for (let i = 0; i < benchSize; i++) {
    slots.push({ id: "BE", label: "BE", isBench: true, player: null });
  }
  for (const p of players) {
    const slot = slots.find((s) => s.player === null && MATCHERS[s.id](p.position));
    if (slot) slot.player = p;
    // Players who can't fit (e.g. extra K in a too-short roster) are silently dropped.
  }
  return slots;
}
