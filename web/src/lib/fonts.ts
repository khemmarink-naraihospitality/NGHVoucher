import localFont from "next/font/local";

// Real Lub d brand font, supplied 2026-08-11. Single source of truth so
// layout.tsx (CSS, via .variable) and VoucherCanvasPreview (Canvas2D, via
// .style.fontFamily) stay in sync. Canvas2D's `font` property can't resolve
// CSS custom properties (`var(--font-agrandir)` silently fails to parse,
// leaving the canvas on its default 10px font) — .style.fontFamily gives
// the actual resolved family name string instead, which is what draw.ts
// needs.
export const agrandir = localFont({
  variable: "--font-agrandir",
  src: [
    { path: "../fonts/agrandir/Agrandir-V2-Light.otf", weight: "300", style: "normal" },
    { path: "../fonts/agrandir/Agrandir-V2-Regular.otf", weight: "400", style: "normal" },
    { path: "../fonts/agrandir/Agrandir-V2-Bold.otf", weight: "700", style: "normal" },
  ],
});
