import type { ApprovalEmailInput } from "@/lib/email/approvalEmail";
import type { IssuerApprovedEmailInput, IssuerRejectedEmailInput } from "@/lib/email/issuerNotificationEmail";

// Fixed, realistic-looking sample values shared by the Admin preview and
// "send test email" — so both show/send exactly the same content, and
// sending a test doesn't need its own DB round-trip just for cosmetics.
// Voucher number format matches submit_voucher_batch (supabase/migrations/
// 0002): {2-digit year}/{property code}{3-digit sequence}.
const SAMPLE_VOUCHER_NUMBERS = ["26/LDBS001", "26/LDBS002", "26/LDBS003"];
const SAMPLE_PROPERTY_NAME = "Lub d Bangkok Siam";
const SAMPLE_VOUCHER_LINKS = [
  { runningNo: "26/LDBS001", url: `${process.env.NEXT_PUBLIC_APP_URL}/v/sample1code` },
  { runningNo: "26/LDBS002", url: `${process.env.NEXT_PUBLIC_APP_URL}/v/sample2code` },
  { runningNo: "26/LDBS003", url: `${process.env.NEXT_PUBLIC_APP_URL}/v/sample3code` },
];

export function buildSampleApprovalEmailInput(overrides: Partial<ApprovalEmailInput> = {}): ApprovalEmailInput {
  return {
    approverName: "Jane Doe",
    requestorName: "Alex Morgan",
    propertyName: SAMPLE_PROPERTY_NAME,
    runningNumbers: SAMPLE_VOUCHER_NUMBERS,
    purpose: "KOL",
    note: "For a hotel review collaboration — 3 nights, breakfast included.",
    approveUrl: "https://example.com/approve/sample-token",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

export function buildSampleIssuerApprovedEmailInput(
  overrides: Partial<IssuerApprovedEmailInput> = {},
): IssuerApprovedEmailInput {
  return {
    issuerName: "Alex Morgan",
    propertyName: SAMPLE_PROPERTY_NAME,
    runningNumbers: SAMPLE_VOUCHER_NUMBERS,
    voucherLinks: SAMPLE_VOUCHER_LINKS,
    historyUrl: `${process.env.NEXT_PUBLIC_APP_URL}/history`,
    ...overrides,
  };
}

export function buildSampleIssuerRejectedEmailInput(
  overrides: Partial<IssuerRejectedEmailInput> = {},
): IssuerRejectedEmailInput {
  return {
    ...buildSampleIssuerApprovedEmailInput(),
    reason: "Blackout dates don't match the requested validity period.",
    ...overrides,
  };
}
