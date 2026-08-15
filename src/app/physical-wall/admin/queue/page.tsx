import type { Metadata } from "next";

import { AdminQueue } from "@/features/physical-wall/components/admin-queue";
import { listQueue } from "@/features/physical-wall/data/waitlist";
import { getActiveGrid, listSlots } from "@/features/physical-wall/data/wall";

export const metadata: Metadata = {
  title: "Queue",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminQueuePage() {
  const grid = await getActiveGrid();
  const [entries, slots] = await Promise.all([
    listQueue(),
    grid ? listSlots(grid.id) : Promise.resolve([]),
  ]);

  const available = slots.filter((slot) => slot.state === "available");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-heading text-display">Queue</h1>
        <p className="text-ink-muted mt-3 max-w-2xl text-sm leading-6">
          In the order slots will actually be offered: anyone you have ranked by
          hand first, then founding members, returning artists, referrals and
          new arrivals. Every promotion, note and removal is recorded against
          your name.
        </p>
      </div>

      <AdminQueue entries={entries} availableSlots={available} />
    </div>
  );
}
