"use client";

import type { CatalogRoomType } from "@/lib/voucher/catalog";
import { ChevronDownIcon } from "@/components/ui/ChevronDownIcon";

interface RoomTypeMultiSelectProps {
  options: CatalogRoomType[];
  selected: number[];
  onChange: (next: number[]) => void;
  max: number;
}

// PRD §5: real data shows a single voucher can select more than one room
// type, so this is a checkbox multi-select (not the single dropdown in the
// original mockup) — capped at `max` per voucher. Selection is by
// room_types.id (PRD §8: vouchers.room_type_ids) rather than name.
export function RoomTypeMultiSelect({ options, selected, onChange, max }: RoomTypeMultiSelectProps) {
  const limitReached = selected.length >= max;
  const selectedNames = options
    .filter((option) => selected.includes(option.id))
    .map((option) => option.name);

  function toggle(id: number) {
    if (selected.includes(id)) {
      onChange(selected.filter((item) => item !== id));
    } else if (!limitReached) {
      onChange([...selected, id]);
    }
  }

  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-full bg-white px-5 py-3 text-brand-dark marker:content-none">
        <span className={selectedNames.length ? "" : "text-brand-dark/40"}>
          {selectedNames.length ? selectedNames.join(", ") : "Select room type(s)"}
        </span>
        <ChevronDownIcon className="h-3 w-3 shrink-0 text-brand-dark/50 transition-transform group-open:rotate-180" />
      </summary>
      <div className="absolute z-10 mt-2 w-full rounded-2xl bg-white p-2 shadow-lg">
        <p className="px-3 pb-1 text-xs text-brand-dark/50">
          {selected.length}/{max} selected — max {max}
        </p>
        {options.map((option) => {
          const checked = selected.includes(option.id);
          const disabled = !checked && limitReached;
          return (
            <label
              key={option.id}
              className={[
                "flex items-center gap-3 rounded-xl px-3 py-2",
                disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:bg-brand-lime/20",
              ].join(" ")}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(option.id)}
                className="h-4 w-4 accent-brand-orange"
              />
              <span className="text-brand-dark">{option.name}</span>
            </label>
          );
        })}
      </div>
    </details>
  );
}
