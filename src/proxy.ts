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

  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob: https://res.cloudinary.com;
    font-src 'self' data:;
    connect-src 'self' https://api.cloudinary.com https://api.razorpay.com https://checkout.razorpay.com https://cdn.razorpay.com https://lumberjack.razorpay.com https://*.walletconnect.com wss://*.walletconnect.com https://*.walletconnect.org wss://*.walletconnect.org https://*.reown.com wss://*.reown.com https://*.web3modal.org https://*.web3modal.com https://sepolia.base.org https://mainnet.base.org;
    frame-src https://checkout.razorpay.com https://api.razorpay.com https://verify.walletconnect.com https://verify.walletconnect.org;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
  `
    .replace(/\s{2,}/g, " ")
    .trim();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", cspHeader);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", cspHeader);
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
