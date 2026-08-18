"use client";

import { DEFAULT_BLACKOUT_TEXT, MAX_ROOM_TYPES, PURPOSE_OPTIONS, type VoucherFormState } from "@/lib/voucher/types";
import type { CatalogApprover, CatalogRoomType } from "@/lib/voucher/catalog";
import { Stepper } from "./Stepper";
import { RoomTypeMultiSelect } from "./RoomTypeMultiSelect";
import { DateRangeCalendar } from "./DateRangeCalendar";
import { BreakfastToggle } from "./BreakfastToggle";
import { formatVoucherDate } from "@/lib/voucher/format";
import { CustomSelect } from "@/components/ui/CustomSelect";

const NOTE_MAX_LENGTH = 200;
const BLACKOUT_MAX_LENGTH = 160;

interface CreateVoucherFormProps {
  state: VoucherFormState;
  roomTypeOptions: CatalogRoomType[];
  approverOptions: CatalogApprover[];
  onChange: (next: VoucherFormState) => void;
  onSubmit: () => void;
  submitting: boolean;
}

export function CreateVoucherForm({
  state,
  roomTypeOptions,
  approverOptions,
  onChange,
  onSubmit,
  submitting,
}: CreateVoucherFormProps) {
  function update<K extends keyof VoucherFormState>(key: K, value: VoucherFormState[K]) {
    onChange({ ...state, [key]: value });
  }

  const canSubmit =
    state.roomTypeIds.length > 0 &&
    !!state.validityStart &&
    !!state.validityEnd &&
    !!state.approverId &&
    !!state.purpose;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="space-y-6"
    >
      <div>
        <label className="block font-semibold text-brand-dark">Item Name</label>
        <input
          type="text"
          value={state.itemName}
          placeholder="e.g. GoxSomeday (KOLs)"
          onChange={(event) => update("itemName", event.target.value)}
          className="mt-2 w-full rounded-full bg-white px-4 py-3 text-brand-dark placeholder:text-brand-dark/40"
        />
        <p className="mt-1 text-xs text-brand-dark/60">Campaign/batch name — groups vouchers issued together.</p>
      </div>

      <div>
        <label className="block font-semibold text-brand-dark">Room Type:</label>
        <div className="mt-2">
          <RoomTypeMultiSelect
            options={roomTypeOptions}
            selected={state.roomTypeIds}
            onChange={(next) => update("roomTypeIds", next)}
            max={MAX_ROOM_TYPES}
          />
        </div>
      </div>

      <Stepper
        label="Number of Nights:"
        value={state.nights}
        min={1}
        max={14}
        suffix={state.nights === 1 ? "Night" : "Nights"}
        onChange={(value) => update("nights", value)}
      />

      <Stepper
        label="Number of Vouchers:"
        hint="This issue is related to the number of vouchers clicked at once."
        value={state.voucherCount}
        min={1}
        max={50}
        suffix="VCs"
        onChange={(value) => update("voucherCount", value)}
      />

      <div>
        <label className="block font-semibold text-brand-dark">Breakfast Option:</label>
        <div className="mt-2">
          <BreakfastToggle
            included={state.breakfastIncluded}
            onChange={(value) => update("breakfastIncluded", value)}
          />
        </div>
      </div>

      <div>
        <label className="block font-semibold text-brand-dark">Validity:</label>
        <p className="mt-1 text-brand-dark">
          {state.validityStart && state.validityEnd ? (
            <>
              from <strong>{formatVoucherDate(state.validityStart)}</strong> untill{" "}
              <strong>{formatVoucherDate(state.validityEnd)}</strong>
            </>
          ) : (
            <span className="text-brand-dark/60">Select a start and end date below</span>
          )}
        </p>
        <div className="mt-2">
          <DateRangeCalendar
            startDate={state.validityStart}
            endDate={state.validityEnd}
            onChange={(start, end) => onChange({ ...state, validityStart: start, validityEnd: end })}
          />
        </div>
      </div>

      <div>
        <label className="block font-semibold text-brand-dark">Blackout Date:</label>
        <div className="mt-2 flex items-center gap-6 text-brand-dark">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="blackoutType"
              checked={state.blackoutType === "default"}
              onChange={() => onChange({ ...state, blackoutType: "default", blackoutText: DEFAULT_BLACKOUT_TEXT })}
              className="h-4 w-4 accent-brand-orange"
            />
            Default
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="blackoutType"
              checked={state.blackoutType === "custom"}
              onChange={() => onChange({ ...state, blackoutType: "custom", blackoutText: "" })}
              className="h-4 w-4 accent-brand-orange"
            />
            Custom
          </label>
        </div>
        <textarea
          value={state.blackoutText}
          disabled={state.blackoutType === "default"}
          maxLength={BLACKOUT_MAX_LENGTH}
          onChange={(event) => update("blackoutText", event.target.value)}
          rows={2}
          className="mt-2 w-full rounded-2xl bg-white p-3 text-brand-dark disabled:opacity-70"
        />
        <p className="mt-1 text-sm text-brand-dark/70">Keep the text brief; it will be in the validity section.</p>
      </div>

      <div>
        <label className="block font-semibold text-brand-dark">Purpose:</label>
        <div className="mt-2">
          <CustomSelect
            options={PURPOSE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            value={state.purpose}
            onChange={(value) => update("purpose", value as VoucherFormState["purpose"])}
            placeholder="Select purpose"
            className="flex w-full cursor-pointer list-none items-center justify-between rounded-full bg-white py-3 pl-4 pr-8 text-brand-dark marker:content-none"
          />
        </div>
      </div>

      <div>
        <label className="block font-semibold text-brand-dark">Send for Approval:</label>
        <div className="mt-2">
          <CustomSelect
            options={approverOptions.map((approver) => ({ value: String(approver.id), label: approver.name }))}
            value={state.approverId}
            onChange={(value) => update("approverId", value)}
            placeholder="Select approver"
            className="flex w-full cursor-pointer list-none items-center justify-between rounded-full bg-white py-3 pl-4 pr-8 text-brand-dark marker:content-none"
          />
        </div>
      </div>

      <div>
        <label className="block font-semibold text-brand-dark">Note</label>
        <textarea
          value={state.note}
          maxLength={NOTE_MAX_LENGTH}
          placeholder="Optional"
          onChange={(event) => update("note", event.target.value)}
          rows={3}
          className="mt-2 w-full rounded-2xl bg-white p-3 text-brand-dark placeholder:text-brand-dark/40"
        />
        <p className="mt-1 text-right text-xs text-brand-dark/50">
          {state.note.length}/{NOTE_MAX_LENGTH}
        </p>
      </div>

      <div>
        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="w-full rounded-full bg-brand-orange py-4 font-semibold text-white transition-opacity disabled:opacity-50"
        >
          {submitting ? "Sending…" : "Send request for approval"}
        </button>
        <p className="mt-2 text-center text-sm text-brand-dark/70">
          This will trigger an email notification to the approver.
        </p>
      </div>
    </form>
  );
}
