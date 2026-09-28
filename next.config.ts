import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://cdn.razorpay.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://res.cloudinary.com",
              "font-src 'self' data:",
              // Browser-direct calls: Cloudinary signed uploads (artwork, wall, selfie),
              // Razorpay Checkout, WalletConnect/Reown relay + Base RPC for wallets.
              [
                "connect-src 'self'",
                "https://api.cloudinary.com",
                "https://api.razorpay.com https://checkout.razorpay.com https://cdn.razorpay.com https://lumberjack.razorpay.com",
                "https://*.walletconnect.com wss://*.walletconnect.com",
                "https://*.walletconnect.org wss://*.walletconnect.org",
                "https://*.reown.com wss://*.reown.com https://*.web3modal.org https://*.web3modal.com",
                "https://sepolia.base.org https://mainnet.base.org",
              ].join(" "),
              "frame-src https://checkout.razorpay.com https://api.razorpay.com https://verify.walletconnect.com https://verify.walletconnect.org",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
