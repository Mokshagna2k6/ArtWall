export interface ArtworkImage {
  url: string;
  width: number;
  height: number;
  /** Required - artist-authored at upload, per the accessibility rule in Phase 2 §7. */
  alt: string;
}

export interface Artwork {
  id: string;
  title: string;
  artistId: string;
  medium: string;
  year: number;
  priceInInr?: number;
  images: ArtworkImage[];
  region?: string;
  mood?: string[];
  certificateId?: string;
}
