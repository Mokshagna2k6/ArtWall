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

/**
 * Suggested media for the artwork form's datalist. A suggestion, not a closed
 * set: `artworks.medium` is free text and a practice we have not listed must
 * still be typeable, so this drives a <datalist> rather than a <select>.
 * Bible §3 lists the art forms ArtWall covers; these are their common media.
 */
export const ARTWORK_MEDIUMS = [
  "Oil on canvas",
  "Acrylic on canvas",
  "Watercolour on paper",
  "Ink on paper",
  "Charcoal on paper",
  "Pencil on paper",
  "Pastel on paper",
  "Mixed media",
  "Photographic print",
  "Digital print",
  "Screen print",
  "Madhubani",
  "Warli",
  "Pattachitra",
  "Rajasthani miniature",
  "Tanjore",
  "Kalamkari",
  "Gond",
  "Phad",
  "Pichwai",
  "Textile / tapestry",
  "Calligraphy",
] as const;
