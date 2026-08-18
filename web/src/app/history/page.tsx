import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/profile";
import { getPreviewRole } from "@/lib/auth/previewRole";
import { formatPurposeLabel, formatVoucherDate } from "@/lib/voucher/format";
import { HistoryRowActions } from "@/components/history/HistoryRowActions";
import { VoucherPreviewButton } from "@/components/history/VoucherPreviewButton";
import { HistoryFilterFields } from "@/components/history/HistoryFilterFields";
import { DownloadIcon } from "@/components/ui/DownloadIcon";
import { ExternalLinkIcon } from "@/components/ui/ExternalLinkIcon";

const STATUSES = [
  "pending_approval",
  "approved",
  "claimable",
  "claimed",
  "rejected",
  "expired",
  "revoked",
] as const;

interface HistoryRow {
  id: string;
  running_no: string;
  property_name: string;
  room_type_names: string[];
  nights: number;
  breakfast_included: boolean;
  validity_start: string;
  validity_end: string;
  status: string;
  note: string | null;
  item_name: string | null;
  purpose: string | null;
  claim_by: string | null;
  reservation_no: string | null;
  revoked_reason: string | null;
  created_at: string;
  share_code: string | null;
  issuer_name: string | null;
  external_file_url: string | null;
}

interface PropertyOption {
  id: number;
  code: string;
  name: string;
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "approved":
    case "claimable":
    case "claimed":
      return "bg-green-100 text-green-800";
    case "rejected":
    case "expired":
    case "revoked":
      return "bg-red-100 text-red-700";
    default:
      return "bg-yellow-100 text-yellow-800";
  }
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; from?: string; to?: string; property?: string; purpose?: string }>;
}) {
  const { status, from, to, property, purpose } = await searchParams;

  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login?next=/history");
  }
  if (profile.status !== "active") {
    redirect("/pending");
  }
  const previewRole = profile.role === "admin" ? await getPreviewRole() : null;
  const effectiveRole = previewRole ?? profile.role;

  const supabase = await createClient();
  // properties_select RLS already scopes this to "assigned properties, or
  // all if admin" (supabase/migrations/0001) — same rule History's own row
  // visibility relies on, so the filter dropdown can't leak a property this
  // user couldn't otherwise see.
  const { data: propertiesData } = await supabase.from("properties").select("id, code, name").order("code");
  const properties = (propertiesData as PropertyOption[] | null) ?? [];

  const { data, error } = await supabase.rpc("get_my_voucher_history", {
    p_status: status || null,
    p_from: from || null,
    p_to: to || null,
    p_property_id: property ? Number(property) : null,
    p_purpose: purpose || null,
  });

  const rows = (error ? [] : (data as HistoryRow[] | null)) ?? [];

  // Export links carry the currently-applied filters (the URL's own
  // searchParams), not whatever's typed-but-unsubmitted in the form —
  // "export what's on screen right now".
  const filterParams: Record<string, string> = {};
  if (status) filterParams.status = status;
  if (from) filterParams.from = from;
  if (to) filterParams.to = to;
  if (property) filterParams.property = property;
  if (purpose) filterParams.purpose = purpose;
  const csvHref = `/api/history/export?${new URLSearchParams({ ...filterParams, format: "csv" })}`;
  const xlsxHref = `/api/history/export?${new URLSearchParams({ ...filterParams, format: "xlsx" })}`;

  return (
    <div className="flex flex-1 flex-col bg-background">
      <AppHeader
        activeTab="history"
        userEmail={profile.email}
        isAdmin={effectiveRole === "admin"}
        canCreateVoucher={effectiveRole !== "front_office"}
        showRolePreview={profile.role === "admin"}
        previewRole={previewRole}
      />

      <div className="mx-auto w-full max-w-[1800px] px-4 py-10">
        <form className="mb-6 flex flex-wrap items-end gap-4 rounded-2xl bg-brand-lime/40 p-4">
          <HistoryFilterFields
            statuses={STATUSES}
            properties={properties}
            initialStatus={status ?? ""}
            initialProperty={property ?? ""}
            initialPurpose={purpose ?? ""}
          />
          <div>
            <label className="block text-xs font-semibold text-brand-dark/70">Validity from</label>
            <input
              type="date"
              name="from"
              defaultValue={from ?? ""}
              className="mt-1 rounded-full bg-white py-2 pl-3 pr-6 text-sm text-brand-dark"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-brand-dark/70">Validity to</label>
            <input
              type="date"
              name="to"
              defaultValue={to ?? ""}
              className="mt-1 rounded-full bg-white py-2 pl-3 pr-6 text-sm text-brand-dark"
            />
          </div>
          <button
            type="submit"
            className="rounded-full bg-brand-orange px-5 py-2 text-sm font-semibold text-white"
          >
            Filter
          </button>
          {status || from || to || property || purpose ? (
            <a href="/history" className="text-sm text-brand-dark/60 underline">
              Clear
            </a>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <a
              href={csvHref}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand-dark"
            >
              Export CSV
            </a>
            <a
              href={xlsxHref}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand-dark"
            >
              Export Excel
            </a>
          </div>
        </form>

        {error ? (
          <p className="text-sm text-red-700">Failed to load history: {error.message}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-brand-dark/60">No vouchers match these filters.</p>
        ) : (
          <div className="max-h-[75vh] overflow-auto rounded-2xl">
            <table className="w-full border-collapse whitespace-nowrap text-sm">
              <thead>
                {/*
                  Bounding this scroll container's height (instead of the old
                  page-length overflow-x-auto) keeps both scrollbars reachable
                  without scrolling all the way to the bottom of a long table
                  first. Header cells go sticky top-0 to match — otherwise
                  scrolling down inside this now-independently-scrolling
                  region would just scroll the column labels away like any
                  other row. The "No." header is sticky on both axes (it's
                  also the pinned-left column below), so it needs the
                  higher z-index to stay above the plain sticky-top headers
                  at their shared corner.
                */}
                <tr className="border-b border-brand-dark/10 text-left text-brand-dark/60">
                  <th className="sticky left-0 top-0 z-20 bg-background py-2 pr-4">No.</th>
                  <th className="sticky top-0 z-10 bg-background py-2 pr-4">Item Name</th>
                  <th className="sticky top-0 z-10 bg-background py-2 pr-4">Issuer</th>
                  <th className="sticky top-0 z-10 bg-background py-2 pr-4">Purpose</th>
                  <th className="sticky top-0 z-10 bg-background py-2 pr-4">Room type(s)</th>
                  <th className="sticky top-0 z-10 bg-background py-2 pr-4">Validity Start</th>
                  <th className="sticky top-0 z-10 bg-background py-2 pr-4">Validity End</th>
                  <th className="sticky top-0 z-10 bg-background py-2 pr-4">Status</th>
                  <th className="sticky top-0 z-10 bg-background py-2 pr-4">Claimed By</th>
                  <th className="sticky top-0 z-10 bg-background py-2 pr-4">Reservation No.</th>
                  <th className="sticky top-0 z-10 bg-background py-2 pr-4">Revoke Reason</th>
                  <th className="sticky top-0 z-10 bg-background py-2 pr-4">Issued</th>
                  <th className="sticky top-0 z-10 bg-background py-2 pr-4">Files</th>
                  <th className="sticky top-0 z-10 bg-background py-2 pr-4">Actions</th>
                  <th className="sticky top-0 z-10 bg-background py-2 pr-4">Note</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-brand-dark/5 text-brand-dark">
                    <td className="sticky left-0 z-10 bg-background py-2 pr-4 font-semibold">{row.running_no}</td>
                    <td className="py-2 pr-4">{row.item_name || "—"}</td>
                    <td className="py-2 pr-4">{row.issuer_name || "—"}</td>
                    <td className="py-2 pr-4">{formatPurposeLabel(row.purpose)}</td>
                    <td className="py-2 pr-4">{row.room_type_names.join(", ")}</td>
                    <td className="py-2 pr-4">{formatVoucherDate(row.validity_start)}</td>
                    <td className="py-2 pr-4">{formatVoucherDate(row.validity_end)}</td>
                    <td className="py-2 pr-4">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusBadgeClass(row.status)}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4">{row.claim_by || "—"}</td>
                    <td className="py-2 pr-4">{row.reservation_no || "—"}</td>
                    <td className="py-2 pr-4">{row.revoked_reason || "—"}</td>
                    <td className="py-2 pr-4">{formatVoucherDate(row.created_at.slice(0, 10))}</td>
                    <td className="py-2 pr-4">
                      {effectiveRole === "front_office" ? (
                        <VoucherPreviewButton voucherId={row.id} status={row.status} />
                      ) : row.share_code ? (
                        <a
                          href={`/v/${row.share_code}`}
                          target="_blank"
                          title="Download voucher (JPEG/PDF)"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-dark/10 text-brand-dark hover:bg-brand-dark/20"
                        >
                          <DownloadIcon className="h-3.5 w-3.5" />
                        </a>
                      ) : row.external_file_url ? (
                        // Migrated historical vouchers were never rendered in this
                        // app (no exported_jpeg_path/share_code) — fall back to the
                        // original artwork's Google Drive folder from the legacy
                        // tracking sheet instead of showing nothing.
                        <a
                          href={row.external_file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open original files (Google Drive)"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-dark/10 text-brand-dark hover:bg-brand-dark/20"
                        >
                          <ExternalLinkIcon className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <HistoryRowActions
                        voucherId={row.id}
                        status={row.status}
                        role={effectiveRole}
                        defaultClaimBy={profile.fullName ?? profile.email}
                      />
                    </td>
                    <td className="py-2 pr-4">{row.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
