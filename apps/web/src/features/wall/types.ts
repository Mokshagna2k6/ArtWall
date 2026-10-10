/**
 * A claimed place on the wall, as the wall needs it.
 *
 * Note what is absent: no email, no user agent, no IP. The wall is a public
 * surface, so the shape that reaches a client component contains only what an
 * artist agreed to show. Keeping that as a type rather than a convention means
 * a future `select *` cannot quietly start shipping addresses to the browser.
 */
export interface WallTile {
  founderNumber: number;
  name: string;
  city: string | null;
  practice: string | null;
  artworkUrl: string;
  artworkWidth: number | null;
  artworkHeight: number | null;
  /** Public by the artist's own upload, shown when a tile is opened. */
  selfieUrl: string | null;
  artworkTitle: string | null;
  quote: string | null;
}

/** The folder every wall upload is signed into, and validated against. */
export const WALL_UPLOAD_FOLDER = "artwall/wall";
