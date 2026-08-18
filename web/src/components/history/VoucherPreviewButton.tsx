"use client";

import { useState } from "react";
import { buildTemplateConfig } from "@/lib/templates/config";
import { formatBlackoutText, formatRoomTypeNights, formatValidityRange, formatVoucherDateShort } from "@/lib/voucher/format";
import { VoucherCanvasPreview } from "@/components/voucher/VoucherCanvasPreview";
import { getVoucherRenderData, type VoucherRenderData } from "@/app/history/previewActions";

interface VoucherPreviewButtonProps {
  voucherId: string;
  status: string;
}

// Front office's substitute for the real PNG/PDF download links (History
// page's Files column) — same watermarked canvas machinery used for the
// live create-voucher preview and the approver page, but populated with
// the full approved-state fields (signature, approved date) so it actually
// matches what a guest is holding, not the pre-approval draft. There's no
// <a> to the real exported_jpeg_path/exported_pdf_path/share_code anywhere
// in this path.
export function VoucherPreviewButton({ voucherId, status }: VoucherPreviewButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<VoucherRenderData | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (status !== "approved" && status !== "claimed") return <>—</>;

  async function handleOpen() {
    setOpen(true);
    setLoading(true);
    setError(null);
    const result = await getVoucherRenderData(voucherId);
    setLoading(false);
    if (!result) {
      setError("Couldn't load this voucher's preview.");
      return;
    }
    setData(result);
  }

  const template = data
    ? buildTemplateConfig(data.property_code, data.property_name, data.template_config)
    : null;

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="rounded-full bg-brand-dark/10 px-3 py-1 text-xs font-semibold text-brand-dark hover:bg-brand-dark/20"
      >
        Preview
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-brand-dark">
                Preview{data ? ` — ${data.running_no}` : ""}
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full bg-brand-dark/10 px-3 py-1 text-xs font-semibold text-brand-dark"
              >
                Close
              </button>
            </div>

            {loading ? <p className="text-sm text-brand-dark/60">Loading…</p> : null}
            {error ? <p className="text-sm text-red-700">{error}</p> : null}

            {template && data ? (
              <VoucherCanvasPreview
                template={template}
                voucher={{
                  runningNo: data.running_no,
                  roomTypeNightsLabel: formatRoomTypeNights(data.room_type_names, data.nights),
                  breakfastIncluded: data.breakfast_included,
                  validityLabel: formatValidityRange(data.validity_start, data.validity_end),
                  blackoutText: formatBlackoutText(data.blackout_text ?? ""),
                  approverPosition: data.approver_position ?? undefined,
                  approvedDateLabel: data.approved_at ? formatVoucherDateShort(data.approved_at.slice(0, 10)) : undefined,
                }}
                signatureImageUrl={data.approver_signature_url ?? undefined}
                watermark
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
