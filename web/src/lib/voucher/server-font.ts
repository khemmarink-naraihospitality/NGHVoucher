import { registerFont } from "canvas";
import path from "node:path";

export const BRAND_FONT_FAMILY = "Agrandir";

let registered = false;

/** node-canvas has no @font-face — this is its equivalent, run once per server process. */
export function ensureBrandFontRegistered() {
  if (registered) return;

  const fontsDir = path.join(process.cwd(), "public", "fonts");
  registerFont(path.join(fontsDir, "Agrandir-V2-Light.otf"), {
    family: BRAND_FONT_FAMILY,
    weight: "300",
  });
  registerFont(path.join(fontsDir, "Agrandir-V2-Regular.otf"), {
    family: BRAND_FONT_FAMILY,
    weight: "400",
  });
  registerFont(path.join(fontsDir, "Agrandir-V2-Bold.otf"), {
    family: BRAND_FONT_FAMILY,
    weight: "700",
  });

  registered = true;
}
