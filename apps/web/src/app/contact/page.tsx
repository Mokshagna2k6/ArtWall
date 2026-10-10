import type { Metadata } from "next";

import { siteConfig } from "@/config/site";
import { Container, Eyebrow } from "@/shared/editorial";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Artist, gallery, collector, investor or just curious: reach the ArtWall Labs founding team directly.",
  alternates: { canonical: "/contact" },
};

const channels = [
  {
    label: "Email",
    value: siteConfig.contact.email,
    href: `mailto:${siteConfig.contact.email}`,
  },
  {
    label: "Phone",
    value: siteConfig.contact.phone,
    href: `tel:+${siteConfig.contact.phoneDigits}`,
  },
  {
    label: "WhatsApp",
    value: "Chat with us",
    href: siteConfig.social.whatsapp,
  },
  {
    label: "Location",
    value: "Jaipur, Rajasthan",
    href: null,
  },
] as const;

/**
 * Contact is deliberately the quietest page on the site.
 *
 * By the time someone arrives here they have already heard the story, so there
 * is no pitch and no motion - just the fastest route to a human. These are the
 * founders' real, direct channels rather than a support queue, which is worth
 * something while the company is still small enough to answer personally.
 */
export default function ContactPage() {
  return (
    <>
      <section className="pt-32 pb-16 sm:pt-40 sm:pb-20 lg:pt-48 lg:pb-24">
        <div className="max-w-page mx-auto px-5 sm:px-8 lg:px-16">
          <Eyebrow>Contact</Eyebrow>
          <h1 className="font-heading text-display mt-8 max-w-[18ch] text-balance">
            Let us build this together.
          </h1>
          <p className="text-muted-foreground text-lead mt-6 max-w-2xl">
            Artist, gallery, collector, investor, or just curious. We want to
            hear from you. Everything below reaches the founding team directly.
          </p>
        </div>
      </section>

      <div className="border-border border-t py-20 sm:py-24 lg:py-32">
        <Container>
          <dl className="border-border border-t">
            {channels.map((channel) => (
              <div
                key={channel.label}
                className="border-border grid gap-2 border-b py-7 sm:grid-cols-[minmax(0,0.4fr)_minmax(0,1.6fr)] sm:gap-8"
              >
                <dt className="text-muted-foreground text-eyebrow sm:pt-1.5">
                  {channel.label}
                </dt>
                <dd className="text-lead break-words">
                  {channel.href ? (
                    <a
                      href={channel.href}
                      {...(channel.href.startsWith("http")
                        ? { target: "_blank", rel: "noopener noreferrer" }
                        : {})}
                      className="underline underline-offset-4 transition-opacity hover:opacity-60"
                    >
                      {channel.value}
                    </a>
                  ) : (
                    channel.value
                  )}
                </dd>
              </div>
            ))}
          </dl>

          <p className="text-muted-foreground mt-12 max-w-2xl text-sm leading-7">
            {siteConfig.legalName}. {siteConfig.credentials.recognition}.{" "}
            {siteConfig.credentials.origin}.
          </p>
        </Container>
      </div>
    </>
  );
}
