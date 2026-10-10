import type { Metadata } from "next";
import Link from "next/link";

import { ArtWallLogo } from "@/components/brand/artwall-logo";
import { faqs, stats, team } from "@/config/content";
import { markElements } from "@/config/products";
import { siteConfig } from "@/config/site";
import { ArtworkBand } from "@/features/home/artwork-band";
import { Faqs } from "@/features/about/faqs";
import { Container, Eyebrow, Section } from "@/shared/editorial";

export const metadata: Metadata = {
  title: "About",
  description:
    "ArtWall Labs is a DPIIT-recognised company building India's art operating system: registry, exhibitions, provenance, a fair marketplace, anti-fraud, and demand-triggered sale.",
  alternates: { canonical: "/about" },
};

/**
 * About.
 *
 * The company, the mark, the people, and the questions everyone asks. Ordered
 * so a sceptical reader gets the credentials before the story: who this is,
 * then who is building it, then what they usually want to check.
 */
export default function AboutPage() {
  return (
    <>
      <section className="pt-32 pb-16 sm:pt-40 sm:pb-20 lg:pt-48 lg:pb-24">
        <div className="max-w-page mx-auto px-5 sm:px-8 lg:px-16">
          <Eyebrow>About</Eyebrow>
          <h1 className="font-heading text-display mt-8 max-w-[18ch] text-balance">
            The platform behind every wall.
          </h1>
          <p className="text-muted-foreground text-lead mt-6 max-w-2xl">
            ArtWall Labs builds the place where artists exhibit, certify and
            sell. Physical exhibitions, tamper-proof provenance, and a
            marketplace that pays the maker properly, in one system rather than
            five.
          </p>
        </div>
      </section>

      <ArtworkBand />


      {/* ── The mark ─────────────────────────────────────────────────── */}
      <Section id="mark">
        <Eyebrow index="01">The mark</Eyebrow>
        <h2 className="font-heading text-section mt-10 max-w-3xl text-balance">
          Four things, holding each other in place.
        </h2>

        <div className="mt-12 grid items-start gap-12 lg:grid-cols-2 lg:gap-24">
          <div className="border-border flex items-center justify-center border p-12">
            <ArtWallLogo className="size-40" titled />
          </div>

          <dl className="border-border border-t">
            {markElements.map((element) => (
              <div
                key={element.name}
                className="border-border grid gap-2 border-b py-6 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] sm:gap-8"
              >
                <dt className="font-heading text-card">{element.name}</dt>
                <dd className="text-muted-foreground leading-7">
                  {element.line}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>

      {/* ── The team ─────────────────────────────────────────────────── */}
      <Section id="team">
        <Eyebrow index="02">The team</Eyebrow>
        <div className="mt-10 max-w-3xl">
          <h2 className="font-heading text-section text-balance">
            Built by people who understand the problem.
          </h2>
          <p className="text-muted-foreground text-lead mt-5">
            Indian law, AI and ML engineering, art community building, and
            startup operations.
          </p>
        </div>

        <ul className="border-border mt-12 border-t">
          {team.map((member) => (
            <li
              key={member.name}
              className="border-border grid gap-4 border-b py-8 lg:grid-cols-[4rem_minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-10"
            >
              <span
                aria-hidden
                className="border-border text-muted-foreground flex size-12 items-center justify-center border text-sm font-medium"
              >
                {member.initials}
              </span>
              <div>
                <h3 className="font-heading text-card">{member.name}</h3>
                <p className="text-muted-foreground text-eyebrow mt-1.5">
                  {member.role}
                </p>
              </div>
              <p className="text-muted-foreground leading-7">{member.bio}</p>
            </li>
          ))}
        </ul>
      </Section>

      {/* ── FAQs ─────────────────────────────────────────────────────── */}
      <Section id="faq">
        <Eyebrow index="03">Frequently asked</Eyebrow>
        <h2 className="font-heading text-section mt-10 max-w-3xl text-balance">
          The questions people actually ask.
        </h2>
        <div className="mt-12 max-w-3xl">
          <Faqs items={faqs} />
        </div>
      </Section>

      <div className="border-border border-t">
        <Container>
          <div className="flex flex-col gap-6 py-16 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground max-w-xl text-sm leading-7">
              {siteConfig.legalName}. {siteConfig.credentials.recognition}.{" "}
              {siteConfig.credentials.origin}.
            </p>
            <Link
              href="/contact"
              className="bg-foreground inline-flex h-11 shrink-0 items-center px-5 text-sm font-medium text-white transition-colors hover:bg-[#2b3245]"
            >
              Contact the team
            </Link>
          </div>
        </Container>
      </div>
    </>
  );
}
