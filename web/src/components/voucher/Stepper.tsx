"use client";

interface StepperProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  suffix: string;
  onChange: (value: number) => void;
  hint?: string;
}

export function Stepper({ label, value, min = 1, max = 99, suffix, onChange, hint }: StepperProps) {
  const decrement = () => onChange(Math.max(min, value - 1));
  const increment = () => onChange(Math.min(max, value + 1));

  return (
    <div>
      <label className="block font-semibold text-brand-dark">{label}</label>
      {hint ? <p className="text-sm text-brand-dark/70 mt-0.5">{hint}</p> : null}
      <div className="mt-2 inline-flex items-center gap-3 rounded-full bg-white px-2 py-2">
        <button
          type="button"
          onClick={decrement}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
          className="h-8 w-8 rounded-full border border-brand-dark/20 text-brand-dark disabled:opacity-30"
        >
          –
        </button>
        <span className="min-w-[6ch] text-center font-medium text-brand-dark">
          {value} {suffix}
        </span>
        <button
          type="button"
          onClick={increment}
          disabled={value >= max}
          aria-label={`Increase ${label}`}
          className="h-8 w-8 rounded-full border border-brand-dark/20 text-brand-dark disabled:opacity-30"
        >
          +
        </button>
      </div>
    </div>
  );
}
