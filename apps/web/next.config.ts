import { STATIC_SECURITY_HEADERS } from "@artwall/security";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source (no build step).
  transpilePackages: ["@artwall/db", "@artwall/ratelimit", "@artwall/security"],
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
  /**
   * CHANGES-PLAN.md §5. Permanent (308) rather than temporary: both old URLs
   * carried a canonical tag and a nav link, so the redirect is what passes
   * their ranking to the new location instead of stranding it.
   *
   * `/team` is freed deliberately — §5 reserves it for team members once the
   * admin shell moves off /physical-wall/admin. Until then it redirects to the
   * founders page, so no inbound link breaks in the meantime.
   */
  async redirects() {
    return [
      { source: "/team", destination: "/about/team", permanent: true },
      // The virtual-wall-tiles tool, moved to free /admin for the super admin.
      { source: "/admin", destination: "/admin/tiles", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...STATIC_SECURITY_HEADERS,
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
