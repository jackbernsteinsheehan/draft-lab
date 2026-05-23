import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const configured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let status = "Supabase not configured — copy .env.local.example to .env.local";
  if (configured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    status = user ? `Signed in as ${user.email}` : "Not signed in";
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-semibold tracking-tight">draft-lab</h1>
      <p className="text-zinc-600 dark:text-zinc-400 max-w-md text-center">
        Mock draft engine and analysis.
      </p>
      <a
        href="/draft"
        className="px-4 py-2 rounded bg-blue-600 text-white text-sm"
      >
        Start a mock draft
      </a>
      <div className="text-sm text-zinc-500">{status}</div>
    </main>
  );
}
