"use client";

import { useState, useTransition } from "react";
import { deleteApprover } from "@/app/admin/actions";

interface DeleteApproverButtonProps {
  approverId: number;
  approverName: string;
}

// Not a plain <form action> like ConfirmSubmitForm (used for room types,
// which can never fail to delete) — deleteApprover can be rejected by the
// DB when the approver has real voucher history, and that rejection needs
// to reach the admin, not just get logged.
export function DeleteApproverButton({ approverId, approverName }: DeleteApproverButtonProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    if (!window.confirm(`Delete "${approverName}"? This can't be undone.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteApprover(approverId);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
