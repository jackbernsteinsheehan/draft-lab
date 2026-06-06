import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles the redirect from Supabase email-confirmation (and any other PKCE)
// links: exchanges the `code` for a session cookie, then sends the user on to
// `next` (defaults to home). On failure, bounce back to the auth page.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  // Only allow same-origin relative redirects to avoid an open-redirect.
  const dest = next.startsWith("/") ? next : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${dest}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth?error=auth_callback`);
}
