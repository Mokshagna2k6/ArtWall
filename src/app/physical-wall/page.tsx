import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  Eye,
  MapPin,
  QrCode,
} from "lucide-react";

import { WallBrowser } from "@/features/physical-wall/components/wall-browser";
import { WallGrid } from "@/features/physical-wall/components/wall-grid";
import {
  getActiveGrid,
  listLiveArtworks,
  listSlots,
} from "@/features/physical-wall/data/wall";
import { getSql } from "@/lib/db";
import {
  Band,
  Container,
  Eyebrow,
  Section,
} from "@/shared/editorial";

export const metadata: Metadata = {
  title: "The Wall",
  description:
    "What is hanging on the ArtWall at Ric Platter right now, and how to book a slot of your own.",
  alternates: { canonical: "/physical-wall" },
};

export const revalidate = 30;

async function scanCounts(artworkIds: string[]): Promise<Record<string, number>> {
  if (artworkIds.length === 0) return {};
  try {
    const sql = getSql();
    const rows = (await sql.query(
      `select artwork_id, count(*)::int as count
       from pw_scans where artwork_id = any($1::text[])
       group by artwork_id`,
      [artworkIds]
    )) as { artwork_id: string; count: number }[];
    return Object.fromEntries(
      rows.map((row) => [String(row.artwork_id), Number(row.count)])
    );
  } catch (error) {
    console.error("[physical-wall] Could not read scan counts", error);
    return {};
  }
}

async function totalScans(): Promise<number> {
  try {
    const sql = getSql();
    const rows = (await sql`
      select count(*)::int as count from pw_scans
    `) as { count: number }[];
    return rows[0]?.count ?? 0;
  } catch (error) {
    return 0;
  }
}

export default async function PhysicalWallPage() {
  const grid = await getActiveGrid();
  const [slots, live] = await Promise.all([
    grid ? listSlots(grid.id) : Promise.resolve([]),
    listLiveArtworks(),
  ]);
  const [scans, allScans] = await Promise.all([
    scanCounts(live.map((work) => work.artworkId)),
    totalScans(),
  ]);

  const available = slots.filter((slot) => slot.state === "available").length;
  const liveCount = slots.filter((slot) => slot.state === "live").length;

  return (
    <main className="bg-background">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="pt-32 pb-16 sm:pt-40 sm:pb-20 lg:pt-48 lg:pb-24">
        <Container>
          <Eyebrow>Physical Wall · Ric Platter, Jaipur</Eyebrow>

          <h1 className="font-heading text-display mt-8 max-w-[18ch] text-balance">
            Art you can stand in front of.
          </h1>

          <div className="border-border mt-14 grid gap-10 border-t pt-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20">
            <div>
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="relative flex size-2.5"
                >
                  <span className="bg-signal absolute inline-flex size-full animate-ping rounded-full opacity-75" />
                  <span className="bg-signal relative inline-flex size-2.5 rounded-full" />
                </span>
                <span className="text-signal text-sm font-medium">
                  {live.length > 0
                    ? `${live.length} ${live.length === 1 ? "work" : "works"} hanging now`
                    : "Wall is being set up"}
                </span>
              </div>

              <p className="text-lead text-muted-foreground mt-6 max-w-2xl">
                Every piece here hangs somewhere physical — inside the Ric
                Platter restaurant in Jaipur. Scan the QR code beside any work
                to meet the artist who made it, or take a position of your own.
              </p>
            </div>

            <div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/physical-wall/book"
                  className="bg-foreground inline-flex h-11 items-center px-5 text-sm font-medium text-white transition-colors hover:bg-[#2b3245]"
                >
                  Book a slot
                </Link>
                <Link
                  href="/physical-wall/visit"
                  className="border-border hover:border-foreground inline-flex h-11 items-center px-5 text-sm font-medium transition-colors"
                >
                  I&rsquo;m here now
                </Link>
              </div>
              <p className="text-muted-foreground mt-7 max-w-md text-sm leading-7">
                <span className="text-foreground font-medium">
                  {available > 0
                    ? `${available} ${available === 1 ? "slot" : "slots"} available.`
                    : "All slots are currently taken."}
                </span>{" "}
                {available > 0
                  ? "Choose a position, hang your work for a week or a month, and let diners discover it while they eat."
                  : "Join the waitlist and we'll let you know when a position opens up."}
              </p>
            </div>
          </div>
        </Container>
      </section>

      {/* ── Stats strip ─────────────────────────────────────────────── */}
      <div className="border-border bg-secondary border-y">
        <Container>
          <div className="grid grid-cols-2 sm:grid-cols-4">
            {[
              { value: live.length.toString(), label: "Works hanging" },
              { value: available.toString(), label: "Slots available" },
              {
                value:
                  allScans > 999
                    ? `${(allScans / 1000).toFixed(1)}k`
                    : allScans.toString(),
                label: "QR scans total",
              },
              {
                value: slots.length > 0 ? slots.length.toString() : "—",
                label: "Wall positions",
              },
            ].map((stat, i) => (
              <div
                key={stat.label}
                className={`border-border py-7 ${
                  i > 0 ? "border-l pl-6 sm:pl-8" : ""
                }`}
              >
                <div className="font-heading text-section text-foreground">
                  {stat.value}
                </div>
                <div className="text-muted-foreground mt-1.5 text-sm">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </Container>
      </div>

      {/* ── Hanging now ─────────────────────────────────────────────── */}
      <Section id="hanging-now">
        <div className="flex items-baseline gap-6">
          <Eyebrow index="01">Hanging now</Eyebrow>
        </div>
        <div className="mt-10 max-w-3xl">
          <h2 className="font-heading text-section text-balance">
            On the wall today
          </h2>
          <p className="text-muted-foreground text-lead mt-5">
            {live.length > 0
              ? `Browse the ${live.length} ${live.length === 1 ? "work" : "works"} currently on display. Search by artist, title, medium or city.`
              : "Nothing is on the wall yet. The first works go up as soon as artists finish installing."}
          </p>
        </div>
        <div className="mt-12">
          <WallBrowser artworks={live} scansByArtwork={scans} />
        </div>
      </Section>

      {/* ── The wall itself ─────────────────────────────────────────── */}
      <Section id="wall-grid">
        <div className="flex items-baseline gap-6">
          <Eyebrow index="02">The wall itself</Eyebrow>
        </div>
        <div className="mt-10 grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-24">
          <div>
            <h2 className="font-heading text-section text-balance">
              Slot map
            </h2>
            <p className="text-muted-foreground text-lead mt-5">
              {grid
                ? `${grid.name} — ${available} of ${slots.length} positions free. Each slot is drawn at the size it actually is on the wall.`
                : "No layout has been published yet. Check back shortly."}
            </p>
            {available > 0 && (
              <Link
                href="/physical-wall/book"
                className="bg-foreground mt-8 inline-flex h-11 items-center px-5 text-sm font-medium text-white transition-colors hover:bg-[#2b3245]"
              >
                Take a position
              </Link>
            )}
          </div>
          <div>
            {grid && slots.length > 0 ? (
              <WallGrid
                slots={slots}
                rowCount={grid.rowCount}
                colCount={grid.colCount}
                mode="read"
              />
            ) : (
              <div className="border-border flex aspect-video items-center justify-center rounded-md border border-dashed">
                <p className="text-muted-foreground text-sm">
                  The wall is being set up.
                </p>
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* ── How it works ────────────────────────────────────────────── */}
      <Band id="how-it-works">
        <Eyebrow index="03">How it works</Eyebrow>
        <h2 className="font-heading text-section mt-10 max-w-2xl text-balance">
          From booking to the wall in four steps.
        </h2>
        <div className="border-border mt-12 grid gap-px border-t md:grid-cols-4">
          {[
            {
              step: "01",
              icon: CalendarDays,
              title: "Book a slot",
              detail:
                "Choose your position on the wall. Pick a size, pick your dates, and pay online.",
            },
            {
              step: "02",
              icon: MapPin,
              title: "Bring your work",
              detail:
                "Drop off your piece at Ric Platter during venue hours. We handle the installation.",
            },
            {
              step: "03",
              icon: QrCode,
              title: "Get your QR code",
              detail:
                "A printed code goes beside your work. Anyone who scans it meets you — your story, your portfolio.",
            },
            {
              step: "04",
              icon: Eye,
              title: "Get discovered",
              detail:
                "Diners see your art while they eat. Every scan is tracked; you see who looked and when.",
            },
          ].map(({ step, icon: Icon, title, detail }) => (
            <div
              key={step}
              className="border-border flex flex-col gap-4 border-b py-10 md:border-r md:px-8 md:first:pl-0 md:last:border-r-0 md:last:pr-0"
            >
              <div className="flex items-center gap-3">
                <span className="bg-foreground flex size-9 items-center justify-center rounded-full">
                  <Icon className="size-4 text-white" aria-hidden />
                </span>
                <span className="text-muted-foreground text-sm tabular-nums">
                  {step}
                </span>
              </div>
              <h3 className="font-heading text-card">{title}</h3>
              <p className="text-muted-foreground text-sm leading-6">
                {detail}
              </p>
            </div>
          ))}
        </div>
      </Band>

      {/* ── For visitors ────────────────────────────────────────────── */}
      <Section id="for-visitors">
        <div className="flex items-baseline gap-6">
          <Eyebrow index="04">For visitors</Eyebrow>
        </div>
        <div className="mt-10 grid gap-14 lg:grid-cols-2 lg:gap-24">
          <div>
            <h2 className="font-heading text-section text-balance">
              You&rsquo;re eating here anyway. Look up.
            </h2>
            <p className="text-muted-foreground text-lead mt-5 max-w-xl">
              Every piece on the wall was made by a working Indian artist. Scan
              the code beside anything that catches your eye and learn who made
              it, how, and why.
            </p>
            <p className="text-muted-foreground mt-6 max-w-xl text-sm leading-7">
              No account needed. No app to install. The QR opens a page — that
              page is the artwork&rsquo;s whole story.
            </p>
            <Link
              href="/physical-wall/visit"
              className="border-border hover:border-foreground mt-8 inline-flex h-11 items-center px-5 text-sm font-medium transition-colors"
            >
              Register as a visitor
            </Link>
          </div>

          <div className="border-border border p-8 sm:p-10">
            <ul>
              {[
                {
                  href: "/physical-wall/book",
                  title: "Book a Slot",
                  detail:
                    "Choose a position, choose your dates, and hang your work on a real wall.",
                },
                {
                  href: "/physical-wall/waitlist",
                  title: "Join the Waitlist",
                  detail:
                    "No slots right now? Get notified the moment one opens.",
                },
                {
                  href: "/physical-wall/visit",
                  title: "I’m at Ric Platter",
                  detail:
                    "Register your visit and see what’s on the wall right now.",
                },
                {
                  href: "#hanging-now",
                  title: "Browse the Wall",
                  detail:
                    "See every work currently hanging, search by artist or medium.",
                },
              ].map((item) => (
                <li
                  key={item.href}
                  className="border-border border-b last:border-b-0"
                >
                  <Link
                    href={item.href}
                    className="group flex items-start justify-between gap-6 py-6 transition-colors"
                  >
                    <div>
                      <h3 className="font-heading text-subsection transition-opacity group-hover:opacity-60">
                        {item.title}
                      </h3>
                      <p className="text-muted-foreground mt-2 max-w-sm leading-7">
                        {item.detail}
                      </p>
                    </div>
                    <ArrowUpRight
                      className="mt-1.5 size-5 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* ── Venue info ──────────────────────────────────────────────── */}
      <Band id="venue">
        <Eyebrow index="05">The venue</Eyebrow>
        <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:gap-24">
          <div>
            <h2 className="font-heading text-section text-balance">
              Ric Platter, Jaipur
            </h2>
            <p className="text-muted-foreground text-lead mt-5 max-w-xl">
              A restaurant that decided its walls should earn their keep. Every
              surface that used to be blank is now an exhibition space — art that
              diners see, touch, scan, and sometimes take home.
            </p>
          </div>
          <div className="border-border space-y-6 border-l pl-8">
            {[
              { label: "Location", value: "Ric Platter Restaurant, Jaipur" },
              { label: "Wall area", value: grid ? `${slots.length} positions across ${grid.rowCount} rows` : "Being set up" },
              { label: "Venue hours", value: "11 AM – 11 PM, all week" },
              { label: "Drop-off", value: "Coordinate with us after booking" },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-muted-foreground text-sm font-medium uppercase tracking-wider">
                  {label}
                </p>
                <p className="text-foreground mt-1 text-base">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </Band>

      {/* ── Final CTA ───────────────────────────────────────────────── */}
      <Section id="cta" divide={false}>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-heading text-section text-balance">
            Your art deserves a wall, not a feed.
          </h2>
          <p className="text-muted-foreground text-lead mx-auto mt-5 max-w-lg">
            A physical exhibition in a room full of people, for the price of a
            few meals. No gallery commission, no gatekeeper.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link
              href="/physical-wall/book"
              className="bg-foreground inline-flex h-11 items-center px-6 text-sm font-medium text-white transition-colors hover:bg-[#2b3245]"
            >
              Book a slot
            </Link>
            <Link
              href="/physical-wall/waitlist"
              className="border-border hover:border-foreground inline-flex h-11 items-center px-6 text-sm font-medium transition-colors"
            >
              Join the waitlist
            </Link>
          </div>
        </div>
      </Section>
    </main>
  );
}
