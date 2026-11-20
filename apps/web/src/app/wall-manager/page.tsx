import type { Metadata } from "next";

import { requireRolePage } from "@/features/physical-wall/authorize";
import {
  listManagedVenues,
  listVenueWalls,
} from "@/features/wallos/wall-manager/actions";
import { WallManagerEditor } from "@/features/wallos/wall-manager/wall-manager-editor";

export const metadata: Metadata = {
  title: "Wall Manager",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The Wall Manager console (Bible §13 / Locked Rule 34).
 *
 * Deliberately NOT under /physical-wall/admin: that whole subtree is gated on
 * `user.role = 'admin'` plus an admin-role assignment, and a Wall Manager is
 * venue-side staff, not platform staff — granting them the admin area to let
 * them price their own slots is exactly the over-grant migration 0081's header
 * argues against. So this is its own route, gated only on being a signed-in
 * user; the venue grant itself is the authorization, and every read and write
 * re-checks it per venue.
 *
 * `requireRolePage("artist")` here means "a real signed-in user" (the lowest
 * tier a granted person is guaranteed to have), matching `requireVenueRole`'s
 * reasoning in authorize.ts. Someone signed in with no grant sees the empty
 * state rather than a redirect, because "you manage no venues" is a true and
 * useful answer, while a redirect to the public wall would look like a bug.
 */
export default async function WallManagerPage({
  searchParams,
}: PageProps<"/wall-manager">) {
  await requireRolePage("artist", "/wall-manager");

  const params = await searchParams;
  const requested =
    typeof params.venue === "string" && params.venue ? params.venue : undefined;

  const venues = await listManagedVenues();
  // Default to the first venue so the page is useful on arrival. A `?venue=`
  // the caller does not manage falls back rather than erroring: listVenueWalls
  // would refuse it anyway, and silently showing their own first venue is a
  // better answer than a dead page.
  const venue = venues.find((v) => v.id === requested) ?? venues[0] ?? null;
  const walls = venue ? await listVenueWalls(venue.id) : [];

  return (
    <main className="mx-auto max-w-4xl px-5 pt-28 pb-16 sm:px-8">
      <p className="text-ink-muted text-label tracking-wider uppercase">WallOS</p>
      <h1 className="text-display font-heading mt-3">Wall Manager</h1>
      <p className="text-ink-muted mt-4 max-w-prose leading-7">
        Set where your venue is, how big each wall is, and what a slot costs.
        Once a venue has a city, a kind and at least one priced slot, you can
        list it and artists will find it when they search for walls.
      </p>

      <WallManagerEditor
        venues={venues.map((v) => ({
          id: v.id,
          name: v.name,
          city: v.city,
          listed: v.listed,
        }))}
        venue={venue}
        walls={walls}
      />
    </main>
  );
}
