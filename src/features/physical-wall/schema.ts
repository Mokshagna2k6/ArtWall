import { z } from "zod";

import { SLOT_STATES } from "@/features/physical-wall/state-machine";

/**
 * Input validation for every physical-wall action.
 *
 * Defined once and validated on the server every time. Client-side checks in
 * the forms are a courtesy to the person typing; anyone can POST straight at a
 * server action, so these schemas are the actual boundary (spec §7, "boundary
 * validation (Zod)").
 *
 * Money arrives from forms in rupees, because that is what a human types, and
 * is converted to paise by the action. These schemas validate the rupee figure.
 */

/** An id we generated: a slug or a nanoid-ish string, never free text. */
const id = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "That doesn't look like a valid id.");

const rupees = z
  .number({ error: "Enter an amount." })
  .min(0, "An amount cannot be negative.")
  .max(10_000_000, "That amount is larger than we accept.");

const rupeesFromForm = z.coerce.number().pipe(rupees);

/** Percentages are whole numbers. 10 means 10%. */
const percentage = z.coerce
  .number()
  .int("Use a whole percentage.")
  .min(0)
  .max(100);

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.");

/* ── Grid (F01, F02) ─────────────────────────────────────────────────────── */

export const gridResizeSchema = z.object({
  gridId: id,
  rowCount: z.coerce.number().int().min(1).max(20),
  colCount: z.coerce.number().int().min(1).max(20),
});

export const slotMoveSchema = z.object({
  slotId: id,
  targetRow: z.coerce.number().int().min(0).max(19),
  targetCol: z.coerce.number().int().min(0).max(19),
  /** Optimistic lock. Rejected if another admin has edited since we loaded. */
  version: z.coerce.number().int().min(1),
});

export const slotEditSchema = z.object({
  slotId: id,
  label: z.string().trim().min(1).max(24),
  sizeId: id,
  typeId: id,
  version: z.coerce.number().int().min(1),
});

export const gridTemplateSchema = z.object({
  gridId: id,
  name: z.string().trim().min(1, "Give the layout a name.").max(60),
});

/* ── Catalogs (F03, F05, F11, C05) ───────────────────────────────────────── */

export const sizeSchema = z.object({
  id: id.optional(),
  name: z.string().trim().min(1, "Name the size class.").max(40),
  wCm: z.coerce.number().int().min(1).max(1000),
  hCm: z.coerce.number().int().min(1).max(1000),
  weightKg: z.coerce.number().int().min(1).max(200),
  basePrice: rupeesFromForm,
  active: z.coerce.boolean().default(true),
});

export const slotTypeSchema = z.object({
  id: id.optional(),
  label: z.string().trim().min(1, "Name the slot type.").max(40),
  /** 1.4 means 1.4x. Stored as basis points. */
  multiplier: z.coerce.number().min(0).max(10),
  requiresGrant: z.coerce.boolean().default(false),
  active: z.coerce.boolean().default(true),
});

export const addonSchema = z.object({
  id: id.optional(),
  label: z.string().trim().min(1, "Name the add-on.").max(80),
  price: rupeesFromForm,
  appliesTo: z.enum(["artist", "visitor", "both"]),
  category: z.enum(["general", "coffee"]),
  active: z.coerce.boolean().default(true),
});

export const refundPolicySchema = z.object({
  percentage,
  note: z.string().trim().max(280).optional(),
});

export const settingsSchema = z.object({
  holdMinutes: z.coerce.number().int().min(5).max(1440),
  bufferDays: z.coerce.number().int().min(0).max(14),
  gstRate: z.coerce.number().min(0).max(100),
  surgeEnabled: z.coerce.boolean().default(false),
  surgeThresholdPct: z.coerce.number().int().min(0).max(100),
  surgeMultiplier: z.coerce.number().min(1).max(5),
  perkDiscount: z.coerce.number().min(0).max(100),
  perkCostBearer: z.enum(["artwall", "platter", "split"]),
});

/* ── Booking (F06-F09, F11) ──────────────────────────────────────────────── */

export const quoteRequestSchema = z.object({
  slotIds: z
    .array(id)
    .min(1, "Choose at least one slot.")
    .max(60, "That is more slots than the wall has."),
  durationDays: z.coerce
    .number()
    .int()
    .min(1, "A booking is at least one day.")
    .max(365, "Bookings run to a year at most."),
  startDate: isoDate,
  addonIds: z.array(id).max(20).default([]),
});

export const reserveSchema = quoteRequestSchema.extend({
  artworkId: id.optional(),
});

/* ── Ops (F13, F14, F15) ─────────────────────────────────────────────────── */

export const installWindowSchema = z.object({
  bookingId: id,
  startsAt: z.string().trim().min(1, "Choose a window."),
});

export const checklistUpdateSchema = z.object({
  checkinId: id,
  /** Keys of the checklist items that are now ticked. */
  completed: z.array(z.string().trim().max(64)).max(40),
  conditionNotes: z.string().trim().max(500).optional(),
});

export const checkinVerifySchema = z.object({
  token: z.string().trim().min(1, "Scan or enter a code.").max(128),
  slotId: id,
});

export const transitionSchema = z.object({
  slotId: id,
  to: z.enum(SLOT_STATES),
  version: z.coerce.number().int().min(1),
});

export const forceReleaseSchema = z.object({
  slotId: id,
  reason: z.string().trim().min(3, "Say why — this is audited.").max(280),
  confirm: z.literal("release", {
    error: "Type 'release' to confirm.",
  }),
});

/* ── Visitor & perk (F26, RP01) ──────────────────────────────────────────── */

/**
 * Walk-in registration.
 *
 * `consentPurpose` must be literally true: the DPDP position is that no consent
 * means no registration, so this is a hard schema failure rather than a
 * defaulted-false column. `consentMarketing` is separate and genuinely optional
 * — bundling the two would be exactly the dark pattern the spec rules out.
 */
export const visitorRegisterSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Please tell us your name.")
    .max(80, "That name is longer than we can store."),
  contact: z.string().trim().min(1, "We need a phone number or email.").max(120),
  contactKind: z.enum(["phone", "email"]),
  consentPurpose: z.literal(true, {
    error: "We can only register you if you agree to this.",
  }),
  consentMarketing: z.coerce.boolean().default(false),
});

export const perkRedeemSchema = z.object({
  token: z.string().trim().min(1, "Scan the customer's code.").max(128),
  billAmount: rupeesFromForm.refine((value) => value > 0, {
    message: "Enter the bill total.",
  }),
});

/* ── Engagement (F24, F32) ───────────────────────────────────────────────── */

/** The five reactions, matching the prototype. A closed set, so the aggregate
 *  table can never grow a column of junk from a crafted request. */
export const REACTION_KINDS = ["fire", "love", "art", "gem", "wow"] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

export const reactionSchema = z.object({
  artworkId: id,
  kind: z.enum(REACTION_KINDS),
});

export const feedbackSchema = z.object({
  bookingId: id,
  rating: z.coerce
    .number()
    .int()
    .min(1, "Pick a rating.")
    .max(5),
  nps: z.coerce.number().int().min(0).max(10).optional(),
  note: z.string().trim().max(1000).optional(),
});

/* ── Ledger (F18) ────────────────────────────────────────────────────────── */

export const ledgerEntrySchema = z.object({
  type: z.enum(["revenue", "expense"]),
  category: z.string().trim().min(1, "Pick a category.").max(40),
  amount: rupeesFromForm,
  note: z.string().trim().max(280).optional(),
  entryDate: isoDate,
});

export type GridResizeInput = z.infer<typeof gridResizeSchema>;
export type SlotMoveInput = z.infer<typeof slotMoveSchema>;
export type SizeInput = z.infer<typeof sizeSchema>;
export type SlotTypeInput = z.infer<typeof slotTypeSchema>;
export type AddonInput = z.infer<typeof addonSchema>;
export type QuoteRequestInput = z.infer<typeof quoteRequestSchema>;
export type ReserveInput = z.infer<typeof reserveSchema>;
export type VisitorRegisterInput = z.infer<typeof visitorRegisterSchema>;
export type PerkRedeemInput = z.infer<typeof perkRedeemSchema>;
export type LedgerEntryInput = z.infer<typeof ledgerEntrySchema>;
