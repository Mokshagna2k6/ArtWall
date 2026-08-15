import type { Metadata } from "next";
import Link from "next/link";

import { requireOnboardedPage } from "@/features/physical-wall/authorize";
import { WaitlistPanel } from "@/features/physical-wall/components/waitlist-form";
import {
  countQueue,
  myQueueEntry,
  queuePosition,
} from "@/features/physical-wall/data/waitlist";
import { getActiveGrid, listSlots } from "@/features/physical-wall/data/wall";

export const metadata: Metadata = {
  title: "Waitlist",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Reused from the rest of the site so the vocabulary matches. */
const MEDIUMS = [
  "Painting",
  "Photography",
  "Sculpture",
  "Textile",
  "Printmaking",
  "Digital",
  "Folk & traditional",
  "Mixed media",
] as const;

const CITIES = [
  "Jaipur",
  "Jodhpur",
  "Udaipur",
  "Sikar",
  "Delhi",
  "Mumbai",
  "Bengaluru",
  "Kolkata",
  "Patna",
] as const;

export default async function WaitlistPage() {
  const actor = await requireOnboardedPage("artist", "/physical-wall/waitlist");

  const grid = await getActiveGrid();
  const slots = grid ? await listSlots(grid.id) : [];
  const available = slots.filter((slot) => slot.state === "available").length;

  const [entry, queueLength] = await Promise.all([
    myQueueEntry(actor.id),
    countQueue(),
  ]);
  const position = entry ? await queuePosition(entry.id) : null;

  return (
    <main className="mx-auto max-w-2xl px-5 pt-24 pb-24 sm:px-8 sm:pt-32">
      <p className="text-signal text-eyebrow">Ric Platter</p>
      <h1 className="font-heading text-display mt-3 text-balance">
        {available > 0 ? "There's room right now." : "The wall is full."}
      </h1>

      {available > 0 ? (
        <>
          <p className="text-ink-muted mt-4 text-sm leading-6">
            {available} position{available === 1 ? " is" : "s are"} open, so
            there&rsquo;s no need to queue — take one.
          </p>
          <Link
            href="/physical-wall/book"
            className="bg-ember text-wall-paper hover:bg-ember-glow text-small mt-6 inline-flex h-11 items-center rounded-md px-5 font-medium transition-colors"
          >
            Book a slot
          </Link>
          <p className="text-ink-muted mt-8 text-sm leading-6">
            You can still join the queue for a future opening if you&rsquo;d
            rather wait for a particular position.
          </p>
        </>
      ) : (
        <p className="text-ink-muted mt-4 text-sm leading-6">
          Every position is taken. Join the queue and we&rsquo;ll hold the next
          matching opening for you for 48 hours. Founding members and returning
          artists go first — and you can see exactly where you stand.
        </p>
      )}

      <div className="mt-10">
        <WaitlistPanel
          entry={entry}
          position={position}
          queueLength={queueLength}
          defaultName={actor.name}
          defaultContact={actor.email}
          mediums={MEDIUMS}
          cities={CITIES}
        />
      </div>
    </main>
  );
}
