import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./SignOutButton";

export default async function UserMenu() {
  const configured =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!configured) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex items-center gap-1.5 text-xs">
        <a
          href="/auth?mode=signin"
          className="px-2.5 py-1 rounded-md text-muted hover:text-foreground hover:bg-surface-2 transition"
        >
          Sign in
        </a>
        <a
          href="/auth?mode=signup"
          className="px-2.5 py-1 rounded-md bg-foreground text-background hover:opacity-90 transition"
        >
          Sign up
        </a>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted truncate max-w-[180px]">{user.email}</span>
      <SignOutButton />
    </div>
  );
}
