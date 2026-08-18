import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Standard @supabase/ssr session-refresh helper, called from proxy.ts (the
// Next.js 16 rename of middleware.ts — see proxy.ts for the file-convention
// note). Refreshes the auth cookie on every request so Server Components
// always see a valid session without each one re-implementing this.
//
// Also forwards the already-validated user (id/email only) via request
// headers, so getCurrentProfile() (lib/auth/profile.ts) can skip its own
// second auth.getUser() call — every page load was paying for two separate
// Supabase Auth network round trips (this one, plus an identical one in
// getCurrentProfile) for the same check. Found while chasing down
// site-wide slowness alongside the Vercel-function/Supabase region
// mismatch (see vercel.json's `regions`) — that fix addressed the biggest
// single hop, this addresses the next-biggest recurring cost, present on
// every single navigation rather than a one-off. Only id/email travel in
// the header, never a token or session — Server Components still query
// `profiles` themselves for role/status, and RLS still applies exactly as
// before; this only saves the redundant *validation* round trip.
export async function updateSession(request: NextRequest) {
  let cookiesToApply: { name: string; value: string; options: CookieOptions }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToApply = cookiesToSet;
        },
      },
    },
  );

  // Required: touches the session so @supabase/ssr can refresh an expiring
  // token before it's read by a Server Component further down the chain.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-mw-user-id", user?.id ?? "");
  requestHeaders.set("x-mw-user-email", user?.email ?? "");

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  // Re-applied here (not inside setAll) since the response object itself
  // is now only constructed once, after the header is known.
  cookiesToApply.forEach(({ name, value, options }) => response.cookies.set(name, value, options));

  return response;
}
