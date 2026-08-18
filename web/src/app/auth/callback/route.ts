import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyAdminsOfPendingSignup } from "@/lib/auth/notifyPendingSignup";

// Google redirects here with a `code` after the user consents. Exchanging
// it for a session sets the auth cookies (via the server client's
// cookies.setAll) before we redirect on to `next`. `next` itself doesn't
// need to know or care about approval status — every protected page
// independently redirects to /pending when profile.status !== "active"
// (app/page.tsx, app/history/page.tsx, app/admin/page.tsx,
// app/admin/template/[propertyId]/page.tsx), so this route only has to get
// the session established and, if this is a fresh pending signup, fire the
// one-time admin notification.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await notifyAdminsOfPendingSignup(user.id);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
