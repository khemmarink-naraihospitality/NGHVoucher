import { createClient } from "@/lib/supabase/server";
import { buildTemplateConfig, type TemplateConfigJson } from "@/lib/templates/config";
import {
  formatBlackoutText,
  formatRoomTypeNights,
  formatRunningNo,
  formatValidityRange,
} from "@/lib/voucher/format";
import { DEFAULT_BLACKOUT_TEXT } from "@/lib/voucher/types";
import { renderVoucherPng } from "@/lib/voucher/export";

// Phase 0 POC (PRD §6.3, §10, milestone Week 1): proved `node-canvas` can
// load an image and render text server-side inside a Next.js Route
// Handler — `serverExternalPackages: ["canvas"]` in next.config.ts keeps it
// out of the bundler. The actual render logic has since moved to
// lib/voucher/export.ts (Phase 3, reused by /api/approve); this route is
// now just a thin manual-testing entry point for it. Template data is
// Admin-managed (0009), so this now needs a session like the rest of the
// Issuer-side app — it's a dev tool, not something linked from any UI.
export const runtime = "nodejs";

interface CatalogPropertyRow {
  code: string;
  name: string;
  templateConfig: TemplateConfigJson;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const propertyCode = searchParams.get("property") ?? "LDCH";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Sign in first — this route needs a session." }, { status: 401 });
  }

  const { data: catalog, error } = await supabase.rpc("get_voucher_workspace_catalog");
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const properties = (catalog as { properties?: CatalogPropertyRow[] } | null)?.properties ?? [];
  const property = properties.find((p) => p.code === propertyCode);
  if (!property) {
    return Response.json(
      { error: `Unknown property code "${propertyCode}". Try one of: ${properties.map((p) => p.code).join(", ")}` },
      { status: 400 },
    );
  }
  const template = buildTemplateConfig(property.code, property.name, property.templateConfig);
  if (!template) {
    return Response.json({ error: `Property "${propertyCode}" has no template image uploaded yet.` }, { status: 400 });
  }

  const sequence = Number(searchParams.get("seq") ?? "99");
  const roomType = searchParams.get("roomType") ?? "The Duo | King";
  const nights = Number(searchParams.get("nights") ?? "1");
  const breakfastIncluded = searchParams.get("breakfast") === "true";
  const validityStart = searchParams.get("start") ?? "2026-08-10";
  const validityEnd = searchParams.get("end") ?? "2027-02-28";
  const blackoutText = searchParams.get("blackout") ?? DEFAULT_BLACKOUT_TEXT;

  const png = await renderVoucherPng(template, {
    runningNo: formatRunningNo(propertyCode, sequence),
    roomTypeNightsLabel: formatRoomTypeNights([roomType], nights),
    breakfastIncluded,
    validityLabel: formatValidityRange(validityStart, validityEnd),
    blackoutText: formatBlackoutText(blackoutText),
  });

  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}
