"use client";

import { useState, useTransition } from "react";
import { deleteRoomType, toggleRoomTypeActive, updateRoomType } from "@/app/admin/actions";
import { ConfirmSubmitForm } from "@/components/admin/ConfirmSubmitForm";

interface RoomTypeRowProps {
  id: number;
  name: string;
  isActive: boolean;
}

export function RoomTypeRow({ id, name, isActive }: RoomTypeRowProps) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSave(formData: FormData) {
    startTransition(async () => {
      await updateRoomType(formData);
      setEditing(false);
    });
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 text-sm text-brand-dark">
      {editing ? (
        <form action={handleSave} className="flex min-w-0 flex-1 items-center gap-1.5">
          <input type="hidden" name="id" value={id} />
          <input
            name="name"
            defaultValue={name}
            required
            autoFocus
            disabled={pending}
            className="min-w-0 flex-1 rounded-full bg-white px-2.5 py-1 text-sm text-brand-dark disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={pending}
            className="shrink-0 text-xs font-semibold text-brand-dark/60 underline disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={pending}
            className="shrink-0 text-xs text-brand-dark/40 underline disabled:opacity-50"
          >
            Cancel
          </button>
        </form>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className={["truncate", isActive ? "" : "text-brand-dark/40 line-through"].join(" ")}>{name}</span>
          <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-xs underline text-brand-dark/60">
            Edit
          </button>
        </div>
      )}
      <div className="flex shrink-0 items-center gap-3">
        <form action={toggleRoomTypeActive}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="nextActive" value={(!isActive).toString()} />
          <button type="submit" className="text-xs underline text-brand-dark/60">
            {isActive ? "Deactivate" : "Activate"}
          </button>
        </form>
        <ConfirmSubmitForm
          action={deleteRoomType}
          confirmMessage={`Delete "${name}"? This can't be undone.`}
          hiddenFields={{ id }}
          buttonLabel="Delete"
        />
      </div>
    </li>
  );
}
