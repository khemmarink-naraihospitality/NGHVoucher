import { createCanvas, loadImage, type Canvas } from "canvas";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import type { TemplateConfig } from "../templates/config";
import { drawVoucherOverlay, type RenderableVoucher } from "./draw";
import { BRAND_FONT_FAMILY, ensureBrandFontRegistered } from "./server-font";

// Real export engine (PRD §6.3, §9), promoted from the Week-1 POC
// (api/poc/render) once the /approve action needed to call it for more
// than one property. Same drawVoucherOverlay as the client preview, so
// preview and export can't visually drift apart.
const DPI = 300;

// Both the downloadable image and the PDF embed use this — verified
// visually indistinguishable from the lossless original at this content's
// texture level (photographic template backgrounds), while cutting
// storage to roughly a fifth of the original lossless PNG. Was PNG-for-
// the-image + JPEG-only-for-the-PDF; moved the image to JPEG too once
// that tradeoff was confirmed acceptable (storage headroom mattered more
// than pixel-perfect losslessness here).
const EXPORT_JPEG_QUALITY = 0.8;

async function buildVoucherCanvas(
  template: TemplateConfig,
  voucher: RenderableVoucher,
  signatureImageUrl?: string,
): Promise<Canvas> {
  ensureBrandFontRegistered();

  // Local default templates live under /public; Admin-uploaded ones
  // (supabase/migrations/0009) are full Supabase Storage URLs — node-canvas's
  // loadImage accepts both a filesystem path and an http(s) URL directly.
  const imageSource = template.imagePath.startsWith("http")
    ? template.imagePath
    : path.join(process.cwd(), "public", template.imagePath);
  // Sequential, not Promise.all — concurrent loadImage() calls hit a real
  // node-canvas/libpng bug (corrupts shared native decode state, throws
  // "error occurred in libpng while reading from or writing to a PNG
  // file"), caught while testing the signature overlay feature.
  const baseImage = await loadImage(imageSource);
  const signatureImage = signatureImageUrl ? await loadImage(signatureImageUrl) : undefined;

  const canvas = createCanvas(template.canvasSize.width, template.canvasSize.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(baseImage, 0, 0, template.canvasSize.width, template.canvasSize.height);
  drawVoucherOverlay(ctx, template, signatureImage ? { ...voucher, signatureImage } : voucher, BRAND_FONT_FAMILY);

  return canvas;
}

/** Standalone PNG render — used only by api/poc/render (a throwaway diagnostic route, not the real export path). */
export async function renderVoucherPng(
  template: TemplateConfig,
  voucher: RenderableVoucher,
  /** Approver's signature image URL (Supabase Storage) — only set once approved. */
  signatureImageUrl?: string,
): Promise<Buffer> {
  const canvas = await buildVoucherCanvas(template, voucher, signatureImageUrl);
  return canvas.toBuffer("image/png");
}

/**
 * Renders once, encodes once: a JPEG at EXPORT_JPEG_QUALITY is both the
 * downloadable image and (via embedJpg, which keeps the JPEG bytes as-is
 * rather than pdf-lib's embedPng decode-and-reflate) the PDF's embedded
 * image — same bytes serve both purposes, no double encode. The PDF's
 * physical page size is set so the image prints at exactly `DPI` (PRD §9:
 * 300 DPI, RGB — no CMYK conversion) — JPEG carries no DPI metadata of its
 * own; the PDF page dimensions are what print software actually reads.
 */
export async function renderVoucherFiles(
  template: TemplateConfig,
  voucher: RenderableVoucher,
  signatureImageUrl?: string,
): Promise<{ jpeg: Buffer; pdf: Buffer }> {
  const canvas = await buildVoucherCanvas(template, voucher, signatureImageUrl);
  const jpeg = canvas.toBuffer("image/jpeg", { quality: EXPORT_JPEG_QUALITY });

  const pdfDoc = await PDFDocument.create();
  const jpgImage = await pdfDoc.embedJpg(jpeg);

  const widthPt = (template.canvasSize.width / DPI) * 72;
  const heightPt = (template.canvasSize.height / DPI) * 72;
  const page = pdfDoc.addPage([widthPt, heightPt]);
  page.drawImage(jpgImage, { x: 0, y: 0, width: widthPt, height: heightPt });

  return { jpeg, pdf: Buffer.from(await pdfDoc.save()) };
}
