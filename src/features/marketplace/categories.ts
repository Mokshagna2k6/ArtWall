/** The fixed set an artist can file a work under; discover filters on it. */
export const ARTWORK_CATEGORIES = [
  "painting",
  "drawing",
  "printmaking",
  "photography",
  "sculpture",
  "textile",
  "digital",
  "mixed-media",
] as const;

export type ArtworkCategory = (typeof ARTWORK_CATEGORIES)[number];

export const categoryLabel = (c: string) =>
  c.charAt(0).toUpperCase() + c.slice(1).replace("-", " ");
