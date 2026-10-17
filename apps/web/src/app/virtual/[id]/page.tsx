import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  canPlaceVirtualArt,
  getVirtualBuilding,
} from "@/features/wallos/virtual-wall/actions";
import { VirtualWallClient } from "@/features/wallos/virtual-wall/virtual-wall-client";

/**
 * `/virtual/:id` — the navigable 3D building (Bible §8's public route list).
 *
 * A Server Component: the building is read here and handed to the client as
 * plain data, so the R3F tree never reaches the server graph (it is lazy-
 * imported behind `virtual-wall-client.tsx`).
 *
 * Anyone may look. `canPlace` only decides whether the placement UI renders —
 * the actions themselves re-check Super Admin server-side on every write.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const building = await getVirtualBuilding((await params).id);
  if (!building) return { title: "Building not found" };
  return {
    title: `${building.name} · Virtual Wall`,
    description: `Walk through ${building.name} and see the art on its walls.`,
  };
}

export default async function VirtualBuildingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const building = await getVirtualBuilding((await params).id);
  if (!building) notFound();

  const canPlace = await canPlaceVirtualArt();

  return (
    <main className="mx-auto max-w-6xl px-6 pt-28 pb-16">
      <p className="text-ink-muted text-label tracking-wider uppercase">Virtual Wall</p>
      <h1 className="text-display font-heading mt-3">{building.name}</h1>
      <p className="text-ink-muted mt-3">
        {building.floors.length} floor{building.floors.length === 1 ? "" : "s"}
        {canPlace && " · you can place art here"}
      </p>

      <div className="mt-8">
        {building.floors.length === 0 ? (
          <p className="text-ink-muted">This building has no floors yet.</p>
        ) : (
          <VirtualWallClient building={building} canPlace={canPlace} />
        )}
      </div>
    </main>
  );
}
