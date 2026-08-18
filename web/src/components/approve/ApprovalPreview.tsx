"use client";

import { useState } from "react";
import type { TemplateConfig } from "@/lib/templates/config";
import { formatBlackoutText, formatRoomTypeNights, formatValidityRange, formatVoucherDate } from "@/lib/voucher/format";
import { VoucherCanvasPreview } from "@/components/voucher/VoucherCanvasPreview";

export interface ApprovalPreviewVoucher {
  id: string;
  running_no: string;
  room_type_names: string[];
  nights: number;
  breakfast_included: boolean;
  blackout_text: string | null;
  validity_start: string;
  validity_end: string;
  status: string;
  approved_at: string | null;
}

interface ApprovalPreviewProps {
  template: TemplateConfig;
  rows: ApprovalPreviewVoucher[];
  approverPosition: string | null;
  approverSignatureUrl: string | null;
}

// Approver-facing preview (PRD §4 step 6-7). A batch can reserve several
// running numbers at once (Number of Vouchers stepper on the Create form),
// so this lets the approver click through each one instead of only ever
// seeing rows[0]. No watermark here — unlike the Issuer's draft preview,
// this *is* the thing the approver is being asked to sign off on, so it
// needs to be read clearly, not deterred from being screenshotted.
export function ApprovalPreview({ template, rows, approverPosition, approverSignatureUrl }: ApprovalPreviewProps) {
  const [selectedId, setSelectedId] = useState(rows[0]?.id);
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0];

  if (!selected) return null;

  return (
    <div>
      {rows.length > 1 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setSelectedId(row.id)}
              className={[
                "rounded-full px-3 py-1 text-sm font-semibold transition-colors",
                row.id === selected.id
                  ? "bg-brand-dark text-white"
                  : "bg-brand-dark/10 text-brand-dark/70 hover:bg-brand-dark/20",
              ].join(" ")}
            >
              {row.running_no}
            </button>
          ))}
        </div>
      ) : null}

      <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand-dark/60">
        Preview — {selected.running_no}
      </p>

      <VoucherCanvasPreview
        template={template}
        voucher={{
          runningNo: selected.running_no,
          roomTypeNightsLabel: formatRoomTypeNights(selected.room_type_names, selected.nights),
          breakfastIncluded: selected.breakfast_included,
          validityLabel: formatValidityRange(selected.validity_start, selected.validity_end),
          blackoutText: formatBlackoutText(selected.blackout_text ?? ""),
          approverPosition: selected.status !== "rejected" ? (approverPosition ?? undefined) : undefined,
          approvedDateLabel:
            selected.status === "approved" && selected.approved_at
              ? formatVoucherDate(selected.approved_at.slice(0, 10))
              : undefined,
        }}
        signatureImageUrl={selected.status !== "rejected" ? (approverSignatureUrl ?? undefined) : undefined}
        watermark={false}
      />
    </div>
  );
}
