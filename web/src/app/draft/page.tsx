import { createClient } from "@/lib/supabase/server";
import DraftRoom from "./DraftRoom";
import type { Player } from "@/lib/draft";
import { buildAdpMap, fetchAdpRows } from "@/lib/adp";

export const dynamic = "force-dynamic";

export default async function DraftPage() {
  const configured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!configured) {
    return (
      <main className="p-8">
        <p className="text-sm text-zinc-500">
          Supabase not configured — copy .env.local.example to .env.local
        </p>
      </main>
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("players")
    .select("player_id, canonical_name, primary_position, current_team")
    .eq("is_active", true)
    .in("primary_position", ["QB", "RB", "WR", "TE", "K", "DST"]);

  if (error) {
    return (
      <main className="p-8">
        <p className="text-sm text-red-500">Failed to load players: {error.message}</p>
      </main>
    );
  }

  const basePlayers: Player[] = (data ?? []).map((r) => ({
    player_id: Number(r.player_id),
    name: r.canonical_name as string,
    position: r.primary_position as string,
    team: (r.current_team as string | null) ?? null,
  }));

  // Prefer FantasyPros ADP from `player_rankings` (seeded via nflverse).
  // Falls back to FFC if the rankings table is empty.
  // nflverse `ff_rankings` exposes ECR, not ADP. ECR serves as the CPU's
  // draft-order signal just as well — coalesce ADP → ECR.
  const { data: rankingRows } = await supabase
    .from("player_rankings")
    .select("player_id, adp, ecr")
    .eq("source", "fantasypros")
    .eq("scoring", "half")
    .order("season", { ascending: false });

  const dbAdpMap: Record<number, number> = {};
  let adpSource: "fantasypros" | "ffc" | "none" = "none";
  if (rankingRows && rankingRows.length > 0) {
    for (const row of rankingRows) {
      const pid = Number(row.player_id);
      const value =
        row.adp != null ? Number(row.adp) : row.ecr != null ? Number(row.ecr) : null;
      if (value != null && dbAdpMap[pid] == null) {
        dbAdpMap[pid] = value;
      }
    }
    if (Object.keys(dbAdpMap).length > 0) adpSource = "fantasypros";
  }

  let matched = Object.keys(dbAdpMap).length;
  let sourceRowCount = rankingRows?.length ?? 0;
  let players: Player[];

  if (matched > 0) {
    players = basePlayers.map((p) => {
      const adp = dbAdpMap[p.player_id];
      return adp != null ? { ...p, adp } : p;
    });
  } else {
    const ffcRows = await fetchAdpRows({ scoring: "half-ppr", teams: 12 });
    const adpMap = buildAdpMap(ffcRows, basePlayers);
    players = basePlayers.map((p) => {
      const entry = adpMap[p.player_id];
      return entry ? { ...p, adp: entry.adp, bye_week: entry.bye } : p;
    });
    matched = Object.keys(adpMap).length;
    sourceRowCount = ffcRows.length;
    adpSource = matched > 0 ? "ffc" : "none";
  }

  const adpCoverage = {
    matched,
    ffcRows: sourceRowCount,
    total: players.length,
    source: adpSource,
  };

  return <DraftRoom players={players} adpCoverage={adpCoverage} />;
}
