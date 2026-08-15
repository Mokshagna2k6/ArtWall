import type { Metadata } from "next";

import { GridEditor } from "@/features/physical-wall/components/grid-editor";
import { listSizes, listSlotTypes } from "@/features/physical-wall/data/catalogs";
import { getActiveGrid, listSlots } from "@/features/physical-wall/data/wall";

export const metadata: Metadata = {
  title: "Wall layout",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminGridPage() {
  const grid = await getActiveGrid();

  if (!grid) {
    return (
      <div>
        <h1 className="font-heading text-display">Wall layout</h1>
        <p className="text-ink-muted mt-4 text-sm leading-6">
          No layout is published. Run{" "}
          <code className="bg-band rounded px-1.5 py-0.5 text-xs">
            node --env-file=.env scripts/seed-physical-wall.mjs
          </code>{" "}
          to create the 28-slot standard wall.
        </p>
      </div>
    );
  }

  const [slots, sizes, types] = await Promise.all([
    listSlots(grid.id),
    listSizes(),
    listSlotTypes(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-heading text-display">Wall layout</h1>
      <GridEditor grid={grid} slots={slots} sizes={sizes} types={types} />
    </div>
  );
}
