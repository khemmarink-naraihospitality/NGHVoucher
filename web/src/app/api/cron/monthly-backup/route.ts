import JSZip from "jszip";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { sendMail } from "@/lib/email/mailer";

// Monthly self-hosted DB backup (Vercel Cron, see vercel.json — 1st of
// every month), in lieu of paying for Supabase's own backup add-on. Dumps
// every table holding real data as JSON (one file per table, zipped) and
// emails it as an attachment. JSON over a real pg_dump: this project has
// no raw Postgres connection string configured, only the REST/service-role
// credentials, so pg_dump isn't available from a Vercel function anyway —
// JSON preserves types (timestamps, arrays, jsonb) faithfully and restores
// trivially (read the file, `supabase.from(table).insert(rows)`).
//
// Deliberately excludes email_settings.gmail_app_password — a live
// credential has no business sitting in an email attachment indefinitely.
// Also excludes Storage bucket contents (voucher JPEGs/PDFs, templates,
// signatures): those are binary files that would blow past typical email
// attachment size limits well before the database tables would, and
// aren't what Supabase's own paid backup covers either (that's Postgres
// only) — this backup has the same scope.
export const runtime = "nodejs";

const BACKUP_TABLES = [
  "properties",
  "room_types",
  "approvers",
  "approver_properties",
  "profiles",
  "user_properties",
  "vouchers",
  "running_number_counters",
  "released_running_numbers",
] as const;

// Every column except the live app password.
const EMAIL_SETTINGS_SAFE_COLUMNS =
  "id, gmail_user, gmail_from_name, gmail_smtp_port, updated_at, " +
  "approval_subject_template, approval_html_template, approval_text_template, " +
  "issuer_approved_subject_template, issuer_approved_html_template, issuer_approved_text_template, " +
  "issuer_rejected_subject_template, issuer_rejected_html_template, issuer_rejected_text_template";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const backupTo = process.env.BACKUP_EMAIL_TO;
  if (!backupTo) {
    return Response.json({ error: "BACKUP_EMAIL_TO is not configured." }, { status: 500 });
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return Response.json({ error: "Service role client is not configured." }, { status: 500 });
  }

  const zip = new JSZip();
  const manifest: Record<string, number | string> = {};

  for (const table of BACKUP_TABLES) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) {
      console.error(`[monthly-backup] failed to read ${table}:`, error.message);
      return Response.json({ error: `Failed to read ${table}: ${error.message}` }, { status: 500 });
    }
    zip.file(`${table}.json`, JSON.stringify(data, null, 2));
    manifest[table] = data?.length ?? 0;
  }

  const { data: emailSettings, error: emailSettingsError } = await supabase
    .from("email_settings")
    .select(EMAIL_SETTINGS_SAFE_COLUMNS)
    .maybeSingle();
  if (emailSettingsError) {
    console.error("[monthly-backup] failed to read email_settings:", emailSettingsError.message);
    return Response.json({ error: `Failed to read email_settings: ${emailSettingsError.message}` }, { status: 500 });
  }
  zip.file("email_settings.json", JSON.stringify(emailSettings, null, 2));
  manifest.email_settings = emailSettings ? 1 : 0;

  const backupDate = new Date().toISOString().slice(0, 10);
  manifest.generated_at = new Date().toISOString();
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

  const summaryLines = Object.entries(manifest)
    .filter(([key]) => key !== "generated_at")
    .map(([table, count]) => `- ${table}: ${count} row(s)`)
    .join("\n");

  const result = await sendMail({
    to: backupTo,
    subject: `Lub d Voucher DB backup — ${backupDate}`,
    text: `Monthly database backup attached (JSON, one file per table).\n\n${summaryLines}`,
    html: `<p>Monthly database backup attached (JSON, one file per table).</p><pre>${summaryLines}</pre>`,
    attachments: [
      {
        filename: `lubd-voucher-backup-${backupDate}.zip`,
        content: zipBuffer,
        contentType: "application/zip",
      },
    ],
  });

  if (!result.sent) {
    console.error("[monthly-backup] email send failed:", result.reason);
    return Response.json({ error: `Backup generated but email failed: ${result.reason}` }, { status: 500 });
  }

  return Response.json({ sent: true, manifest });
}
