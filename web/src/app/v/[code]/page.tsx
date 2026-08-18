import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatValidityRange } from "@/lib/voucher/format";

interface VoucherShareRow {
  running_no: string;
  property_name: string;
  room_type_names: string[];
  nights: number;
  validity_start: string;
  validity_end: string;
  status: string;
  exported_jpeg_path: string | null;
  exported_pdf_path: string | null;
}

// Once a voucher leaves `approved` (claimed at the front desk, revoked, or
// expired past its validity date), the file stops being served — the
// share_code itself never expires, but what it's allowed to unlock
// follows the voucher's own lifecycle. See lib/voucher/share.ts for the
// same gate applied to the actual png/pdf routes.
const STATUS_MESSAGES: Record<string, string> = {
  claimed: "This voucher has already been claimed at the property.",
  revoked: "This voucher has been revoked.",
  expired: "This voucher has expired.",
  rejected: "This voucher request was not approved.",
  pending_approval: "This voucher is still waiting for approval.",
};

// Public, unauthenticated — the share_code itself is the auth, same
// posture as the approve/[token] page. Only ever shown display info and
// links to the two redirect routes (app/v/[code]/jpg|pdf); never a raw
// storage path.
export default async function VoucherSharePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  const supabase = await createClient();
  const { data } = await supabase.rpc("get_voucher_by_share_code", { p_code: code });
  const row = (data as VoucherShareRow[] | null)?.[0];

  if (!row) {
    notFound();
  }

  const statusMessage = row.status === "approved" ? null : (STATUS_MESSAGES[row.status] ?? "This voucher is no longer available.");

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <div className="rounded-3xl bg-brand-lime p-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-dark/50">Lub d Voucher</p>
        <h1 className="mt-1 text-lg font-bold text-brand-dark">{row.running_no}</h1>
        <p className="mt-1 text-sm text-brand-dark/70">{row.property_name}</p>
        <p className="mt-1 text-sm text-brand-dark/60">
          {row.room_type_names.join(", ")} · {row.nights} night{row.nights === 1 ? "" : "s"}
        </p>
        <p className="mt-1 text-xs text-brand-dark/50">
          {formatValidityRange(row.validity_start, row.validity_end)}
        </p>

        <div className="mt-6 flex flex-col gap-2">
          {statusMessage ? (
            <p className="rounded-2xl bg-white/70 p-3 text-sm text-brand-dark/70">{statusMessage}</p>
          ) : (
            <>
              {row.exported_jpeg_path ? (
                <a
                  href={`/v/${code}/jpg`}
                  className="rounded-full bg-brand-orange py-3 font-semibold text-white transition-opacity"
                >
                  Download JPEG
                </a>
              ) : null}
              {row.exported_pdf_path ? (
                <a
                  href={`/v/${code}/pdf`}
                  className="rounded-full bg-brand-dark/10 py-3 font-semibold text-brand-dark transition-opacity"
                >
                  Download PDF
                </a>
              ) : null}
              {!row.exported_jpeg_path && !row.exported_pdf_path ? (
                <p className="text-sm text-brand-dark/50">No files available for this voucher yet.</p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
