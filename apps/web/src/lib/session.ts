import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

/**
 * The signed-in user, or null.
 *
 * Reads the session on every call rather than caching: a page that renders
 * differently for a signed-in artist must never be served from a shared cache
 * entry built for someone else.
 *
 * Uses `getClaims()`, **never `getSession()`**. Supabase's own docs are
 * explicit that the session cookie is forgeable, so the user object embedded in
 * it cannot be trusted for authorization - `getClaims()` verifies the JWT
 * signature (locally against the project's JWKS when it can, otherwise over the
 * network). Every `requireRole`/`requireAdminRole` gate in this app resolves
 * its actor through this function, so trusting an unverified cookie here would
 * hand an attacker any role they cared to name.
 *
 * `id` is the Supabase `auth.users` uuid, which is also the primary key of our
 * own `public.user` profile row (kept in sync by the `handle_new_user` trigger,
 * migration 0074). So the 26 tables carrying a `userId` need no change.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims) return null;

    const claims = data.claims as {
      sub?: string;
      email?: string;
      user_metadata?: { name?: string; full_name?: string; avatar_url?: string };
    };
    if (!claims.sub) return null;

    const metadata = claims.user_metadata ?? {};
    return {
      id: claims.sub,
      // Falls back to the local part of the email so `name` keeps its
      // non-null contract even for an account created without one.
      name: metadata.name ?? metadata.full_name ?? claims.email?.split("@")[0] ?? "",
      email: claims.email ?? "",
      image: metadata.avatar_url ?? null,
    };
  } catch (error) {
    // Next signals "this render is dynamic" and "this render is bailing out"
    // by throwing. Swallowing those would let a signed-out prerender be cached
    // and served to a signed-in visitor, so they are re-thrown untouched.
    if (isFrameworkControlFlow(error)) throw error;

    // A genuinely unreachable auth service must not take the page down - the
    // caller treats this as "signed out", which is the safe direction.
    console.error("[auth] Could not read session", error);
    return null;
  }
}

/**
 * Is this one of Next's control-flow throws rather than a real failure?
 *
 * Matched on the `digest` string because these error classes are internal to
 * Next and not importable. Checked with `startsWith` so the parameterised
 * digests (`NEXT_REDIRECT;replace;/sign-in;…`) match too.
 */
function isFrameworkControlFlow(error: unknown): boolean {
  const digest = (error as { digest?: unknown })?.digest;
  if (typeof digest !== "string") return false;

  return (
    digest === "DYNAMIC_SERVER_USAGE" ||
    digest === "BAILOUT_TO_CLIENT_SIDE_RENDERING" ||
    digest.startsWith("NEXT_REDIRECT") ||
    digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")
  );
}

/**
 * Require a signed-in user, or send them to sign in and back again.
 *
 * `returnTo` is a path we construct, never user input, so there is no open
 * redirect here - and the sign-in page re-checks that the callback is a
 * same-site path before using it.
 */
export async function requireUser(returnTo: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect(`/sign-in?callbackUrl=${encodeURIComponent(returnTo)}`);
  }
  return user;
}
