"use client";

import { useEffect, useRef, useState } from "react";
import type { TemplateConfig } from "@/lib/templates/config";
import { drawVoucherOverlay, type RenderableVoucher } from "@/lib/voucher/draw";
import { agrandir } from "@/lib/fonts";

interface VoucherCanvasPreviewProps {
  template: TemplateConfig;
  voucher: RenderableVoucher;
  /** Set once a voucher is approved (PRD §4 step 7) — loaded here, same pattern as the base template image. */
  signatureImageUrl?: string;
  /**
   * Tiled "PREVIEW" watermark, on by default. This is an on-screen-only
   * deterrent against screenshotting an unapproved preview as if it were a
   * signed voucher — it never touches the actual export path
   * (lib/voucher/export.ts renders PNG/PDF independently and has no
   * watermark code at all), so approved downloads are always clean.
   */
  watermark?: boolean;
  /** Defaults to filling its own width — the layout editor overrides this to fill a fixed-aspect-ratio container instead. */
  className?: string;
}

function useLoadedImage(src: string | undefined): HTMLImageElement | null {
  const [loaded, setLoaded] = useState<{ src: string; image: HTMLImageElement } | null>(null);

  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    img.onload = () => {
      if (!cancelled) setLoaded({ src, image: img });
    };
    return () => {
      cancelled = true;
    };
  }, [src]);

  return loaded !== null && loaded.src === src ? loaded.image : null;
}

/** Tiled, rotated "PREVIEW" text — covers the whole canvas so cropping a screenshot can't dodge it. */
function drawPreviewWatermark(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-Math.PI / 6);
  ctx.font = `700 ${Math.round(height * 0.055)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = Math.max(1, height * 0.002);

  const stepY = height * 0.16;
  const stepX = width * 0.42;
  const span = width + height; // over-cover so rotated tiling has no gaps at the edges
  for (let y = -span; y < span; y += stepY) {
    for (let x = -span; x < span; x += stepX) {
      ctx.strokeStyle = "rgba(0,0,0,0.28)";
      ctx.strokeText("PREVIEW", x, y);
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.fillText("PREVIEW", x, y);
    }
  }
  ctx.restore();
}

// Client-side Canvas live preview (PRD §6.1, §6.3). This intentionally
// duplicates none of the drawing logic — it shares drawVoucherOverlay with
// the server export route so preview and export can't visually drift apart.
export function VoucherCanvasPreview({
  template,
  voucher,
  signatureImageUrl,
  watermark = true,
  className,
}: VoucherCanvasPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseImage = useLoadedImage(template.imagePath);
  const signatureImage = useLoadedImage(signatureImageUrl);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !baseImage) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cancelled = false;
    // Wait for the Agrandir @font-face to finish loading so the first paint
    // doesn't measure/draw text in the fallback font. Pass the resolved
    // family name explicitly — Canvas2D's `font` property can't resolve
    // `var(--font-agrandir)`, it just silently no-ops (see lib/fonts.ts).
    document.fonts.ready.then(() => {
      if (cancelled) return;
      canvas.width = template.canvasSize.width;
      canvas.height = template.canvasSize.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
      drawVoucherOverlay(
        ctx,
        template,
        signatureImage ? { ...voucher, signatureImage } : voucher,
        agrandir.style.fontFamily,
      );
      if (watermark) {
        drawPreviewWatermark(ctx, canvas.width, canvas.height);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [template, voucher, baseImage, signatureImage, watermark]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`Voucher preview for ${template.propertyName}`}
      className={className ?? "w-full h-auto rounded-3xl shadow-xl"}
    />
  );
}
