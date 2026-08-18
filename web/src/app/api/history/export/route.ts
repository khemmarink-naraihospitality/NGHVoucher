import { createClient } from "@/lib/supabase/server";
import { buildHistoryCsv, buildHistoryXlsx, type HistoryExportRow } from "@/lib/history/export";

// Same filters, same RPC, same RLS-scoped row visibility as the History
// page itself (get_my_voucher_history is `security invoker` — see
// supabase/migrations/0017 — so this can't leak rows the caller couldn't
// already see on-screen). No role check beyond "is logged in": every role
// that can view History can export exactly what it's able to view.
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const status = url.searchParams.get("status");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const property = url.searchParams.get("property");
  const purpose = url.searchParams.get("purpose");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("get_my_voucher_history", {
    p_status: status || null,
    p_from: from || null,
    p_to: to || null,
    p_property_id: property ? Number(property) : null,
    p_purpose: purpose || null,
  });

  if (error) {
    console.error("history export failed:", error.message);
    return Response.json({ error: "Failed to load history." }, { status: 500 });
  }

  const rows = (data as HistoryExportRow[] | null) ?? [];
  const filenameDate = new Date().toISOString().slice(0, 10);

  if (format === "xlsx") {
    const buffer = await buildHistoryXlsx(rows);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="voucher-history-${filenameDate}.xlsx"`,
      },
    });
  }

  const csv = buildHistoryCsv(rows);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="voucher-history-${filenameDate}.csv"`,
    },
  });
}
