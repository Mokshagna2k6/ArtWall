import { POLICIES } from "@artwall/ratelimit";
import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";
import {
  checkRateLimit,
  clientIp,
  mostRestrictive,
  retryIn,
  tooManyRequests,
  type RateLimitRule,
} from "@/lib/rate-limit";

const handler = toNextJsHandler(auth.handler);

export const { GET } = handler;

/**
 * Credential endpoints (PERF-1.05). better-auth's own limiter is disabled in
 * lib/auth.ts (it is in-memory per instance); these persistent limits replace
 * it. `ip` caps one source across all accounts (credential stuffing);
 * `identifier` caps one source guessing one account (IP + email).
 *
 *  - sign-in:  5 per 15 min per IP+email, 20 per 15 min per IP. Five typos is
 *              plenty for a human; 20 leaves room for a shared office NAT.
 *  - sign-up:  5 per hour per IP. Nobody creates more than a couple of accounts.
 *  - password reset request: 3 per hour per IP+email, 10 per hour per IP.
 *              Each one sends an email; this stops mailbox bombing.
 *  - reset-password (token submit): 10 per hour per IP; tokens are long random
 *              strings, this just stops hammering.
 */
// Values live in the policy table (packages/ratelimit/src/policies.ts); all fail closed.
const RULES: Record<string, { ip: RateLimitRule; identifier?: RateLimitRule }> = {
  "/sign-in/email": { ip: POLICIES.login, identifier: POLICIES["login-identifier"] },
  "/sign-up/email": { ip: POLICIES.signup },
  "/request-password-reset": { ip: POLICIES["password-reset"], identifier: POLICIES["password-reset-identifier"] },
  "/reset-password": { ip: POLICIES["reset-password"] },
};

export async function POST(request: Request) {
  const path = new URL(request.url).pathname.replace(/^\/api\/auth/, "");
  const rule = RULES[path];
  if (!rule) return handler.POST(request);

  const ip = clientIp(request.headers);
  const checks = [checkRateLimit(`auth${path}:ip:${ip}`, rule.ip)];
  if (rule.identifier) {
    const body = (await request.clone().json().catch(() => null)) as { email?: unknown } | null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    checks.push(checkRateLimit(`auth${path}:id:${ip}:${email}`, rule.identifier));
  }

  // Credential endpoints fail CLOSED (PERF-2.03): no counting, no sign-in.
  const limit = mostRestrictive(await Promise.all(checks));
  if (!limit.ok) {
    return tooManyRequests(
      limit,
      limit.unavailable
        ? { code: "SERVICE_UNAVAILABLE", message: "Temporarily unavailable on our side. Try again in a moment." }
        : { code: "TOO_MANY_REQUESTS", message: `Too many attempts. Try again in ${retryIn(limit)}.` }
    );
  }
  return handler.POST(request);
}
