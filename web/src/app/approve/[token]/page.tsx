import { createClient } from "@/lib/supabase/server";
import { buildTemplateConfig, type TemplateConfigJson } from "@/lib/templates/config";
import { formatPurposeLabel, formatValidityRange } from "@/lib/voucher/format";
import { ApprovalPreview } from "@/components/approve/ApprovalPreview";
import { ApprovalActions } from "@/components/approve/ApprovalActions";

interface VoucherBatchRow {
  id: string;
  running_no: string;
  property_code: string;
  property_name: string;
  template_config: TemplateConfigJson;
  room_type_names: string[];
  nights: number;
  breakfast_included: boolean;
  blackout_type: "default" | "custom";
  blackout_text: string | null;
  validity_start: string;
  validity_end: string;
  note: string | null;
  item_name: string | null;
  purpose: string | null;
  status: string;
  approval_token_expires_at: string;
  approved_at: string | null;
  rejected_reason: string | null;
  share_code: string | null;
  approver_name: string | null;
  approver_position: string | null;
  approver_signature_url: string | null;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ApprovePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_voucher_batch_by_token", { p_token: token });
  const rows = (data as VoucherBatchRow[] | null) ?? [];

  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-lg font-semibold text-brand-dark">This approval link is invalid.</p>
        <p className="mt-2 text-sm text-brand-dark/60">
          Double-check the link, or ask the Issuer to resend the request.
        </p>
      </div>
    );
  }

  const first = rows[0];
  const runningNumbers = rows.map((row) => row.running_no);
  const template = buildTemplateConfig(first.property_code, first.property_name, first.template_config);
  const isExpired = new Date(first.approval_token_expires_at) < new Date();

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[minmax(0,420px)_1fr]">
      <section className="rounded-3xl bg-brand-lime p-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-dark/60">
          {first.property_name}
        </p>
        <p className="mt-1 text-2xl font-bold text-brand-dark">{runningNumbers.join(", ")}</p>

        <dl className="mt-6 space-y-3 text-brand-dark">
          <div>
            <dt className="text-sm text-brand-dark/60">Item Name / Purpose</dt>
            <dd className="font-medium">
              {first.item_name || "—"}
              <span className="block text-sm font-normal text-brand-dark/60">{formatPurposeLabel(first.purpose)}</span>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-brand-dark/60">Room type{first.room_type_names.length > 1 ? "s" : ""}</dt>
            <dd className="font-medium">{first.room_type_names.join(", ") || "—"}</dd>
          </div>
          <div>
            <dt className="text-sm text-brand-dark/60">Nights</dt>
            <dd className="font-medium">{first.nights}</dd>
          </div>
          <div>
            <dt className="text-sm text-brand-dark/60">Breakfast</dt>
            <dd className="font-medium">{first.breakfast_included ? "Included" : "Not included"}</dd>
          </div>
          <div>
            <dt className="text-sm text-brand-dark/60">Validity</dt>
            <dd className="font-medium">
              {formatValidityRange(first.validity_start, first.validity_end)}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-brand-dark/60">Blackout</dt>
            <dd className="font-medium">{first.blackout_text || "—"}</dd>
          </div>
          {first.note ? (
            <div>
              <dt className="text-sm text-brand-dark/60">Note</dt>
              <dd className="font-medium">{first.note}</dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-6">
          {first.status === "pending_approval" && !isExpired ? (
            <ApprovalActions token={token} />
          ) : first.status === "pending_approval" && isExpired ? (
            <div className="rounded-2xl bg-white/70 p-4 text-sm text-brand-dark">
              This link expired on {formatDateTime(first.approval_token_expires_at)}. Ask the Issuer
              to resend the request.
            </div>
          ) : first.status === "approved" ? (
            <div className="space-y-3">
              <div className="rounded-2xl bg-white/70 p-4 text-sm text-brand-dark">
                Approved{first.approved_at ? ` on ${formatDateTime(first.approved_at)}` : ""}.
              </div>
              <ul className="space-y-2">
                {rows.map((row) => (
                  <li key={row.id} className="rounded-2xl bg-white/70 p-3 text-sm text-brand-dark">
                    <span className="font-semibold">{row.running_no}</span>{" "}
                    {row.share_code ? (
                      <>
                        —{" "}
                        <a href={`/v/${row.share_code}/jpg`} className="underline" target="_blank">
                          JPEG
                        </a>{" "}
                        ·{" "}
                        <a href={`/v/${row.share_code}/pdf`} className="underline" target="_blank">
                          PDF
                        </a>
                      </>
                    ) : (
                      <span className="text-brand-dark/60">
                        Preparing the voucher file — the requester will be notified once it&apos;s ready.
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : first.status === "rejected" ? (
            <div className="rounded-2xl bg-white/70 p-4 text-sm text-brand-dark">
              Rejected. Reason: {first.rejected_reason}
            </div>
          ) : (
            <div className="rounded-2xl bg-white/70 p-4 text-sm text-brand-dark">
              This request is currently <strong>{first.status}</strong>.
            </div>
          )}
        </div>
      </section>

      <section className="lg:sticky lg:top-10 lg:self-start">
        {template ? (
          <ApprovalPreview
            template={template}
            rows={rows}
            approverPosition={first.approver_position}
            approverSignatureUrl={first.approver_signature_url}
          />
        ) : (
          <p className="text-sm text-brand-dark/60">No visual template available for this property yet.</p>
        )}
      </section>
    </div>
  );
}
