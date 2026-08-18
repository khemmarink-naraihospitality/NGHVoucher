import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

// Resolves whatever's stored in properties.template_config.imagePath or
// approvers.signature_url into something actually fetchable, now that the
// templates/signatures buckets are private (migration 0030). Handles three
// shapes so existing rows keep working without a forced re-upload:
//   1. A local /public asset (the two seed templates) — never went through
//      Storage, returned as-is.
//   2. An old-style full public URL, stored before the bucket went private
//      — the storage path is extracted out of it and signed.
//   3. A bare storage path (what uploads write from now on) — signed directly.
// Uses the service-role client, not the caller's session — these values
// are read by admin (authenticated), the issuer's create-voucher workspace
// (authenticated), and the anonymous token-gated approve page, and none of
// those have a standing RLS grant on these buckets anymore (there isn't
// one — see migration 0030's comment for why re-adding one would defeat
// the point).
export async function resolveStorageImageUrl(
  bucket: string,
  value: string | null | undefined,
  ttlSeconds: number,
): Promise<string | null> {
  if (!value) return null;
  if (value.startsWith("/")) return value;

  let path = value;
  if (value.startsWith("http")) {
    const publicMarker = `/object/public/${bucket}/`;
    const idx = value.indexOf(publicMarker);
    if (idx === -1) return null;
    path = value.slice(idx + publicMarker.length).split("?")[0];
  }

  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, ttlSeconds);
  if (error || !data) {
    console.error(`[signedUrl] failed to sign ${bucket}/${path}:`, error?.message);
    return null;
  }
  return data.signedUrl;
}
