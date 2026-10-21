import { NextResponse } from "next/server";

import { POST_AUTH_DESTINATION } from "@/config/site";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth and email-confirmation landing route.
 *
 * Supabase sends the browser here with a one-time `code`, which is exchanged
 * for a session. The exchange must happen server-side in a Route Handler —
 * that is the only place able to write the auth cookie (a Server Component
 * cannot set headers; see the try/catch in src/lib/supabase/server.ts).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/sign-in?error=missing_code", url.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // The code is single-use and short-lived, so a stale or replayed link ends
    // up here. No detail is echoed back: the reason is for our logs, not for
    // whoever followed the link.
    console.error("[auth] Code exchange failed", error);
    return NextResponse.redirect(new URL("/sign-in?error=auth_failed", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}

/**
 * Only same-site paths are honoured.
 *
 * `next` arrives in a URL the user can edit, so it is untrusted here even
 * though auth-form.tsx already filtered it. A value beginning "//" is a
 * protocol-relative URL to another host — the classic open-redirect shape —
 * and a value with a scheme is an absolute URL; both fall back to the default.
 */
function safeNext(value: string | null): string {
  if (!value) return POST_AUTH_DESTINATION;
  if (!value.startsWith("/")) return POST_AUTH_DESTINATION;
  if (value.startsWith("//")) return POST_AUTH_DESTINATION;
  return value;
}
