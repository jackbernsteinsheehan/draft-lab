import { createClient } from "@/lib/supabase/server";
import DraftRoom from "./DraftRoom";
import type { Player } from "@/lib/draft";

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

  const players: Player[] = (data ?? []).map((r) => ({
    player_id: Number(r.player_id),
    name: r.canonical_name as string,
    position: r.primary_position as string,
    team: (r.current_team as string | null) ?? null,
  }));

  return <DraftRoom players={players} />;
}
