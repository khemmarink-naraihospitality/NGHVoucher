import nodemailer from "nodemailer";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

// Phase 3: sends outbound app email (approval requests) through a Gmail /
// Google Workspace account's SMTP relay, authenticated with an App
// Password (Google Account -> Security -> 2-Step Verification -> App
// passwords). Deliberately not Resend/SES/etc — see PRD §10 discussion;
// riding Google's own IP reputation avoids the cold-sender-reputation
// problem a from-scratch SMTP server would have, with zero new signup if
// the org already has Workspace.
//
// Credentials come from the admin-editable email_settings table when set
// (Admin page -> Email section), falling back to GMAIL_USER/
// GMAIL_APP_PASSWORD/GMAIL_FROM_NAME in .env.local otherwise. Either way,
// if nothing is configured, `sendMail` no-ops (logs instead of throwing)
// so the rest of the approval flow (token generation, DB writes) still
// works end-to-end without a working mailer. Run `npm run email:test`
// to confirm the .env.local fallback credentials actually work, or use
// the "Send test email" button in Admin for DB-configured ones.

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendMailResult {
  sent: boolean;
  /** Present when sent is false — nothing configured or the SMTP call failed. */
  reason?: string;
}

interface Credentials {
  user: string;
  appPassword: string;
  fromName: string;
  port: number;
}

const DEFAULT_SMTP_PORT = 587;

function envPort(): number | null {
  const raw = process.env.GMAIL_SMTP_PORT;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

// email_settings is admin-only under RLS (it holds a live SMTP password),
// but sendMail also runs on behalf of an issuer submitting a voucher or an
// anonymous token-authenticated approver — neither can pass that RLS
// check. The service-role client bypasses it; if the service role key
// isn't configured, this just returns null and getCredentials() falls
// back to env vars below.
async function getDbCredentials(): Promise<Credentials | null> {
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("email_settings")
    .select("gmail_user, gmail_app_password, gmail_from_name, gmail_smtp_port")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    console.error("[mailer] failed to read email_settings:", error.message);
    return null;
  }
  if (!data?.gmail_user || !data?.gmail_app_password) return null;

  return {
    user: data.gmail_user,
    appPassword: data.gmail_app_password,
    fromName: data.gmail_from_name || process.env.GMAIL_FROM_NAME || "Lub d Voucher System",
    port: data.gmail_smtp_port || envPort() || DEFAULT_SMTP_PORT,
  };
}

function getEnvCredentials(): Credentials | null {
  const user = process.env.GMAIL_USER;
  const appPassword = process.env.GMAIL_APP_PASSWORD;
  if (!user || !appPassword) return null;
  return {
    user,
    appPassword,
    fromName: process.env.GMAIL_FROM_NAME || "Lub d Voucher System",
    port: envPort() || DEFAULT_SMTP_PORT,
  };
}

async function getCredentials(): Promise<Credentials | null> {
  return (await getDbCredentials()) ?? getEnvCredentials();
}

export async function isMailerConfigured(): Promise<boolean> {
  return (await getCredentials()) !== null;
}

function createTransport(user: string, appPassword: string, port: number) {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port,
    secure: port === 465, // 465 = implicit TLS; 587/25 = STARTTLS
    auth: { user, pass: appPassword },
  });
}

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const credentials = await getCredentials();
  if (!credentials) {
    console.warn(
      `[mailer] No email credentials configured — skipping send to ${input.to}. ` +
        `Subject: "${input.subject}".`,
    );
    return { sent: false, reason: "SMTP not configured" };
  }

  try {
    const transporter = createTransport(credentials.user, credentials.appPassword, credentials.port);
    await transporter.sendMail({
      from: `"${credentials.fromName}" <${credentials.user}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { sent: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown SMTP error";
    console.error(`[mailer] send to ${input.to} failed:`, reason);
    return { sent: false, reason };
  }
}
