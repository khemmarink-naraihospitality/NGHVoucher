import { createClient } from "@/lib/supabase/server";
import { MAX_ROOM_TYPES, PURPOSE_OPTIONS, type BlackoutType, type PurposeValue } from "@/lib/voucher/types";
import { formatPurposeLabel } from "@/lib/voucher/format";
import { sendMail } from "@/lib/email/mailer";
import { renderApprovalEmail } from "@/lib/email/approvalEmail";

// Submit-for-approval write path (PRD §4 step 5, §6.4, §7). Delegates the
// reservation + insert to `submit_voucher_batch` (supabase/migrations/0006),
// which requires a session and records the caller as issuer_id, then emails
// the approver a signed link.
export const runtime = "nodejs";

interface SubmitVoucherPayload {
  propertyCode: string;
  roomTypeIds: number[];
  nights: number;
  voucherCount: number;
  breakfastIncluded: boolean;
  blackoutType: BlackoutType;
  blackoutText: string;
  validityStart: string;
  validityEnd: string;
  note: string;
  approverId: string;
  itemName: string;
  purpose: PurposeValue;
}

const VALID_PURPOSES = new Set(PURPOSE_OPTIONS.map((option) => option.value));

function validate(payload: Partial<SubmitVoucherPayload>): string | null {
  if (!payload.propertyCode) return "propertyCode is required.";
  if (!Array.isArray(payload.roomTypeIds) || payload.roomTypeIds.length === 0) {
    return "At least one room type must be selected.";
  }
  if (payload.roomTypeIds.length > MAX_ROOM_TYPES) {
    return `At most ${MAX_ROOM_TYPES} room types may be selected.`;
  }
  if (!Number.isInteger(payload.nights) || (payload.nights ?? 0) < 1) {
    return "nights must be a positive integer.";
  }
  if (!Number.isInteger(payload.voucherCount) || (payload.voucherCount ?? 0) < 1) {
    return "voucherCount must be a positive integer.";
  }
  if (typeof payload.breakfastIncluded !== "boolean") return "breakfastIncluded must be a boolean.";
  if (payload.blackoutType !== "default" && payload.blackoutType !== "custom") {
    return "blackoutType must be 'default' or 'custom'.";
  }
  if (!payload.validityStart || !payload.validityEnd) {
    return "validityStart and validityEnd are required.";
  }
  if (payload.validityEnd < payload.validityStart) {
    return "validityEnd must not be before validityStart.";
  }
  if (!payload.approverId) return "approverId is required.";
  if (!payload.purpose || !VALID_PURPOSES.has(payload.purpose)) {
    return "purpose is required and must be one of: " + Array.from(VALID_PURPOSES).join(", ");
  }
  return null;
}

export async function POST(request: Request) {
  let payload: Partial<SubmitVoucherPayload>;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const validationError = validate(payload);
  if (validationError) {
    return Response.json({ error: validationError }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { data: approver } = await supabase
    .from("approvers")
    .select("name, email")
    .eq("id", Number(payload.approverId))
    .maybeSingle();
  if (!approver) {
    return Response.json({ error: "Unknown approver." }, { status: 400 });
  }

  // "Requested by" on the approval email — own row, allowed under
  // profiles' normal RLS (auth.uid() = id), no service-role client needed.
  const { data: issuerProfile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();
  const requestorName = issuerProfile?.full_name || issuerProfile?.email || user.email || "Unknown";

  const { data, error } = await supabase.rpc("submit_voucher_batch", {
    p_property_code: payload.propertyCode,
    p_room_type_ids: payload.roomTypeIds,
    p_nights: payload.nights,
    p_voucher_count: payload.voucherCount,
    p_breakfast_included: payload.breakfastIncluded,
    p_blackout_type: payload.blackoutType,
    p_blackout_text: payload.blackoutText ?? "",
    p_validity_start: payload.validityStart,
    p_validity_end: payload.validityEnd,
    p_approver_id: Number(payload.approverId),
    p_note: payload.note || null,
    p_item_name: payload.itemName || null,
    p_purpose: payload.purpose,
  });

  if (error) {
    console.error("submit_voucher_batch failed:", error.message);
    return Response.json({ error: "Failed to submit voucher request." }, { status: 500 });
  }

  const rows =
    (data as
      | { id: string; running_no: string; approval_token: string; approval_token_expires_at: string }[]
      | null) ?? [];

  if (rows.length === 0) {
    return Response.json({ error: "Failed to submit voucher request." }, { status: 500 });
  }

  const runningNumbers = rows.map((row) => row.running_no);
  const approveUrl = `${process.env.NEXT_PUBLIC_APP_URL}/approve/${rows[0].approval_token}`;

  // PRD §4 step 5: property display name for the email. `properties` has no
  // anon-readable RLS policy (Phase 2 deferred-auth design), so this goes
  // through the same catalog RPC the workspace page uses rather than a
  // direct table read.
  const { data: catalog } = await supabase.rpc("get_voucher_workspace_catalog");
  const propertyName =
    (catalog as { properties?: { code: string; name: string }[] } | null)?.properties?.find(
      (p) => p.code === payload.propertyCode,
    )?.name ?? payload.propertyCode!;

  const { subject, html, text } = await renderApprovalEmail({
    approverName: approver.name,
    requestorName,
    propertyName,
    runningNumbers,
    purpose: formatPurposeLabel(payload.purpose ?? null),
    note: payload.note ?? "",
    approveUrl,
    expiresAt: new Date(rows[0].approval_token_expires_at),
  });

  const emailResult = await sendMail({ to: approver.email, subject, html, text });

  return Response.json({
    runningNumbers,
    approveUrl,
    emailSent: emailResult.sent,
  });
}
