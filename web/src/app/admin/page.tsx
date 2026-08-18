import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/AppHeader";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/profile";
import { getPreviewRole } from "@/lib/auth/previewRole";
import { resolveStorageImageUrl } from "@/lib/supabase/signedUrl";
import {
  APPROVAL_EMAIL_PLACEHOLDERS,
  DEFAULT_APPROVAL_EMAIL_TEMPLATE,
  renderApprovalEmailTemplate,
  type ApprovalEmailTemplate,
} from "@/lib/email/approvalEmail";
import {
  DEFAULT_ISSUER_APPROVED_EMAIL_TEMPLATE,
  DEFAULT_ISSUER_REJECTED_EMAIL_TEMPLATE,
  ISSUER_APPROVED_EMAIL_PLACEHOLDERS,
  ISSUER_REJECTED_EMAIL_PLACEHOLDERS,
  renderIssuerApprovedEmailTemplate,
  renderIssuerRejectedEmailTemplate,
  type EmailTemplate,
} from "@/lib/email/issuerNotificationEmail";
import {
  buildSampleApprovalEmailInput,
  buildSampleIssuerApprovedEmailInput,
  buildSampleIssuerRejectedEmailInput,
} from "@/lib/email/sampleData";
import type { TemplateConfigJson } from "@/lib/templates/config";
import { RoomTypeAddForm } from "@/components/admin/RoomTypeAddForm";
import { RoomTypeRow } from "@/components/admin/RoomTypeRow";
import { TemplateUploadForm } from "@/components/admin/TemplateUploadForm";
import { ApproverSignatureUploadForm } from "@/components/admin/ApproverSignatureUploadForm";
import { RoleSelect } from "@/components/admin/RoleSelect";
import { DeleteApproverButton } from "@/components/admin/DeleteApproverButton";
import { EmailTestForm } from "@/components/admin/EmailTestForm";
import { EmailTemplateSection } from "@/components/admin/EmailTemplateSection";
import { ChevronDownIcon } from "@/components/ui/ChevronDownIcon";
import {
  addApprover,
  addProperty,
  grantPropertyAccess,
  revokePropertyAccess,
  saveEmailSettings,
  setUserRole,
  setUserStatus,
  toggleApproverActive,
  toggleApproverProperty,
  updateApproverDetails,
} from "./actions";

interface Property {
  id: number;
  code: string;
  name: string;
  template_config: TemplateConfigJson | null;
}
interface RoomType {
  id: number;
  property_id: number;
  name: string;
  is_active: boolean;
}
interface Approver {
  id: number;
  name: string;
  email: string;
  is_active: boolean;
  position: string | null;
  signature_url: string | null;
}
interface ApproverPropertyRow {
  approver_id: number;
  property_id: number;
}
interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: "issuer" | "approver" | "admin" | "front_office";
  status: "pending" | "active" | "rejected";
}
interface UserPropertyRow {
  user_id: string;
  property_id: number;
}
interface EmailSettingsRow {
  gmail_user: string | null;
  gmail_app_password: string | null;
  gmail_from_name: string | null;
  gmail_smtp_port: number | null;
  approval_subject_template: string | null;
  approval_html_template: string | null;
  approval_text_template: string | null;
  issuer_approved_subject_template: string | null;
  issuer_approved_html_template: string | null;
  issuer_approved_text_template: string | null;
  issuer_rejected_subject_template: string | null;
  issuer_rejected_html_template: string | null;
  issuer_rejected_text_template: string | null;
}

// Shared "select properties" pill look — reused as-is by Approvers' assign
// toggles, the Add Approver checkboxes, and Users' access toggles, so the
// same interaction reads the same everywhere on the page. Kept as plain
// class-string constants rather than one wrapper component: the three call
// sites have genuinely different mechanics (individual Server Action submit
// vs. a single checkbox-group submit), so a shared component would just
// hide that instead of simplifying anything.
const PILL_CLASS = "rounded-full px-3 py-1 text-xs font-semibold transition-colors";
const PILL_ACTIVE = "bg-brand-dark text-white";
const PILL_INACTIVE = "bg-white text-brand-dark/60";

// Plain helpers (not called inline in the component body) so Date.now() —
// impure per react-hooks/purity, pulled in via buildSampleApprovalEmailInput
// — stays out of the component's render path. Sample data is shared with
// "send test email" (lib/email/sampleData.ts) so preview and test always
// show/send the same content.
function buildApprovalEmailPreview(template: ApprovalEmailTemplate) {
  return renderApprovalEmailTemplate(template, buildSampleApprovalEmailInput());
}

function buildIssuerApprovedEmailPreview(template: EmailTemplate) {
  return renderIssuerApprovedEmailTemplate(template, buildSampleIssuerApprovedEmailInput());
}

function buildIssuerRejectedEmailPreview(template: EmailTemplate) {
  return renderIssuerRejectedEmailTemplate(template, buildSampleIssuerRejectedEmailInput());
}

const SECTION_NAV = [
  { href: "#properties", label: "Properties" },
  { href: "#approvers", label: "Approvers" },
  { href: "#users", label: "Users" },
  { href: "#email", label: "Email" },
];

export default async function AdminPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login?next=/admin");
  }
  if (profile.status !== "active") {
    redirect("/pending");
  }
  if (profile.role !== "admin") {
    redirect("/");
  }
  const previewRole = await getPreviewRole();

  const supabase = await createClient();
  const [
    propertiesRes,
    roomTypesRes,
    approversRes,
    approverPropertiesRes,
    profilesRes,
    userPropertiesRes,
    emailSettingsRes,
  ] = await Promise.all([
    supabase.from("properties").select("id, code, name, template_config").order("code"),
    supabase.from("room_types").select("id, property_id, name, is_active").order("name"),
    supabase.from("approvers").select("id, name, email, is_active, position, signature_url").order("name"),
    supabase.from("approver_properties").select("approver_id, property_id"),
    supabase.from("profiles").select("id, email, full_name, role, status").order("email"),
    supabase.from("user_properties").select("user_id, property_id"),
    supabase
      .from("email_settings")
      .select(
        [
          "gmail_user",
          "gmail_app_password",
          "gmail_from_name",
          "gmail_smtp_port",
          "approval_subject_template",
          "approval_html_template",
          "approval_text_template",
          "issuer_approved_subject_template",
          "issuer_approved_html_template",
          "issuer_approved_text_template",
          "issuer_rejected_subject_template",
          "issuer_rejected_html_template",
          "issuer_rejected_text_template",
        ].join(", "),
      )
      .eq("id", true)
      .maybeSingle(),
  ]);

  const roomTypes = (roomTypesRes.data as RoomType[] | null) ?? [];
  const approverProperties = (approverPropertiesRes.data as ApproverPropertyRow[] | null) ?? [];
  // Admin browses this page for a while — same generous TTL as the
  // create-voucher workspace (lib/voucher/catalog.ts), not the short one
  // used for one-shot voucher downloads.
  const IMAGE_URL_TTL_SECONDS = 3600;
  const properties = await Promise.all(
    ((propertiesRes.data as Property[] | null) ?? []).map(async (property) => {
      if (!property.template_config?.imagePath) return property;
      const imagePath = await resolveStorageImageUrl(
        "templates",
        property.template_config.imagePath,
        IMAGE_URL_TTL_SECONDS,
      );
      return {
        ...property,
        template_config: { ...property.template_config, imagePath: imagePath ?? property.template_config.imagePath },
      };
    }),
  );
  const approvers = await Promise.all(
    ((approversRes.data as Approver[] | null) ?? []).map(async (approver) => ({
      ...approver,
      signature_url: await resolveStorageImageUrl("signatures", approver.signature_url, IMAGE_URL_TTL_SECONDS),
    })),
  );
  const profiles = (profilesRes.data as Profile[] | null) ?? [];
  const pendingProfiles = profiles.filter((p) => p.status === "pending");
  const activeProfiles = profiles.filter((p) => p.status === "active");
  const rejectedProfiles = profiles.filter((p) => p.status === "rejected");
  const userProperties = (userPropertiesRes.data as UserPropertyRow[] | null) ?? [];
  // The real app password never enters JSX/props below — only this
  // derived boolean does. gmail_user/gmail_from_name aren't secret and are
  // shown as-is (same posture as every other admin text field on this page).
  const emailSettingsRow = emailSettingsRes.data as EmailSettingsRow | null;
  const emailSettings = {
    gmailUser: emailSettingsRow?.gmail_user ?? "",
    gmailFromName: emailSettingsRow?.gmail_from_name ?? "",
    gmailSmtpPort: emailSettingsRow?.gmail_smtp_port ?? null,
    hasAppPassword: Boolean(emailSettingsRow?.gmail_app_password),
  };
  const serviceRoleConfigured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  // This page is admin-only (redirect above), so unlike lib/email/
  // approvalEmail.ts's own DB read (which has to go through the
  // service-role client for issuer/approver callers), this can just use
  // the normal session-bound client — the admin's own RLS already allows it.
  const isCustomApprovalTemplate = Boolean(
    emailSettingsRow?.approval_subject_template ||
      emailSettingsRow?.approval_html_template ||
      emailSettingsRow?.approval_text_template,
  );
  const approvalTemplate: ApprovalEmailTemplate = {
    subject: emailSettingsRow?.approval_subject_template || DEFAULT_APPROVAL_EMAIL_TEMPLATE.subject,
    html: emailSettingsRow?.approval_html_template || DEFAULT_APPROVAL_EMAIL_TEMPLATE.html,
    text: emailSettingsRow?.approval_text_template || DEFAULT_APPROVAL_EMAIL_TEMPLATE.text,
  };
  const approvalEmailPreview = buildApprovalEmailPreview(approvalTemplate);

  const isCustomIssuerApprovedTemplate = Boolean(
    emailSettingsRow?.issuer_approved_subject_template ||
      emailSettingsRow?.issuer_approved_html_template ||
      emailSettingsRow?.issuer_approved_text_template,
  );
  const issuerApprovedTemplate: EmailTemplate = {
    subject: emailSettingsRow?.issuer_approved_subject_template || DEFAULT_ISSUER_APPROVED_EMAIL_TEMPLATE.subject,
    html: emailSettingsRow?.issuer_approved_html_template || DEFAULT_ISSUER_APPROVED_EMAIL_TEMPLATE.html,
    text: emailSettingsRow?.issuer_approved_text_template || DEFAULT_ISSUER_APPROVED_EMAIL_TEMPLATE.text,
  };
  const issuerApprovedPreview = buildIssuerApprovedEmailPreview(issuerApprovedTemplate);

  const isCustomIssuerRejectedTemplate = Boolean(
    emailSettingsRow?.issuer_rejected_subject_template ||
      emailSettingsRow?.issuer_rejected_html_template ||
      emailSettingsRow?.issuer_rejected_text_template,
  );
  const issuerRejectedTemplate: EmailTemplate = {
    subject: emailSettingsRow?.issuer_rejected_subject_template || DEFAULT_ISSUER_REJECTED_EMAIL_TEMPLATE.subject,
    html: emailSettingsRow?.issuer_rejected_html_template || DEFAULT_ISSUER_REJECTED_EMAIL_TEMPLATE.html,
    text: emailSettingsRow?.issuer_rejected_text_template || DEFAULT_ISSUER_REJECTED_EMAIL_TEMPLATE.text,
  };
  const issuerRejectedPreview = buildIssuerRejectedEmailPreview(issuerRejectedTemplate);

  return (
    <div className="flex flex-1 flex-col bg-background">
      <AppHeader
        activeTab="admin"
        userEmail={profile.email}
        isAdmin
        showRolePreview
        previewRole={previewRole}
      />

      <nav className="sticky top-0 z-30 border-b border-brand-dark/10 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl gap-5 px-4 py-2.5 text-sm">
          {SECTION_NAV.map((item) => (
            <a key={item.href} href={item.href} className="font-semibold text-brand-dark/60 hover:text-brand-dark">
              {item.label}
            </a>
          ))}
        </div>
      </nav>

      <div className="mx-auto w-full max-w-5xl space-y-10 px-4 py-10">
        {/* Properties (incl. room types) */}
        <section id="properties">
          <h2 className="text-lg font-bold text-brand-dark">
            Properties <span className="font-normal text-brand-dark/40">({properties.length})</span>
          </h2>
          <div className="mt-3 space-y-3">
            {properties.map((p) => {
              const propertyRoomTypes = roomTypes.filter((rt) => rt.property_id === p.id);
              return (
                <div key={p.id} className="rounded-2xl bg-brand-lime/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {p.template_config?.imagePath ? (
                        // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail, arbitrary external Storage URL
                        <img
                          src={p.template_config.imagePath}
                          alt={`${p.code} template`}
                          className="h-12 w-12 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-dark/10 text-[10px] text-brand-dark/50">
                          none
                        </div>
                      )}
                      <div>
                        <p className="font-mono text-sm font-semibold text-brand-dark">{p.code}</p>
                        <p className="text-sm text-brand-dark/70">{p.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <TemplateUploadForm
                        propertyId={p.id}
                        propertyCode={p.code}
                        hasTemplate={Boolean(p.template_config?.imagePath)}
                      />
                      {p.template_config?.imagePath ? (
                        <Link
                          href={`/admin/template/${p.id}`}
                          className="rounded-full bg-brand-dark/10 px-3 py-1.5 text-xs font-semibold text-brand-dark"
                        >
                          Edit layout
                        </Link>
                      ) : null}
                    </div>
                  </div>

                  <details className="group mt-3 border-t border-brand-dark/10 pt-3">
                    <summary className="flex cursor-pointer list-none items-center justify-between marker:content-none">
                      <span className="text-xs font-semibold text-brand-dark/70">
                        Room types <span className="font-normal text-brand-dark/50">({propertyRoomTypes.length})</span>
                      </span>
                      <ChevronDownIcon className="h-3 w-3 shrink-0 text-brand-dark/50 transition-transform group-open:rotate-180" />
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {propertyRoomTypes.map((rt) => (
                        <RoomTypeRow key={rt.id} id={rt.id} name={rt.name} isActive={rt.is_active} />
                      ))}
                    </ul>
                    <div className="mt-2 border-t border-dashed border-brand-dark/15 pt-2">
                      <RoomTypeAddForm propertyId={p.id} />
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
          <form
            action={addProperty}
            className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border-2 border-dashed border-brand-dark/20 p-3"
          >
            <input
              name="code"
              placeholder="Code, e.g. LDSR"
              required
              className="rounded-full bg-white px-3 py-2 text-sm text-brand-dark"
            />
            <input
              name="name"
              placeholder="Name, e.g. Lub d Siem Reap"
              required
              className="min-w-[220px] flex-1 rounded-full bg-white px-3 py-2 text-sm text-brand-dark"
            />
            <button type="submit" className="rounded-full bg-brand-orange px-4 py-2 text-sm font-semibold text-white">
              + Add property
            </button>
          </form>
        </section>

        {/* Approvers */}
        <section id="approvers">
          <h2 className="text-lg font-bold text-brand-dark">
            Approvers <span className="font-normal text-brand-dark/40">({approvers.length})</span>
          </h2>
          <div className="mt-3 space-y-2">
            {approvers.map((a) => {
              const assignedPropertyIds = new Set(
                approverProperties.filter((ap) => ap.approver_id === a.id).map((ap) => ap.property_id),
              );
              return (
                <details key={a.id} className="group rounded-2xl bg-brand-lime/20 px-4 py-2.5">
                  <summary className="flex cursor-pointer list-none items-center gap-3 marker:content-none">
                    {a.signature_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail, arbitrary external Storage URL
                      <img
                        src={a.signature_url}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-full bg-white/70 object-contain ring-1 ring-brand-dark/10"
                      />
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-dark/10 text-[10px] font-semibold text-brand-dark/40">
                        {a.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className={["min-w-0 flex-1", a.is_active ? "" : "opacity-50"].join(" ")}>
                      <p className="truncate text-sm font-semibold text-brand-dark">
                        {a.name}
                        {a.position ? <span className="font-normal text-brand-dark/60"> · {a.position}</span> : null}
                        {!a.is_active ? (
                          <span className="ml-1.5 rounded-full bg-brand-dark/10 px-1.5 py-0.5 align-middle text-[9px] font-semibold uppercase tracking-wide text-brand-dark/50">
                            Inactive
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-brand-dark/60">
                        {a.email}{" "}
                        <span className="text-brand-dark/40">
                          · {assignedPropertyIds.size} {assignedPropertyIds.size === 1 ? "property" : "properties"}
                        </span>
                      </p>
                    </div>
                    <ChevronDownIcon className="h-4 w-4 shrink-0 text-brand-dark/50 transition-transform group-open:rotate-180" />
                  </summary>

                  <div className="mt-3 space-y-3 border-t border-brand-dark/10 pt-3">
                    <form
                      action={updateApproverDetails}
                      className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
                    >
                      <input type="hidden" name="id" value={a.id} />
                      <label className="block">
                        <span className="block text-[10px] font-semibold uppercase tracking-wide text-brand-dark/50">
                          Name
                        </span>
                        <input
                          name="name"
                          defaultValue={a.name}
                          required
                          className="mt-0.5 w-full rounded-full bg-white px-3 py-1.5 text-xs text-brand-dark"
                        />
                      </label>
                      <label className="block">
                        <span className="block text-[10px] font-semibold uppercase tracking-wide text-brand-dark/50">
                          Email
                        </span>
                        <input
                          name="email"
                          type="email"
                          defaultValue={a.email}
                          required
                          className="mt-0.5 w-full rounded-full bg-white px-3 py-1.5 text-xs text-brand-dark"
                        />
                      </label>
                      <label className="block">
                        <span className="block text-[10px] font-semibold uppercase tracking-wide text-brand-dark/50">
                          Position
                        </span>
                        <input
                          name="position"
                          defaultValue={a.position ?? ""}
                          placeholder="e.g. Property Leader"
                          className="mt-0.5 w-full rounded-full bg-white px-3 py-1.5 text-xs text-brand-dark"
                        />
                      </label>
                      <button
                        type="submit"
                        className="rounded-full bg-brand-dark/10 px-3 py-1.5 text-xs font-semibold text-brand-dark"
                      >
                        Save
                      </button>
                    </form>

                    <div className="flex flex-wrap items-center gap-3">
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-brand-dark/50">
                        Signature
                      </span>
                      {a.signature_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail, arbitrary external Storage URL
                        <img
                          src={a.signature_url}
                          alt={`${a.name} signature`}
                          className="h-8 w-16 shrink-0 rounded-md bg-white/70 object-contain"
                        />
                      ) : (
                        <span className="text-xs text-red-700">Missing</span>
                      )}
                      <ApproverSignatureUploadForm approverId={a.id} />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-brand-dark/50">
                        Properties
                      </span>
                      {properties.map((property) => {
                        const assigned = assignedPropertyIds.has(property.id);
                        return (
                          <form key={property.id} action={toggleApproverProperty}>
                            <input type="hidden" name="approverId" value={a.id} />
                            <input type="hidden" name="propertyId" value={property.id} />
                            <input type="hidden" name="grant" value={(!assigned).toString()} />
                            <button
                              type="submit"
                              className={[PILL_CLASS, assigned ? PILL_ACTIVE : PILL_INACTIVE].join(" ")}
                            >
                              {property.code}
                            </button>
                          </form>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-end gap-2 border-t border-dashed border-brand-dark/15 pt-2.5">
                      <form action={toggleApproverActive}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="nextActive" value={(!a.is_active).toString()} />
                        <button
                          type="submit"
                          className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-dark/70"
                        >
                          {a.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </form>
                      <DeleteApproverButton approverId={a.id} approverName={a.name} />
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
          <form
            action={addApprover}
            className="mt-4 space-y-3 rounded-2xl border-2 border-dashed border-brand-dark/20 p-3"
          >
            <div className="flex flex-wrap gap-2">
              <input
                name="name"
                placeholder="Name"
                required
                className="rounded-full bg-white px-3 py-2 text-sm text-brand-dark"
              />
              <input
                name="email"
                type="email"
                placeholder="Email"
                required
                className="min-w-[220px] flex-1 rounded-full bg-white px-3 py-2 text-sm text-brand-dark"
              />
              <input
                name="position"
                placeholder="Position, e.g. Property Leader"
                className="rounded-full bg-white px-3 py-2 text-sm text-brand-dark"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-brand-dark/60">Properties:</span>
              {properties.map((property) => (
                <label key={property.id} className="cursor-pointer">
                  <input type="checkbox" name="propertyIds" value={property.id} className="peer sr-only" />
                  <span className={[PILL_CLASS, PILL_INACTIVE, "peer-checked:bg-brand-dark peer-checked:text-white"].join(" ")}>
                    {property.code}
                  </span>
                </label>
              ))}
            </div>
            <button type="submit" className="rounded-full bg-brand-orange px-4 py-2 text-sm font-semibold text-white">
              + Add approver
            </button>
          </form>
        </section>

        {/* Users & property access */}
        <section id="users">
          {pendingProfiles.length > 0 ? (
            <div className="mb-8">
              <h2 className="text-lg font-bold text-brand-dark">
                Pending Approval <span className="font-normal text-brand-dark/40">({pendingProfiles.length})</span>
              </h2>
              <p className="mt-1 text-xs text-brand-dark/60">
                New sign-ins land here until approved — they can&apos;t use the app yet. Assign properties now or after
                approving.
              </p>
              <div className="mt-3 space-y-4">
                {pendingProfiles.map((prof) => {
                  const accessiblePropertyIds = new Set(
                    userProperties.filter((up) => up.user_id === prof.id).map((up) => up.property_id),
                  );
                  return (
                    <div key={prof.id} className="rounded-2xl bg-brand-orange/10 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-brand-dark">{prof.full_name ?? prof.email}</p>
                          <p className="text-xs text-brand-dark/60">{prof.email}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <form action={setUserStatus}>
                            <input type="hidden" name="userId" value={prof.id} />
                            <input type="hidden" name="status" value="rejected" />
                            <button
                              type="submit"
                              className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-brand-dark/70"
                            >
                              Reject
                            </button>
                          </form>
                          <form action={setUserStatus}>
                            <input type="hidden" name="userId" value={prof.id} />
                            <input type="hidden" name="status" value="active" />
                            <button
                              type="submit"
                              className="rounded-full bg-brand-dark px-3 py-1.5 text-xs font-semibold text-white"
                            >
                              Approve
                            </button>
                          </form>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {properties.map((property) => {
                          const hasAccess = accessiblePropertyIds.has(property.id);
                          return (
                            <form key={property.id} action={hasAccess ? revokePropertyAccess : grantPropertyAccess}>
                              <input type="hidden" name="userId" value={prof.id} />
                              <input type="hidden" name="propertyId" value={property.id} />
                              <button
                                type="submit"
                                className={[PILL_CLASS, hasAccess ? PILL_ACTIVE : PILL_INACTIVE].join(" ")}
                              >
                                {property.code}
                              </button>
                            </form>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <h2 className="text-lg font-bold text-brand-dark">
            Users &amp; Property Access <span className="font-normal text-brand-dark/40">({activeProfiles.length})</span>
          </h2>
          <div className="mt-3 space-y-4">
            {activeProfiles.map((prof) => {
              const accessiblePropertyIds = new Set(
                userProperties.filter((up) => up.user_id === prof.id).map((up) => up.property_id),
              );
              return (
                <div key={prof.id} className="rounded-2xl bg-brand-lime/30 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-brand-dark">{prof.full_name ?? prof.email}</p>
                      <p className="text-xs text-brand-dark/60">{prof.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <form action={setUserRole} className="flex items-center gap-2">
                        <input type="hidden" name="userId" value={prof.id} />
                        <RoleSelect defaultValue={prof.role} />
                        <button type="submit" className="rounded-full bg-brand-dark/10 px-3 py-1.5 text-xs font-semibold text-brand-dark">
                          Save role
                        </button>
                      </form>
                      <form action={setUserStatus}>
                        <input type="hidden" name="userId" value={prof.id} />
                        <input type="hidden" name="status" value="rejected" />
                        <button
                          type="submit"
                          className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-brand-dark/70"
                        >
                          Suspend
                        </button>
                      </form>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {properties.map((property) => {
                      const hasAccess = accessiblePropertyIds.has(property.id);
                      return (
                        <form key={property.id} action={hasAccess ? revokePropertyAccess : grantPropertyAccess}>
                          <input type="hidden" name="userId" value={prof.id} />
                          <input type="hidden" name="propertyId" value={property.id} />
                          <button
                            type="submit"
                            className={[PILL_CLASS, hasAccess ? PILL_ACTIVE : PILL_INACTIVE].join(" ")}
                          >
                            {property.code}
                          </button>
                        </form>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {rejectedProfiles.length > 0 ? (
            <details className="group mt-6">
              <summary className="flex cursor-pointer list-none items-center gap-2 marker:content-none">
                <h2 className="text-sm font-semibold text-brand-dark/60">
                  Rejected / Suspended <span className="font-normal text-brand-dark/40">({rejectedProfiles.length})</span>
                </h2>
                <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-brand-dark/50 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-3 space-y-2">
                {rejectedProfiles.map((prof) => (
                  <div
                    key={prof.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-brand-dark/5 p-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-brand-dark">{prof.full_name ?? prof.email}</p>
                      <p className="text-xs text-brand-dark/60">{prof.email}</p>
                    </div>
                    <form action={setUserStatus}>
                      <input type="hidden" name="userId" value={prof.id} />
                      <input type="hidden" name="status" value="active" />
                      <button
                        type="submit"
                        className="rounded-full bg-brand-dark/10 px-3 py-1.5 text-xs font-semibold text-brand-dark"
                      >
                        Re-approve
                      </button>
                    </form>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </section>

        {/* Email / SMTP */}
        <section id="email">
          <h2 className="text-lg font-bold text-brand-dark">Email</h2>
          <div className="mt-3 space-y-4 rounded-2xl bg-brand-lime/20 p-4">
            {!serviceRoleConfigured ? (
              <p className="rounded-xl bg-brand-orange/10 px-3 py-2 text-xs text-brand-dark/70">
                <span className="font-semibold">Heads up:</span> SUPABASE_SERVICE_ROLE_KEY isn&apos;t set on the
                server, so these saved settings won&apos;t be used yet — the app will keep sending through the
                GMAIL_* values in .env.local until it is.
              </p>
            ) : null}

            <form action={saveEmailSettings} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-brand-dark/50">
                  Gmail / Workspace address
                </span>
                <input
                  name="gmailUser"
                  type="email"
                  defaultValue={emailSettings.gmailUser}
                  placeholder="voucher-system@yourdomain.com"
                  className="mt-0.5 w-full rounded-full bg-white px-3 py-1.5 text-sm text-brand-dark"
                />
              </label>
              <label className="block">
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-brand-dark/50">
                  From name
                </span>
                <input
                  name="gmailFromName"
                  defaultValue={emailSettings.gmailFromName}
                  placeholder="Lub d Voucher System"
                  className="mt-0.5 w-full rounded-full bg-white px-3 py-1.5 text-sm text-brand-dark"
                />
              </label>
              <label className="block">
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-brand-dark/50">
                  SMTP port
                </span>
                <input
                  name="gmailSmtpPort"
                  type="number"
                  min={1}
                  max={65535}
                  defaultValue={emailSettings.gmailSmtpPort ?? ""}
                  placeholder="587"
                  className="mt-0.5 w-full rounded-full bg-white px-3 py-1.5 text-sm text-brand-dark"
                />
                <span className="mt-1 block text-xs text-brand-dark/50">
                  587 = STARTTLS (default), 465 = implicit TLS/SSL. Leave blank for 587.
                </span>
              </label>
              <label className="block sm:col-span-2">
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-brand-dark/50">
                  App password
                </span>
                <input
                  name="gmailAppPassword"
                  type="password"
                  autoComplete="off"
                  placeholder={
                    emailSettings.hasAppPassword ? "•••••••••••••• (leave blank to keep current)" : "16-character app password"
                  }
                  className="mt-0.5 w-full rounded-full bg-white px-3 py-1.5 text-sm text-brand-dark"
                />
                <span className="mt-1 block text-xs text-brand-dark/50">
                  Generate one at Google Account → Security → 2-Step Verification → App passwords. Never shown
                  again once saved — leave blank to keep the current one.
                </span>
              </label>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  className="rounded-full bg-brand-dark/10 px-4 py-1.5 text-xs font-semibold text-brand-dark"
                >
                  Save settings
                </button>
              </div>
            </form>

            <EmailTemplateSection
              kind="approval"
              title="Approval request email"
              description="Sent automatically to the approver when an issuer submits a voucher — built from real data at send time; shown here with sample values."
              placeholders={APPROVAL_EMAIL_PLACEHOLDERS}
              template={approvalTemplate}
              isCustom={isCustomApprovalTemplate}
              preview={approvalEmailPreview}
              previewTitle="Approval email preview"
              previewHeightClassName="h-72"
            />

            <EmailTemplateSection
              kind="issuerApproved"
              title="Issuer notification — approved"
              description="Sent automatically to the issuer once the approver approves their request."
              placeholders={ISSUER_APPROVED_EMAIL_PLACEHOLDERS}
              template={issuerApprovedTemplate}
              isCustom={isCustomIssuerApprovedTemplate}
              preview={issuerApprovedPreview}
              previewTitle="Issuer approved email preview"
              previewHeightClassName="h-56"
            />

            <EmailTemplateSection
              kind="issuerRejected"
              title="Issuer notification — rejected"
              description="Sent automatically to the issuer once the approver rejects their request, with the reason."
              placeholders={ISSUER_REJECTED_EMAIL_PLACEHOLDERS}
              template={issuerRejectedTemplate}
              isCustom={isCustomIssuerRejectedTemplate}
              preview={issuerRejectedPreview}
              previewTitle="Issuer rejected email preview"
              previewHeightClassName="h-56"
            />

            <div className="border-t border-dashed border-brand-dark/15 pt-3">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-brand-dark/50">
                Test
              </span>
              <div className="mt-1">
                <EmailTestForm defaultTo={profile.email} />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
