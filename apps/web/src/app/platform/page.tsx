import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import {
  competitorDomains,
  competitors,
  painStages,
  services,
} from "@/config/content";
import { ArtworkBand } from "@/features/home/artwork-band";
import { PainStages } from "@/features/platform/pain-stages";
import { Container, Eyebrow, Section } from "@/shared/editorial";

export const metadata: Metadata = {
  title: "Services",
  description:
    "Six integrated systems: artist registry, exhibition engine, provenance and certification, a fair marketplace, a nine-layer anti-fraud engine, and patented demand-triggered sale.",
  alternates: { canonical: "/platform" },
};

/**
 * Services - the argument page.
 *
 * Every other route is an experience: hang a work, find your archetype, take a
 * place. This one is the reasoning underneath them, in the order an
 * unconvinced person needs it - what we built, what was broken, and why no one
 * else covers the whole of it.
 *
 * The headline is server-rendered and unanimated: it is the LCP element, and
 * fading in the largest text on the page would mean measuring our own paint as
 * slower than it is.
 */
export default function ServicesPage() {
  return (
    <>
      <section className="pt-32 pb-16 sm:pt-40 sm:pb-20 lg:pt-48 lg:pb-24">
        <div className="max-w-page mx-auto px-5 sm:px-8 lg:px-16">
          <Eyebrow>Services</Eyebrow>
          <h1 className="font-heading text-display mt-8 max-w-[18ch] text-balance">
            Six integrated systems. One platform.
          </h1>
          <p className="text-muted-foreground text-lead mt-6 max-w-2xl">
            Every stage of the life of an artwork, from creation to legacy. Each
            system solves a different break in the path from artist to
            collector, and each one works better because the others are there.
          </p>
        </div>
      </section>

      <ArtworkBand />

      {/* ── The six ──────────────────────────────────────────────────── */}
      <Section id="systems">
        {/* Text and diagram side by side, one system per row. The full detail
            moves up beside the summary so the right-hand column belongs
            entirely to the image — a diagram squeezed into a third column
            beside two blocks of prose is too small to read, which makes it
            decoration rather than explanation. */}
        <ol className="border-border border-t">
          {services.map((service, index) => (
            <li
              key={service.number}
              className="border-border grid gap-6 border-b py-10 lg:grid-cols-[4rem_minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-12 lg:py-16"
            >
              <span className="text-muted-foreground font-heading text-lg tabular-nums">
                {service.number}
              </span>

              <div>
                <h2 className="font-heading text-subsection">
                  {service.title}
                </h2>
                <p className="text-lead mt-2.5 text-balance">
                  {service.summary}
                </p>
                <p className="text-muted-foreground mt-5 leading-7">
                  {service.detail}
                </p>
              </div>

              <figure className="border-border bg-band overflow-hidden border">
                <Image
                  src={service.image}
                  alt={service.imageAlt}
                  sizes="(min-width: 1024px) 32rem, 90vw"
                  className="h-auto w-full"
                  // Only the first is anywhere near the fold on this page.
                  priority={index === 0}
                />
              </figure>
            </li>
          ))}
        </ol>
      </Section>

      {/* ── The 24 failures ──────────────────────────────────────────── */}
      <Section id="why">
        <Eyebrow index="02">Why ArtWall Labs</Eyebrow>
        <div className="mt-10 max-w-3xl">
          <h2 className="font-heading text-section text-balance">
            Twenty-four failures across six stages. All answered.
          </h2>
          <p className="text-muted-foreground text-lead mt-5">
            India has 42 million artists and a ₹30,000 crore market with no
            integrated infrastructure underneath it. These are the failures that
            compound, stage by stage.
          </p>
        </div>
        <div className="mt-12">
          <PainStages stages={painStages} />
        </div>
      </Section>

      {/* ── Competitive landscape ────────────────────────────────────── */}
      <Section id="landscape">
        <Eyebrow index="03">Competitive landscape</Eyebrow>
        <div className="mt-10 max-w-3xl">
          <h2 className="font-heading text-section text-balance">
            No competitor covers more than two of the seven domains.
          </h2>
          <p className="text-muted-foreground text-lead mt-5">
            ArtWall Labs is the only platform we know of integrating all seven
            infrastructure layers in one place.
          </p>
        </div>

        <div className="mt-12 overflow-x-auto">
          <table className="w-full min-w-[42rem] border-collapse text-sm">
            <caption className="sr-only">
              Coverage of seven infrastructure domains by platform
            </caption>
            <thead>
              <tr className="border-border border-b-2">
                <th
                  scope="col"
                  className="text-muted-foreground text-eyebrow py-3 pr-4 text-left"
                >
                  Platform
                </th>
                {competitorDomains.map((domain) => (
                  <th
                    key={domain}
                    scope="col"
                    className="text-muted-foreground text-eyebrow px-2 py-3 text-center"
                  >
                    {domain}
                  </th>
                ))}
                <th scope="col" className="text-eyebrow py-3 pl-2 text-center">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {competitors.map((competitor) => (
                <tr key={competitor.name} className="border-border border-b">
                  <th
                    scope="row"
                    className="text-muted-foreground py-4 pr-4 text-left font-normal"
                  >
                    {competitor.name}
                  </th>
                  {competitor.covers.map((covered, index) => (
                    <td
                      key={competitorDomains[index]}
                      className="text-muted-foreground px-2 py-4 text-center"
                    >
                      <span className="sr-only">
                        {covered ? "Covered" : "Not covered"}
                      </span>
                      <span aria-hidden>{covered ? "●" : "–"}</span>
                    </td>
                  ))}
                  <td className="text-muted-foreground py-4 pl-2 text-center tabular-nums">
                    {competitor.covers.filter(Boolean).length}
                  </td>
                </tr>
              ))}
              <tr className="border-foreground border-b-2">
                <th scope="row" className="py-5 pr-4 text-left font-medium">
                  ArtWall Labs
                </th>
                {competitorDomains.map((domain) => (
                  <td key={domain} className="px-2 py-5 text-center">
                    <span className="sr-only">Covered</span>
                    <span aria-hidden>●</span>
                  </td>
                ))}
                <td className="font-heading text-card py-5 pl-2 text-center tabular-nums">
                  7
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <div className="border-border border-t">
        <Container>
          <div className="flex flex-col gap-6 py-16 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-heading text-subsection max-w-xl text-balance">
              See how it works, step by step.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/journey"
                className="bg-foreground inline-flex h-11 items-center px-5 text-sm font-medium text-white transition-colors hover:bg-[#2b3245]"
              >
                How It Works
              </Link>
              <Link
                href="/join"
                className="border-border hover:border-foreground inline-flex h-11 items-center px-5 text-sm font-medium transition-colors"
              >
                Join the Wall
              </Link>
            </div>
          </div>
        </Container>
      </div>
    </>
  );
}
