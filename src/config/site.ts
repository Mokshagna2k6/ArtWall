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

  /**
   * DPDP Rules 2025, Rule 13: the grievance officer's name, designation and
   * contact details must be prominently published. Displayed on the rights
   * centre (BE-3.20) next to the grievance form it already has.
   */
  grievanceOfficer: {
    name: "Grievance Officer, Artwall Labs",
    email: "grievance@artwalllabs.com",
    phone: "+91 82093 95894",
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
 * `studio` is the artist workspace at /studio. On: a signed-in user reaching
 * /studio gets the workspace (the layout sends anonymous visitors to sign-in),
 * and signing in lands there when no callback was requested. Kept as a flag so
 * it can be switched off again in one line if needed.
 */
export const features = {
  studio: true,

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

  /**
   * `marketplaceCheckout`: buyers can put artworks in a cart and pay for them
   * (cart, checkout, orders, seller fulfilment, escrow, payouts). Off by
   * default: it moves real money, and needs Razorpay live keys, a commission
   * policy and legal/finance sign-off first (docs/plans/BUYER_CHECKOUT_PLAN.md).
   * Switched on with MARKETPLACE_CHECKOUT_ENABLED=true. While off, every page
   * is a not-found and every action/webhook branch refuses.
   */
  marketplaceCheckout: process.env.MARKETPLACE_CHECKOUT_ENABLED === "true",
} as const;

/**
 * Where a person lands after signing in when no callback was requested.
 *
 * This is deliberately role-blind — an admin or team-member account signing
 * in still gets sent here first, same as everyone else. src/app/layout.tsx's
 * session-wide admin-shell takeover (FE-3.19) then redirects any such
 * account straight to /physical-wall/admin on the very next render, before
 * this destination's own page (e.g. studio/layout.tsx's onboarding check)
 * does anything — so the "land directly in the admin shell" requirement is
 * met without this constant, or auth-form.tsx, needing to know about roles
 * at all.
 */
export const POST_AUTH_DESTINATION = features.studio ? "/studio" : "/join";
