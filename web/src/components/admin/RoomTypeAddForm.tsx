"use client";

import { useState } from "react";
import { addRoomType } from "@/app/admin/actions";
import { ROOM_TYPE_PRESETS } from "@/lib/voucher/roomTypePresets";

export function RoomTypeAddForm({ propertyId }: { propertyId: number }) {
  const [name, setName] = useState("");

  return (
    <div className="mt-2 space-y-2">
      <form action={addRoomType} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="propertyId" value={propertyId} />
        <input
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Room type name"
          required
          className="min-w-[180px] flex-1 rounded-full bg-white px-3 py-1.5 text-sm text-brand-dark"
        />
        <button
          type="submit"
          className="rounded-full bg-brand-dark/10 px-3 py-1.5 text-xs font-semibold text-brand-dark"
        >
          Add
        </button>
      </form>
      {/* Presets are a one-click shortcut for common names, not a locked
          list — the text field above always takes any custom name. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-dark/40">Quick add:</span>
        {ROOM_TYPE_PRESETS.map((preset) => (
          <form key={preset} action={addRoomType}>
            <input type="hidden" name="propertyId" value={propertyId} />
            <input type="hidden" name="name" value={preset} />
            <button
              type="submit"
              className="rounded-full bg-white px-2.5 py-1 text-xs text-brand-dark/70 hover:bg-brand-dark/5"
            >
              {preset}
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
