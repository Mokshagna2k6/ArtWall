export interface Signature {
  /** Serialized vector stroke path captured during onboarding (Phase 1 #21). */
  strokeData: string;
  capturedAt: string;
}

export type WallMarkType =
  "founding-member" | "mentor" | "referrer" | "featured";

export interface WallMark {
  type: WallMarkType;
  label: string;
  awardedAt: string;
}

export interface Artist {
  id: string;
  /** Without the leading "@" - the route param strips it. */
  handle: string;
  name: string;
  medium: string;
  city: string;
  state: string;
  /** The Nameplate's one-line statement (Phase 2 §5.3). */
  statement?: string;
  /** "What's the first thing you remember drawing?" (Phase 1 #24). */
  originStory?: string;
  /** Thank a Teacher credit (Phase 1 #26). */
  teacherCredit?: string;
  avatarUrl?: string;
  coverImageUrl?: string;
  signature?: Signature;
  wallMarks: WallMark[];
  joinedAt: string;
  /** Position on the Founding Roster, if the artist joined pre-launch. */
  founderNumber?: number;
}
