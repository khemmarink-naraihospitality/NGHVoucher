"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Both RPCs (supabase/migrations/0014) re-check permission server-side via
// private.has_property_access()/is_admin() — this file is UI plumbing, not
// the security boundary, same disclaimer as admin/actions.ts. Unlike that
// file, errors are returned (not swallowed) since History is reachable by
// any signed-in Issuer, not just Admin, so a blocked action needs to
// surface as real UI feedback rather than a silent no-op.

export async function revokeVoucher(voucherId: string, reason: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("revoke_voucher", {
    p_voucher_id: voucherId,
    p_reason: reason,
  });

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "This voucher can't be revoked (wrong status, or you don't have access to it)." };
  }

  revalidatePath("/history");
  return { error: null };
}

export async function claimVoucher(
  voucherId: string,
  claimBy: string,
  reservationNo: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_voucher", {
    p_voucher_id: voucherId,
    p_claim_by: claimBy,
    p_reservation_no: reservationNo || null,
  });

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "This voucher can't be claimed (wrong status, or you don't have access to it)." };
  }

  revalidatePath("/history");
  return { error: null };
}
