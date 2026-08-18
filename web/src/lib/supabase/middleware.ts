import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Standard @supabase/ssr session-refresh helper, called from proxy.ts (the
// Next.js 16 rename of middleware.ts — see proxy.ts for the file-convention
// note). Refreshes the auth cookie on every request so Server Components
// always see a valid session without each one re-implementing this.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

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
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // Required: touches the session so @supabase/ssr can refresh an expiring
  // token before it's read by a Server Component further down the chain.
  await supabase.auth.getUser();

  return response;
}
