import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";

import { MotionProvider } from "@/components/layout/motion-provider";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SkipLink } from "@/components/layout/skip-link";
import { features, siteConfig } from "@/config/site";
import { getSessionUser } from "@/lib/session";
import "./globals.css";

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

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getSessionUser();

  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        {/* Structured data. The content is a literal object we control and is
            serialised with JSON.stringify, so there is no injection path here. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organisationJsonLd),
          }}
        />
        <MotionProvider>
          <SkipLink />
          {/* Read here, in a Server Component, and handed down: the flag is a
              plain env var, so a client component would only ever see it as
              undefined. */}
          <SiteHeader
            physicalWallEnabled={features.physicalWall}
            user={user}
          />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </MotionProvider>
      </body>
    </html>
  );
}
