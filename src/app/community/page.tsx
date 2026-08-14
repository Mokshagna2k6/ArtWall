import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { community, physicalWall } from "@/config/content";
import { siteConfig } from "@/config/site";
import { ArtworkBand } from "@/features/home/artwork-band";
import { ArchetypeQuiz } from "@/features/archetype/archetype-quiz";
import { FOUNDING_COHORT_SIZE } from "@/features/waitlist/roster";
import { Container, Eyebrow, Section } from "@/shared/editorial";

export const metadata: Metadata = {
  title: "Community",
  description:
    "Indiagrapher, a national fine-art community with city chapters, a weekly Artisan Spotlight, a monthly Deep Dive, and the Heritage Retreat. Find your archetype and meet the people behind it.",
  alternates: { canonical: "/community" },
};

/**
 * Community.
 *
 * The three ways a person actually becomes part of ArtWall rather than a
 * visitor to it: the archetype (how you see), the community (who you meet),
 * and founding membership (what you commit to). The order matters - asking for
 * a commitment before someone has met anyone is how a community becomes a
 * mailing list.
 */
export default function CommunityPage() {
  return (
    <>
      <section className="pt-32 pb-16 sm:pt-40 sm:pb-20 lg:pt-48 lg:pb-24">
        <div className="max-w-page mx-auto px-5 sm:px-8 lg:px-16">
          <Eyebrow>Community</Eyebrow>
          <h1 className="font-heading text-display mt-8 max-w-[18ch] text-balance">
            Help keep culture alive.
          </h1>
          <p className="text-muted-foreground text-lead mt-6 max-w-2xl">
            Democratising opportunity for India&apos;s creative economy, so
            every artisan has digital access, every artwork carries verified
            provenance, and every transaction supports a sustainable creative
            life.
          </p>
        </div>
      </section>

      <ArtworkBand label="Ten living Indian traditions, drawn as the wall's own generative work" />

      {/* ── Indiagrapher ─────────────────────────────────────────────── */}
      <Section id="indiagrapher">
        <Eyebrow index="01">The community</Eyebrow>
        <div className="mt-10 grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-24">
          <div>
            <h2 className="font-heading text-section text-balance">
              {community.name}
            </h2>
            <p className="text-muted-foreground text-lead mt-5">
              {community.summary}
            </p>
            <p className="border-border text-muted-foreground mt-8 border-t pt-5 text-sm">
              {community.pipeline}
            </p>
          </div>

          <ul className="border-border border-t">
            {community.rituals.map((ritual) => (
              <li
                key={ritual.title}
                className="border-border grid gap-2 border-b py-6 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] sm:gap-8"
              >
                <h3 className="font-heading text-card">{ritual.title}</h3>
                <p className="text-muted-foreground leading-7">
                  {ritual.detail}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* ── The archetype ────────────────────────────────────────────── */}
      {/* Lives here rather than on its own page: the archetype is how two
          strangers in this community get introduced, so it belongs beside
          them rather than in a corner of the site by itself. */}
      <Section id="archetype">
        <Eyebrow index="02">The Archetype</Eyebrow>
        <div className="mt-10 grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-24">
          <div>
            <h2 className="font-heading text-section text-balance">
              How much do you know about art?
            </h2>
            <p className="text-muted-foreground text-lead mt-5">
              It is the wrong question, and almost everyone asks it. Knowing the
              movements, the dates, the names on the placards. None of that is
              what happens when a work stops you in a corridor.
            </p>
            <p className="text-muted-foreground text-lead mt-4">
              So here is a better one. Five quiet encounters with observation,
              texture, space, memory and light. No right answers, nothing saved,
              and at the end the kind of eye you have been using all along.
            </p>
            <Link
              href="/survey"
              className="text-foreground mt-8 inline-flex text-sm underline underline-offset-4"
            >
              Or tell us what is broken instead
            </Link>
          </div>

          <div className="border-border border-t pt-8 lg:border-t-0 lg:pt-0">
            <ArchetypeQuiz />
          </div>
        </div>
      </Section>

      {/* ── The physical wall ────────────────────────────────────────── */}
      <Section id="physical-wall">
        <Eyebrow index="03">The physical wall</Eyebrow>
        <div className="mt-10 grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-24">
          <div>
            <h2 className="font-heading text-section text-balance">
              It started with one wall in Jaipur.
            </h2>
            <p className="text-muted-foreground text-lead mt-5">
              {physicalWall.summary}
            </p>
            <p className="text-muted-foreground text-eyebrow mt-6">
              {physicalWall.venue}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-eyebrow">
              What the wall management system does
            </p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {physicalWall.capabilities.map((capability) => (
                <li
                  key={capability}
                  className="border-border text-muted-foreground border px-3 py-1.5 text-sm"
                >
                  {capability}
                </li>
              ))}
            </ul>
            <Link
              href="/wall"
              className="group text-foreground mt-8 inline-flex items-center gap-2 text-sm underline underline-offset-4"
            >
              See the virtual wall
              <ArrowUpRight
                className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                aria-hidden
              />
            </Link>
          </div>
        </div>
      </Section>

      {/* ── Founding membership ──────────────────────────────────────── */}
      <Section id="founding">
        <Eyebrow index="04">Optional</Eyebrow>
        <div className="mt-10 grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-24">
          <h2 className="font-heading text-section text-balance">
            Be a Founding Member.
          </h2>
          <div>
            <p className="text-muted-foreground text-lead">
              Everyone who joins takes a numbered place on the wall. Founding
              Membership is something else, and you have to ask for it: a say in
              what gets built, first access when we open, and a badge that stays
              on your profile permanently. The first{" "}
              {FOUNDING_COHORT_SIZE.toLocaleString("en-IN")} artists who want it
              can have it.
            </p>
            <ul className="border-border mt-8 border-t">
              {[
                "A permanent, numbered place on the wall",
                "First access when we open, before the public",
                "A say in what we build. Founding artists are asked, not surveyed",
                "Free certification for your first works",
              ].map((promise) => (
                <li
                  key={promise}
                  className="border-border text-muted-foreground border-b py-4 leading-7"
                >
                  {promise}
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground mt-6 text-sm leading-7">
              You will be asked to sign in first. A place belongs to a person,
              not to an email address.
            </p>
            <Link
              href="/join"
              className="bg-foreground mt-8 inline-flex h-11 items-center px-5 text-sm font-medium text-white transition-colors hover:bg-[#2b3245]"
            >
              Join the Wall
            </Link>
          </div>
        </div>
      </Section>

      <div className="border-border border-t">
        <Container>
          <div className="flex flex-col gap-6 py-16 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-heading text-subsection max-w-xl text-balance">
              Know an artist who belongs here?
            </p>
            <a
              href={siteConfig.social.whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="border-border hover:border-foreground inline-flex h-11 items-center px-5 text-sm font-medium transition-colors"
            >
              Tell us about them
            </a>
          </div>
        </Container>
      </div>
    </>
  );
}
