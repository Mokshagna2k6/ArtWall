import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid, Network } from "lucide-react";

import { requireAnyAdminRolePage } from "@/features/physical-wall/authorize";

export const metadata: Metadata = {
  title: "Wall Network Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * FE-3.18: "Wall Network Admin" is the Bible's name for the existing
 * `venue_admin` role — physical wall / venue operations, 1:1, kept as the
 * same stored identifier (see migration 0059's header for why the id
 * itself wasn't renamed). WallOS hierarchy is real, already-built
 * functionality (BE-3.13); this links to it rather than re-rendering it.
 */
export default async function WallNetworkAdminConsolePage() {
  await requireAnyAdminRolePage(["venue_admin"], "/physical-wall/admin/console/wall-network-admin");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-display">Wall Network Admin</h1>
        <p className="text-ink-muted mt-2 max-w-2xl text-sm leading-6">
          Physical wall / venue operations. Stored as <code>venue_admin</code>{" "}
          — the Bible&rsquo;s name for the same role.
        </p>
      </div>

      <Link href="/physical-wall/admin/wallos" className="border-hairline hover:bg-band flex items-center gap-3 rounded-md border p-5 transition-colors">
        <Network className="size-5 shrink-0" aria-hidden />
        <div>
          <p className="text-sm font-medium">WallOS hierarchy</p>
          <p className="text-ink-muted mt-1 text-xs">
            Organization → venue → building → floor → room/zone → wall → slot
          </p>
        </div>
      </Link>

      <Link href="/physical-wall/admin/grid" className="border-hairline hover:bg-band flex items-center gap-3 rounded-md border p-5 transition-colors">
        <LayoutGrid className="size-5 shrink-0" aria-hidden />
        <div>
          <p className="text-sm font-medium">Wall map</p>
          <p className="text-ink-muted mt-1 text-xs">The flat booking grid</p>
        </div>
      </Link>
    </div>
  );
}
