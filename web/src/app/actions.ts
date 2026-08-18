"use server";

import { cookies } from "next/headers";
import { PREVIEW_ROLE_COOKIE, PREVIEWABLE_ROLES } from "@/lib/auth/previewRole";

// Called from RolePreviewSwitcher (admin-only "view as" toggle in
// AppHeader). Doesn't check the caller is actually an admin here — reading
// the cookie back (getPreviewRole) already ignores it for anyone whose real
// profiles.role isn't admin, and this never touches any real permission
// check, so there's nothing to gain by setting it as a non-admin.
export async function setPreviewRole(role: string) {
  const cookieStore = await cookies();
  if (!role || !(PREVIEWABLE_ROLES as readonly string[]).includes(role)) {
    cookieStore.delete(PREVIEW_ROLE_COOKIE);
    return;
  }
  cookieStore.set(PREVIEW_ROLE_COOKIE, role, { path: "/", maxAge: 60 * 60 * 24 });
}
