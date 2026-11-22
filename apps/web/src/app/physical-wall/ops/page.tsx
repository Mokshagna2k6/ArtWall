import type { Metadata } from "next";
import Link from "next/link";

import { requireRolePage } from "@/features/physical-wall/authorize";
import { InstallPanel } from "@/features/physical-wall/components/install-panel";
import { listInstallQueue } from "@/features/physical-wall/data/bookings";
import { listCheckinsForBooking } from "@/features/physical-wall/data/ops";

export const metadata: Metadata = {
  title: "Install queue",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The staff screen (F13, F14, F15).
 *
 * Ordered by start date, because the only useful order standing at a wall is
 * "what is arriving next". Everything a staff member needs for one install —
 * the checklist, the condition note, the scan field — is on this page; there is
 * no drilling in, because they are holding a painting.
 */
export default async function OpsPage() {
  await requireRolePage("staff", "/physical-wall/ops");

  const queue = await listInstallQueue();
  const withCheckins = await Promise.all(
    queue.map(async (booking) => ({
      booking,
      checkins: await listCheckinsForBooking(booking.id),
    }))
  );

  return (
    <main className="mx-auto max-w-3xl px-5 pt-24 pb-24 sm:px-8 sm:pt-32">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-signal text-eyebrow">Staff</p>
          <h1 className="font-heading text-display mt-3">Install queue</h1>
        </div>
        <Link
          href="/physical-wall/ops/perk"
          className="border-hairline-strong hover:border-ink text-small inline-flex h-10 items-center rounded-md border px-4"
        >
          Ric Platter counter
        </Link>
      </div>

      <p className="text-ink-muted mt-4 text-sm leading-6">
        Paid bookings waiting to go up, soonest first. A work goes live only
        when its checklist is complete and the artist&rsquo;s code scans against
        this slot.
      </p>

      {withCheckins.length === 0 ? (
        <p className="border-hairline text-ink-muted mt-10 rounded-md border border-dashed p-8 text-center text-sm leading-6">
          Nothing waiting. Paid bookings appear here as soon as they&rsquo;re
          confirmed.
        </p>
      ) : (
        <ul className="mt-10 flex flex-col gap-6">
          {withCheckins.map(({ booking, checkins }) => (
            <li key={booking.id}>
              <InstallPanel booking={booking} checkins={checkins} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
