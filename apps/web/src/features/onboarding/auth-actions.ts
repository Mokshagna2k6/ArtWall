"use server";

import { POLICIES } from "@artwall/ratelimit";
import { headers } from "next/headers";

import {
  checkRateLimit,
  clientIp,
  mostRestrictive,
  retryIn,
  type RateLimitRule,
} from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * Credential auth, rate-limited server-side.
 *
 * ## Why these are server actions and not a client-side Supabase call
 *
 * Before the Supabase migration, every credential request went through
 * `/api/auth/[...all]`, which applied the persistent limits below (PERF-1.05).
 * Calling `supabase.auth.signInWithPassword` straight from the browser would
 * talk to Supabase's API directly and **bypass this project's limiter
 * entirely**, losing credential-stuffing protection. Supabase has its own
 * limits, but they are per-project and not tunable per identifier, so they do
 * not replace these.
 *
 * Routing credentials through a server action keeps the limiter on the path and
 * keeps the cookie write on the server, where it belongs. OAuth is unaffected:
 * it is a redirect to Google, not a credential submission.
 *
 *  - sign-in:  5 per 15 min per IP+email, 20 per 15 min per IP. Five typos is
 *              plenty for a human; 20 leaves room for a shared office NAT.
 *  - sign-up:  5 per hour per IP. Nobody creates more than a couple of accounts.
 *  - password reset request: 3 per hour per IP+email, 10 per hour per IP.
 *              Each one sends an email; this stops mailbox bombing.
 *
 * All of these **fail closed** (PERF-2.03): if the limiter's store is
 * unreachable there is no counting, so there is no sign-in either.
 */

export interface AuthActionResult {
  error: { code?: string; message: string } | null;
}

export async function signInWithPassword(
  email: string,
  password: string
): Promise<AuthActionResult> {
  const limited = await limit("sign-in", POLICIES.login, POLICIES["login-identifier"], email);
  if (limited) return limited;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error ? { code: error.code, message: error.message } : null };
}

export async function signUpWithPassword(
  email: string,
  password: string,
  name: string
): Promise<AuthActionResult> {
  const limited = await limit("sign-up", POLICIES.signup);
  if (limited) return limited;

  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? "";
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Copied into `public.user.name` by the handle_new_user trigger
      // (migration 0074), so the profile row is correct from the first insert.
      data: { name },
      emailRedirectTo: `${origin}/api/auth/callback`,
    },
  });
  return { error: error ? { code: error.code, message: error.message } : null };
}

export async function requestPasswordReset(email: string): Promise<AuthActionResult> {
  const limited = await limit(
    "password-reset",
    POLICIES["password-reset"],
    POLICIES["password-reset-identifier"],
    email
  );
  if (limited) return limited;

  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? "";
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/api/auth/callback?next=/studio/settings`,
  });

  // Deliberately not surfaced (SEC-2.12, account enumeration): the caller
  // shows the same "check your email" either way, so a failure here is logged
  // and swallowed rather than telling the sender whether the address exists.
  if (error) console.error("[auth] Password reset request failed", error);
  return { error: null };
}

export async function signOut(): Promise<AuthActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  return { error: error ? { code: error.code, message: error.message } : null };
}

/**
 * Apply the IP rule, and the IP+identifier rule when there is an identifier.
 *
 * `ip` caps one source across all accounts (credential stuffing);
 * `identifier` caps one source guessing one account.
 */
async function limit(
  scope: string,
  ipRule: RateLimitRule,
  identifierRule?: RateLimitRule,
  identifier?: string
): Promise<AuthActionResult | null> {
  const ip = clientIp(await headers());
  const checks = [checkRateLimit(`auth/${scope}:ip:${ip}`, ipRule)];

  if (identifierRule && identifier) {
    const normalised = identifier.trim().toLowerCase();
    checks.push(checkRateLimit(`auth/${scope}:id:${ip}:${normalised}`, identifierRule));
  }

  const result = mostRestrictive(await Promise.all(checks));
  if (result.ok) return null;

  return {
    error: result.unavailable
      ? {
          code: "SERVICE_UNAVAILABLE",
          message: "Temporarily unavailable on our side. Try again in a moment.",
        }
      : {
          code: "TOO_MANY_REQUESTS",
          message: `Too many attempts. Try again in ${retryIn(result)}.`,
        },
  };
}
