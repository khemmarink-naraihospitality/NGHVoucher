"use server";

import { createClient } from "@/lib/supabase/server";
import { resolveStorageImageUrl } from "@/lib/supabase/signedUrl";
import type { TemplateConfigJson } from "@/lib/templates/config";

// Button-triggered, one-off preview — same generous TTL as the rest of
// the app's non-download image consumers (the modal might stay open a
// while).
const IMAGE_URL_TTL_SECONDS = 3600;

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
  const row = rows?.[0] ?? null;
  if (!row) return null;

  const [resolvedImagePath, resolvedSignatureUrl] = await Promise.all([
    row.template_config?.imagePath
      ? resolveStorageImageUrl("templates", row.template_config.imagePath, IMAGE_URL_TTL_SECONDS)
      : null,
    resolveStorageImageUrl("signatures", row.approver_signature_url, IMAGE_URL_TTL_SECONDS),
  ]);

  return {
    ...row,
    template_config: { ...row.template_config, imagePath: resolvedImagePath ?? row.template_config?.imagePath },
    approver_signature_url: resolvedSignatureUrl,
  };
}
