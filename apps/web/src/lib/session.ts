import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

/**
 * The signed-in user, or null.
 *
 * Reads the session from the request headers on every call rather than
 * caching: a page that renders differently for a signed-in artist must never
 * be served from a shared cache entry built for someone else.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return null;

    const { id, name, email, image } = session.user;
    return { id, name, email, image };
  } catch (error) {
    // Next signals "this render is dynamic" and "this render is bailing out"
    // by throwing. Swallowing those would let a signed-out prerender be cached
    // and served to a signed-in visitor, so they are re-thrown untouched.
    if (isFrameworkControlFlow(error)) throw error;

    // A genuinely unreachable auth database must not take the page down - the
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
