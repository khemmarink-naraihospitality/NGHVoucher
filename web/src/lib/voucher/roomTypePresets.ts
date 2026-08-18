/**
 * Common room type names across Lub d properties, offered as quick-add
 * options in the Admin page instead of free text every time (PRD §5: the
 * master list is still per-property, since some properties have unique
 * names like "Coconut Hideaway" — this is a starting point, not a lock-in).
 */
export const ROOM_TYPE_PRESETS = [
  "The Compact",
  "The Sidekick",
  "The Upgrade",
  "The Duo",
  "The Triplex",
  "Tribe Hideout All Yours",
  "Tribe Hideout Bed",
] as const;
