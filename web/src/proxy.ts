import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 renamed middleware.ts -> proxy.ts (see AGENTS.md: this repo's
// Next version has file-convention breaking changes vs older training
// data — verified against node_modules/next/dist/docs/.../proxy.md).
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip static assets and the voucher template images; run everywhere
    // else, including /approve (no session needed there, but running the
    // refresh is harmless) and API routes.
    "/((?!_next/static|_next/image|favicon.ico|templates/).*)",
  ],
};
