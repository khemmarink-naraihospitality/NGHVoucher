"use server";

import { createClient } from "@/lib/supabase/server";
import type { TemplateConfigJson } from "@/lib/templates/config";

export interface VoucherRenderData {
  id: string;
  running_no: string;
  property_code: string;
  property_name: string;
  template_config: TemplateConfigJson;
  room_type_names: string[];
  nights: number;
  breakfast_included: boolean;
  blackout_text: string | null;
  validity_start: string;
  validity_end: string;
  status: string;
  approved_at: string | null;
  approver_position: string | null;
  approver_signature_url: string | null;
}

// Backs VoucherPreviewButton's watermarked, non-downloadable "compare
// against the real file" view (front office role) — never returns the real
// exported_jpeg_path/exported_pdf_path/share_code, and get_voucher_render_data
// (supabase/migrations/0015) only returns a row at all for approved/claimed
// vouchers.
export async function getVoucherRenderData(voucherId: string): Promise<VoucherRenderData | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_voucher_render_data", { p_voucher_id: voucherId });
  if (error) {
    console.error("get_voucher_render_data failed:", error.message);
    return null;
  }
  const rows = data as VoucherRenderData[] | null;
  return rows?.[0] ?? null;
}
