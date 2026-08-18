"use server";

import { loadImage } from "canvas";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendMail } from "@/lib/email/mailer";
import { renderApprovalEmail } from "@/lib/email/approvalEmail";
import { renderIssuerApprovedEmail, renderIssuerRejectedEmail } from "@/lib/email/issuerNotificationEmail";
import {
  buildSampleApprovalEmailInput,
  buildSampleIssuerApprovedEmailInput,
  buildSampleIssuerRejectedEmailInput,
} from "@/lib/email/sampleData";
import { cropSignatureToContent } from "@/lib/voucher/signatureImage";
import type {
  BreakfastCheckboxConfig,
  SignatureFieldConfig,
  TemplateTextField,
} from "@/lib/templates/config";

// Every mutation here is also enforced by RLS (supabase/migrations/0008/0009
// — *_insert/*_update/*_delete policies gated on private.is_admin()), so a
// tampered client request still can't write; these actions exist for the
// UI, not as the security boundary. Errors are logged, not surfaced in the
// UI — this page is only reachable by an admin (see app/admin/page.tsx), so
// a failure here is a bug to notice in logs, not a user-facing validation case.

export async function addProperty(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim();
  if (!code || !name) return;

  const supabase = await createClient();
  const { error } = await supabase.from("properties").insert({ code, name });
  if (error) console.error("addProperty failed:", error.message);
  revalidatePath("/admin");
}

// Reads the uploaded file's real pixel dimensions server-side (via the same
// node-canvas already used for export — lib/voucher/export.ts) so Admin
// never has to type canvas width/height by hand and can't get it wrong.
export async function uploadTemplate(formData: FormData) {
  const propertyId = Number(formData.get("propertyId"));
  const propertyCode = String(formData.get("propertyCode") ?? "");
  const file = formData.get("file");
  if (!propertyId || !propertyCode || !(file instanceof File) || file.size === 0) return;

  const buffer = Buffer.from(await file.arrayBuffer());
  const dimensions = await loadImage(buffer);

  const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "png";
  const storagePath = `${propertyCode}/template.${ext}`;

  const supabase = await createClient();
  const { error: uploadError } = await supabase.storage
    .from("templates")
    .upload(storagePath, buffer, { contentType: file.type || "image/png", upsert: true });
  if (uploadError) {
    console.error("uploadTemplate storage upload failed:", uploadError.message);
    return;
  }

  // Cache-bust: the storage path is fixed per property (so re-uploading
  // always overwrites the same object instead of accumulating files), but
  // that means the public URL string never changes between uploads either
  // — browsers just keep serving the old cached bytes at that URL. A
  // version query param forces a fresh fetch without needing a new path.
  const imagePath = `${supabase.storage.from("templates").getPublicUrl(storagePath).data.publicUrl}?v=${Date.now()}`;

  // Merge, don't overwrite — a re-upload (swapping the photo) shouldn't
  // silently wipe out a layout Admin already adjusted in the field editor
  // (app/admin/template/[propertyId]). Percentage-based positions still
  // roughly apply to a same-shaped new image anyway.
  const { data: existing } = await supabase
    .from("properties")
    .select("template_config")
    .eq("id", propertyId)
    .maybeSingle();

  const { error: updateError } = await supabase
    .from("properties")
    .update({
      template_config: {
        ...(existing?.template_config ?? {}),
        imagePath,
        canvasWidth: dimensions.width,
        canvasHeight: dimensions.height,
      },
    })
    .eq("id", propertyId);
  if (updateError) console.error("uploadTemplate property update failed:", updateError.message);

  revalidatePath("/admin");
  revalidatePath("/");
}

// Called directly from the drag-and-drop editor (app/admin/template/
// [propertyId]/TemplateFieldEditor.tsx), not a <form action>, since the
// payload is structured data built up by dragging, not form fields.
// Merges into template_config the same way uploadTemplate does — leaves
// imagePath/canvasWidth/canvasHeight untouched.
export async function updateTemplateLayout(
  propertyId: number,
  fields: TemplateTextField[],
  breakfastCheckbox: BreakfastCheckboxConfig,
  signatureField: SignatureFieldConfig,
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("properties")
    .select("template_config")
    .eq("id", propertyId)
    .maybeSingle();

  const { error } = await supabase
    .from("properties")
    .update({
      template_config: {
        ...(existing?.template_config ?? {}),
        fields,
        breakfastCheckbox,
        signatureField,
      },
    })
    .eq("id", propertyId);

  if (error) console.error("updateTemplateLayout failed:", error.message);

  revalidatePath("/admin");
  revalidatePath(`/admin/template/${propertyId}`);
  revalidatePath("/");

  return { error: error?.message ?? null };
}

export async function addRoomType(formData: FormData) {
  const propertyId = Number(formData.get("propertyId"));
  const name = String(formData.get("name") ?? "").trim();
  if (!propertyId || !name) return;

  const supabase = await createClient();
  const { error } = await supabase.from("room_types").insert({ property_id: propertyId, name });
  if (error) console.error("addRoomType failed:", error.message);
  revalidatePath("/admin");
}

export async function updateRoomType(formData: FormData) {
  const id = Number(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;

  const supabase = await createClient();
  const { error } = await supabase.from("room_types").update({ name }).eq("id", id);
  if (error) console.error("updateRoomType failed:", error.message);
  revalidatePath("/admin");
}

export async function toggleRoomTypeActive(formData: FormData) {
  const id = Number(formData.get("id"));
  const nextActive = formData.get("nextActive") === "true";

  const supabase = await createClient();
  const { error } = await supabase.from("room_types").update({ is_active: nextActive }).eq("id", id);
  if (error) console.error("toggleRoomTypeActive failed:", error.message);
  revalidatePath("/admin");
}

export async function deleteRoomType(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;

  const supabase = await createClient();
  const { error } = await supabase.from("room_types").delete().eq("id", id);
  if (error) console.error("deleteRoomType failed:", error.message);
  revalidatePath("/admin");
}

export async function addApprover(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const position = String(formData.get("position") ?? "").trim() || null;
  const propertyIds = formData.getAll("propertyIds").map(Number).filter(Boolean);
  if (!name || !email) return;

  const supabase = await createClient();
  const { data: approver, error } = await supabase
    .from("approvers")
    .insert({ name, email, position })
    .select("id")
    .single();
  if (error || !approver) {
    console.error("addApprover failed:", error?.message);
    return;
  }

  if (propertyIds.length > 0) {
    const { error: linkError } = await supabase
      .from("approver_properties")
      .insert(propertyIds.map((propertyId) => ({ approver_id: approver.id, property_id: propertyId })));
    if (linkError) console.error("addApprover property link failed:", linkError.message);
  }

  revalidatePath("/admin");
}

export async function updateApproverDetails(formData: FormData) {
  const id = Number(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const position = String(formData.get("position") ?? "").trim() || null;
  if (!id || !name || !email) return;

  const supabase = await createClient();
  const { error } = await supabase.from("approvers").update({ name, email, position }).eq("id", id);
  // Most likely failure: email collides with another approver's (unique
  // constraint, migration 0008) — logged, not surfaced, same posture as
  // every other action in this file.
  if (error) console.error("updateApproverDetails failed:", error.message);
  revalidatePath("/admin");
}

// Reads the uploaded file so its aspect ratio is knowable at draw time
// (lib/voucher/draw.ts scales it to fit the signature box) — no separate
// dimension bookkeeping needed, node-canvas's Image already carries it.
export async function uploadApproverSignature(formData: FormData) {
  const approverId = Number(formData.get("approverId"));
  const file = formData.get("file");
  if (!approverId || !(file instanceof File) || file.size === 0) return;

  const rawBuffer = Buffer.from(await file.arrayBuffer());
  // Cropped to content + background flattened to transparent (see
  // lib/voucher/signatureImage.ts) — always PNG regardless of the upload's
  // original format, since that's what the crop step outputs.
  const buffer = await cropSignatureToContent(rawBuffer);
  const storagePath = `${approverId}/signature.png`;

  const supabase = await createClient();
  const { error: uploadError } = await supabase.storage
    .from("signatures")
    .upload(storagePath, buffer, { contentType: "image/png", upsert: true });
  if (uploadError) {
    console.error("uploadApproverSignature storage upload failed:", uploadError.message);
    return;
  }

  // Cache-bust — same fixed-path-reuse issue as uploadTemplate above.
  const signatureUrl = `${supabase.storage.from("signatures").getPublicUrl(storagePath).data.publicUrl}?v=${Date.now()}`;
  const { error: updateError } = await supabase
    .from("approvers")
    .update({ signature_url: signatureUrl })
    .eq("id", approverId);
  if (updateError) console.error("uploadApproverSignature approver update failed:", updateError.message);

  revalidatePath("/admin");
}

export async function toggleApproverActive(formData: FormData) {
  const id = Number(formData.get("id"));
  const nextActive = formData.get("nextActive") === "true";

  const supabase = await createClient();
  const { error } = await supabase.from("approvers").update({ is_active: nextActive }).eq("id", id);
  if (error) console.error("toggleApproverActive failed:", error.message);
  revalidatePath("/admin");
}

// Unlike every other action in this file, the error here is a normal,
// expected outcome (not a bug to notice in logs) — an approver who's ever
// been selected on a voucher can't be hard-deleted (vouchers.
// selected_approver_id has no ON DELETE clause, so Postgres rejects it with
// 23503/foreign_key_violation to protect that voucher's history). Returned
// so the UI can tell the admin to deactivate instead. approver_properties
// rows clean up on their own (ON DELETE CASCADE).
export async function deleteApprover(id: number): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("approvers").delete().eq("id", id);

  if (error?.code === "23503") {
    return { error: "Can't delete — this approver has been used on at least one voucher. Deactivate them instead." };
  }
  if (error) {
    console.error("deleteApprover failed:", error.message);
    return { error: "Failed to delete approver." };
  }

  revalidatePath("/admin");
  return { error: null };
}

export async function toggleApproverProperty(formData: FormData) {
  const approverId = Number(formData.get("approverId"));
  const propertyId = Number(formData.get("propertyId"));
  const grant = formData.get("grant") === "true";

  const supabase = await createClient();
  const { error } = grant
    ? // ignoreDuplicates: a stale page render can show "not yet assigned"
      // for a property the row was already granted in a previous click —
      // don't hard-fail on that, just no-op.
      await supabase
        .from("approver_properties")
        .upsert(
          { approver_id: approverId, property_id: propertyId },
          { onConflict: "approver_id,property_id", ignoreDuplicates: true },
        )
    : await supabase
        .from("approver_properties")
        .delete()
        .eq("approver_id", approverId)
        .eq("property_id", propertyId);
  if (error) console.error("toggleApproverProperty failed:", error.message);
  revalidatePath("/admin");
}

export async function setUserRole(formData: FormData) {
  const userId = String(formData.get("userId"));
  const role = String(formData.get("role"));
  if (!["issuer", "approver", "admin"].includes(role)) return;

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) console.error("setUserRole failed:", error.message);
  revalidatePath("/admin");
}

export async function grantPropertyAccess(formData: FormData) {
  const userId = String(formData.get("userId"));
  const propertyId = Number(formData.get("propertyId"));

  const supabase = await createClient();
  // ignoreDuplicates: same stale-render double-click case as
  // toggleApproverProperty above.
  const { error } = await supabase
    .from("user_properties")
    .upsert({ user_id: userId, property_id: propertyId }, { onConflict: "user_id,property_id", ignoreDuplicates: true });
  if (error) console.error("grantPropertyAccess failed:", error.message);
  revalidatePath("/admin");
}

export async function revokePropertyAccess(formData: FormData) {
  const userId = String(formData.get("userId"));
  const propertyId = Number(formData.get("propertyId"));

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_properties")
    .delete()
    .eq("user_id", userId)
    .eq("property_id", propertyId);
  if (error) console.error("revokePropertyAccess failed:", error.message);
  revalidatePath("/admin");
}

// gmail_app_password is never read back into the form (see app/admin/
// page.tsx — the fetched row is stripped down to a `hasAppPassword`
// boolean before it reaches JSX), so an empty submission unambiguously
// means "didn't touch this field" rather than "clear the password".
// gmail_user/gmail_from_name ARE shown pre-filled, so blank there really
// does mean "clear it", same as every other admin text field on this page.
export async function saveEmailSettings(formData: FormData) {
  const gmailUser = String(formData.get("gmailUser") ?? "").trim();
  const gmailFromName = String(formData.get("gmailFromName") ?? "").trim();
  const gmailAppPassword = String(formData.get("gmailAppPassword") ?? "").trim();
  const gmailSmtpPortRaw = String(formData.get("gmailSmtpPort") ?? "").trim();
  const gmailSmtpPort = gmailSmtpPortRaw ? Number(gmailSmtpPortRaw) : null;

  const payload: Record<string, unknown> = {
    id: true,
    gmail_user: gmailUser || null,
    gmail_from_name: gmailFromName || null,
    gmail_smtp_port: gmailSmtpPort && Number.isInteger(gmailSmtpPort) && gmailSmtpPort > 0 ? gmailSmtpPort : null,
    updated_at: new Date().toISOString(),
  };
  if (gmailAppPassword) payload.gmail_app_password = gmailAppPassword;

  const supabase = await createClient();
  const { error } = await supabase.from("email_settings").upsert(payload, { onConflict: "id" });
  if (error) console.error("saveEmailSettings failed:", error.message);
  revalidatePath("/admin");
}

export type EmailTemplateKind = "approval" | "issuerApproved" | "issuerRejected";

// Allowlist, not a dynamic `${kind}_subject_template` string — kind comes
// from form input, and this keeps the set of writable columns fixed
// regardless of what a tampered request sends.
const TEMPLATE_KIND_COLUMNS: Record<EmailTemplateKind, { subject: string; html: string; text: string }> = {
  approval: {
    subject: "approval_subject_template",
    html: "approval_html_template",
    text: "approval_text_template",
  },
  issuerApproved: {
    subject: "issuer_approved_subject_template",
    html: "issuer_approved_html_template",
    text: "issuer_approved_text_template",
  },
  issuerRejected: {
    subject: "issuer_rejected_subject_template",
    html: "issuer_rejected_html_template",
    text: "issuer_rejected_text_template",
  },
};

// Unlike gmail_app_password, these ARE shown pre-filled with their real
// current value (the default template's {{token}} text, or the saved
// override) — so, same as every other admin text field on this page,
// blank really does mean "clear it", which here means "revert to the
// built-in default" (stored as null, not empty string).
export async function saveEmailTemplate(formData: FormData) {
  const columns = TEMPLATE_KIND_COLUMNS[formData.get("kind") as EmailTemplateKind];
  if (!columns) return;

  const subject = String(formData.get("subjectTemplate") ?? "").trim();
  const html = String(formData.get("htmlTemplate") ?? "").trim();
  const text = String(formData.get("textTemplate") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase.from("email_settings").upsert(
    {
      id: true,
      [columns.subject]: subject || null,
      [columns.html]: html || null,
      [columns.text]: text || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) console.error("saveEmailTemplate failed:", error.message);
  revalidatePath("/admin");
}

async function buildTestEmailContent(kind: string): Promise<{ subject: string; html: string; text: string }> {
  switch (kind) {
    case "approval":
      return renderApprovalEmail(buildSampleApprovalEmailInput());
    case "issuerApproved":
      return renderIssuerApprovedEmail(buildSampleIssuerApprovedEmailInput());
    case "issuerRejected":
      return renderIssuerRejectedEmail(buildSampleIssuerRejectedEmailInput());
    default:
      return {
        subject: "Lub d Voucher System — test email",
        text: "If you're reading this, your SMTP settings are configured correctly.",
        html: "<p>If you're reading this, your SMTP settings are configured correctly.</p>",
      };
  }
}

// Not a plain <form action> — the send result (ok, or SMTP's rejection
// reason) needs to reach the admin inline instead of just getting logged,
// same reasoning as DeleteApproverButton. `kind` picks which real template
// (rendered with sample data, admin's saved override included) gets sent,
// so "test" actually verifies what recipients will see — not just SMTP
// connectivity.
export async function sendTestEmail(formData: FormData): Promise<{ error: string | null }> {
  const to = String(formData.get("to") ?? "").trim();
  if (!to) return { error: "Enter an email address to send the test to." };
  const kind = String(formData.get("kind") ?? "generic");

  const { subject, html, text } = await buildTestEmailContent(kind);
  const result = await sendMail({ to, subject, html, text });

  return { error: result.sent ? null : (result.reason ?? "Failed to send.") };
}
