import type { Metadata } from "next";
import Link from "next/link";

import { howItWorks } from "@/config/content";
import { Container, Eyebrow, Section } from "@/shared/editorial";

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "From registration to royalties in five steps: verify, certify, exhibit, sell with trust, and earn a perpetual royalty on every resale.",
  alternates: { canonical: "/journey" },
};

/**
 * How It Works.
 *
 * The life of an artwork on ArtWall, in the order it actually happens. Set as
 * a numbered list with a hairline between each step rather than as cards: this
 * is a sequence, and cards imply you can start anywhere.
 */
export default function HowItWorksPage() {
  return (
    <>
      <section className="pt-32 pb-16 sm:pt-40 sm:pb-20 lg:pt-48 lg:pb-24">
        <div className="max-w-page mx-auto px-5 sm:px-8 lg:px-16">
          <Eyebrow>How It Works</Eyebrow>
          <h1 className="font-heading text-display mt-8 max-w-[18ch] text-balance">
            From registration to royalties in five steps.
          </h1>
          <p className="text-muted-foreground text-lead mt-6 max-w-2xl">
            The whole life of a work, from the first upload to a resale years
            later. Every product on the platform maps to one of these stages.
          </p>
        </div>
      </section>

      <Section>
        <ol className="border-border border-t">
          {howItWorks.map((step) => (
            <li
              key={step.number}
              className="border-border grid gap-4 border-b py-12 lg:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1.25fr)] lg:gap-12 lg:py-16"
            >
              <span
                className="font-heading text-numeral text-hairline tabular-nums"
                aria-hidden
              >
                {step.number}
              </span>
              <h2 className="font-heading text-subsection">
                <span className="sr-only">Step {step.number}: </span>
                {step.title}
              </h2>
              <p className="text-muted-foreground text-lead">{step.detail}</p>
            </li>
          ))}
        </ol>
      </Section>

      <div className="border-border border-t">
        <Container>
          <div className="flex flex-col gap-6 py-16 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-heading text-subsection max-w-xl text-balance">
              Step one takes about two minutes.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/join"
                className="bg-foreground inline-flex h-11 items-center px-5 text-sm font-medium text-white transition-colors hover:bg-[#2b3245]"
              >
                Join the Wall
              </Link>
              <Link
                href="/platform"
                className="border-border hover:border-foreground inline-flex h-11 items-center px-5 text-sm font-medium transition-colors"
              >
                See the services
              </Link>
            </div>
          </div>
        </Container>
      </div>
    </>
  );
}
