import Link from "next/link";
import { positionBadgeClass, strategyBadgeClass } from "@/lib/ui";
import { buildRoster } from "@/lib/roster";

export type DetailPick = {
  player_id: number;
  overall: number;
  round: number;
  slot: number;
  name: string;
  position: string;
  adp: number | null;
};

export type BoardPick = {
  overall: number;
  round: number;
  slot: number;
  team: string;
  isUser: boolean;
  name: string;
  position: string;
};

export type DetailDraft = {
  id: string;
  num_teams: number;
  num_rounds: number;
  user_slot: number;
  strategy: string;
  strategy_tags: string[];
  created_at: string;
};

// A pick is a "steal" if it landed this many spots past its ADP, a "reach" if
// this many spots ahead. Picks inside the band are roughly on par.
const VALUE_BAND = 6;

function valueOf(pick: DetailPick): number | null {
  if (pick.adp == null) return null;
  // Positive = drafted later than ADP (value gained); negative = reached.
  return Math.round((pick.adp - pick.overall) * 10) / 10;
}

export default function DraftDetail({
  draft,
  picks,
  board,
}: {
  draft: DetailDraft;
  picks: DetailPick[];
  board: BoardPick[];
}) {
  const slots = buildRoster(picks, draft.num_rounds);
  const starters = slots.filter((s) => !s.isBench);
  const bench = slots.filter((s) => s.isBench);

  const valued = picks.map(valueOf).filter((v): v is number => v != null);
  const steals = valued.filter((v) => v >= VALUE_BAND).length;
  const reaches = valued.filter((v) => v <= -VALUE_BAND).length;
  const netValue = Math.round(valued.reduce((s, v) => s + v, 0) * 10) / 10;

  return (
    <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
      <Link href="/analyze" className="text-sm text-muted hover:text-foreground transition">
        ← Back to drafts
      </Link>

      <header className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded ${strategyBadgeClass(draft.strategy)}`}
          >
            {draft.strategy}
          </span>
          {draft.strategy_tags
            .filter((t) => t !== draft.strategy)
            .map((t) => (
              <span
                key={t}
                className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-2 text-muted"
              >
                {t}
              </span>
            ))}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Your draft</h1>
        <div className="text-xs text-muted">
          {new Date(draft.created_at).toLocaleString()} · {draft.num_teams}-team ·{" "}
          {draft.num_rounds} rounds · slot {draft.user_slot}
        </div>
      </header>

      <section className="grid grid-cols-3 gap-3">
        <Stat label="Steals" value={steals} hint={`≥${VALUE_BAND} past ADP`} />
        <Stat label="Reaches" value={reaches} hint={`≥${VALUE_BAND} ahead of ADP`} />
        <Stat
          label="Net value"
          value={netValue > 0 ? `+${netValue}` : `${netValue}`}
          hint="picks vs. ADP"
        />
      </section>

      <section className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted border-b border-border bg-surface-2/40">
          Pick log
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted">
              <th className="text-left font-semibold px-4 py-2">Pick</th>
              <th className="text-left font-semibold px-2 py-2">Pos</th>
              <th className="text-left font-semibold px-2 py-2">Player</th>
              <th className="text-right font-semibold px-2 py-2">ADP</th>
              <th className="text-right font-semibold px-4 py-2">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {picks.map((p) => {
              const pickInRound = p.overall - (p.round - 1) * draft.num_teams;
              const v = valueOf(p);
              return (
                <tr key={`${p.player_id}-${p.overall}`}>
                  <td className="px-4 py-2 tabular-nums">
                    <span className="font-medium">
                      {p.round}.{String(pickInRound).padStart(2, "0")}
                    </span>
                    <span className="text-muted text-xs"> · {p.overall} ovr</span>
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className={`text-[9px] font-semibold tracking-wider px-1 py-px rounded ${positionBadgeClass(p.position)}`}
                    >
                      {p.position}
                    </span>
                  </td>
                  <td className="px-2 py-2 truncate">{p.name}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted">
                    {p.adp != null ? Math.round(p.adp) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <ValueBadge value={v} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <DraftBoard
        board={board}
        numTeams={draft.num_teams}
        numRounds={draft.num_rounds}
        userSlot={draft.user_slot}
      />

      <section className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
          <SlotColumn title="Starters" slots={starters} />
          <SlotColumn title="Bench" slots={bench} />
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs font-medium mt-0.5">{label}</div>
      <div className="text-[10px] text-muted">{hint}</div>
    </div>
  );
}

function ValueBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted/60">—</span>;
  if (value >= VALUE_BAND) {
    return (
      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
        +{value} steal
      </span>
    );
  }
  if (value <= -VALUE_BAND) {
    return (
      <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 tabular-nums">
        {value} reach
      </span>
    );
  }
  return (
    <span className="text-xs text-muted tabular-nums">
      {value > 0 ? `+${value}` : value}
    </span>
  );
}

// Full snake-draft board: one row per round, one column per team slot, so the
// draft can be reviewed round by round with the user's picks highlighted.
function DraftBoard({
  board,
  numTeams,
  numRounds,
  userSlot,
}: {
  board: BoardPick[];
  numTeams: number;
  numRounds: number;
  userSlot: number;
}) {
  if (board.length === 0) return null;

  // Index picks by "round-slot" for O(1) cell lookup.
  const byCell = new Map<string, BoardPick>();
  for (const p of board) byCell.set(`${p.round}-${p.slot}`, p);

  const slots = Array.from({ length: numTeams }, (_, i) => i + 1);
  const rounds = Array.from({ length: numRounds }, (_, i) => i + 1);

  return (
    <section className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted border-b border-border bg-surface-2/40">
        Draft board · round by round
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted">
              <th className="sticky left-0 z-10 bg-surface px-2 py-2 text-left font-semibold">
                Rd
              </th>
              {slots.map((s) => (
                <th
                  key={s}
                  className={`px-2 py-2 font-semibold text-center min-w-[7rem] ${
                    s === userSlot ? "text-foreground" : ""
                  }`}
                >
                  {s === userSlot ? "You" : s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rounds.map((r) => (
              <tr key={r}>
                <td className="sticky left-0 z-10 bg-surface px-2 py-1.5 font-medium tabular-nums text-muted border-r border-border">
                  {r}
                </td>
                {slots.map((s) => {
                  const pick = byCell.get(`${r}-${s}`);
                  return (
                    <td
                      key={s}
                      className={`px-2 py-1.5 align-top ${
                        pick?.isUser ? "bg-foreground/5 ring-1 ring-inset ring-foreground/20" : ""
                      }`}
                    >
                      {pick ? (
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[9px] font-semibold tracking-wider px-1 py-px rounded shrink-0 ${positionBadgeClass(pick.position)}`}
                          >
                            {pick.position}
                          </span>
                          <span className="truncate">{pick.name}</span>
                        </div>
                      ) : (
                        <span className="text-muted/40">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type CardPlayer = { player_id: number; name: string; position: string };

function SlotColumn({
  title,
  slots,
}: {
  title: string;
  slots: ReturnType<typeof buildRoster<CardPlayer>>;
}) {
  if (slots.length === 0) return null;
  return (
    <div>
      <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted border-b border-border bg-surface-2/40">
        {title}
      </div>
      <ul className="divide-y divide-border">
        {slots.map((slot, i) => (
          <li key={`${slot.id}-${i}`} className="flex items-center gap-2 px-4 py-1.5 text-xs">
            <span className="w-10 shrink-0 text-[10px] font-semibold tracking-wider text-muted">
              {slot.label}
            </span>
            {slot.player ? (
              <>
                <span
                  className={`text-[9px] font-semibold tracking-wider px-1 py-px rounded ${positionBadgeClass(slot.player.position)}`}
                >
                  {slot.player.position}
                </span>
                <span className="truncate">{slot.player.name}</span>
              </>
            ) : (
              <span className="text-muted/60 italic">Empty</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
