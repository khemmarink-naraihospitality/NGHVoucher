"use client";

import { useState } from "react";
import { CustomSelect } from "@/components/ui/CustomSelect";

const ROLE_OPTIONS = [
  { value: "issuer", label: "issuer" },
  { value: "approver", label: "approver" },
  { value: "admin", label: "admin" },
  { value: "front_office", label: "front_office" },
];

// The surrounding <form action={setUserRole}> (app/admin/page.tsx) still
// submits natively via its "Save role" button — this just needs to put a
// real `role` field in that form's data, same job the native <select
// name="role"> used to do, since CustomSelect itself renders no form input.
export function RoleSelect({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);

  return (
    <>
      <input type="hidden" name="role" value={value} />
      <CustomSelect
        options={ROLE_OPTIONS}
        value={value}
        onChange={setValue}
        placeholder="Select role"
        className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-full bg-white py-1.5 pl-3 pr-6 text-sm text-brand-dark marker:content-none"
      />
    </>
  );
}
