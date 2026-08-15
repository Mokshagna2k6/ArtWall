export const siteConfig = {
  name: "ArtWall",
  legalName: "Artwall Labs Pvt Ltd",
  tagline: "Art lives on the wall.",
  positioning: "Reimagining and revolutionising India's art economy.",
  description:
    "India's digital home for artists. Exhibitions, a fair marketplace, and tamper-proof certification. Launching Diwali 2026.",
  url: "https://www.artwalllabs.com",

  /**
   * When the platform goes live. Everything that counts down reads this one
   * constant.
   *
   * NOTE FOR THE FOUNDERS: the current teaser says both "Diwali 2026" and
   * "October", but Diwali 2026 (Lakshmi Puja) actually falls on 8 November
   * 2026. The live countdown implies ~19 October. Those cannot both be true -
   * pick one and set it here. The value below matches the countdown currently
   * running on artwalllabs.com; change the date and every surface follows.
   */
  launchAt: "2026-10-19T00:00:00+05:30",

  contact: {
    email: "artwalllabs@gmail.com",
    phone: "+91 82093 95894",
    /** E.164 without punctuation, for tel: and wa.me links. */
    phoneDigits: "918209395894",
  },

  social: {
    instagram: "https://instagram.com/artwalllabs",
    x: "https://x.com/artwalllabs",
    linkedin: "https://linkedin.com/company/artwalllabs",
    youtube: "https://youtube.com/@artwalllabs",
    whatsapp: "https://wa.me/918209395894",
  },

  credentials: {
    recognition: "DPIIT Recognised · Startup India, Govt. of India",
    origin: "Designed & built in Rajasthan",
  },

  /** Engineering, cloud, and blockchain partner. */
  techPartner: { name: "StackFox", url: "https://stackfox.in" },
} as const;

/**
 * Feature flags.
 *
 * `studio` is the artist workspace at /studio. It is built but not ready to be
 * shown, so it is switched off here rather than deleted: every route, action,
 * and component stays in the tree and compiles, and turning it back on is a
 * one-line change instead of a revert.
 *
 * While it is off:
 *  - no link to it appears anywhere in the site chrome,
 *  - signing in lands on the wall rather than the workspace,
 *  - /studio and everything under it redirect away.
 */
export const features = {
  studio: false,

  /**
   * `physicalWall` is the Wall Management System at /physical-wall - the real
   * wall inside the Ric Platter venue, as distinct from the digital wall at
   * /wall. Off by default: it is operational software for a venue that has not
   * opened, and a booking page that takes money for slots nobody can hang work
   * in would be worse than no page.
   *
   * Switched on with PHYSICAL_WALL_ENABLED=true rather than by editing this
   * file, so staging can run it while production does not.
   *
   * While it is off, /physical-wall and everything under it - including the
   * /q/ QR resolver - returns a not-found. Printed codes stay dormant rather
   * than resolving to a half-built page.
   */
  physicalWall: process.env.PHYSICAL_WALL_ENABLED === "true",
} as const;

/** Where a person lands after signing in when no callback was requested. */
export const POST_AUTH_DESTINATION = features.studio ? "/studio" : "/join";
