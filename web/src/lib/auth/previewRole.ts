import { cookies } from "next/headers";

const COOKIE_NAME = "preview_role";
const VALID_ROLES = ["issuer", "approver", "admin", "front_office"] as const;
export type PreviewableRole = (typeof VALID_ROLES)[number];

/**
 * Admin-only "view as" toggle (components/layout/RolePreviewSwitcher.tsx) so
 * an admin can check what each role's UI looks like without a second
 * account. UI-only — the underlying RPCs/RLS still check the real session's
 * profiles.role, so an admin previewing as front_office still has real
 * admin permissions server-side even though the preview hides the buttons
 * that would use them.
 */
export async function getPreviewRole(): Promise<PreviewableRole | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value ?? "";
  return (VALID_ROLES as readonly string[]).includes(value) ? (value as PreviewableRole) : null;
}

export { COOKIE_NAME as PREVIEW_ROLE_COOKIE, VALID_ROLES as PREVIEWABLE_ROLES };
