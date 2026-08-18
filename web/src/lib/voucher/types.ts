export type BlackoutType = "default" | "custom";

/** A voucher's Room Type line has to fit on one printed line, so selection is capped. */
export const MAX_ROOM_TYPES = 3;

export const DEFAULT_BLACKOUT_TEXT =
  "Weekend, and Public Holiday, Please contact the reservation team for more information";

/** PRD §5.1: real historical data's "Purpose" column, required on the form. */
export type PurposeValue = "kol" | "partner_compliment" | "staff_party" | "etc_compliment";

export const PURPOSE_OPTIONS: { value: PurposeValue; label: string }[] = [
  { value: "kol", label: "KOL" },
  { value: "partner_compliment", label: "Partner Compliment" },
  { value: "staff_party", label: "Staff Party" },
  { value: "etc_compliment", label: "Etc. Compliment" },
];

export interface VoucherFormState {
  propertyCode: string;
  /** room_types.id from the DB catalog (PRD §8: vouchers.room_type_ids). */
  roomTypeIds: number[];
  nights: number;
  voucherCount: number;
  breakfastIncluded: boolean;
  validityStart: string; // ISO date (yyyy-mm-dd)
  validityEnd: string; // ISO date (yyyy-mm-dd)
  blackoutType: BlackoutType;
  blackoutText: string;
  approverId: string;
  note: string;
  /** PRD §5.1: campaign/batch name, e.g. "GoxSomeday (KOLs)" — optional, groups vouchers issued together. */
  itemName: string;
  purpose: PurposeValue | "";
}

export function createDefaultVoucherFormState(propertyCode: string): VoucherFormState {
  return {
    propertyCode,
    roomTypeIds: [],
    nights: 1,
    voucherCount: 1,
    breakfastIncluded: false,
    validityStart: "",
    validityEnd: "",
    blackoutType: "default",
    blackoutText: DEFAULT_BLACKOUT_TEXT,
    approverId: "",
    note: "",
    itemName: "",
    purpose: "",
  };
}
