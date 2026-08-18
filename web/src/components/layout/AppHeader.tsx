import Link from "next/link";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { RolePreviewSwitcher } from "./RolePreviewSwitcher";

interface AppHeaderProps {
  activeTab: "create" | "history" | "admin";
  userEmail: string;
  isAdmin?: boolean;
  canCreateVoucher?: boolean;
  /** Only ever passed truthy for a real admin session — see app/actions.ts. */
  showRolePreview?: boolean;
  previewRole?: string | null;
}

export function AppHeader({
  activeTab,
  userEmail,
  isAdmin,
  canCreateVoucher = true,
  showRolePreview,
  previewRole,
}: AppHeaderProps) {
  return (
    <header className="border-b border-brand-dark/10 px-4 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-brand-dark">Lub d Room Voucher Generator</h1>
          <nav className="mt-1 flex gap-4 text-sm">
            {canCreateVoucher ? (
              <Link
                href="/"
                className={activeTab === "create" ? "font-semibold text-brand-dark" : "text-brand-dark/60"}
              >
                Create Voucher
              </Link>
            ) : null}
            <Link
              href="/history"
              className={activeTab === "history" ? "font-semibold text-brand-dark" : "text-brand-dark/60"}
            >
              History
            </Link>
            {isAdmin ? (
              <Link
                href="/admin"
                className={activeTab === "admin" ? "font-semibold text-brand-dark" : "text-brand-dark/60"}
              >
                Admin
              </Link>
            ) : null}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm text-brand-dark/70">
          <span>{userEmail}</span>
          {showRolePreview ? <RolePreviewSwitcher currentPreview={previewRole ?? null} /> : null}
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
