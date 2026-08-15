import type { SlotState } from "@/features/physical-wall/state-machine";

/**
 * Row shapes as the app sees them.
 *
 * Deliberately camelCase and already-converted, so nothing outside `data/` ever
 * deals in `base_price_paise` or a Postgres date string. The mapping happens in
 * one place per table and the rest of the feature reads plain objects.
 */

export interface GridConfig {
  id: string;
  name: string;
  rowCount: number;
  colCount: number;
  isTemplate: boolean;
  active: boolean;
  version: number;
}

export interface Slot {
  id: string;
  gridId: string;
  rowIndex: number;
  colIndex: number;
  label: string;
  sizeId: string;
  typeId: string;
  state: SlotState;
  version: number;
}

/** A slot joined to the catalog rows the grid and the pricing engine need. */
export interface SlotWithCatalog extends Slot {
  sizeName: string;
  wCm: number;
  hCm: number;
  weightKg: number;
  basePricePaise: number;
  typeLabel: string;
  typeMultiplierBp: number;
}

export interface SizeClass {
  id: string;
  name: string;
  wCm: number;
  hCm: number;
  weightKg: number;
  basePricePaise: number;
  active: boolean;
  sortOrder: number;
}

export interface SlotType {
  id: string;
  label: string;
  multiplierBp: number;
  requiresGrant: boolean;
  active: boolean;
  sortOrder: number;
}

export interface Addon {
  id: string;
  label: string;
  pricePaise: number;
  appliesTo: "artist" | "visitor" | "both";
  category: "general" | "coffee";
  active: boolean;
  sortOrder: number;
}

export interface RefundPolicy {
  version: number;
  percentage: number;
  note: string | null;
  updatedAt: string;
}

export interface WallSettings {
  holdMinutes: number;
  bufferDays: number;
  gstRateBp: number;
  surgeEnabled: boolean;
  surgeThresholdPct: number;
  surgeMultiplierBp: number;
  perkDiscountBp: number;
  perkCostBearer: "artwall" | "platter" | "split";
  groupDiscountTiers: { minSlots: number; percentBp: number }[];
  venueOpenHour: number;
  venueCloseHour: number;
}

export type BookingStatus =
  | "held"
  | "paid"
  | "cancelled"
  | "expired"
  | "completed"
  | "refunded";

export interface Booking {
  id: string;
  artistId: string;
  artworkId: string | null;
  status: BookingStatus;
  startDate: string;
  endDate: string;
  durationDays: number;
  baseAmountPaise: number;
  addonAmountPaise: number;
  discountAmountPaise: number;
  gstAmountPaise: number;
  totalAmountPaise: number;
  surgeApplied: boolean;
  refundPolicyVersion: number | null;
  holdExpiresAt: string | null;
  createdAt: string;
}

export interface BookingDetail extends Booking {
  artistName: string;
  artistEmail: string;
  artworkTitle: string | null;
  artworkImageUrl: string | null;
  slots: { slotId: string; label: string; quotedPricePaise: number }[];
  addons: { id: string; label: string; pricePaise: number }[];
}

export interface LedgerEntry {
  id: string;
  type: "revenue" | "expense";
  category: string;
  amountPaise: number;
  note: string | null;
  entryDate: string;
  sourceRef: string | null;
}

/** A work currently hanging, as shown publicly. Public fields only. */
export interface LiveArtwork {
  artworkId: string;
  title: string;
  imageUrl: string | null;
  medium: string | null;
  year: number | null;
  description: string | null;
  artistName: string;
  artistHandle: string | null;
  artistCity: string | null;
  slotLabel: string;
  endDate: string;
  qrToken: string | null;
}
