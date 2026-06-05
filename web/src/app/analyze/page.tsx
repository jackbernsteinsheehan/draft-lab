import { createClient } from "@/lib/supabase/server";
import AnalyzeView, { type SavedDraft } from "./AnalyzeView";

export const dynamic = "force-dynamic";

export default async function AnalyzePage() {
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
        <h1 className="text-2xl font-semibold">Draft Analysis</h1>
        <p className="text-sm text-zinc-500">Sign in to view your saved drafts.</p>
      </main>
    );
  }

  const { data: drafts, error } = await supabase
    .from("drafts")
    .select("id, num_teams, num_rounds, user_slot, user_team, picks, strategy, strategy_tags, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="p-8">
        <p className="text-sm text-red-500">Failed to load drafts: {error.message}</p>
      </main>
    );
  }

  // Resolve player names for all picks the user made (one query, all drafts).
  const userPlayerIds = new Set<number>();
  for (const d of drafts ?? []) {
    const picks = (d.picks as { team: string; player_id: number }[]) ?? [];
    for (const p of picks) {
      if (p.team === d.user_team) userPlayerIds.add(Number(p.player_id));
    }
  }

  let playerMap: Record<number, { name: string; position: string }> = {};
  if (userPlayerIds.size > 0) {
    const { data: players } = await supabase
      .from("players")
      .select("player_id, canonical_name, primary_position")
      .in("player_id", Array.from(userPlayerIds));
    playerMap = Object.fromEntries(
      (players ?? []).map((p) => [
        Number(p.player_id),
        { name: p.canonical_name as string, position: (p.primary_position as string) ?? "?" },
      ]),
    );
  }

  const saved: SavedDraft[] = (drafts ?? []).map((d) => ({
    id: d.id as string,
    num_teams: d.num_teams as number,
    num_rounds: d.num_rounds as number,
    user_slot: d.user_slot as number,
    user_team: d.user_team as string,
    picks: (d.picks as SavedDraft["picks"]) ?? [],
    strategy: (d.strategy as string | null) ?? "Unclassified",
    strategy_tags: (d.strategy_tags as string[]) ?? [],
    created_at: d.created_at as string,
  }));

  return <AnalyzeView drafts={saved} playerMap={playerMap} />;
}
