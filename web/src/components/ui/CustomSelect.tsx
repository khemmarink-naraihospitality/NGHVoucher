"use client";

import { useRef } from "react";
import { ChevronDownIcon } from "@/components/ui/ChevronDownIcon";

export interface CustomSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface CustomSelectProps {
  options: CustomSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
  /** Shared across a group of CustomSelects (e.g. several filters in one row) so the browser auto-closes the others when one opens — native <details name> behavior. */
  name?: string;
}

const DEFAULT_SUMMARY_CLASS =
  "flex cursor-pointer list-none items-center justify-between rounded-full bg-white px-4 py-3 text-brand-dark marker:content-none";

// Single-select counterpart to RoomTypeMultiSelect.tsx — same <details>/
// <summary> pattern and chevron icon, so every dropdown in the app looks
// and behaves the same way. Unlike that component (checkboxes, stays open
// for multi-pick), a single choice here closes the panel immediately.
export function CustomSelect({ options, value, onChange, placeholder, className, name }: CustomSelectProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const selected = options.find((option) => option.value === value);

  return (
    <details ref={detailsRef} name={name} className="group relative">
      <summary className={className ?? DEFAULT_SUMMARY_CLASS}>
        <span className={["min-w-0 truncate", selected ? "" : "text-brand-dark/40"].join(" ")}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDownIcon className="h-3 w-3 shrink-0 text-brand-dark/50 transition-transform group-open:rotate-180" />
      </summary>
      <div className="absolute z-20 mt-2 max-h-64 w-max min-w-full max-w-xs overflow-y-auto rounded-2xl bg-white p-2 shadow-lg">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={option.disabled}
            onClick={() => {
              onChange(option.value);
              detailsRef.current?.removeAttribute("open");
            }}
            className={[
              "block w-full whitespace-nowrap rounded-xl px-3 py-2 text-left text-brand-dark",
              option.value === value ? "bg-brand-lime/30 font-semibold" : "",
              option.disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:bg-brand-lime/20",
            ].join(" ")}
          >
            {option.label}
          </button>
        ))}
      </div>
    </details>
  );
}
