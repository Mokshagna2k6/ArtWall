import type { Metadata } from "next";
import Link from "next/link";

import { requireOnboardedPage } from "@/features/physical-wall/authorize";
import { BookingFlow } from "@/features/physical-wall/components/booking-flow";
import {
  getCurrentRefundPolicy,
  getSettings,
  listAddons,
} from "@/features/physical-wall/data/catalogs";
import { getActiveGrid, listSlots } from "@/features/physical-wall/data/wall";
import { releaseLapsedHolds } from "@/features/physical-wall/expiry";
import { getSql } from "@/lib/db";

export const metadata: Metadata = {
  title: "Book a slot",
  description: "Take a slot on the ArtWall at Ric Platter.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** The artist's own catalogue, for attaching a work to the booking (F09). */
async function listOwnArtworks(userId: string) {
  try {
    const sql = getSql();
    const rows = (await sql`
      select id, title from artworks
      where "userId" = ${userId}
      order by "createdAt" desc
      limit 100
    `) as { id: string; title: string }[];
    return rows.map((row) => ({ id: String(row.id), title: String(row.title) }));
  } catch (error) {
    console.error("[physical-wall] Could not read own artworks", error);
    return [];
  }
}

export default async function BookPage() {
  const actor = await requireOnboardedPage("artist", "/physical-wall/book");

  // Hand back anything whose hold lapsed before drawing the grid, so an
  // abandoned checkout from an hour ago is not shown as unavailable.
  await releaseLapsedHolds();

  const grid = await getActiveGrid();
  if (!grid) {
    return (
      <main className="mx-auto max-w-lg px-5 pt-32 pb-20 sm:px-8">
        <h1 className="font-heading text-display">The wall isn&rsquo;t ready.</h1>
        <p className="text-ink-muted mt-4 text-sm leading-6">
          No layout has been published yet, so there is nothing to book. Try
          again shortly.
        </p>
        <Link
          href="/physical-wall"
          className="border-hairline-strong text-small hover:border-ink mt-8 inline-flex h-10 items-center rounded-md border px-4"
        >
          Back to the wall
        </Link>
      </main>
    );
  }

  const [slots, addons, artworks, settings, policy] = await Promise.all([
    listSlots(grid.id),
    listAddons(),
    listOwnArtworks(actor.id),
    getSettings(),
    getCurrentRefundPolicy(),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto max-w-6xl px-5 pt-24 pb-24 sm:px-8 sm:pt-32">
      <p className="text-signal text-eyebrow">Ric Platter · {grid.name}</p>
      <h1 className="font-heading text-display mt-4 text-balance">
        Take a place on the wall.
      </h1>
      <p className="text-ink-muted mt-4 max-w-2xl text-sm leading-6">
        Choose your position, pick your dates, and we&rsquo;ll hold the slots
        while you pay. Everything you see includes GST.
      </p>

      <div className="mt-12">
        <BookingFlow
          slots={slots}
          rowCount={grid.rowCount}
          colCount={grid.colCount}
          addons={addons}
          artworks={artworks}
          today={today}
          venueName="Ric Platter, Jaipur"
          refundPercentage={policy?.percentage ?? null}
          gstRatePct={settings.gstRateBp / 100}
        />
      </div>
    </main>
  );
}
