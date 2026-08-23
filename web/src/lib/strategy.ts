import type { Pick, Player } from "./draft";

export type StrategyResult = {
  primary: string;
  tags: string[];
  // Per-position round of first pick (null if never drafted in scope).
  firstRoundByPos: Record<string, number | null>;
  earlyCounts: Record<string, number>; // first 3 rounds
};

const POSITIONS = ["QB", "RB", "WR", "TE"] as const;

// Classify a user's roster (as drafted, in pick order) into one or more
// fantasy-football draft strategy tags. Picks must be sorted by overall pick.
export function classifyStrategy(
  picks: Pick[],
  players: Record<number, Player>,
): StrategyResult {
  const userPicks = [...picks].sort((a, b) => a.overall - b.overall);

  const posByRound: { round: number; pos: string }[] = userPicks.map((p) => ({
    round: p.round,
    pos: players[p.player_id]?.position ?? "?",
  }));

  const earlyCounts: Record<string, number> = {};
  for (const { round, pos } of posByRound) {
    if (round <= 3) earlyCounts[pos] = (earlyCounts[pos] ?? 0) + 1;
  }

  const firstRoundByPos: Record<string, number | null> = {};
  for (const pos of POSITIONS) firstRoundByPos[pos] = null;
  for (const { round, pos } of posByRound) {
    if (firstRoundByPos[pos] == null) firstRoundByPos[pos] = round;
  }

  const firstFive = posByRound.filter((p) => p.round <= 5);
  const rbInFirstFive = firstFive.filter((p) => p.pos === "RB").length;
  const wrInFirstFive = firstFive.filter((p) => p.pos === "WR").length;

  const tags: string[] = [];

  // RB construction
  if (rbInFirstFive === 0) {
    tags.push("Zero RB");
  } else if ((earlyCounts.RB ?? 0) >= 2) {
    tags.push("Robust RB");
  }

  // WR construction
  if ((earlyCounts.WR ?? 0) >= 2) tags.push("WR Heavy");

  // QB timing
  const qbRound = firstRoundByPos.QB;
  if (qbRound != null && qbRound <= 4) tags.push("Early QB");
  else if (qbRound == null || qbRound >= 10) tags.push("Late QB");

  // TE timing
  const teRound = firstRoundByPos.TE;
  if (teRound != null && teRound <= 4) tags.push("Early TE");

  // Balanced fallback: 1 RB + 1 WR in first 2 rounds and no extreme tag.
  const balancedShape =
    rbInFirstFive >= 1 &&
    wrInFirstFive >= 1 &&
    (earlyCounts.RB ?? 0) <= 1 &&
    (earlyCounts.WR ?? 0) <= 1;
  if (
    balancedShape &&
    !tags.some((t) => ["Zero RB", "Robust RB", "WR Heavy"].includes(t))
  ) {
    tags.unshift("Balanced");
  }

  // Pick the most descriptive primary tag.
  const priority = [
    "Zero RB",
    "Robust RB",
    "WR Heavy",
    "Balanced",
    "Early QB",
    "Early TE",
  ];
  const primary =
    priority.find((p) => tags.includes(p)) ?? tags[0] ?? "Unclassified";

  return { primary, tags, firstRoundByPos, earlyCounts };
}
