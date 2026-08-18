"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { uploadApproverSignature } from "@/app/admin/actions";

function UploadStatus() {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return <span className="text-xs text-brand-dark/50">Uploading…</span>;
}

export function ApproverSignatureUploadForm({ approverId }: { approverId: number }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={uploadApproverSignature} className="flex items-center gap-2">
      <input type="hidden" name="approverId" value={approverId} />
      <label className="cursor-pointer rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-brand-dark hover:bg-brand-dark/5">
        Change
        <input
          type="file"
          name="file"
          accept="image/png,image/jpeg,image/webp"
          required
          className="sr-only"
          // Selecting a file submits immediately — one step instead of
          // choose-then-click, since the file itself is the only input.
          onChange={() => formRef.current?.requestSubmit()}
        />
      </label>
      <UploadStatus />
    </form>
  );
}
