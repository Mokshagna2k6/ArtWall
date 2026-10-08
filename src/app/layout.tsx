import type { Metadata } from "next";
import { headers } from "next/headers";
import { Fraunces, Inter } from "next/font/google";

import { MotionProvider } from "@/components/layout/motion-provider";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SkipLink } from "@/components/layout/skip-link";
import { features, siteConfig } from "@/config/site";
import { getActor } from "@/features/physical-wall/authorize";
import "./globals.css";
import { JsonLd } from "@/components/seo/json-ld";

/**
 * Display face. The `opsz` axis is what makes a serif hold together at 100px
 * and still read at 20px.
 *
 * `weight: "variable"` ships the whole axis in one file, so the display sizes
 * can carry real mass without a second request. next/font rejects an explicit
 * weight list whenever `axes` is set, which is why this is not `["400","700"]`.
 */
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
  weight: "variable",
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} | ${siteConfig.tagline}`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  alternates: { canonical: "/" },
  keywords: [
    "Indian art",
    "art marketplace India",
    "art exhibitions",
    "art certification",
    "artist community India",
    "buy original art India",
  ],
  authors: [{ name: siteConfig.legalName, url: siteConfig.url }],
  creator: siteConfig.legalName,
  publisher: siteConfig.legalName,
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    title: `${siteConfig.name} | ${siteConfig.tagline}`,
    description: siteConfig.description,
    url: siteConfig.url,
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} | ${siteConfig.tagline}`,
    description: siteConfig.description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

/**
 * Organisation schema, so search engines can associate the brand, the legal
 * entity, and the social profiles rather than guessing at them.
 */
const organisationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: siteConfig.legalName,
  alternateName: siteConfig.name,
  url: siteConfig.url,
  email: siteConfig.contact.email,
  telephone: `+${siteConfig.contact.phoneDigits}`,
  slogan: siteConfig.tagline,
  description: siteConfig.positioning,
  address: {
    "@type": "PostalAddress",
    addressRegion: "Rajasthan",
    addressCountry: "IN",
  },
  sameAs: Object.values(siteConfig.social),
};

export const viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

/**
 * FE-3.19: admins get their own app shell — the layout built for
 * /physical-wall/admin (src/app/physical-wall/admin/layout.tsx) is a full
 * nav rail, not a child section of the public site, and the product owner
 * does not want the public SiteHeader/SiteFooter showing at all underneath
 * it (problem #1).
 *
 * Route groups (`(public)`/`(admin)` folders, each with their own root
 * layout) are the idiomatic tool for "two genuinely different root
 * layouts" — but Next.js only allows multiple root layouts when EVERY
 * top-level route is partitioned into a group, not just the special one
 * (see node_modules/next/dist/docs/.../route-groups.md's "Top-level root
 * layout" caveat). This app has ~25 top-level route folders under src/app;
 * moving all of them into `(public)` to free up `(admin)` is a large,
 * mechanical, high-blast-radius rename for a one-route carve-out, and it
 * also loses something real: a route-group boundary forces a full page
 * reload on every nav between the two trees (same doc, "Full page load"
 * caveat), which would make "View site" / "Dashboard" links between admin
 * and public feel slower than they do today.
 *
 * A pathname check here is the smaller, lower-risk diff: one `if`, no
 * route moves, no churn to existing relative imports, and every existing
 * /physical-wall/admin/* URL keeps working exactly as it does today (this
 * was already true either way, since route groups don't appear in the
 * URL — but conditional rendering gets there without moving a single
 * file). The pathname itself comes from proxy.ts, which already stamps a
 * per-request header (x-nonce) for the same reason: a Server Component
 * root layout has no usePathname().
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getActor();
  const pathname = (await headers()).get("x-pathname") ?? "";
  const isAdminShell = pathname.startsWith("/physical-wall/admin");

  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${fraunces.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        <JsonLd data={organisationJsonLd} />
        <MotionProvider>
          <SkipLink />
          {!isAdminShell && (
            // Read here, in a Server Component, and handed down: the flag is
            // a plain env var, so a client component would only ever see it
            // as undefined.
            <SiteHeader
              physicalWallEnabled={features.physicalWall}
              user={user}
            />
          )}
          <main id="main" className="flex-1">
            {children}
          </main>
          {!isAdminShell && <SiteFooter />}
        </MotionProvider>
      </body>
    </html>
  );
}
