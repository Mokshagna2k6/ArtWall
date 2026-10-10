/**
 * The platform argument, as data.
 *
 * Why this file exists: the "why we're building this" story is told in three
 * places (the home teaser, the platform page, and the investor conversation).
 * Keeping the numbers here means a figure can never be right on one surface
 * and stale on another.
 *
 * Every figure below is either a stated company claim or a modelling
 * assumption, and each is labelled as such. Nothing here is presented to a
 * visitor as a market statistic without the company standing behind it.
 */

/** The problem, in the numbers the company quotes publicly. */
export const problem = {
  artists: {
    value: 42,
    unit: "million",
    label: "artists and artisans in India",
    line: "The largest creative workforce on earth, and almost none of it is reachable by a buyer who wants to pay fairly.",
  },
  leakage: {
    value: 85,
    unit: "%",
    label: "absorbed before the maker is paid",
    line: "Distributors, agents, and galleries take up to eighty-five paise of every rupee a buyer spends.",
  },
  trust: {
    value: 0,
    unit: "",
    label: "places a first-time buyer can verify a work",
    line: "Fakes circulate freely because nothing in the chain proves what a piece is or where it came from.",
  },
} as const;

/**
 * FOUNDERS - CONFIRM BEFORE LAUNCH.
 *
 * These two rates drive the value-split visual and the earnings calculator.
 * They are the only invented numbers on the page, and they are the ones a
 * journalist or an artist will hold us to. Set them to the real commercial
 * terms and both surfaces update together.
 */
export const economics = {
  /** Share of the sale price the artist keeps on a primary sale. */
  artistShare: 0.85,
  /** Artist's cut of every subsequent resale, enforced by the certificate. */
  resaleRoyalty: 0.1,
  /** Share the artist keeps today, on the far side of the middleman chain. */
  legacyArtistShare: 0.15,
  /**
   * Modelling assumption for the calculator: how much a work is worth at each
   * resale, relative to the previous sale. Deliberately conservative.
   */
  resaleAppreciation: 1.35,
} as const;

export interface Layer {
  id: string;
  index: string;
  name: string;
  claim: string;
  body: string;
  /** The three things this layer actually does, in plain language. */
  mechanics: readonly string[];
  /** Guards against the obvious misreading of what we built. */
  notThis?: string;
}

/** The three connected layers of the platform. */
export const layers: readonly Layer[] = [
  {
    id: "exhibition",
    index: "01",
    name: "The Exhibition Engine",
    claim: "Art reaches the wall where its buyer already stands.",
    body: "Discovery does not happen in a search box. It happens when someone looks up from a coffee, a hotel check-in, a desk. The engine reads a physical space, its light, its dimensions, its footfall, its audience, and matches real artworks to real walls in hotels, galleries, and coworking floors.",
    mechanics: [
      "Venues list wall space; artists list available work",
      "Matching scores light, scale, palette, and audience fit",
      "Placement, rotation, and revenue split handled end to end",
    ],
  },
  {
    id: "escrow",
    index: "02",
    name: "Escrow and the Fraud Layer",
    claim: "The money waits until the work is proven.",
    body: "Every sale settles through bank-grade escrow. Before funds release, an AI authentication layer, trained specifically on Indian traditional forms rather than on Western canvas, scores the work against the tradition it claims to belong to. Counterfeits are stopped at the platform, not discovered in a collector's living room.",
    mechanics: [
      "Funds held in regulated escrow until delivery is confirmed",
      "Authentication trained on Madhubani, Phad, Warli, Pattachitra and more",
      "A flagged work never reaches the buyer, and the artist is never blamed for it",
    ],
  },
  {
    id: "provenance",
    index: "03",
    name: "Provenance That Outlives Everyone",
    claim: "One certificate, carried for the life of the work.",
    body: "Each artwork is issued a tamper-proof provenance record at the moment of its first sale. Every exhibition, transfer, restoration, and resale is written to it. When the piece changes hands in twenty years, the record still names the person who made it, and pays them.",
    mechanics: [
      "Issued at first sale, extended at every event afterwards",
      "Resale royalties trigger automatically on transfer",
      "Verifiable by anyone holding the work, with no wallet or app",
    ],
    notThis:
      "Not an NFT. Not a token to speculate on. A record of fact that happens to be impossible to forge.",
  },
] as const;

/** Mission and the 2030 commitments, in the company's own words. */
export const mission = {
  statement:
    "To democratise opportunity for India's creative economy, a compliant, scalable, creator-first platform that preserves cultural heritage while enabling real, sustainable livelihoods.",
  visionYear: "2030",
  visionStatement: "India's most trusted platform for creative commerce.",
  pillars: [
    {
      title: "Every artisan has digital access",
      line: "A weaver in a village district reaches a collector in Berlin without a broker standing between them.",
    },
    {
      title: "Every artwork carries verified provenance",
      line: "Authenticity stops being a matter of reputation and becomes a matter of record.",
    },
    {
      title: "Every transaction keeps a craft alive",
      line: "Fair payment is what turns an inherited tradition into a career worth passing on.",
    },
  ],
} as const;
