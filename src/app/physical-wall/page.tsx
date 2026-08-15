import type { Metadata } from "next";
import Link from "next/link";

import { WallBrowser } from "@/features/physical-wall/components/wall-browser";
import { WallGrid } from "@/features/physical-wall/components/wall-grid";
import {
  getActiveGrid,
  listLiveArtworks,
  listSlots,
} from "@/features/physical-wall/data/wall";
import { getSql } from "@/lib/db";

export const metadata: Metadata = {
  title: "The Wall",
  description:
    "What is hanging on the ArtWall at Ric Platter right now, and how to book a slot of your own.",
  alternates: { canonical: "/physical-wall" },
};

/**
 * The public wall.
 *
 * The spec wants this driven by Socket.IO with Redis fan-out. On Vercel and
 * Neon there is no socket server to fan out from, so it is server-rendered and
 * revalidates every 30 seconds. For a wall whose contents change when somebody
 * physically hangs a painting, thirty seconds is not a delay anyone can
 * perceive — and it survives a lost connection, which a socket does not.
 */
export const revalidate = 30;

/** Scan totals for everything currently hanging, in one query rather than N. */
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

export default async function PhysicalWallPage() {
  const grid = await getActiveGrid();
  const [slots, live] = await Promise.all([
    grid ? listSlots(grid.id) : Promise.resolve([]),
    listLiveArtworks(),
  ]);
  const scans = await scanCounts(live.map((work) => work.artworkId));

  const available = slots.filter((slot) => slot.state === "available").length;

  return (
    <main className="pt-20">
      {/* The hero states what is true right now — a live count, not a slogan.
          Taken from the prototype, which led with "LIVE NOW" and the number. */}
      <section className="border-border border-b px-5 py-16 sm:px-8 md:py-20 lg:px-16">
        <div className="max-w-page mx-auto">
          <p className="text-signal text-eyebrow flex items-center gap-2">
            <span
              aria-hidden
              className="bg-signal inline-block size-1.5 rounded-full"
            />
            Live now · Ric Platter, Jaipur
          </p>
          <h1 className="font-heading text-display mt-4 max-w-3xl text-balance">
            A real wall, in a room where people eat.
          </h1>
          <p className="text-ink-muted mt-5 max-w-2xl text-base leading-7">
            {live.length > 0
              ? `${live.length} ${live.length === 1 ? "work is" : "works are"} hanging at Ric Platter right now. Scan the code beside any of them to meet the artist who made it — or take a position of your own.`
              : "Every piece here hangs somewhere physical. Scan the code beside a work to meet the artist who made it — or take a position of your own."}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/physical-wall/book"
              className="bg-ember text-wall-paper hover:bg-ember-glow text-small inline-flex h-11 items-center rounded-md px-5 font-medium transition-colors"
            >
              Book a slot
            </Link>
            <Link
              href="/physical-wall/visit"
              className="border-hairline-strong hover:border-ink text-small inline-flex h-11 items-center rounded-md border px-5"
            >
              I&rsquo;m here now
            </Link>
          </div>
        </div>
      </section>

      <section className="border-border border-b px-5 py-14 sm:px-8 lg:px-16">
        <div className="max-w-page mx-auto">
          <h2 className="font-heading text-section">Hanging now</h2>
          <div className="mt-8">
            <WallBrowser artworks={live} scansByArtwork={scans} />
          </div>
        </div>
      </section>

      <section className="px-5 py-14 sm:px-8 lg:px-16">
        <div className="max-w-page mx-auto">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-heading text-section">The wall itself</h2>
              <p className="text-ink-muted mt-2 max-w-xl text-sm leading-6">
                {grid
                  ? `${grid.name} — ${available} of ${slots.length} positions free. Each slot is drawn at the size it actually is.`
                  : "No layout has been published yet."}
              </p>
            </div>
            {available > 0 && (
              <Link
                href="/physical-wall/book"
                className="border-hairline-strong hover:border-ink text-small inline-flex h-10 items-center rounded-md border px-4"
              >
                Take one
              </Link>
            )}
          </div>

          <div className="mt-8 max-w-3xl">
            {grid && slots.length > 0 ? (
              <WallGrid
                slots={slots}
                rowCount={grid.rowCount}
                colCount={grid.colCount}
                mode="read"
              />
            ) : (
              <p className="border-hairline text-ink-muted rounded-md border border-dashed p-8 text-center text-sm">
                The wall is being set up. Check back shortly.
              </p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
