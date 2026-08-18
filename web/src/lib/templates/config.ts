// Per-property voucher template config — the client Canvas preview (Phase 1)
// and the server export engine (Phase 3) both draw from this.
//
// Field positions live in properties.template_config (Admin-editable via
// the drag-and-drop layout editor, app/admin/template/[propertyId] — see
// supabase/migrations/0011). DEFAULT_FIELDS/DEFAULT_BREAKFAST_CHECKBOX/
// DEFAULT_SIGNATURE_FIELD below are just the fallback for a property that
// hasn't had its layout customized yet (e.g. right after Admin uploads a
// template image) — buildTemplateConfig merges the two.

export type VoucherTextFieldKey =
  | "running_no"
  | "room_type_nights"
  | "validity_range"
  | "blackout_text"
  | "approver_position"
  | "approved_date";

export interface TemplateTextField {
  key: VoucherTextFieldKey;
  xPct: number;
  yPct: number;
  sizePct: number;
  color: string;
  align: "left" | "center" | "right";
  maxWidthPct: number;
  /** Maps to registered Agrandir weights (300 Light / 400 Regular / 700 Bold). Defaults to 700. */
  weight?: 300 | 400 | 700;
  /** If set, shrinks below sizePct (down to this floor) before falling back to ellipsis truncation. */
  minSizePct?: number;
  /** For multi-line fields (currently just blackout_text). */
  maxLines?: number;
  lineHeightPct?: number;
}

export interface BreakfastCheckboxConfig {
  includedXPct: number;
  notIncludedXPct: number;
  yPct: number;
  radiusPct: number;
  color: string;
}

export interface SignatureFieldConfig {
  /** Left edge of the signature box. */
  xPct: number;
  /** Bottom edge of the box — the blank line the signature sits on top of. */
  yPct: number;
  maxWidthPct: number;
  maxHeightPct: number;
}

export interface TemplateConfig {
  propertyCode: string;
  propertyName: string;
  /** Path under /public, or a full URL (Admin-uploaded templates live in Supabase Storage). */
  imagePath: string;
  canvasSize: { width: number; height: number };
  fields: TemplateTextField[];
  breakfastCheckbox: BreakfastCheckboxConfig;
  signatureField: SignatureFieldConfig;
}

/** Shape stored in properties.template_config (supabase/migrations/0009, 0011). Everything but the image is optional — a fresh upload has no layout yet. */
export interface TemplateConfigJson {
  imagePath?: string;
  canvasWidth?: number;
  canvasHeight?: number;
  fields?: TemplateTextField[];
  breakfastCheckbox?: BreakfastCheckboxConfig;
  signatureField?: SignatureFieldConfig;
}

// Pixel-sampled 2026-08-13 off the redesigned LDBS/LDCH templates (both
// 1713x1713, sharing one layout at the time) — see git history for the
// throwaway node-canvas crop script used to find these, if a differently
// laid out template ever needs re-deriving them as a new starting point.
export const DEFAULT_FIELDS: TemplateTextField[] = [
  {
    // Bold, ~24px at native 1713px resolution. yPct is the text *baseline*,
    // pixel-matched to the "No." label's own baseline so both sit on the
    // same line despite the size difference.
    key: "running_no",
    xPct: 0.358,
    yPct: 0.2855,
    sizePct: 0.014,
    weight: 700,
    color: "#FFFFFF",
    align: "left",
    maxWidthPct: 0.125,
  },
  {
    // Light, ~28px at native 1713px resolution. Shrinks down to ~19px
    // before ellipsis-truncating, since 3 room types + nights can run long.
    key: "room_type_nights",
    xPct: 0.153,
    yPct: 0.363,
    sizePct: 0.0163,
    minSizePct: 0.011,
    weight: 300,
    color: "#FFFFFF",
    align: "left",
    maxWidthPct: 0.31,
  },
  {
    // Light, ~28px at native 1713px resolution. Shrinks down before
    // ellipsis-truncating — "from [date] until [date]" runs long for
    // full month names on both ends.
    key: "validity_range",
    xPct: 0.127,
    yPct: 0.4507,
    sizePct: 0.0163,
    minSizePct: 0.012,
    weight: 300,
    color: "#FFFFFF",
    align: "left",
    maxWidthPct: 0.336,
  },
  {
    // Light, ~21px at native 1713px resolution, max 2 lines.
    key: "blackout_text",
    xPct: 0.127,
    yPct: 0.472,
    sizePct: 0.01226,
    weight: 300,
    color: "#FFFFFF",
    align: "left",
    // Matches validity_range's maxWidthPct so the blackout note never runs
    // wider than the Validity line above it.
    maxWidthPct: 0.336,
    maxLines: 2,
    lineHeightPct: 0.0185,
  },
  {
    // Sits directly on the second "Approved by" blank line, above the
    // template's own static "(Date)" caption. minSizePct added after a real
    // approval showed "18 August 2026" ellipsis-truncating to "18 August
    // 20…" — this slot is much narrower (maxWidthPct 0.1) than
    // validity_range's, so it needs to shrink-to-fit like the other
    // free-text fields instead of just truncating at a fixed size. Paired
    // with formatVoucherDateShort (abbreviated month) so it rarely needs to
    // shrink much at all.
    key: "approved_date",
    xPct: 0.4116,
    yPct: 0.54,
    sizePct: 0.014,
    minSizePct: 0.011,
    weight: 400,
    color: "#FFFFFF",
    align: "center",
    maxWidthPct: 0.1,
  },
  {
    // Fills the spot the old "(Property Leader)" static label used to
    // occupy — that label was removed from the redesigned template
    // (2026-08-13) so it can show the *real* approver's title instead.
    key: "approver_position",
    xPct: 0.2568,
    yPct: 0.5586,
    sizePct: 0.011,
    weight: 400,
    color: "#FFFFFF",
    align: "center",
    maxWidthPct: 0.17,
    // Titles like "Cluster General Manager South East Asia" don't fit on
    // one line at this width — wrap instead of ellipsis-truncating.
    // align: "center" (above) already centers each wrapped line, not just
    // the block as a whole, since drawWrappedText re-centers per line.
    maxLines: 2,
    lineHeightPct: 0.0154,
  },
];

export const DEFAULT_BREAKFAST_CHECKBOX: BreakfastCheckboxConfig = {
  includedXPct: 0.2166,
  notIncludedXPct: 0.3339,
  yPct: 0.4063,
  radiusPct: 0.0128,
  // Sampled from the real voucher example — Included shows a green
  // checkmark, not the dark one on the blank base template.
  color: "#2FA84F",
};

// Square, not the original wide rectangle — updated 2026-08-13 to match
// LDBS's box (dragged/saved via the layout editor), once approver
// signature photos standardized on a square (2000x2000) source. A square
// box lets a square-cropped signature fill it fully instead of only ever
// being height-constrained inside a wide box, per PRD §6.2's own
// admin-editable-without-redeploy intent — see supabase/migrations/0011.
export const DEFAULT_SIGNATURE_FIELD: SignatureFieldConfig = {
  xPct: 0.2135,
  yPct: 0.557,
  maxWidthPct: 0.09,
  maxHeightPct: 0.09,
};

/**
 * Combines a property's DB-stored template_config with code-level
 * defaults for anything Admin hasn't customized yet via the layout editor.
 * Returns null if no template image has been uploaded at all.
 */
export function buildTemplateConfig(
  code: string,
  name: string,
  raw: TemplateConfigJson | null | undefined,
): TemplateConfig | null {
  if (!raw?.imagePath || !raw.canvasWidth || !raw.canvasHeight) return null;

  return {
    propertyCode: code,
    propertyName: name,
    imagePath: raw.imagePath,
    canvasSize: { width: raw.canvasWidth, height: raw.canvasHeight },
    fields: raw.fields ?? DEFAULT_FIELDS,
    breakfastCheckbox: raw.breakfastCheckbox ?? DEFAULT_BREAKFAST_CHECKBOX,
    signatureField: raw.signatureField ?? DEFAULT_SIGNATURE_FIELD,
  };
}
