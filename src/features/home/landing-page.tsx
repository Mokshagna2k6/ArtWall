import Link from "next/link";
import { ArrowDown, ArrowUpRight, Check, Sparkles } from "lucide-react";

import { siteConfig } from "@/config/site";

const layers = [
  {
    number: "01",
    title: "The Exhibition Engine",
    detail:
      "AI matches physical artworks with real-world walls in hotels, galleries and coworking spaces, where discovery naturally happens.",
  },
  {
    number: "02",
    title: "Trust at the point of sale",
    detail:
      "Bank-grade escrow and an AI fraud layer trained for Indian traditional forms help stop counterfeits before they reach a collector.",
  },
  {
    number: "03",
    title: "Provenance for life",
    detail:
      "Every work receives a tamper-proof certificate that travels with it, records its history, and enables royalties when it is resold.",
  },
] as const;

const people = [
  [
    "Artists & artisans",
    "A fairer route from making to meaningful discovery, with a record that honours the work and its maker.",
  ],
  [
    "Collectors",
    "A calmer way to discover original work, understand its story and buy with confidence.",
  ],
  [
    "Spaces & galleries",
    "A thoughtful way to bring art into the places people already gather, stay and work.",
  ],
] as const;

/** A deliberately quiet, information-first homepage for ArtWall Labs. */
export function LandingPage() {
  return (
    <div className="bg-[#faf9f5] text-[#101114]">
      <section
        id="top"
        className="relative min-h-[42rem] overflow-hidden border-b border-[#e7e4df]"
      >
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(67,133,244,0.07),transparent_22rem),radial-gradient(circle_at_22%_85%,rgba(226,139,41,0.06),transparent_19rem)]"
        />
        <div className="relative mx-auto flex min-h-[42rem] max-w-[1040px] flex-col items-center justify-center px-5 pt-36 pb-20 text-center sm:px-8">
          <BrandMark />
          <p className="mt-7 text-[11px] font-semibold tracking-[0.34em] uppercase">
            ArtWall Labs
          </p>
          <div className="mt-16 max-w-4xl">
            <h1 className="font-heading text-[clamp(3.4rem,8vw,6.8rem)] leading-[0.95] tracking-[-0.055em] text-balance">
              Art lives on the wall.
            </h1>
            <p className="mt-6 text-lg leading-8 text-[#4e5667] sm:text-2xl sm:leading-9">
              Reimagining and revolutionising India&apos;s art economy.
            </p>
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link
              href="#what-is-artwall"
              className="inline-flex h-12 items-center gap-2 rounded-full bg-[#101114] px-5 text-sm font-semibold text-white transition hover:bg-[#2b2d33]"
            >
              Discover ArtWall <ArrowDown className="size-4" aria-hidden />
            </Link>
            <Link
              href="/join"
              className="inline-flex h-12 items-center rounded-full border border-[#d9d5cf] px-5 text-sm font-semibold transition hover:border-[#4385f4] hover:text-[#245fc5]"
            >
              Add your voice
            </Link>
          </div>
        </div>
      </section>

      <Section id="what-is-artwall" index="01" label="What is ArtWall">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-24">
          <h2 className="font-heading text-4xl leading-tight tracking-[-0.035em] sm:text-5xl">
            The infrastructure behind a fairer art economy.
          </h2>
          <div className="space-y-6 text-lg leading-8 text-[#4e5667]">
            <p>
              India has 42 million artists and artisans. Most never see fair
              value for their work: middlemen can absorb up to 85% of what a
              buyer pays, fakes flood the market, and first-time collectors have
              little reason to trust what they find.
            </p>
            <p>
              ArtWall Labs exists to change that. We are building a
              creator-first platform that helps original work be discovered,
              protected and fairly exchanged.
            </p>
          </div>
        </div>
      </Section>

      <Section
        id="how-we-do-it"
        index="02"
        label="How we do it"
        className="border-y border-[#e7e4df] bg-[#f3f1ec]"
      >
        <div className="max-w-2xl">
          <h2 className="font-heading text-4xl tracking-[-0.035em] sm:text-5xl">
            Three connected layers. One stronger ecosystem.
          </h2>
          <p className="mt-5 text-lg leading-8 text-[#4e5667]">
            Each layer solves a different break in the path from artist to
            collector—and works better because the others are there.
          </p>
        </div>
        <ol className="mt-14 border-t border-[#d9d5cf]">
          {layers.map((layer) => (
            <li
              key={layer.number}
              className="grid gap-4 border-b border-[#d9d5cf] py-7 sm:grid-cols-[5rem_minmax(0,0.75fr)_minmax(0,1.25fr)] sm:gap-8 sm:py-9"
            >
              <span className="font-heading text-xl text-[#4385f4]">
                {layer.number}
              </span>
              <h3 className="font-heading text-2xl tracking-[-0.025em]">
                {layer.title}
              </h3>
              <p className="leading-7 text-[#4e5667]">{layer.detail}</p>
            </li>
          ))}
        </ol>
        <p className="mt-7 inline-flex items-center gap-2 text-sm text-[#4e5667]">
          <Check className="size-4 text-[#db861b]" aria-hidden /> Not an NFT or
          a speculative token—just durable proof of a work&apos;s history.
        </p>
      </Section>

      <Section id="for-everyone" index="03" label="What's in it for everyone">
        <div className="flex max-w-3xl flex-col gap-5">
          <h2 className="font-heading text-4xl tracking-[-0.035em] sm:text-5xl">
            A better art economy makes room for everyone.
          </h2>
          <p className="text-lg leading-8 text-[#4e5667]">
            ArtWall connects the people who make culture with the people and
            places that keep it moving.
          </p>
        </div>
        <div className="mt-14 grid divide-y divide-[#e0dcd6] border-y border-[#e0dcd6] md:grid-cols-3 md:divide-x md:divide-y-0">
          {people.map(([title, detail]) => (
            <article
              key={title}
              className="px-0 py-7 md:px-8 md:first:pl-0 md:last:pr-0"
            >
              <Sparkles className="size-5 text-[#db861b]" aria-hidden />
              <h3 className="font-heading mt-7 text-2xl tracking-[-0.025em]">
                {title}
              </h3>
              <p className="mt-3 leading-7 text-[#4e5667]">{detail}</p>
            </article>
          ))}
        </div>
      </Section>

      <Section
        id="help-build"
        index="04"
        label="Help us build this"
        className="border-y border-[#e7e4df] bg-[#f3f1ec]"
      >
        <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-24">
          <div>
            <h2 className="font-heading text-4xl tracking-[-0.035em] sm:text-5xl">
              This wall gets better with more voices on it.
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-8 text-[#4e5667]">
              ArtWall is not being built from a distance. Explore the wall, tell
              us what needs to work better, and help define what a trusted art
              economy should feel like.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <ActionCard
              href="/wall"
              title="The Wall"
              detail="Meet the founding artists and add your own mark."
            />
            <ActionCard
              href="/contact"
              title="Suggestions & feedback"
              detail="Tell the team what would make ArtWall more useful."
            />
          </div>
        </div>
      </Section>

      <Section id="share" index="05" label="Pass the torch">
        <div className="rounded-[2rem] border border-[#dad5ce] bg-white px-6 py-10 sm:px-10 sm:py-14 lg:flex lg:items-end lg:justify-between lg:gap-10">
          <div className="max-w-2xl">
            <h2 className="font-heading text-4xl tracking-[-0.035em] sm:text-5xl">
              Know someone who belongs on the wall?
            </h2>
            <p className="mt-5 text-lg leading-8 text-[#4e5667]">
              Challenge a friend to share their work. Pass on the idea that art
              deserves to be seen, trusted and fairly valued.
            </p>
          </div>
          <Link
            href="/wall"
            className="mt-8 inline-flex h-12 shrink-0 items-center gap-2 rounded-full border border-[#101114] px-5 text-sm font-semibold transition hover:bg-[#101114] hover:text-white lg:mt-0"
          >
            Share the wall <ArrowUpRight className="size-4" aria-hidden />
          </Link>
        </div>
      </Section>

      <Section
        id="community"
        index="06"
        label="Join the voice communities"
        className="border-t border-[#e7e4df] bg-[#101114] text-[#faf9f5]"
      >
        <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="max-w-3xl">
            <h2 className="font-heading text-4xl tracking-[-0.035em] sm:text-5xl">
              Help keep culture alive.
            </h2>
            <p className="mt-5 text-lg leading-8 text-[#c7c6c2]">
              Our mission is to democratise opportunity for India&apos;s
              creative economy—so every artisan has digital access, every
              artwork can carry verified provenance, and every transaction can
              support a sustainable creative life.
            </p>
          </div>
          <Link
            href="/join"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#4385f4] px-6 text-sm font-semibold text-white transition hover:bg-[#2f72dc]"
          >
            Join the community <ArrowUpRight className="size-4" aria-hidden />
          </Link>
        </div>
        <p className="mt-16 border-t border-white/15 pt-5 text-sm text-[#a4a39e]">
          Vision 2030: India&apos;s most trusted platform for creative commerce.
        </p>
      </Section>
    </div>
  );
}

function Section({
  id,
  index,
  label,
  className = "",
  children,
}: {
  id: string;
  index: string;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={`px-5 py-20 sm:px-8 sm:py-28 ${className}`}>
      <div className="mx-auto max-w-[1040px]">
        <p className="mb-8 text-[11px] font-semibold tracking-[0.24em] text-[#6d7480] uppercase">
          <span className="mr-3 text-[#db861b]">{index}</span>
          {label}
        </p>
        {children}
      </div>
    </section>
  );
}

function ActionCard({
  href,
  title,
  detail,
}: {
  href: string;
  title: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start justify-between gap-6 border border-[#d9d5cf] bg-[#faf9f5] p-6 transition hover:border-[#4385f4] hover:bg-white"
    >
      <div>
        <h3 className="font-heading text-2xl tracking-[-0.025em]">{title}</h3>
        <p className="mt-2 max-w-sm leading-7 text-[#4e5667]">{detail}</p>
      </div>
      <ArrowUpRight
        className="mt-1 size-5 shrink-0 text-[#4385f4] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        aria-hidden
      />
    </Link>
  );
}

function BrandMark() {
  return (
    <div
      className="relative h-30 w-35"
      aria-label={`${siteConfig.name} mark`}
      role="img"
    >
      <span className="absolute top-0 left-0 h-18 w-18 border-t-[3px] border-l-[3px] border-[#101114]" />
      <span className="absolute top-[2.4rem] left-[2.4rem] h-18 w-18 border-[3px] border-[#4385f4]" />
      <span className="absolute top-[2.1rem] left-[-0.32rem] size-3 rounded-full border-[3px] border-[#faf9f5] bg-[#db861b]" />
    </div>
  );
}
