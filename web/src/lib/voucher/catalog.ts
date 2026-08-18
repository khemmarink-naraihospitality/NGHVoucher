import { createClient } from "@/lib/supabase/server";
import { resolveStorageImageUrl } from "@/lib/supabase/signedUrl";
import type { TemplateConfigJson } from "@/lib/templates/config";

// Issuer might sit on the create-voucher page composing a request for a
// while — generous enough that the signed image URLs won't go stale
// mid-session (unlike the voucher-download links, which are one-shot
// redirects and use a much shorter TTL).
const IMAGE_URL_TTL_SECONDS = 3600;

export interface CatalogProperty {
  id: number;
  code: string;
  name: string;
  /** Last running number issued this calendar year (0 if none yet). */
  lastNumber: number;
  /** Image/canvas size + optional Admin-customized field layout — see supabase/migrations/0009, 0011. */
  templateConfig: TemplateConfigJson | null;
}

export interface CatalogRoomType {
  id: number;
  propertyId: number;
  name: string;
}

export interface CatalogApprover {
  id: number;
  name: string;
  email: string;
  /** Properties this approver is scoped to — see supabase/migrations/0009. */
  propertyIds: number[];
  /** Job title + signature image, drawn on the voucher's "Approved by" line — see supabase/migrations/0010. */
  position: string | null;
  signatureUrl: string | null;
}

export interface VoucherWorkspaceCatalog {
  properties: CatalogProperty[];
  roomTypes: CatalogRoomType[];
  approvers: CatalogApprover[];
}

const EMPTY_CATALOG: VoucherWorkspaceCatalog = { properties: [], roomTypes: [], approvers: [] };

/**
 * Fetches everything the Create Voucher page needs in one round trip via
 * the `get_voucher_workspace_catalog` RPC (see supabase/migrations/0002,
 * extended in 0008/0009 with approvers and per-property template info).
 * Requires a session (Phase 4) — the page calling this must already have
 * redirected unauthenticated users.
 */
export async function fetchWorkspaceCatalog(): Promise<VoucherWorkspaceCatalog> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_voucher_workspace_catalog");

  if (error) {
    console.error("fetchWorkspaceCatalog failed:", error.message);
    return EMPTY_CATALOG;
  }

  const catalog = (data as VoucherWorkspaceCatalog | null) ?? EMPTY_CATALOG;

  const [properties, approvers] = await Promise.all([
    Promise.all(
      catalog.properties.map(async (property) => {
        if (!property.templateConfig?.imagePath) return property;
        const imagePath = await resolveStorageImageUrl(
          "templates",
          property.templateConfig.imagePath,
          IMAGE_URL_TTL_SECONDS,
        );
        return { ...property, templateConfig: { ...property.templateConfig, imagePath: imagePath ?? property.templateConfig.imagePath } };
      }),
    ),
    Promise.all(
      catalog.approvers.map(async (approver) => ({
        ...approver,
        signatureUrl: await resolveStorageImageUrl("signatures", approver.signatureUrl, IMAGE_URL_TTL_SECONDS),
      })),
    ),
  ]);

  return { ...catalog, properties, approvers };
}
