import ExcelJS from "exceljs";
import { formatPurposeLabel, formatVoucherDate } from "@/lib/voucher/format";

export interface HistoryExportRow {
  running_no: string;
  property_name: string;
  item_name: string | null;
  purpose: string | null;
  room_type_names: string[];
  nights: number;
  breakfast_included: boolean;
  validity_start: string;
  validity_end: string;
  status: string;
  claim_by: string | null;
  reservation_no: string | null;
  revoked_reason: string | null;
  created_at: string;
  note: string | null;
  share_code: string | null;
  issuer_name: string | null;
  external_file_url: string | null;
}

// Column set is a superset of the on-screen History table — adds Property
// (already in the row data, just not shown as its own column on-screen)
// and JPEG/PDF links (front_office sees a preview button instead of these
// on-screen, but Finance needs the actual file for a CSV row). These are
// app/v/[code]/jpg|pdf links, not raw storage URLs — the vouchers bucket
// is private (migration 0023); the link resolves to a fresh short-lived
// signed URL on click, not a permanently guessable one.
const COLUMNS = [
  { key: "runningNo", header: "Voucher No." },
  { key: "propertyName", header: "Property" },
  { key: "itemName", header: "Item Name" },
  { key: "purpose", header: "Purpose" },
  { key: "roomTypes", header: "Room Type(s)" },
  { key: "nights", header: "Nights" },
  { key: "breakfast", header: "Breakfast" },
  { key: "validityStart", header: "Validity Start" },
  { key: "validityEnd", header: "Validity End" },
  { key: "status", header: "Status" },
  { key: "issuer", header: "Issuer" },
  { key: "claimBy", header: "Claimed By" },
  { key: "reservationNo", header: "Reservation No." },
  { key: "revokedReason", header: "Revoke Reason" },
  { key: "issuedAt", header: "Issued" },
  { key: "note", header: "Note" },
  { key: "jpegUrl", header: "JPEG URL" },
  { key: "pdfUrl", header: "PDF URL" },
  { key: "originalFileUrl", header: "Original File (Drive)" },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];

function toValues(row: HistoryExportRow): Record<ColumnKey, string | number> {
  return {
    runningNo: row.running_no,
    propertyName: row.property_name,
    itemName: row.item_name || "",
    purpose: formatPurposeLabel(row.purpose),
    roomTypes: row.room_type_names.join(", "),
    nights: row.nights,
    breakfast: row.breakfast_included ? "Yes" : "No",
    validityStart: formatVoucherDate(row.validity_start),
    validityEnd: formatVoucherDate(row.validity_end),
    status: row.status,
    issuer: row.issuer_name || "",
    claimBy: row.claim_by || "",
    reservationNo: row.reservation_no || "",
    revokedReason: row.revoked_reason || "",
    issuedAt: formatVoucherDate(row.created_at.slice(0, 10)),
    note: row.note || "",
    jpegUrl: row.share_code ? `${process.env.NEXT_PUBLIC_APP_URL}/v/${row.share_code}/jpg` : "",
    pdfUrl: row.share_code ? `${process.env.NEXT_PUBLIC_APP_URL}/v/${row.share_code}/pdf` : "",
    originalFileUrl: row.external_file_url || "",
  };
}

function csvEscape(value: string | number): string {
  const str = String(value);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

const UTF8_BOM = "﻿";

// Leading BOM so Excel/Sheets detect UTF-8 correctly instead of guessing a
// legacy codepage — property/issuer names aren't guaranteed ASCII.
export function buildHistoryCsv(rows: HistoryExportRow[]): string {
  const header = COLUMNS.map((c) => csvEscape(c.header)).join(",");
  const lines = rows.map((row) => {
    const values = toValues(row);
    return COLUMNS.map((c) => csvEscape(values[c.key])).join(",");
  });
  return UTF8_BOM + [header, ...lines].join("\r\n");
}

export async function buildHistoryXlsx(rows: HistoryExportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  // "History" is a reserved worksheet name in the xlsx format (Excel's own
  // change-tracking feature) — ExcelJS rejects it outright.
  const sheet = workbook.addWorksheet("Voucher History");
  sheet.columns = COLUMNS.map((c) => ({
    header: c.header,
    key: c.key,
    width: Math.max(c.header.length + 2, 14),
  }));
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    sheet.addRow(toValues(row));
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
