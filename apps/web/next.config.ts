import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The certificate PDF reads its Noto fonts with fs at request time; tracing can't see that.
  outputFileTracingIncludes: {
    "/api/coa/[id]/pdf": ["./src/features/coa/fonts/*.ttf"],
    "/verify/[hash]/pdf": ["./src/features/coa/fonts/*.ttf"],
    "/studio/certificates": ["./src/features/coa/fonts/*.ttf"],
  },
  images: {
    // Cloudinary only. An open remote-image allowlist turns next/image into a
    // free image-resizing proxy for the whole internet, at our bandwidth cost.
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com", pathname: "/**" },
    ],
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          // SEC-2.03: Content-Security-Policy is NOT set here. It needs a fresh
          // nonce on every request (so script-src can drop 'unsafe-inline' and
          // 'unsafe-eval' without breaking Next's own inline bootstrap scripts
          // or src/components/seo/json-ld.tsx), and `headers()` here runs once
          // at build/config-eval time, not per-request. See proxy.ts.
        ],
      },
    ];
  },
};

export default nextConfig;
