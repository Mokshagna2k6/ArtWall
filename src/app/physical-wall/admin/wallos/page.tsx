import type { Metadata } from "next";

import { requireRolePage } from "@/features/physical-wall/authorize";
import { WallosEditor } from "@/features/physical-wall/components/wallos-editor";
import {
  listUnlinkedPwSlots,
  listWallosNodes,
  listWallosSlots,
} from "@/features/wallos/actions";

export const metadata: Metadata = {
  title: "WallOS hierarchy",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * FE-3.12: the WallOS admin console — organizations -> venues -> buildings ->
 * floors -> rooms/zones -> walls -> slots (F64; Bible §30-34).
 *
 * A drill-down, not seven separate pages: at any moment there is exactly one
 * selected id per level above the one you're looking at, carried as query
 * params so the breadcrumb is a real URL and the back button works. Each
 * level only ever lists direct children of the level above, same as the
 * hierarchy itself — there is no "all buildings" view, because a building
 * means nothing without its venue.
 */
export default async function AdminWallosPage({
  searchParams,
}: PageProps<"/physical-wall/admin/wallos">) {
  await requireRolePage("admin", "/physical-wall/admin/wallos");
  const params = await searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

  const orgId = str(params.org);
  const venueId = str(params.venue);
  const buildingId = str(params.building);
  const floorId = str(params.floor);
  const zoneId = str(params.zone);
  const wallId = str(params.wall);

  // listWallosNodes returns the full row for whichever table the level maps
  // to (drizzle's generic `.select().from(table)`), which is always at least
  // `{ id, name, ... }` for the six container levels — narrowed here so the
  // client component gets the plain { id, name } shape every level shares.
  const asNodes = (rows: Record<string, unknown>[]) =>
    rows.map((row) => ({ id: String(row.id), name: String(row.name) }));

  const [
    organizations,
    venues,
    buildings,
    floors,
    zones,
    walls,
    slots,
    unlinkedPwSlots,
  ] = await Promise.all([
    listWallosNodes("organization"),
    orgId ? listWallosNodes("venue", orgId) : Promise.resolve([]),
    venueId ? listWallosNodes("building", venueId) : Promise.resolve([]),
    buildingId ? listWallosNodes("floor", buildingId) : Promise.resolve([]),
    floorId ? listWallosNodes("roomZone", floorId) : Promise.resolve([]),
    zoneId ? listWallosNodes("wall", zoneId) : Promise.resolve([]),
    wallId ? listWallosSlots(wallId) : Promise.resolve([]),
    listUnlinkedPwSlots(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-heading text-display">WallOS hierarchy</h1>
        <p className="text-ink-muted mt-3 max-w-2xl text-sm leading-6">
          Organization, venue, building, floor, room/zone, wall, slot — the
          structure the booking flow&rsquo;s hierarchy picker walks. This is a
          parallel structure to the wall map&rsquo;s flat grid, not a
          replacement of it; a slot here only becomes bookable once it&rsquo;s
          linked to a real slot on the grid.
        </p>
      </div>

      <WallosEditor
        orgId={orgId}
        venueId={venueId}
        buildingId={buildingId}
        floorId={floorId}
        zoneId={zoneId}
        wallId={wallId}
        organizations={asNodes(organizations)}
        venues={asNodes(venues)}
        buildings={asNodes(buildings)}
        floors={asNodes(floors)}
        zones={asNodes(zones)}
        walls={asNodes(walls)}
        slots={slots.map((s) => ({ id: String(s.id), wallId: String(s.wallId), label: String(s.label), pwSlotId: s.pwSlotId ?? null }))}
        unlinkedPwSlots={unlinkedPwSlots}
      />
    </div>
  );
}
