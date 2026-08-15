import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  /** visitor | artist | staff | admin. See db/migrations/0006_physical_wall.sql. */
  role: text("role").notNull().default("artist"),
  /** Claimed at onboarding, never assumed (F31). */
  foundingMember: boolean("foundingMember").notNull().default(false),
  /** Identity verification. Required before a first payout, not before exhibiting. */
  verifiedAt: timestamp("verifiedAt", { withTimezone: true }),
  verificationMethod: text("verificationMethod"),
  /** Self-declared 18+. Null means not yet asked (DPDP §5.4). */
  ageDeclaredAdult: boolean("ageDeclaredAdult"),
  onboardedAt: timestamp("onboardedAt", { withTimezone: true }),
  nomineeName: text("nomineeName"),
  nomineeContact: text("nomineeContact"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});
export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId").notNull(),
});
export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId").notNull(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});
export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
  updatedAt: timestamp("updatedAt").defaultNow(),
});

export const artistProfiles = pgTable("artist_profiles", {
  userId: text("userId").primaryKey(),
  handle: text("handle").notNull().unique(),
  displayName: text("displayName").notNull(),
  discipline: text("discipline"),
  location: text("location"),
  bio: text("bio"),
  website: text("website"),
  instagram: text("instagram"),
  avatarUrl: text("avatarUrl"),
  published: boolean("published").notNull().default(false),
  publishedAt: timestamp("publishedAt"),
  onboardingCompleted: boolean("onboardingCompleted").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const artworks = pgTable("artworks", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull(),
  title: text("title").notNull(),
  year: integer("year"),
  medium: text("medium"),
  description: text("description"),
  dimensions: text("dimensions"),
  status: text("status").notNull().default("available"),
  imageUrl: text("imageUrl"),
  imagePublicId: text("imagePublicId"),
  isPublic: boolean("isPublic").notNull().default(true),
  /**
   * Where this work is in the *physical* wall lifecycle, if it is on it at all.
   * Null for the vast majority of works, which only ever live in the artist's
   * own catalogue.
   */
  physicalStatus: text("physicalStatus"),
  qrToken: text("qrToken"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});
export const contacts = pgTable("contacts", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  kind: text("kind").notNull().default("collector"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});
export const collections = pgTable("collections", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});
export const tasks = pgTable("tasks", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("open"),
  dueAt: timestamp("dueAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});
export const sales = pgTable("sales", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull(),
  contactId: text("contactId"),
  artworkId: text("artworkId"),
  status: text("status").notNull().default("lead"),
  amount: integer("amount"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});
export const documents = pgTable("documents", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull(),
  title: text("title").notNull(),
  kind: text("kind").notNull().default("certificate"),
  url: text("url"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});
export const rooms = pgTable("rooms", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

/* ── Physical wall (WMS) ─────────────────────────────────────────────────────
 *
 * The wall inside the Ric Platter venue. Everything is prefixed `pw_` in the
 * database so it is never confused with the *digital* wall (`waitlist_entries`,
 * /wall), which is a different product.
 *
 * Money is stored in paise as integers throughout, and every such column says
 * so in its name. See db/migrations/0006_physical_wall.sql for the reasoning
 * behind each table's shape.
 */

export const pwGridConfig = pgTable("pw_grid_config", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  rowCount: integer("row_count").notNull(),
  colCount: integer("col_count").notNull(),
  isTemplate: boolean("is_template").notNull().default(false),
  active: boolean("active").notNull().default(false),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pwSizeCatalog = pgTable("pw_size_catalog", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  wCm: integer("w_cm").notNull(),
  hCm: integer("h_cm").notNull(),
  weightKg: integer("weight_kg").notNull().default(5),
  basePricePaise: integer("base_price_paise").notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pwSlotTypes = pgTable("pw_slot_types", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  /** Basis points: 10000 = 1.0x. Integer so pricing never touches a float. */
  multiplierBp: integer("multiplier_bp").notNull(),
  requiresGrant: boolean("requires_grant").notNull().default(false),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pwSlots = pgTable("pw_slots", {
  id: text("id").primaryKey(),
  gridId: text("grid_id").notNull(),
  rowIndex: integer("row_index").notNull(),
  colIndex: integer("col_index").notNull(),
  label: text("label").notNull(),
  sizeId: text("size_id").notNull(),
  typeId: text("type_id").notNull(),
  state: text("state").notNull().default("available"),
  /** Optimistic lock. Two admins can edit the grid at the same time. */
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pwAddonCatalog = pgTable("pw_addon_catalog", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  pricePaise: integer("price_paise").notNull(),
  appliesTo: text("applies_to").notNull().default("artist"),
  category: text("category").notNull().default("general"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Append-only. A booking snapshots the version in force when it was made. */
export const pwRefundPolicy = pgTable("pw_refund_policy", {
  version: integer("version").primaryKey().generatedAlwaysAsIdentity(),
  percentage: integer("percentage").notNull(),
  note: text("note"),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Single row, id pinned to 1. Every tunable the founder owns. */
export const pwSettings = pgTable("pw_settings", {
  id: integer("id").primaryKey().default(1),
  holdMinutes: integer("hold_minutes").notNull().default(30),
  bufferDays: integer("buffer_days").notNull().default(0),
  gstRateBp: integer("gst_rate_bp").notNull().default(1800),
  surgeEnabled: boolean("surge_enabled").notNull().default(false),
  surgeThresholdPct: integer("surge_threshold_pct").notNull().default(80),
  surgeMultiplierBp: integer("surge_multiplier_bp").notNull().default(11500),
  perkDiscountBp: integer("perk_discount_bp").notNull().default(1000),
  perkCostBearer: text("perk_cost_bearer").notNull().default("artwall"),
  groupDiscountTiers: jsonb("group_discount_tiers").notNull().default([]),
  venueOpenHour: integer("venue_open_hour").notNull().default(11),
  venueCloseHour: integer("venue_close_hour").notNull().default(22),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pwBookings = pgTable("pw_bookings", {
  id: text("id").primaryKey(),
  artistId: text("artist_id").notNull(),
  artworkId: text("artwork_id"),
  status: text("status").notNull().default("held"),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  durationDays: integer("duration_days").notNull(),
  baseAmountPaise: integer("base_amount_paise").notNull().default(0),
  addonAmountPaise: integer("addon_amount_paise").notNull().default(0),
  discountAmountPaise: integer("discount_amount_paise").notNull().default(0),
  gstAmountPaise: integer("gst_amount_paise").notNull().default(0),
  totalAmountPaise: integer("total_amount_paise").notNull().default(0),
  surgeApplied: boolean("surge_applied").notNull().default(false),
  /** Snapshot, not a join: the policy in force at booking time governs. */
  refundPolicyVersion: integer("refund_policy_version"),
  holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
  cancelledReason: text("cancelled_reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pwBookingSlots = pgTable(
  "pw_booking_slots",
  {
    bookingId: text("booking_id").notNull(),
    slotId: text("slot_id").notNull(),
    /** A copy, not a join: editing the catalog must not re-price a booking. */
    quotedPricePaise: integer("quoted_price_paise").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.bookingId, table.slotId] }),
  ]
);

export const pwBookingAddons = pgTable("pw_booking_addons", {
  id: text("id").primaryKey(),
  bookingId: text("booking_id").notNull(),
  addonId: text("addon_id").notNull(),
  label: text("label").notNull(),
  pricePaise: integer("price_paise").notNull(),
  fulfilled: boolean("fulfilled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pwPayments = pgTable("pw_payments", {
  id: text("id").primaryKey(),
  bookingId: text("booking_id").notNull(),
  provider: text("provider").notNull().default("razorpay"),
  orderId: text("order_id"),
  paymentId: text("payment_id"),
  /** Unique. This column is the entire webhook-idempotency story. */
  eventId: text("event_id").unique(),
  amountPaise: integer("amount_paise").notNull(),
  status: text("status").notNull().default("created"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pwLedger = pgTable("pw_ledger", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  category: text("category").notNull(),
  amountPaise: integer("amount_paise").notNull(),
  note: text("note"),
  entryDate: date("entry_date").notNull(),
  sourceRef: text("source_ref"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pwInstallWindows = pgTable("pw_install_windows", {
  id: text("id").primaryKey(),
  bookingId: text("booking_id").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("offered"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pwCheckins = pgTable("pw_checkins", {
  id: text("id").primaryKey(),
  bookingId: text("booking_id").notNull(),
  slotId: text("slot_id").notNull(),
  /** Derived per booking from size, type and add-ons — no fixed columns to model. */
  checklist: jsonb("checklist").notNull().default([]),
  conditionPhotoUrl: text("condition_photo_url"),
  conditionNotes: text("condition_notes"),
  verifiedBy: text("verified_by"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Artwork labels, artist coupons and visitor coupons: one resolver, one table. */
export const pwQrTokens = pgTable("pw_qr_tokens", {
  token: text("token").primaryKey(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const pwVisitors = pgTable("pw_visitors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  contact: text("contact").notNull(),
  contactKind: text("contact_kind").notNull().default("phone"),
  /** Required to store the row at all. Marketing consent is separate. */
  consentPurpose: boolean("consent_purpose").notNull().default(false),
  consentMarketing: boolean("consent_marketing").notNull().default(false),
  consentedAt: timestamp("consented_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pwVisits = pgTable("pw_visits", {
  id: text("id").primaryKey(),
  visitorId: text("visitor_id").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

/** No IP, no user agent. Data minimisation is the design, not an oversight. */
export const pwScans = pgTable("pw_scans", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  artworkId: text("artwork_id").notNull(),
  visitId: text("visit_id"),
  source: text("source").notNull().default("qr"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pwPerkRedemptions = pgTable("pw_perk_redemptions", {
  id: text("id").primaryKey(),
  principalType: text("principal_type").notNull(),
  principalId: text("principal_id").notNull(),
  /** The field that makes this a sale tracker rather than a coupon log. */
  billAmountPaise: integer("bill_amount_paise"),
  discountAmountPaise: integer("discount_amount_paise").notNull().default(0),
  artworkRef: text("artwork_ref"),
  visitRef: text("visit_ref"),
  bookingRef: text("booking_ref"),
  flagged: boolean("flagged").notNull().default(false),
  redeemedBy: text("redeemed_by"),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Aggregate counts only. There is no "who reacted" to leak (F24). */
export const pwReactions = pgTable(
  "pw_reactions",
  {
    artworkId: text("artwork_id").notNull(),
    kind: text("kind").notNull(),
    count: integer("count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.artworkId, table.kind] })]
);

/** One voluntary response per completed booking (F32). */
export const pwFeedback = pgTable("pw_feedback", {
  id: text("id").primaryKey(),
  bookingId: text("booking_id").notNull(),
  artistId: text("artist_id"),
  rating: integer("rating").notNull(),
  nps: integer("nps"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * The Consent Manager record (DPDP §5.2).
 *
 * One row per person per purpose, so withdrawing marketing cannot touch the
 * account consent. Withdrawal sets `withdrawnAt` — rows are never deleted,
 * because the record that consent was held, and when it ended, is the evidence.
 */
export const pwConsents = pgTable("pw_consents", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  visitorId: text("visitor_id"),
  purpose: text("purpose").notNull(),
  granted: boolean("granted").notNull().default(true),
  noticeVersion: text("notice_version").notNull().default("v1"),
  grantedAt: timestamp("granted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
});

/** Hash-sealed at signature, so the version signed can be proven (F20). */
export const pwAgreements = pgTable("pw_agreements", {
  id: text("id").primaryKey(),
  bookingId: text("booking_id").notNull(),
  artistId: text("artist_id").notNull(),
  termsVersion: text("terms_version").notNull(),
  termsHash: text("terms_hash").notNull(),
  body: text("body").notNull(),
  refundPolicyVersion: integer("refund_policy_version"),
  totalAmountPaise: integer("total_amount_paise").notNull(),
  signedName: text("signed_name").notNull(),
  signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pwWaitlist = pgTable("pw_waitlist", {
  id: text("id").primaryKey(),
  artistId: text("artist_id"),
  name: text("name").notNull(),
  contact: text("contact").notNull(),
  city: text("city"),
  medium: text("medium"),
  sizePref: text("size_pref"),
  note: text("note"),
  tier: text("tier").notNull().default("new"),
  /** A manual rank sits above the automatic tier ordering (C04). */
  priorityRank: integer("priority_rank"),
  status: text("status").notNull().default("queued"),
  matchedSlotId: text("matched_slot_id"),
  offerExpiresAt: timestamp("offer_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pwQueueOverrides = pgTable("pw_queue_overrides", {
  id: text("id").primaryKey(),
  waitlistId: text("waitlist_id").notNull(),
  action: text("action").notNull(),
  actorId: text("actor_id"),
  note: text("note"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export const pwGrievances = pgTable("pw_grievances", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  contact: text("contact").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("open"),
  /** The Act wants a time-bound response, so the clock is a column. */
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  response: text("response"),
  respondedBy: text("responded_by"),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Append-only. "This admin did this", not "an admin did this". */
export const pwAuditLog = pgTable("pw_audit_log", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  actorId: text("actor_id"),
  actorLabel: text("actor_label"),
  action: text("action").notNull(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});
