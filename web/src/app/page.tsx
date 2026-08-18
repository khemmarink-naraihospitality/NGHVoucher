import { redirect } from "next/navigation";
import { VoucherWorkspace } from "@/components/voucher/VoucherWorkspace";
import { AppHeader } from "@/components/layout/AppHeader";
import { fetchWorkspaceCatalog } from "@/lib/voucher/catalog";
import { getCurrentProfile } from "@/lib/auth/profile";
import { getPreviewRole } from "@/lib/auth/previewRole";

export default async function Home() {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect("/login?next=/");
  }
  if (profile.status !== "active") {
    redirect("/pending");
  }
  const previewRole = profile.role === "admin" ? await getPreviewRole() : null;
  const effectiveRole = previewRole ?? profile.role;
  if (effectiveRole === "front_office") {
    redirect("/history");
  }

  const catalog = await fetchWorkspaceCatalog();

  return (
    <div className="flex flex-1 flex-col bg-background">
      <AppHeader
        activeTab="create"
        userEmail={profile.email}
        isAdmin={effectiveRole === "admin"}
        showRolePreview={profile.role === "admin"}
        previewRole={previewRole}
      />
      <VoucherWorkspace catalog={catalog} />
    </div>
  );
}
