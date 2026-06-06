export default function AnalyzeLoading() {
  return (
    <main className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
      <div className="h-8 w-48 rounded bg-surface-2 animate-pulse" />
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-40 rounded-xl border border-border bg-surface-2/40 animate-pulse" />
        ))}
      </div>
    </main>
  );
}
