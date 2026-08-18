"use client";

import { useState, useTransition } from "react";
import { sendTestEmail } from "@/app/admin/actions";
import { CustomSelect } from "@/components/ui/CustomSelect";

const KIND_OPTIONS = [
  { value: "generic", label: "Generic SMTP check" },
  { value: "approval", label: "Approval request (to approver)" },
  { value: "issuerApproved", label: "Voucher approved (to issuer)" },
  { value: "issuerRejected", label: "Voucher rejected (to issuer)" },
];

export function EmailTestForm({ defaultTo }: { defaultTo: string }) {
  const [kind, setKind] = useState(KIND_OPTIONS[0].value);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function handleSubmit(formData: FormData) {
    setResult(null);
    startTransition(async () => {
      const { error } = await sendTestEmail(formData);
      setResult(error ? { ok: false, message: error } : { ok: true, message: "Sent — check the inbox." });
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={handleSubmit} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="kind" value={kind} />
        <CustomSelect
          options={KIND_OPTIONS}
          value={kind}
          onChange={setKind}
          placeholder="Which email?"
          className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-full bg-white py-1.5 pl-3 pr-6 text-xs text-brand-dark marker:content-none"
        />
        <input
          name="to"
          type="email"
          defaultValue={defaultTo}
          required
          placeholder="Send test to…"
          className="min-w-[200px] rounded-full bg-white px-3 py-1.5 text-xs text-brand-dark"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand-dark/10 px-3 py-1.5 text-xs font-semibold text-brand-dark disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send test email"}
        </button>
      </form>
      {result ? (
        <span className={["text-xs", result.ok ? "text-green-700" : "text-red-700"].join(" ")}>{result.message}</span>
      ) : null}
    </div>
  );
}
