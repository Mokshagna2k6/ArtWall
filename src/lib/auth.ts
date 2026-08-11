import { betterAuth } from "better-auth";
import { Pool } from "pg";

const baseUrl = process.env.BETTER_AUTH_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined) ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ??
  process.env.V0_RUNTIME_URL ?? "http://localhost:3000";

if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET is required for Better Auth");
}

const trustedOrigins = Array.from(new Set([
  baseUrl,
  process.env.BETTER_AUTH_URL,
  process.env.V0_RUNTIME_URL,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined,
].filter(Boolean) as string[]));

export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: baseUrl,
  trustedOrigins,
  emailAndPassword: { enabled: true },
  advanced: {
    defaultCookieAttributes: process.env.NODE_ENV === "development"
      ? { sameSite: "none", secure: true }
      : { sameSite: "lax", secure: true },
  },
});
