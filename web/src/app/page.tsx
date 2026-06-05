import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const configured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let signedInEmail: string | null = null;
  if (configured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedInEmail = user?.email ?? null;
  }

  return (
    <main className="min-h-[calc(100vh-57px)] relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_50%_-20%,rgba(59,130,246,0.18),transparent_60%)]"
      />
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-16 text-center">
        <p className="text-xs font-medium tracking-widest text-muted uppercase mb-4">
          Fantasy Football Mock Drafts
        </p>
        <h1 className="text-5xl md:text-6xl font-semibold tracking-tight">
          Draft smarter.
          <br />
          <span className="text-muted">Analyze every pick.</span>
        </h1>
        <p className="mt-6 text-muted max-w-xl mx-auto">
          Run mock drafts against ADP-driven CPUs, then classify your roster
          construction strategy to see what you actually drafted vs. what you
          intended.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <a
            href="/draft"
            className="px-5 py-2.5 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition"
          >
            Start a mock draft
          </a>
          <a
            href="/analyze"
            className="px-5 py-2.5 rounded-md border border-border text-sm font-medium hover:bg-surface-2 transition"
          >
            Analyze drafts
          </a>
        </div>
        {!configured ? (
          <p className="mt-8 text-xs text-amber-600">
            Supabase not configured — copy .env.local.example to .env.local
          </p>
        ) : signedInEmail ? (
          <p className="mt-8 text-xs text-muted">Signed in as {signedInEmail}</p>
        ) : (
          <p className="mt-8 text-xs text-muted">Not signed in</p>
        )}
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-20 grid sm:grid-cols-3 gap-4">
        <Feature title="ADP-driven CPUs" body="Picks use live half-PPR ADP from FFC with positional need bias and weighted variance." />
        <Feature title="Strategy classifier" body="Zero RB, Robust RB, Hero RB, WR Heavy, Early QB/TE — labeled automatically." />
        <Feature title="Save & compare" body="Persist every draft and review your build patterns across runs." />
      </section>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </div>
  );
}
