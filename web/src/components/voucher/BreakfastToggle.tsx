"use client";

interface BreakfastToggleProps {
  included: boolean;
  onChange: (included: boolean) => void;
}

export function BreakfastToggle({ included, onChange }: BreakfastToggleProps) {
  return (
    <div className="flex items-center gap-6">
      <RadioOption label="Included" checked={included} onSelect={() => onChange(true)} />
      <RadioOption label="Not Included" checked={!included} onSelect={() => onChange(false)} />
    </div>
  );
}

function RadioOption({
  label,
  checked,
  onSelect,
}: {
  label: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex items-center gap-2 text-brand-dark"
      aria-pressed={checked}
    >
      <span
        className={[
          "flex h-5 w-5 items-center justify-center rounded-full border-2",
          checked ? "border-brand-orange" : "border-brand-dark/30",
        ].join(" ")}
      >
        {checked ? <span className="h-2.5 w-2.5 rounded-full bg-brand-orange" /> : null}
      </span>
      {label}
    </button>
  );
}
