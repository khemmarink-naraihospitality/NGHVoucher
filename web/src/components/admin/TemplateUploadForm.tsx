"use client";

import { useFormStatus } from "react-dom";
import { uploadTemplate } from "@/app/admin/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-brand-dark/10 px-3 py-1.5 text-xs font-semibold text-brand-dark disabled:opacity-50"
    >
      {pending ? "Uploading…" : "Upload"}
    </button>
  );
}

interface TemplateUploadFormProps {
  propertyId: number;
  propertyCode: string;
  hasTemplate: boolean;
}

export function TemplateUploadForm({ propertyId, propertyCode, hasTemplate }: TemplateUploadFormProps) {
  return (
    <form action={uploadTemplate} className="flex items-center gap-2">
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="propertyCode" value={propertyCode} />
      <input
        type="file"
        name="file"
        accept="image/png,image/jpeg,image/webp"
        required
        className="text-xs text-brand-dark file:mr-2 file:rounded-full file:border-0 file:bg-white file:px-3 file:py-1 file:text-xs file:font-semibold file:text-brand-dark"
      />
      <SubmitButton />
      {!hasTemplate ? <span className="text-xs text-red-700">No template yet</span> : null}
    </form>
  );
}
