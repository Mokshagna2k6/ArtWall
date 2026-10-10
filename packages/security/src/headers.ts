export interface CspOptions {
  nonce: string;
  isDev?: boolean;
}

// Third parties the app really talks to: Razorpay checkout, Cloudinary, WalletConnect/wagmi, Base RPC.
const CONNECT = [
  "'self'",
  "https://api.cloudinary.com",
  "https://api.razorpay.com",
  "https://checkout.razorpay.com",
  "https://cdn.razorpay.com",
  "https://lumberjack.razorpay.com",
  "https://*.walletconnect.com",
  "wss://*.walletconnect.com",
  "https://*.walletconnect.org",
  "wss://*.walletconnect.org",
  "https://*.reown.com",
  "wss://*.reown.com",
  "https://*.web3modal.org",
  "https://*.web3modal.com",
  "https://sepolia.base.org",
  "https://mainnet.base.org",
].join(" ");

const FRAMES =
  "https://checkout.razorpay.com https://api.razorpay.com https://verify.walletconnect.com https://verify.walletconnect.org";

const squash = (s: string) => s.replace(/\s{2,}/g, " ").trim();

/** Enforced CSP (SEC-2.03). Google OAuth is a top-level redirect, so it needs no directive. */
export function buildCsp({ nonce, isDev = false }: CspOptions): string {
  return squash(`
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: blob: https://res.cloudinary.com;
    font-src 'self' data:;
    connect-src ${CONNECT};
    frame-src ${FRAMES};
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
  `);
}

/**
 * Stricter candidate shipped as Content-Security-Policy-Report-Only: drops style
 * 'unsafe-inline' (nonce'd styles only) and adds upgrade-insecure-requests.
 * Violations only show in the browser console until a `report-to` collector exists.
 */
export function buildCspReportOnly({ nonce, isDev = false }: CspOptions): string {
  return `${buildCsp({ nonce, isDev }).replace(
    "style-src 'self' 'unsafe-inline'",
    `style-src 'self' 'nonce-${nonce}'`
  )} upgrade-insecure-requests;`;
}

/** Static headers for every response (next.config headers()). */
export const STATIC_SECURITY_HEADERS: readonly { key: string; value: string }[] = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];
