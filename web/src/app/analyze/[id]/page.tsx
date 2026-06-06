import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadAdpForPlayers } from "@/lib/adp-resolve";
import DraftDetail, { type DetailDraft, type DetailPick } from "./DraftDetail";

export const dynamic = "force-dynamic";

type RawPick = { overall: number; round: number; slot: number; team: string; player_id: number };

export default async function DraftDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="p-8 max-w-xl mx-auto space-y-3">
        <h1 className="text-2xl font-semibold">Draft detail</h1>
        <p className="text-sm text-zinc-500">Sign in to view this draft.</p>
      </main>
    );
  }

  // RLS restricts this to the owner, so a missing row means "not yours" too.
  const { data: draft, error } = await supabase
    .from("drafts")
    .select(
      "id, num_teams, num_rounds, user_slot, user_team, picks, strategy, strategy_tags, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return (
      <main className="p-8">
        <p className="text-sm text-red-500">Failed to load draft: {error.message}</p>
      </main>
    );
  }
  if (!draft) notFound();

  const picks = ((draft.picks as RawPick[]) ?? []).map((p) => ({
    overall: Number(p.overall),
    round: Number(p.round),
    slot: Number(p.slot),
    team: String(p.team),
    player_id: Number(p.player_id),
  }));

  // Resolve names/positions/teams for every drafted player (one query).
  const ids = Array.from(new Set(picks.map((p) => p.player_id)));
  let playerRows: { player_id: number; name: string; position: string; team: string | null }[] = [];
  if (ids.length > 0) {
    const { data: players } = await supabase
      .from("players")
      .select("player_id, canonical_name, primary_position, current_team")
      .in("player_id", ids);
    playerRows = (players ?? []).map((p) => ({
      player_id: Number(p.player_id),
      name: p.canonical_name as string,
      position: (p.primary_position as string) ?? "?",
      team: (p.current_team as string | null) ?? null,
    }));
  }
  const playerMap = new Map(playerRows.map((p) => [p.player_id, p]));

  // ADP only matters for the user's own picks; resolve for those players.
  const userPlayers = playerRows.filter((p) =>
    picks.some((pick) => pick.team === draft.user_team && pick.player_id === p.player_id),
  );
  const adpMap = await loadAdpForPlayers(supabase, userPlayers);

  const userPicks: DetailPick[] = picks
    .filter((p) => p.team === draft.user_team)
    .sort((a, b) => a.overall - b.overall)
    .map((p) => {
      const info = playerMap.get(p.player_id);
      return {
        player_id: p.player_id,
        overall: p.overall,
        round: p.round,
        slot: p.slot,
        name: info?.name ?? `#${p.player_id}`,
        position: info?.position ?? "?",
        adp: adpMap[p.player_id] ?? null,
      };
    });

  const detail: DetailDraft = {
    id: draft.id as string,
    num_teams: draft.num_teams as number,
    num_rounds: draft.num_rounds as number,
    user_slot: draft.user_slot as number,
    strategy: (draft.strategy as string | null) ?? "Unclassified",
    strategy_tags: (draft.strategy_tags as string[]) ?? [],
    created_at: draft.created_at as string,
  };

  return <DraftDetail draft={detail} picks={userPicks} />;
}
