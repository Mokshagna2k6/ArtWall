import { betterAuth } from "better-auth";
import { pool } from "@/lib/db/index";
import { notify } from "@/features/physical-wall/notifications";

const baseUrl =
  process.env.BETTER_AUTH_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined) ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ??
  process.env.V0_RUNTIME_URL ??
  "http://localhost:3000";

if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET is required for Better Auth");
}

const trustedOrigins = Array.from(
  new Set(
    [
      baseUrl,
      process.env.BETTER_AUTH_URL,
      process.env.V0_RUNTIME_URL,
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
      process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : undefined,
    ].filter(Boolean) as string[]
  )
);

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

export const auth = betterAuth({
  // Shared pool: one set of connections and one place that handles dropped ones.
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: baseUrl,
  trustedOrigins,
  emailAndPassword: { enabled: true },
  // KB-C03 follow-up: a Google sign-in can only auto-link onto an existing
  // local account once that account's email is verified (see accountLinking
  // below). Without this, that local account's emailVerified stayed false
  // forever and Google linking was permanently blocked for every user who
  // signed up with email/password first.
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await notify("auth.verify-email", { userId: user.id, email: user.email }, { name: user.name, url });
    },
  },
  // Off: better-auth's built-in limiter defaults to per-instance memory, which
  // does nothing on serverless. The credential endpoints are limited by the
  // shared Postgres limiter in app/api/auth/[...all]/route.ts instead.
  rateLimit: { enabled: false },
  account: {
    accountLinking: {
      // Equivalent to NextAuth's `allowDangerousEmailAccountLinking` for Google.
      // Google must still return a verified email address before it is linked.
      trustedProviders: ["google"],
      // KB-C03: `false` let an OAuth sign-in silently link onto ANY existing
      // local account with a matching email, even one that never verified it
      // (e.g. an attacker's own unverified sign-up in someone else's address).
      // The default (true) requires the existing local account's email to
      // already be verified before a new provider can attach to it.
      requireLocalEmailVerified: true,
    },
  },
  ...(googleClientId && googleClientSecret
    ? {
        socialProviders: {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        },
      }
    : {}),
  // SEC-2.05: this SameSite=Lax (below) is also this app's CSRF defense for
  // the handful of cookie-session-authenticated API routes that aren't Next
  // server actions (src/app/api/blockchain/**, ugc/upload-signature) — Lax
  // cookies are withheld from cross-site fetch/XHR entirely, POST included,
  // not just cross-site form submission, and nothing here sets a wildcard
  // CORS header that would widen that. Server actions get Next's own
  // Origin/Host check instead (confirmed in
  // node_modules/next/dist/docs/01-app/02-guides/server-actions.md).
  advanced: {
    defaultCookieAttributes:
      process.env.NODE_ENV === "development"
        ? // `SameSite=None` cookies must also be `Secure`, so the previous setting
          // was discarded by browsers on the standard http://localhost dev server.
          // Keep production cookies HTTPS-only while allowing local sign-in to work.
          { sameSite: "lax", secure: false }
        : { sameSite: "lax", secure: true },
  },
});
