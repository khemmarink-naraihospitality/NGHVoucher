import { redirectToVoucherFile } from "@/lib/voucher/share";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return redirectToVoucherFile(code, "pdf");
}
