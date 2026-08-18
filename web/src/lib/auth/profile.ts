import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export interface CurrentProfile {
  id: string;
  email: string;
  fullName: string | null;
  role: "issuer" | "approver" | "admin" | "front_office";
  status: "pending" | "active" | "rejected";
}

/**
 * Session + profile row for the signed-in user, or null if signed out.
 *
 * The user id/email come from proxy.ts's middleware (lib/supabase/
 * middleware.ts) via x-mw-user-* request headers it sets right after its
 * own auth.getUser() call, instead of this function repeating that same
 * network round trip to Supabase Auth on every single page load. Safe
 * against spoofing: middleware unconditionally overwrites these headers
 * with its own freshly-validated value (including clearing them to "" when
 * signed out) before forwarding the request, so nothing a client sends can
 * survive to reach here. Falls back to a direct getUser() call only if the
 * headers are entirely absent (middleware.has() false) — e.g. a route
 * excluded from proxy.ts's matcher — so this stays correct even then.
 * Either way, role/status still come from a fresh `profiles` query below,
 * never from a header — that's what RLS actually gates on.
 */
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createClient();
  const requestHeaders = await headers();
  const middlewareRan = requestHeaders.has("x-mw-user-id");

  let userId: string | null = null;
  let userEmail = "";
  let fallbackFullName: string | null = null;

  if (middlewareRan) {
    userId = requestHeaders.get("x-mw-user-id") || null;
    userEmail = requestHeaders.get("x-mw-user-email") ?? "";
  } else {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
      userEmail = user.email ?? "";
      fallbackFullName = user.user_metadata?.full_name ?? null;
    }
  }

  if (!userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, status")
    .eq("id", userId)
    .maybeSingle();

  return {
    id: userId,
    email: userEmail,
    fullName: profile?.full_name ?? fallbackFullName,
    role: profile?.role ?? "issuer",
    // Missing row is an edge case that "shouldn't happen" (handle_new_user
    // always inserts one) — fail closed to pending rather than assume
    // active, matching the new-signup default.
    status: profile?.status ?? "pending",
  };
}
