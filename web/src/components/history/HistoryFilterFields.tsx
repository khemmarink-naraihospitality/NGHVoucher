"use client";

import { useState } from "react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { PURPOSE_OPTIONS } from "@/lib/voucher/types";

interface PropertyOption {
  id: number;
  code: string;
  name: string;
}

interface HistoryFilterFieldsProps {
  statuses: readonly string[];
  properties: PropertyOption[];
  initialStatus: string;
  initialProperty: string;
  initialPurpose: string;
}

const FIELD_CLASS =
  "mt-1 flex w-36 cursor-pointer list-none items-center justify-between gap-2 rounded-full bg-white py-2 pl-3 pr-6 text-sm text-brand-dark marker:content-none";

// The surrounding <form> in app/history/page.tsx has no `action` — it's a
// plain native GET submission (filters become URL query params on
// "Filter"). CustomSelect renders no form input itself, so each field pairs
// it with a hidden input carrying the real name/value, same pattern as
// RoleSelect.tsx.
//
// A fixed width (rather than sizing to the selected label) matters here:
// without it, picking a longer option — a long property name vs. "All" —
// changed the pill's own width and shifted every field after it in the
// row. CustomSelect's label span truncates with an ellipsis instead.
export function HistoryFilterFields({
  statuses,
  properties,
  initialStatus,
  initialProperty,
  initialPurpose,
}: HistoryFilterFieldsProps) {
  const [status, setStatus] = useState(initialStatus);
  const [property, setProperty] = useState(initialProperty);
  const [purpose, setPurpose] = useState(initialPurpose);

  return (
    <>
      <div>
        <label className="block text-xs font-semibold text-brand-dark/70">Status</label>
        <input type="hidden" name="status" value={status} />
        <CustomSelect
          name="history-filters"
          options={[{ value: "", label: "All" }, ...statuses.map((s) => ({ value: s, label: s }))]}
          value={status}
          onChange={setStatus}
          placeholder="All"
          className={FIELD_CLASS}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-brand-dark/70">Property</label>
        <input type="hidden" name="property" value={property} />
        <CustomSelect
          name="history-filters"
          options={[
            { value: "", label: "All" },
            ...properties.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` })),
          ]}
          value={property}
          onChange={setProperty}
          placeholder="All"
          className={FIELD_CLASS}
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-brand-dark/70">Purpose</label>
        <input type="hidden" name="purpose" value={purpose} />
        <CustomSelect
          name="history-filters"
          options={[{ value: "", label: "All" }, ...PURPOSE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))]}
          value={purpose}
          onChange={setPurpose}
          placeholder="All"
          className={FIELD_CLASS}
        />
      </div>
    </>
  );
}
