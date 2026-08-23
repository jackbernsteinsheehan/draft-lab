// Shared UI tokens — colors for positions and strategy chips.

export const POSITION_COLORS: Record<string, string> = {
  QB:  "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
  RB:  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  WR:  "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
  TE:  "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  K:   "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  DST: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export function positionBadgeClass(pos: string): string {
  return POSITION_COLORS[pos] ?? "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}

export const STRATEGY_COLORS: Record<string, string> = {
  "Zero RB":     "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200",
  "Robust RB":   "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200",
  "WR Heavy":    "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200",
  "Balanced":    "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  "Early QB":    "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200",
  "Late QB":     "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200",
  "Early TE":    "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200",
};

export function strategyBadgeClass(name: string): string {
  return STRATEGY_COLORS[name] ?? "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}
