import { getCustomEmailTemplate, renderTemplate } from "@/lib/email/template";

// PRD §4 steps 7-8, §7: the issuer who submitted the voucher gets emailed
// once the approver decides, mirroring the approver's own "approval
// needed" email (see approvalEmail.ts) — including being admin-editable
// via email_settings the same way.

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

/** One voucher's download link — url is null when that specific voucher failed to export (approval still stands, see app/api/approve/route.ts). */
export interface VoucherLinkEntry {
  runningNo: string;
  url: string | null;
}

interface IssuerNotificationBase {
  issuerName: string;
  propertyName: string;
  runningNumbers: string[];
  historyUrl: string;
}

export interface IssuerApprovedEmailInput extends IssuerNotificationBase {
  voucherLinks: VoucherLinkEntry[];
}

export interface IssuerRejectedEmailInput extends IssuerNotificationBase {
  reason: string;
}

function baseVars(input: IssuerNotificationBase): Record<string, string> {
  return {
    issuerName: input.issuerName,
    propertyName: input.propertyName,
    voucherNumbers: input.runningNumbers.join(", "),
    historyUrl: input.historyUrl,
  };
}

// One <a> per voucher, joined with <br> — a comma-separated line of links
// reads poorly once wrapped, and each voucher having its own line makes it
// obvious which link goes with which running number. Vouchers with no
// export (url: null) render as plain text, not a dead link.
function renderVoucherLinksHtml(links: VoucherLinkEntry[]): string {
  return links
    .map((v) =>
      v.url
        ? `<a href="${v.url}" style="color: #ff5a1f; text-decoration: underline;">${v.runningNo}</a>`
        : v.runningNo,
    )
    .join("<br>");
}

function renderVoucherLinksText(links: VoucherLinkEntry[]): string {
  return links.map((v) => (v.url ? `${v.runningNo} — ${v.url}` : v.runningNo)).join("\n");
}

const BASE_PLACEHOLDERS = ["issuerName", "propertyName", "voucherNumbers", "historyUrl"] as const;
// voucherLinksHtml/voucherLinksText only exist for the approved email
// (rejected vouchers have nothing to link to — no export ever happens) —
// kept off ISSUER_REJECTED_EMAIL_PLACEHOLDERS so Admin's placeholder list
// for that template doesn't advertise a variable that would just render
// blank there.
export const ISSUER_APPROVED_EMAIL_PLACEHOLDERS = [
  ...BASE_PLACEHOLDERS,
  "voucherLinksHtml",
  "voucherLinksText",
] as const;
export const ISSUER_REJECTED_EMAIL_PLACEHOLDERS = [...BASE_PLACEHOLDERS, "reason"] as const;

const APPROVED_TEMPLATE_COLUMNS = {
  subject: "issuer_approved_subject_template",
  html: "issuer_approved_html_template",
  text: "issuer_approved_text_template",
};

const REJECTED_TEMPLATE_COLUMNS = {
  subject: "issuer_rejected_subject_template",
  html: "issuer_rejected_html_template",
  text: "issuer_rejected_text_template",
};

export const DEFAULT_ISSUER_APPROVED_EMAIL_TEMPLATE: EmailTemplate = {
  subject: "Voucher approved — {{propertyName}} ({{voucherNumbers}})",
  html: `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <p>Hi {{issuerName}},</p>
      <p>Your voucher request has been <strong style="color: #1a7d3c;">approved</strong>.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 4px 0; color: #666;">Property</td>
          <td style="padding: 4px 0; font-weight: 600;">{{propertyName}}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #666; vertical-align: top;">Voucher Number(s)</td>
          <td style="padding: 4px 0; font-weight: 600;">{{voucherLinksHtml}}</td>
        </tr>
      </table>
      <p>
        <a href="{{historyUrl}}" style="display: inline-block; background: #ff5a1f; color: #fff; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: 600;">
          View in History
        </a>
      </p>
    </div>
  `,
  text: `Hi {{issuerName}},

Your voucher request has been approved.

Property: {{propertyName}}
Voucher Number(s):
{{voucherLinksText}}

View it here:
{{historyUrl}}`,
};

export const DEFAULT_ISSUER_REJECTED_EMAIL_TEMPLATE: EmailTemplate = {
  subject: "Voucher rejected — {{propertyName}} ({{voucherNumbers}})",
  html: `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1a1a1a;">
      <p>Hi {{issuerName}},</p>
      <p>Your voucher request was <strong style="color: #b3261e;">rejected</strong>.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 4px 0; color: #666;">Property</td>
          <td style="padding: 4px 0; font-weight: 600;">{{propertyName}}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #666;">Voucher Number(s)</td>
          <td style="padding: 4px 0; font-weight: 600;">{{voucherNumbers}}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #666; vertical-align: top;">Reason</td>
          <td style="padding: 4px 0; font-weight: 600;">{{reason}}</td>
        </tr>
      </table>
      <p>
        <a href="{{historyUrl}}" style="display: inline-block; background: #ff5a1f; color: #fff; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: 600;">
          View in History
        </a>
      </p>
    </div>
  `,
  text: `Hi {{issuerName}},

Your voucher request was rejected.

Property: {{propertyName}}
Voucher Number(s): {{voucherNumbers}}
Reason: {{reason}}

View it here:
{{historyUrl}}`,
};

/** Pure — renders a given template (default or custom) against real input. Used for both the actual send and the Admin preview. */
export function renderIssuerApprovedEmailTemplate(
  template: EmailTemplate,
  input: IssuerApprovedEmailInput,
): { subject: string; html: string; text: string } {
  const vars = {
    ...baseVars(input),
    voucherLinksHtml: renderVoucherLinksHtml(input.voucherLinks),
    voucherLinksText: renderVoucherLinksText(input.voucherLinks),
  };
  return {
    subject: renderTemplate(template.subject, vars),
    html: renderTemplate(template.html, vars),
    text: renderTemplate(template.text, vars),
  };
}

export function renderIssuerRejectedEmailTemplate(
  template: EmailTemplate,
  input: IssuerRejectedEmailInput,
): { subject: string; html: string; text: string } {
  const vars = { ...baseVars(input), reason: input.reason };
  return {
    subject: renderTemplate(template.subject, vars),
    html: renderTemplate(template.html, vars),
    text: renderTemplate(template.text, vars),
  };
}

/** Renders using the admin's saved custom template when set, falling back to the default otherwise. This is what actually sends — see app/api/approve/route.ts. */
export async function renderIssuerApprovedEmail(
  input: IssuerApprovedEmailInput,
): Promise<{ subject: string; html: string; text: string }> {
  const custom = await getCustomEmailTemplate(APPROVED_TEMPLATE_COLUMNS);
  const template: EmailTemplate = {
    subject: custom?.subject || DEFAULT_ISSUER_APPROVED_EMAIL_TEMPLATE.subject,
    html: custom?.html || DEFAULT_ISSUER_APPROVED_EMAIL_TEMPLATE.html,
    text: custom?.text || DEFAULT_ISSUER_APPROVED_EMAIL_TEMPLATE.text,
  };
  return renderIssuerApprovedEmailTemplate(template, input);
}

/** Same as renderIssuerApprovedEmail — see app/api/reject/route.ts. */
export async function renderIssuerRejectedEmail(
  input: IssuerRejectedEmailInput,
): Promise<{ subject: string; html: string; text: string }> {
  const custom = await getCustomEmailTemplate(REJECTED_TEMPLATE_COLUMNS);
  const template: EmailTemplate = {
    subject: custom?.subject || DEFAULT_ISSUER_REJECTED_EMAIL_TEMPLATE.subject,
    html: custom?.html || DEFAULT_ISSUER_REJECTED_EMAIL_TEMPLATE.html,
    text: custom?.text || DEFAULT_ISSUER_REJECTED_EMAIL_TEMPLATE.text,
  };
  return renderIssuerRejectedEmailTemplate(template, input);
}
