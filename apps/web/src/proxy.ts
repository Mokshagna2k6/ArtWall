import { buildCsp, buildCspReportOnly } from "@artwall/security";
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
export function proxy(request: NextRequest) {
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

  const response = NextResponse.next({ request: { headers: requestHeaders } });
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
