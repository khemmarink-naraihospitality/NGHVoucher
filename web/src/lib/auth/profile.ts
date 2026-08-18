import { createClient } from "@/lib/supabase/server";

export interface CurrentProfile {
  id: string;
  email: string;
  fullName: string | null;
  role: "issuer" | "approver" | "admin" | "front_office";
  status: "pending" | "active" | "rejected";
}

/** Session + profile row for the signed-in user, or null if signed out. */
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, status")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? "",
    fullName: profile?.full_name ?? user.user_metadata?.full_name ?? null,
    role: profile?.role ?? "issuer",
    // Missing row is an edge case that "shouldn't happen" (handle_new_user
    // always inserts one) — fail closed to pending rather than assume
    // active, matching the new-signup default.
    status: profile?.status ?? "pending",
  };
}
