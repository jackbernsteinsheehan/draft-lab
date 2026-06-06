"use client";

import Link from "next/link";

export default function AnalyzeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="max-w-xl mx-auto px-4 md:px-6 py-16 text-center space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-sm text-muted">
        We couldn&apos;t load this draft analysis. {error.digest ? `(ref ${error.digest})` : ""}
      </p>
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={reset}
          className="text-sm px-3 py-1.5 rounded-md bg-foreground text-background hover:opacity-90 transition"
        >
          Try again
        </button>
        <Link
          href="/analyze"
          className="text-sm px-3 py-1.5 rounded-md border border-border hover:bg-surface-2 transition"
        >
          Back to drafts
        </Link>
      </div>
    </main>
  );
}
