"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await createClient().auth.signOut();
        router.refresh();
        router.push("/");
      }}
      className="px-2.5 py-1 rounded-md border border-border text-muted hover:text-foreground hover:bg-surface-2 transition disabled:opacity-50"
    >
      {busy ? "…" : "Sign out"}
    </button>
  );
}
