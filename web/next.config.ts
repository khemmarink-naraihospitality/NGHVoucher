import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `canvas` (node-canvas) has native bindings and must not be bundled —
  // see PRD §6.3 POC: this is the export-engine risk we're de-risking in Phase 0.
  serverExternalPackages: ["canvas"],
  experimental: {
    serverActions: {
      // Default is 1MB — too small for the Admin page's template/signature
      // image uploads (app/admin/actions.ts), which run 1-3MB for a real
      // voucher template. Found by an actual failed upload in dev
      // ("Body exceeded 1 MB limit"), not a preemptive guess.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
