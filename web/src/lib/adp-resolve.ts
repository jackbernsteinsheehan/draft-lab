import type { createClient } from "@/lib/supabase/server";
import { buildAdpMap, fetchAdpRows } from "@/lib/adp";

type Supa = Awaited<ReturnType<typeof createClient>>;
type AdpPlayer = { player_id: number; name: string; position: string; team: string | null };

// Resolve ADP for the given players, preferring FantasyPros from `player_rankings`
// (seeded via nflverse) and falling back to FantasyFootballCalculator when the
// rankings table is empty. Mirrors the resolution order used by the draft room.
// Returns a map of player_id -> ADP value (lower = drafted earlier).
export async function loadAdpForPlayers(
  supabase: Supa,
  players: AdpPlayer[],
): Promise<Record<number, number>> {
  // player_rankings now keeps history (one row per scrape_date), so order by the
  // newest snapshot first and take the first value seen per player below.
  const { data: rankingRows } = await supabase
    .from("player_rankings")
    .select("player_id, adp, ecr")
    .eq("source", "fantasypros")
    .eq("scoring", "half")
    .order("scrape_date", { ascending: false })
    .order("season", { ascending: false });

  const map: Record<number, number> = {};
  if (rankingRows && rankingRows.length > 0) {
    for (const row of rankingRows) {
      const pid = Number(row.player_id);
      // ECR stands in for ADP when ADP is absent (nflverse exposes ECR only).
      const value =
        row.adp != null ? Number(row.adp) : row.ecr != null ? Number(row.ecr) : null;
      if (value != null && map[pid] == null) map[pid] = value;
    }
  }
  if (Object.keys(map).length > 0) return map;

  // Fallback: FFC, matched to our players by normalized name + position.
  const ffcRows = await fetchAdpRows({ scoring: "half-ppr", teams: 12 });
  const adpMap = buildAdpMap(ffcRows, players);
  for (const [pid, entry] of Object.entries(adpMap)) map[Number(pid)] = entry.adp;
  return map;
}
