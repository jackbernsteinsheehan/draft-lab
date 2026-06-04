// ADP source: Fantasy Football Calculator public API.
//   https://fantasyfootballcalculator.com/api/v1/adp/{scoring}?teams={n}&year={yyyy}
// No auth required; CDN-cached. We further cache via Next's fetch revalidate.

type FfcPlayer = {
  name: string;
  position: string;
  team: string | null;
  adp: number;
  bye: number | null;
};

export type AdpEntry = { adp: number; bye: number | null };

const FFC_URL = (scoring: string, teams: number, year: number) =>
  `https://fantasyfootballcalculator.com/api/v1/adp/${scoring}?teams=${teams}&year=${year}`;

// Normalize "A.J. Brown Jr.", "AJ Brown", etc. to a comparable key.
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['.\-]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// FFC uses "DEF" for team defenses; we use "DST". Also normalize a few teams.
function normalizePosition(p: string): string {
  const up = p.toUpperCase();
  if (up === "DEF" || up === "D/ST") return "DST";
  if (up === "PK") return "K";
  return up;
}

export async function fetchAdpRows(opts: {
  scoring?: "standard" | "half-ppr" | "ppr";
  teams?: number;
  year?: number;
  revalidateSeconds?: number;
} = {}): Promise<FfcPlayer[]> {
  const scoring = opts.scoring ?? "half-ppr";
  const teams = opts.teams ?? 12;
  const revalidate = opts.revalidateSeconds ?? 3600;
  const currentYear = opts.year ?? new Date().getFullYear();

  // Try current year first; FFC may not yet have a board for the upcoming
  // season in early offseason, so fall back to the prior year.
  for (const year of [currentYear, currentYear - 1]) {
    const res = await fetch(FFC_URL(scoring, teams, year), {
      next: { revalidate },
    });
    if (!res.ok) continue;
    const json = (await res.json()) as { players?: FfcPlayer[] };
    const rows = json.players ?? [];
    if (rows.length === 0) continue;
    return rows.map((p) => ({ ...p, position: normalizePosition(p.position) }));
  }
  return [];
}

// Build a map from our internal player_id -> { adp, bye } by matching FFC
// rows to provided players via (normalizedName, position). Team is used as a
// tiebreaker when normalized names collide.
export function buildAdpMap(
  ffcRows: FfcPlayer[],
  players: { player_id: number; name: string; position: string; team: string | null }[],
): Record<number, AdpEntry> {
  const buckets = new Map<string, typeof players>();
  for (const p of players) {
    const key = `${normalizeName(p.name)}|${p.position}`;
    const arr = buckets.get(key) ?? [];
    arr.push(p);
    buckets.set(key, arr);
  }

  const out: Record<number, AdpEntry> = {};
  for (const row of ffcRows) {
    const key = `${normalizeName(row.name)}|${row.position}`;
    const matches = buckets.get(key);
    if (!matches || matches.length === 0) continue;
    const match =
      matches.length === 1
        ? matches[0]
        : matches.find((m) => (m.team ?? "") === (row.team ?? "")) ?? matches[0];
    out[match.player_id] = { adp: row.adp, bye: row.bye };
  }
  return out;
}
