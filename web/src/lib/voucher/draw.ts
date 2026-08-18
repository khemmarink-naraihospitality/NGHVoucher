import type { TemplateConfig, TemplateTextField, VoucherTextFieldKey } from "../templates/config";

// Structural subset of Canvas2D shared by the browser's
// CanvasRenderingContext2D and node-canvas's context — lets Phase 1's
// client preview and Phase 3's server export call the exact same drawing
// code, which is the whole point of keeping preview/export visually in
// sync (PRD §6.3).
export interface DrawableContext2D {
  // Typed as the union both DOM's CanvasRenderingContext2D and node-canvas's
  // context use, even though we only ever assign plain color strings here.
  fillStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textAlign: "left" | "right" | "center" | "start" | "end";
  textBaseline: string;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineCap: "butt" | "round" | "square";
  lineJoin: "round" | "bevel" | "miter";
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  measureText(text: string): { width: number };
  beginPath(): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  fill(): void;
  stroke(): void;
  // Typed loosely (not DrawableImageSource) for the same reason as the
  // other members here — the DOM and node-canvas's own `drawImage`
  // overloads are structurally incompatible with each other, so this
  // interface can't state a precise common type without one of the two
  // real implementations failing to satisfy it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  drawImage(image: any, dx: number, dy: number, dWidth: number, dHeight: number): void;
}

/** Structural common ground between DOM's HTMLImageElement and node-canvas's Image. */
export interface DrawableImageSource {
  width: number;
  height: number;
}

export interface RenderableVoucher {
  runningNo: string;
  /** Room type(s) plus nights, e.g. "The Upgrade | 1 night" — matches the real voucher layout. */
  roomTypeNightsLabel: string;
  breakfastIncluded: boolean;
  validityLabel: string;
  blackoutText: string;
  /**
   * Approver sign-off — only meaningful once a voucher is actually
   * approved (PRD §4 step 7). Callers should leave these unset for a
   * pending/rejected voucher; the "Approved by" line stays blank the same
   * way it always did when no approver was known yet.
   */
  approverPosition?: string;
  approvedDateLabel?: string;
  /** Already-loaded image (caller loads it — keeps this function synchronous, same as the base template image). */
  signatureImage?: DrawableImageSource;
}

// Safety-net only — both real callers (VoucherCanvasPreview, the POC route)
// pass an explicit resolved family name. Canvas2D's `font` property can't
// resolve CSS custom properties, so `var(--font-agrandir)` would silently
// no-op here if it were ever relied on.
const DEFAULT_FONT_FAMILY = "sans-serif";

export function drawVoucherOverlay(
  ctx: DrawableContext2D,
  config: TemplateConfig,
  voucher: RenderableVoucher,
  fontFamily: string = DEFAULT_FONT_FAMILY,
) {
  const { width, height } = config.canvasSize;

  const textByKey: Record<VoucherTextFieldKey, string | undefined> = {
    running_no: voucher.runningNo,
    room_type_nights: voucher.roomTypeNightsLabel,
    validity_range: voucher.validityLabel,
    blackout_text: voucher.blackoutText,
    approver_position: voucher.approverPosition,
    approved_date: voucher.approvedDateLabel,
  };

  for (const field of config.fields) {
    const text = textByKey[field.key];
    if (!text) continue;

    const maxWidth = field.maxWidthPct * width;
    const weight = field.weight ?? 700;

    ctx.fillStyle = field.color;
    ctx.textAlign = field.align;
    ctx.textBaseline = "alphabetic";

    if (field.maxLines && field.maxLines > 1) {
      ctx.font = `${weight} ${field.sizePct * height}px ${fontFamily}`;
      drawWrappedText(ctx, field, text, width, height);
    } else {
      // Sets ctx.font itself — shrinks down to field.minSizePct (if set)
      // before falling back to ellipsis truncation.
      setShrunkFont(ctx, field, text, weight, fontFamily, maxWidth, height);
      ctx.fillText(fitText(ctx, text, maxWidth), field.xPct * width, field.yPct * height, maxWidth);
    }
  }

  drawBreakfastCheck(ctx, config, voucher.breakfastIncluded);

  if (voucher.signatureImage) {
    drawSignature(ctx, config, voucher.signatureImage);
  }
}

/**
 * Sets ctx.font to `field.sizePct`, shrinking down to `field.minSizePct`
 * (1px steps) while the text still overflows `maxWidth`. Fields without
 * `minSizePct` just get their normal fixed size — ellipsis truncation in
 * `fitText` is still the final fallback either way (PRD §6.2).
 */
function setShrunkFont(
  ctx: DrawableContext2D,
  field: TemplateTextField,
  text: string,
  weight: number,
  fontFamily: string,
  maxWidth: number,
  canvasHeight: number,
) {
  const maxSizePx = field.sizePct * canvasHeight;
  const minSizePx = field.minSizePct ? field.minSizePct * canvasHeight : maxSizePx;

  let sizePx = maxSizePx;
  ctx.font = `${weight} ${sizePx}px ${fontFamily}`;

  while (sizePx > minSizePx && ctx.measureText(text).width > maxWidth) {
    sizePx = Math.max(minSizePx, sizePx - 1);
    ctx.font = `${weight} ${sizePx}px ${fontFamily}`;
  }
}

/** Truncates with an ellipsis so free-text fields never overflow the frame (PRD §6.2). */
function fitText(ctx: DrawableContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
}

/** Word-wraps into `field.maxLines`, ellipsizing the last line if it still overflows (PRD §6.2). */
function drawWrappedText(
  ctx: DrawableContext2D,
  field: TemplateTextField,
  text: string,
  canvasWidth: number,
  canvasHeight: number,
) {
  const maxWidth = field.maxWidthPct * canvasWidth;
  const maxLines = field.maxLines ?? 1;
  const lineHeight = (field.lineHeightPct ?? field.sizePct * 1.3) * canvasHeight;
  const x = field.xPct * canvasWidth;
  const y = field.yPct * canvasHeight;

  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const fitsOnLine = ctx.measureText(candidate).width <= maxWidth;
    const onLastAllowedLine = lines.length >= maxLines - 1;

    if (fitsOnLine || !current || onLastAllowedLine) {
      // On the last allowed line we keep accumulating past maxWidth on
      // purpose — it gets truncated with an ellipsis below.
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);

  const lastIndex = lines.length - 1;
  lines[lastIndex] = fitText(ctx, lines[lastIndex], maxWidth);

  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight, maxWidth);
  });
}

function drawBreakfastCheck(ctx: DrawableContext2D, config: TemplateConfig, included: boolean) {
  const { width, height } = config.canvasSize;
  const { includedXPct, notIncludedXPct, yPct, radiusPct, color } = config.breakfastCheckbox;
  const x = (included ? includedXPct : notIncludedXPct) * width;
  const y = yPct * height;
  const r = radiusPct * height;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // A hand-drawn checkmark path instead of the "✓" glyph — glyph shape,
  // weight, and vertical centering vary too much across fonts/renderers to
  // look clean at this size (that's what looked off before).
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = r * 0.32;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x - r * 0.5, y + r * 0.02);
  ctx.lineTo(x - r * 0.12, y + r * 0.38);
  ctx.lineTo(x + r * 0.52, y - r * 0.32);
  ctx.stroke();
}

/**
 * Draws the approver's signature image inside its configured box,
 * preserving aspect ratio and anchoring bottom-left (a signature reads
 * naturally sitting just above the blank line, however wide it is).
 */
function drawSignature(ctx: DrawableContext2D, config: TemplateConfig, image: DrawableImageSource) {
  const { width, height } = config.canvasSize;
  const { xPct, yPct, maxWidthPct, maxHeightPct } = config.signatureField;
  const boxWidth = maxWidthPct * width;
  const boxHeight = maxHeightPct * height;

  // No upper cap — a modest-resolution upload should still scale *up* to
  // fill the box. It only ever looks soft if someone uploads something
  // tiny; that's a better failure mode than a signature too small to read.
  const scale = Math.min(boxWidth / image.width, boxHeight / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;

  const x = xPct * width;
  const y = yPct * height - drawHeight;
  ctx.drawImage(image, x, y, drawWidth, drawHeight);
}
