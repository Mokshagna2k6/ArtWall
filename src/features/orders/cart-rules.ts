/**
 * Cart staleness rules. Pure.
 *
 * A cart can sit for days; the work in it can be sold, reserved by someone
 * mid-checkout, unpublished, repriced to nothing, or the artist's profile
 * hidden. The cart shows these as flagged lines and checkout refuses to
 * proceed until they are removed (`removeUnavailableFromCart`), never
 * silently drops them and never charges for them.
 */

export type CartIssue =
  | "missing"
  | "own_work"
  | "sold"
  | "reserved"
  | "unavailable"
  | "unpublished"
  | "seller_unpublished"
  | "unpriced";

export interface CartRow {
  artworkId: string;
  /** null when the artwork row no longer exists. */
  artwork: null | {
    sellerId: string;
    /** Legacy artworks.status: available | reserved | sold | ... */
    status: string;
    isPublic: boolean;
    sellerPublished: boolean;
    pricePaise: number | null;
  };
}

export const ISSUE_MESSAGES: Record<CartIssue, string> = {
  missing: "This work is no longer on ArtWall.",
  own_work: "You cannot buy your own work.",
  sold: "Sold.",
  reserved: "Another buyer is checking out with this work right now.",
  unavailable: "No longer for sale.",
  unpublished: "No longer listed.",
  seller_unpublished: "The artist's profile is not public right now.",
  unpriced: "This work has no price.",
};

/** The first reason this line cannot be bought, or null when it can. */
export function classifyCartRow(row: CartRow, buyerId: string): CartIssue | null {
  const a = row.artwork;
  if (!a) return "missing";
  if (a.sellerId === buyerId) return "own_work";
  if (a.status === "sold") return "sold";
  if (a.status === "reserved") return "reserved";
  if (a.status !== "available") return "unavailable";
  if (!a.isPublic) return "unpublished";
  if (!a.sellerPublished) return "seller_unpublished";
  if (a.pricePaise === null || !Number.isSafeInteger(a.pricePaise) || a.pricePaise <= 0) return "unpriced";
  return null;
}
