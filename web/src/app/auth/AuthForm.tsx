"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export default function AuthForm({
  initialMode,
  next,
  initialError,
}: {
  initialMode: Mode;
  next: string;
  initialError?: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [info, setInfo] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        setBusy(false);
        return;
      }
      router.push(next);
      router.refresh();
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) {
        setError(error.message);
        setBusy(false);
        return;
      }
      if (data.session) {
        router.push(next);
        router.refresh();
      } else {
        setInfo("Check your email to confirm your account, then sign in.");
        setBusy(false);
      }
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-md space-y-6 rounded-xl border border-border bg-surface p-8 md:p-10 shadow-sm"
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {mode === "signin" ? "Sign in" : "Create account"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {mode === "signin"
            ? "Welcome back. Sign in to save and analyze drafts."
            : "Save mock drafts and unlock strategy analysis."}
        </p>
      </div>

      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted">Password</span>
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </label>
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      {info && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">{info}</p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full px-3 py-2.5 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
      >
        {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
      </button>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError(null);
          setInfo(null);
        }}
        className="w-full text-xs text-muted hover:text-foreground transition"
      >
        {mode === "signin"
          ? "Need an account? Create one →"
          : "Have an account? Sign in →"}
      </button>
    </form>
  );
}
