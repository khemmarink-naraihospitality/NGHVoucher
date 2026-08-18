"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPreviewRole } from "@/app/actions";
import { CustomSelect } from "@/components/ui/CustomSelect";

const ROLES = ["issuer", "approver", "admin", "front_office"];

const OPTIONS = [
  { value: "", label: "Preview: my role (admin)" },
  ...ROLES.map((role) => ({ value: role, label: `Preview: ${role}` })),
];

interface RolePreviewSwitcherProps {
  currentPreview: string | null;
}

// Admin-only debug tool — lets an admin see the app as another role would
// without a second account. UI-only: real permission checks (RLS/RPCs)
// still run against the actual signed-in admin session regardless of what's
// previewed here.
export function RolePreviewSwitcher({ currentPreview }: RolePreviewSwitcherProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <CustomSelect
      options={OPTIONS}
      value={currentPreview ?? ""}
      placeholder="Preview: my role (admin)"
      onChange={(value) => {
        startTransition(async () => {
          await setPreviewRole(value);
          router.refresh();
        });
      }}
      className={[
        "flex cursor-pointer list-none items-center justify-between gap-2 rounded-full border border-brand-dark/20",
        "bg-white py-1 pl-2 pr-6 text-xs text-brand-dark marker:content-none",
        pending ? "opacity-50" : "",
      ].join(" ")}
    />
  );
}
