import { PURPOSE_OPTIONS } from "@/lib/voucher/types";

/** Value -> display label, e.g. "kol" -> "KOL". Shared by History, the Approver's review page, and the approval-request email. */
export function formatPurposeLabel(purpose: string | null): string {
  return PURPOSE_OPTIONS.find((option) => option.value === purpose)?.label ?? "—";
}

// PRD §5/§6.4 prose says "2-digit Buddhist-era year" but every worked
// example ("26/LDCH099" in 2026, rolling to "27/LDCH001" in 2027) is the
// last 2 digits of the Gregorian year, not true BE (2026 -> BE 2569 -> "69").
// The examples are unambiguous and repeated, so this follows them — must
// stay in sync with the `submit_voucher_batch` SQL function, which formats
// running numbers the same way.
export function twoDigitYear(date: Date = new Date()): string {
  return String(date.getFullYear()).slice(-2);
}

/** `{2-digit year}/{Property Code}{3-digit running number}`, e.g. "26/LDCH099". */
export function formatRunningNo(
  propertyCode: string,
  sequence: number,
  date: Date = new Date(),
): string {
  return `${twoDigitYear(date)}/${propertyCode}${String(sequence).padStart(3, "0")}`;
}

export function formatVoucherDate(isoDate: string): string {
  if (!isoDate) return "";
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

// Abbreviated month specifically for the "Approved by" signature line's
// date field — that slot is much narrower than validity_range's (which
// legitimately has room for a full month name), so a shorter format needs
// far less shrinking to fit (see approved_date's minSizePct in
// templates/config.ts) and stays legible instead of truncating with "…".
export function formatVoucherDateShort(isoDate: string): string {
  if (!isoDate) return "";
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatValidityRange(start: string, end: string): string {
  const startLabel = formatVoucherDate(start);
  const endLabel = formatVoucherDate(end);
  if (!startLabel || !endLabel) return "";
  return `from ${startLabel} until ${endLabel}`;
}

/** "The Upgrade | 1 night" / "The Duo | King, The Compact | 3 nights" — matches the real voucher layout. */
export function formatRoomTypeNights(roomTypes: string[], nights: number): string {
  if (roomTypes.length === 0) return "";
  const nightsLabel = `${nights} night${nights === 1 ? "" : "s"}`;
  return `${roomTypes.join(", ")} | ${nightsLabel}`;
}

/** Prefixes with "Blackout: " to match how it renders on the real voucher. */
export function formatBlackoutText(blackoutText: string): string {
  return blackoutText ? `Blackout: ${blackoutText}` : "";
}
