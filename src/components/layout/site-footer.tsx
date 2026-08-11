import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Wordmark } from "@/components/brand/wordmark";
import { navItems, primaryCta, secondaryNavItems } from "@/config/nav";
import { siteConfig } from "@/config/site";

const socials = [
  { label: "Instagram", href: siteConfig.social.instagram },
  { label: "X", href: siteConfig.social.x },
  { label: "LinkedIn", href: siteConfig.social.linkedin },
  { label: "YouTube", href: siteConfig.social.youtube },
  { label: "WhatsApp", href: siteConfig.social.whatsapp },
] as const;

/**
 * The closing wall.
 *
 * A footer is usually where a premium site gives up and becomes a sitemap.
 * This one stays part of the exhibition: the tagline is set at display scale as
 * the last thing you read, with the practical details quiet beneath it.
 *
 * Server Component — every interaction here is CSS-only, so it ships no JS.
 */
export function SiteFooter() {
  return (
    <footer className="border-border border-t">
      <div className="max-w-wall mx-auto px-5 py-16 md:px-12 lg:px-16 lg:py-24">
        <p className="font-heading text-h2 lg:text-display-s max-w-4xl tracking-tight text-balance">
          {siteConfig.tagline}
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/preview"
            className="bg-ember text-wall-paper text-body hover:bg-ember-glow inline-flex h-12 items-center gap-2 rounded-md px-5 font-medium transition-[background-color,transform] duration-200 hover:-translate-y-px active:translate-y-0"
          >
            See your work hung
            <ArrowUpRight className="size-4" aria-hidden />
          </Link>
          <Link
            href="/wall"
            className="border-border text-body hover:border-ink/30 inline-flex h-12 items-center gap-2 rounded-md border px-5 transition-[border-color,transform] duration-200 hover:-translate-y-px active:translate-y-0"
          >
            Explore The Wall
            <ArrowUpRight className="size-4" aria-hidden />
          </Link>
        </div>

        <div className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Wordmark markClassName="size-6" />
            <p className="text-muted-foreground text-small mt-4 max-w-xs">
              {siteConfig.positioning}
            </p>
            <dl className="text-small mt-6 flex flex-col gap-1.5">
              <div>
                <dt className="sr-only">Email</dt>
                <dd>
                  <a
                    href={`mailto:${siteConfig.contact.email}`}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {siteConfig.contact.email}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="sr-only">Phone</dt>
                <dd>
                  <a
                    href={`tel:+${siteConfig.contact.phoneDigits}`}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {siteConfig.contact.phone}
                  </a>
                </dd>
              </div>
            </dl>
          </div>

          <nav aria-label="Explore">
            <h2 className="text-label text-muted-foreground font-sans tracking-wider uppercase">
              Explore
            </h2>
            <ul className="mt-4 flex flex-col gap-3">
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-muted-foreground hover:text-foreground text-small transition-colors"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href={primaryCta.href}
                  className="text-ember hover:text-ember-glow text-small transition-colors"
                >
                  {primaryCta.label}
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-label="Practice">
            <h2 className="text-label text-muted-foreground font-sans tracking-wider uppercase">
              Practice
            </h2>
            <ul className="mt-4 flex flex-col gap-3">
              {secondaryNavItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-muted-foreground hover:text-foreground text-small transition-colors"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/sign-in"
                  className="text-muted-foreground hover:text-foreground text-small transition-colors"
                >
                  ArtWall Studio
                </Link>
              </li>
            </ul>
          </nav>

          <div>
            <h2 className="text-label text-muted-foreground font-sans tracking-wider uppercase">
              Follow
            </h2>
            <ul className="mt-4 flex flex-col gap-3">
              {socials.map((social) => (
                <li key={social.label}>
                  <a
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground text-small transition-colors"
                  >
                    {social.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-border mt-16 flex flex-col gap-4 border-t pt-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="text-muted-foreground text-caption flex flex-wrap gap-x-6 gap-y-2">
            <span>{siteConfig.credentials.recognition}</span>
            <span>{siteConfig.credentials.origin}</span>
            <span>
              Built with{" "}
              <a
                href={siteConfig.techPartner.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground underline underline-offset-2 transition-colors"
              >
                {siteConfig.techPartner.name}
              </a>
            </span>
          </div>
          <p className="text-muted-foreground text-caption shrink-0">
            &copy; {new Date().getFullYear()} {siteConfig.legalName}. All rights
            reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
