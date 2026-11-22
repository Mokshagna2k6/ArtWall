import { buildCsp, buildCspReportOnly } from "@artwall/security";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

// SEC-2.03: the CSP in next.config.ts used to allow 'unsafe-inline' for
// script-src, which defeats the point of a CSP against XSS — any injected
// <script> tag runs. Nonces let the framework's own scripts (and the inline
// JSON-LD tag in src/components/seo/json-ld.tsx) run while blocking anything
// an attacker injects, since they can't predict this per-request value.
//
// Every page here is already dynamically rendered (`ƒ` in `pnpm build`'s
// route list, not `○`/`●`), so the "nonces require dynamic rendering"
// trade-off the Next.js docs describe costs nothing extra on this app.
//
// This is also the only place a refreshed Supabase auth cookie can be written:
// a Server Component cannot set headers, so `setAll` in
// src/lib/supabase/server.ts deliberately swallows its throw and relies on
// this running first. Without it, access tokens would silently expire and
// users would be logged out at random.
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";

  const cspHeader = buildCsp({ nonce, isDev });
  const cspReportOnly = buildCspReportOnly({ nonce, isDev });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", cspHeader);
  // FE-3.19: the root layout needs to know which tree it's rendering for —
  // the admin shell replaces the public SiteHeader/SiteFooter outright (see
  // src/app/layout.tsx) — and a Server Component root layout has no
  // `usePathname()`. Same "stamp it on the request here, read it via
  // headers() there" pattern as x-nonce above, rather than a second proxy
  // or a route-group restructure (see layout.tsx's comment for why that
  // was ruled out).
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Unset locally or in a build with no Supabase project: serve the request
  // with headers applied and no session, rather than throwing on every route.
  // getSessionUser() independently returns null, so the app reads as signed
  // out — the safe direction.
  if (supabaseUrl && supabaseKey) {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        // A refreshed token must land on BOTH the request (so this render sees
        // it) and the response (so the browser keeps it). Rebuilding the
        // response here preserves the request headers set above.
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request: { headers: requestHeaders } });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });

    // Verifies the JWT and refreshes it when near expiry. `getClaims()`, not
    // `getSession()`: the cookie is forgeable, so its embedded user object is
    // not trustworthy for anything. A failure here is deliberately not fatal —
    // the per-route gates in features/physical-wall/authorize.ts are what
    // actually deny access, and they re-resolve the actor themselves.
    try {
      await supabase.auth.getClaims();
    } catch (error) {
      console.error("[auth] Session refresh failed", error);
    }
  }

  response.headers.set("Content-Security-Policy", cspHeader);
  response.headers.set("Content-Security-Policy-Report-Only", cspReportOnly);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
