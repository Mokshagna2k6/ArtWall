export type ExhibitionStatus = "upcoming" | "live" | "closed";

export interface Exhibition {
  id: string;
  slug: string;
  title: string;
  city: string;
  startDate: string;
  endDate: string;
  /** Curator's Note (Phase 1 #78) - a human voice before logistics. */
  curatorNote?: string;
  coverImageUrl?: string;
  artistIds: string[];
  status: ExhibitionStatus;
}
