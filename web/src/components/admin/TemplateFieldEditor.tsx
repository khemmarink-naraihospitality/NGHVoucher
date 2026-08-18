"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildTemplateConfig,
  DEFAULT_BREAKFAST_CHECKBOX,
  DEFAULT_FIELDS,
  DEFAULT_SIGNATURE_FIELD,
  type BreakfastCheckboxConfig,
  type SignatureFieldConfig,
  type TemplateTextField,
  type VoucherTextFieldKey,
} from "@/lib/templates/config";
import { VoucherCanvasPreview } from "@/components/voucher/VoucherCanvasPreview";
import { updateTemplateLayout } from "@/app/admin/actions";
import { CustomSelect } from "@/components/ui/CustomSelect";

// Realistic stand-in content so font shrinking/wrapping/truncation behaves
// the same way here as it would on a real voucher — an empty/short sample
// would make fields look like they have more room than they really do.
const SAMPLE_VOUCHER = {
  runningNo: "26/LDCH099",
  roomTypeNightsLabel: "The Duo | King, The Compact | 2 nights",
  breakfastIncluded: true,
  validityLabel: "from 10 August 2026 until 28 February 2027",
  blackoutText: "Blackout: Weekend, and Public Holiday, Please contact the reservation team for more information",
  approverPosition: "Property Leader",
  approvedDateLabel: "6 Aug 2026",
};

const FIELD_LABELS: Record<VoucherTextFieldKey, string> = {
  running_no: "Running No.",
  room_type_nights: "Room Type / Nights",
  validity_range: "Validity",
  blackout_text: "Blackout",
  approver_position: "Approver Position",
  approved_date: "Approved Date",
};

type SelectionKey = VoucherTextFieldKey | "__signature__" | "__breakfast_included__" | "__breakfast_not_included__";

interface SampleSignature {
  id: number;
  name: string;
  signatureUrl: string;
}

interface TemplateFieldEditorProps {
  propertyId: number;
  propertyCode: string;
  propertyName: string;
  imagePath: string;
  canvasWidth: number;
  canvasHeight: number;
  initialFields: TemplateTextField[];
  initialBreakfastCheckbox: BreakfastCheckboxConfig;
  initialSignatureField: SignatureFieldConfig;
  /** Every approver with a real uploaded signature — picked from in the UI, since shape/size varies per person. */
  sampleSignatures: SampleSignature[];
}

/** Drags a handle by percentage of the given container — shared by every draggable element below. */
function usePercentDrag(
  containerRef: React.RefObject<HTMLDivElement | null>,
  onDrag: (xPct: number, yPct: number) => void,
) {
  const draggingRef = useRef(false);

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    draggingRef.current = true;
  }, []);

  useEffect(() => {
    function handleMove(event: PointerEvent) {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const xPct = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      const yPct = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
      onDrag(xPct, yPct);
    }
    function handleUp() {
      draggingRef.current = false;
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [containerRef, onDrag]);

  return onPointerDown;
}

export function TemplateFieldEditor({
  propertyId,
  propertyCode,
  propertyName,
  imagePath,
  canvasWidth,
  canvasHeight,
  initialFields,
  initialBreakfastCheckbox,
  initialSignatureField,
  sampleSignatures,
}: TemplateFieldEditorProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  const [fields, setFields] = useState(initialFields);
  const [breakfastCheckbox, setBreakfastCheckbox] = useState(initialBreakfastCheckbox);
  const [signatureField, setSignatureField] = useState(initialSignatureField);
  const [selected, setSelected] = useState<SelectionKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [previewSignatureId, setPreviewSignatureId] = useState<number | null>(sampleSignatures[0]?.id ?? null);

  const previewSignatureUrl = sampleSignatures.find((s) => s.id === previewSignatureId)?.signatureUrl;

  function updateField(key: VoucherTextFieldKey, patch: Partial<TemplateTextField>) {
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  }

  const template = buildTemplateConfig(propertyCode, propertyName, {
    imagePath,
    canvasWidth,
    canvasHeight,
    fields,
    breakfastCheckbox,
    signatureField,
  });

  async function handleSave() {
    setSaving(true);
    const { error } = await updateTemplateLayout(propertyId, fields, breakfastCheckbox, signatureField);
    setSaving(false);
    if (!error) {
      setSavedAt(Date.now());
      router.refresh();
    }
  }

  function handleReset() {
    setFields(DEFAULT_FIELDS);
    setBreakfastCheckbox(DEFAULT_BREAKFAST_CHECKBOX);
    setSignatureField(DEFAULT_SIGNATURE_FIELD);
    setSelected(null);
  }

  if (!template) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <p className="mb-2 text-xs text-brand-dark/60">
          Dots mark each field. Click one to select it (shows its label + the fine-tune panel), then drag to
          reposition.
        </p>

        {sampleSignatures.length > 0 ? (
          <label className="mb-2 flex items-center gap-2 text-xs text-brand-dark">
            Preview signature:
            <CustomSelect
              options={sampleSignatures.map((s) => ({ value: String(s.id), label: s.name }))}
              value={previewSignatureId != null ? String(previewSignatureId) : ""}
              onChange={(value) => setPreviewSignatureId(value ? Number(value) : null)}
              placeholder="Select signature"
              className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-full bg-white py-1 pl-3 pr-6 text-xs text-brand-dark marker:content-none"
            />
          </label>
        ) : (
          <p className="mb-2 text-xs text-red-700">
            No approver has an uploaded signature yet — the box will preview empty until one does.
          </p>
        )}

        <div
          ref={containerRef}
          className="relative mx-auto w-full max-w-[700px] select-none"
          style={{ aspectRatio: `${canvasWidth} / ${canvasHeight}` }}
        >
          <VoucherCanvasPreview
            template={template}
            voucher={SAMPLE_VOUCHER}
            signatureImageUrl={previewSignatureUrl}
            watermark={false}
            className="absolute inset-0 h-full w-full rounded-3xl shadow-xl"
          />

          {fields.map((field) => (
            <FieldHandle
              key={field.key}
              label={FIELD_LABELS[field.key]}
              xPct={field.xPct}
              yPct={field.yPct}
              selected={selected === field.key}
              containerRef={containerRef}
              onSelect={() => setSelected(field.key)}
              onMove={(xPct, yPct) => updateField(field.key, { xPct, yPct })}
            />
          ))}

          <FieldHandle
            label="Breakfast: Included"
            xPct={breakfastCheckbox.includedXPct}
            yPct={breakfastCheckbox.yPct}
            selected={selected === "__breakfast_included__"}
            containerRef={containerRef}
            onSelect={() => setSelected("__breakfast_included__")}
            onMove={(xPct, yPct) => setBreakfastCheckbox((prev) => ({ ...prev, includedXPct: xPct, yPct }))}
          />
          <FieldHandle
            label="Breakfast: Not Included"
            xPct={breakfastCheckbox.notIncludedXPct}
            yPct={breakfastCheckbox.yPct}
            selected={selected === "__breakfast_not_included__"}
            containerRef={containerRef}
            onSelect={() => setSelected("__breakfast_not_included__")}
            onMove={(xPct, yPct) => setBreakfastCheckbox((prev) => ({ ...prev, notIncludedXPct: xPct, yPct }))}
          />

          <SignatureHandle
            signatureField={signatureField}
            selected={selected === "__signature__"}
            containerRef={containerRef}
            onSelect={() => setSelected("__signature__")}
            onMove={(xPct, yPct) => setSignatureField((prev) => ({ ...prev, xPct, yPct }))}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-full bg-brand-orange px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save layout"}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-full bg-brand-dark/10 px-4 py-2 text-sm font-semibold text-brand-dark"
          >
            Reset to defaults
          </button>
          {savedAt ? <span className="text-xs text-green-700">Saved.</span> : null}
        </div>
      </div>

      <FieldInspector
        selected={selected}
        fields={fields}
        breakfastCheckbox={breakfastCheckbox}
        signatureField={signatureField}
        onFieldChange={updateField}
        onBreakfastChange={(patch) => setBreakfastCheckbox((prev) => ({ ...prev, ...patch }))}
        onSignatureChange={(patch) => setSignatureField((prev) => ({ ...prev, ...patch }))}
      />
    </div>
  );
}

/**
 * A small dot at (xPct, yPct) — used for every point-anchored field
 * (text fields and the two breakfast checkmarks). Unselected, it's just a
 * dot (with a native title tooltip for a free hover hint); selected, it
 * also shows its label so multiple close-together fields don't turn into
 * an unreadable pile of overlapping text.
 */
function FieldHandle({
  label,
  xPct,
  yPct,
  selected,
  containerRef,
  onSelect,
  onMove,
}: {
  label: string;
  xPct: number;
  yPct: number;
  selected: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onSelect: () => void;
  onMove: (xPct: number, yPct: number) => void;
}) {
  const onPointerDown = usePercentDrag(containerRef, onMove);

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${xPct * 100}%`, top: `${yPct * 100}%`, zIndex: selected ? 20 : 10 }}
    >
      <div
        title={label}
        onPointerDown={(event) => {
          onSelect();
          onPointerDown(event);
        }}
        className={[
          "h-3.5 w-3.5 cursor-grab rounded-full border-2 shadow active:cursor-grabbing",
          selected ? "border-brand-orange bg-brand-orange" : "border-white bg-black/50",
        ].join(" ")}
      />
      {selected ? (
        <span className="absolute top-1/2 left-full ml-1.5 -translate-y-1/2 whitespace-nowrap rounded bg-brand-orange px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {label}
        </span>
      ) : null}
    </div>
  );
}

function SignatureHandle({
  signatureField,
  selected,
  containerRef,
  onSelect,
  onMove,
}: {
  signatureField: SignatureFieldConfig;
  selected: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onSelect: () => void;
  onMove: (xPct: number, yPct: number) => void;
}) {
  const onPointerDown = usePercentDrag(containerRef, onMove);

  return (
    <div
      onPointerDown={(event) => {
        onSelect();
        onPointerDown(event);
      }}
      className={[
        "absolute flex cursor-grab items-start justify-start rounded active:cursor-grabbing",
        selected ? "border-2 border-brand-orange bg-brand-orange/10" : "border border-dashed border-white/60",
      ].join(" ")}
      style={{
        left: `${signatureField.xPct * 100}%`,
        // Top edge of the box — yPct is the *bottom* edge (the blank line
        // it sits on), so subtract the height. No extra translate on top
        // of this: that was the bug (double-shifted the box upward).
        top: `${(signatureField.yPct - signatureField.maxHeightPct) * 100}%`,
        width: `${signatureField.maxWidthPct * 100}%`,
        height: `${signatureField.maxHeightPct * 100}%`,
        zIndex: selected ? 20 : 5,
      }}
    >
      {selected ? (
        <span className="-translate-y-full whitespace-nowrap rounded bg-brand-orange px-1.5 py-0.5 text-[10px] font-semibold text-white">
          Signature
        </span>
      ) : null}
    </div>
  );
}

interface FieldInspectorProps {
  selected: SelectionKey | null;
  fields: TemplateTextField[];
  breakfastCheckbox: BreakfastCheckboxConfig;
  signatureField: SignatureFieldConfig;
  onFieldChange: (key: VoucherTextFieldKey, patch: Partial<TemplateTextField>) => void;
  onBreakfastChange: (patch: Partial<BreakfastCheckboxConfig>) => void;
  onSignatureChange: (patch: Partial<SignatureFieldConfig>) => void;
}

function NumberRow({
  label,
  value,
  step = 0.001,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs text-brand-dark">
      {label}
      <input
        type="number"
        step={step}
        value={Number(value.toFixed(4))}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-24 rounded-full bg-white px-2 py-1 text-right"
      />
    </label>
  );
}

function FieldInspector({
  selected,
  fields,
  breakfastCheckbox,
  signatureField,
  onFieldChange,
  onBreakfastChange,
  onSignatureChange,
}: FieldInspectorProps) {
  if (!selected) {
    return (
      <div className="rounded-2xl bg-brand-dark/5 p-4 text-sm text-brand-dark/60">
        Click a dot on the preview to select it — hover any dot to see what it is without clicking. Selecting
        shows its label on the canvas and its fine-tune controls here; drag the dot to reposition.
      </div>
    );
  }

  if (selected === "__signature__") {
    return (
      <div className="space-y-2 rounded-2xl bg-brand-lime/20 p-4">
        <p className="text-sm font-semibold text-brand-dark">Signature box</p>
        <NumberRow
          label="Max width (%)"
          value={signatureField.maxWidthPct}
          onChange={(v) => onSignatureChange({ maxWidthPct: v })}
        />
        <NumberRow
          label="Max height (%)"
          value={signatureField.maxHeightPct}
          onChange={(v) => onSignatureChange({ maxHeightPct: v })}
        />
      </div>
    );
  }

  if (selected === "__breakfast_included__" || selected === "__breakfast_not_included__") {
    return (
      <div className="space-y-2 rounded-2xl bg-brand-lime/20 p-4">
        <p className="text-sm font-semibold text-brand-dark">Breakfast checkmark</p>
        <NumberRow label="Radius (%)" value={breakfastCheckbox.radiusPct} onChange={(v) => onBreakfastChange({ radiusPct: v })} />
        <label className="flex items-center justify-between gap-2 text-xs text-brand-dark">
          Color
          <input
            type="color"
            value={breakfastCheckbox.color}
            onChange={(event) => onBreakfastChange({ color: event.target.value })}
            className="h-7 w-12 rounded"
          />
        </label>
      </div>
    );
  }

  const field = fields.find((f) => f.key === selected);
  if (!field) return null;

  return (
    <div className="space-y-2 rounded-2xl bg-brand-lime/20 p-4">
      <p className="text-sm font-semibold text-brand-dark">{FIELD_LABELS[field.key]}</p>
      <NumberRow label="Font size (%)" value={field.sizePct} onChange={(v) => onFieldChange(field.key, { sizePct: v })} />
      <NumberRow label="Min font size (%)" value={field.minSizePct ?? field.sizePct} onChange={(v) => onFieldChange(field.key, { minSizePct: v })} />
      <NumberRow label="Max width (%)" value={field.maxWidthPct} onChange={(v) => onFieldChange(field.key, { maxWidthPct: v })} />
      <label className="flex items-center justify-between gap-2 text-xs text-brand-dark">
        Color
        <input
          type="color"
          value={field.color}
          onChange={(event) => onFieldChange(field.key, { color: event.target.value })}
          className="h-7 w-12 rounded"
        />
      </label>
      <label className="flex items-center justify-between gap-2 text-xs text-brand-dark">
        Align
        <span className="flex gap-1">
          {(["left", "center", "right"] as const).map((align) => (
            <button
              key={align}
              type="button"
              onClick={() => onFieldChange(field.key, { align })}
              className={[
                "rounded-full px-2 py-1 text-[10px] font-semibold",
                field.align === align ? "bg-brand-dark text-white" : "bg-white text-brand-dark/60",
              ].join(" ")}
            >
              {align}
            </button>
          ))}
        </span>
      </label>
      <label className="flex items-center justify-between gap-2 text-xs text-brand-dark">
        Weight
        <CustomSelect
          options={[
            { value: "300", label: "Light" },
            { value: "400", label: "Regular" },
            { value: "700", label: "Bold" },
          ]}
          value={String(field.weight ?? 700)}
          onChange={(value) => onFieldChange(field.key, { weight: Number(value) as 300 | 400 | 700 })}
          placeholder="Weight"
          className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-full bg-white py-1 pl-2 pr-6 text-xs marker:content-none"
        />
      </label>
      {field.key === "blackout_text" ? (
        <>
          <NumberRow
            label="Max lines"
            step={1}
            value={field.maxLines ?? 2}
            onChange={(v) => onFieldChange(field.key, { maxLines: Math.max(1, Math.round(v)) })}
          />
          <NumberRow
            label="Line height (%)"
            value={field.lineHeightPct ?? field.sizePct * 1.3}
            onChange={(v) => onFieldChange(field.key, { lineHeightPct: v })}
          />
        </>
      ) : null}
    </div>
  );
}
