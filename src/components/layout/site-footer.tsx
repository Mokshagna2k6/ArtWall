import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";
import { navItems, secondaryNavItems } from "@/config/nav";
import { siteConfig } from "@/config/site";

const socials = [
  { label: "Instagram", href: siteConfig.social.instagram },
  { label: "X", href: siteConfig.social.x },
  { label: "LinkedIn", href: siteConfig.social.linkedin },
  { label: "YouTube", href: siteConfig.social.youtube },
  { label: "WhatsApp", href: siteConfig.social.whatsapp },
] as const;

const columns = [
  { heading: "Explore", links: navItems.slice(1) },
  { heading: "More", links: secondaryNavItems },
] as const;

/**
 * The closing wall.
 *
 * A footer is usually where a premium site gives up and becomes a sitemap.
 * This one stays part of the exhibition: set on deep slate so the white page
 * ends against something solid, with the tagline at display scale as the last
 * thing you read and the practical details quiet beneath it.
 *
 * Every route that is not in the header lives here, so nothing on the site is
 * more than two clicks from anywhere.
 *
 * Server Component - every interaction is CSS-only, so it ships no JS.
 */
export function SiteFooter() {
  return (
    <footer className="bg-footer text-white">
      <div className="max-w-page mx-auto w-full px-5 py-16 sm:px-8 lg:px-16 lg:py-20">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Wordmark markClassName="size-6" />
            <p className="mt-5 max-w-xs text-sm leading-7 text-white/60">
              {siteConfig.positioning}
            </p>
            <dl className="mt-6 flex flex-col gap-1.5 text-sm">
              <div>
                <dt className="sr-only">Email</dt>
                <dd>
                  <a
                    href={`mailto:${siteConfig.contact.email}`}
                    className="text-white/60 transition-colors hover:text-white"
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
                    className="text-white/60 transition-colors hover:text-white"
                  >
                    {siteConfig.contact.phone}
                  </a>
                </dd>
              </div>
            </dl>
          </div>

          {columns.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <p className="text-signal-bright text-eyebrow">
                {column.heading}
              </p>
              <ul className="mt-5 flex flex-col gap-3">
                {column.links.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-sm text-white/60 transition-colors hover:text-white"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <nav aria-label="Follow">
            <p className="text-signal-bright text-eyebrow">Follow</p>
            <ul className="mt-5 flex flex-col gap-3">
              {socials.map((social) => (
                <li key={social.label}>
                  <a
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-white/60 transition-colors hover:text-white"
                  >
                    {social.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-16 flex flex-col gap-4 border-t border-white/15 pt-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/45">
            <span>{siteConfig.credentials.recognition}</span>
            <span>{siteConfig.credentials.origin}</span>
            <span>
              Built with{" "}
              <a
                href={siteConfig.techPartner.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 transition-colors hover:text-white"
              >
                {siteConfig.techPartner.name}
              </a>
            </span>
          </div>
          <p className="shrink-0 text-xs text-white/45">
            &copy; {new Date().getFullYear()} {siteConfig.legalName}. All rights
            reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
