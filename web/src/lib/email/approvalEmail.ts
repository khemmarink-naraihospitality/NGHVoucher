import { getCustomEmailTemplate, renderTemplate } from "@/lib/email/template";

export interface ApprovalEmailInput {
  approverName: string;
  requestorName: string;
  propertyName: string;
  runningNumbers: string[];
  /** Already the display label (e.g. "KOL"), not the raw PurposeValue — see lib/voucher/format.ts's formatPurposeLabel. */
  purpose: string;
  /** Issuer's free-text note. Empty/whitespace renders as "—", same convention as an unset purpose. */
  note: string;
  approveUrl: string;
  expiresAt: Date;
}

export interface ApprovalEmailTemplate {
  subject: string;
  html: string;
  text: string;
}

const TEMPLATE_COLUMNS = {
  subject: "approval_subject_template",
  html: "approval_html_template",
  text: "approval_text_template",
};

/** PRD §7: email to the Approver with a signed link, expiring in ~7 days. */
export const DEFAULT_APPROVAL_EMAIL_TEMPLATE: ApprovalEmailTemplate = {
  subject: "Voucher approval needed — {{propertyName}} ({{voucherNumbers}})",
  html: `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <p>Hi {{approverName}},</p>
      <p>A new voucher request is waiting for your approval.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 4px 0; color: #666;">Requested by</td>
          <td style="padding: 4px 0; font-weight: 600;">{{requestorName}}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #666;">Property</td>
          <td style="padding: 4px 0; font-weight: 600;">{{propertyName}}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #666;">Voucher Number(s)</td>
          <td style="padding: 4px 0; font-weight: 600;">{{voucherNumbers}}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #666;">Purpose</td>
          <td style="padding: 4px 0; font-weight: 600;">{{purpose}}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #666; vertical-align: top;">Note</td>
          <td style="padding: 4px 0; font-weight: 600;">{{note}}</td>
        </tr>
      </table>
      <p>
        <a href="{{approveUrl}}" style="display: inline-block; background: #ff5a1f; color: #fff; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: 600;">
          Review request
        </a>
      </p>
      <p style="color: #666; font-size: 13px;">This link expires on {{expiresDate}}.</p>
    </div>
  `,
  text: `Hi {{approverName}},

A new voucher request is waiting for your approval.

Requested by: {{requestorName}}
Property: {{propertyName}}
Voucher Number(s): {{voucherNumbers}}
Purpose: {{purpose}}
Note: {{note}}

Review and approve or reject here:
{{approveUrl}}

This link expires on {{expiresDate}}.`,
};

/** Placeholders available to a custom template, documented for the Admin UI. */
export const APPROVAL_EMAIL_PLACEHOLDERS = [
  "approverName",
  "requestorName",
  "propertyName",
  "voucherNumbers",
  "purpose",
  "note",
  "approveUrl",
  "expiresDate",
] as const;

function buildTemplateVars(input: ApprovalEmailInput): Record<string, string> {
  return {
    approverName: input.approverName,
    requestorName: input.requestorName,
    propertyName: input.propertyName,
    voucherNumbers: input.runningNumbers.join(", "),
    purpose: input.purpose.trim() || "—",
    note: input.note.trim() || "—",
    approveUrl: input.approveUrl,
    expiresDate: input.expiresAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
  };
}

/** Pure — renders a given template (default or custom) against real input. Used for both the actual send and the Admin preview. */
export function renderApprovalEmailTemplate(
  template: ApprovalEmailTemplate,
  input: ApprovalEmailInput,
): { subject: string; html: string; text: string } {
  const vars = buildTemplateVars(input);
  return {
    subject: renderTemplate(template.subject, vars),
    html: renderTemplate(template.html, vars),
    text: renderTemplate(template.text, vars),
  };
}

/** Renders using the admin's saved custom template when set, falling back to the default per-field otherwise. This is what actually sends — see app/api/vouchers/route.ts. */
export async function renderApprovalEmail(
  input: ApprovalEmailInput,
): Promise<{ subject: string; html: string; text: string }> {
  const custom = await getCustomEmailTemplate(TEMPLATE_COLUMNS);
  const template: ApprovalEmailTemplate = {
    subject: custom?.subject || DEFAULT_APPROVAL_EMAIL_TEMPLATE.subject,
    html: custom?.html || DEFAULT_APPROVAL_EMAIL_TEMPLATE.html,
    text: custom?.text || DEFAULT_APPROVAL_EMAIL_TEMPLATE.text,
  };
  return renderApprovalEmailTemplate(template, input);
}
