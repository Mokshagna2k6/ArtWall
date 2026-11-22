/**
 * The kinds a venue may be, and how they are written on screen.
 *
 * Its own module, not a const in actions.ts, because a `"use server"` file may
 * only export async functions — a client component importing a constant from
 * one breaks the build (it passes `tsc` and fails `next build`). The server
 * actions and the form both import from here.
 *
 * The list mirrors migration 0086's check constraint exactly. Changing one
 * without the other means a value the form offers that the database refuses.
 */
export const VENUE_TYPES = [
  "cafe",
  "restaurant",
  "hotel",
  "gallery",
  "office",
  "coworking",
  "retail",
] as const;

export type VenueType = (typeof VENUE_TYPES)[number];

export const VENUE_TYPE_LABELS: Record<VenueType, string> = {
  cafe: "Café",
  restaurant: "Restaurant",
  hotel: "Hotel",
  gallery: "Gallery",
  office: "Office",
  coworking: "Coworking space",
  retail: "Shop",
};

/** The label for a stored value, which may be null or an unknown string. */
export function venueTypeLabel(value: string | null): string | null {
  if (!value) return null;
  return VENUE_TYPE_LABELS[value as VenueType] ?? value;
}
