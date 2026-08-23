import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let response = NextResponse.next({ request });
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { error } = await supabase.auth.getUser();

  // A stale/invalid refresh token cookie (e.g. after switching Supabase
  // projects or the token being revoked) fails every request until cleared.
  // Sign out to drop the bad auth cookies and treat the client as logged out.
  if (error && (error.code === "refresh_token_not_found" || error.status === 400)) {
    await supabase.auth.signOut({ scope: "local" });
  }

  return response;
}
