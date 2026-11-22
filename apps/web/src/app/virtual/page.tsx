import type { Metadata } from "next";
import Link from "next/link";

import { listVirtualBuildings } from "@/features/wallos/virtual-wall/actions";

export const metadata: Metadata = {
  title: "Virtual Wall",
  description: "Walk through ArtWall's buildings and see the art on their walls.",
};

/** The entry point: every building that has at least one floor. */
export default async function VirtualIndexPage() {
  const buildings = await listVirtualBuildings();

  return (
    <main className="mx-auto max-w-4xl px-6 pt-28 pb-16">
      <p className="text-ink-muted text-label tracking-wider uppercase">Virtual Wall</p>
      <h1 className="text-display font-heading mt-3">Walk the building</h1>

      {buildings.length === 0 ? (
        <p className="text-ink-muted mt-8">
          No buildings have floors yet. Add a floor, a room and a wall in the WallOS
          admin and the building appears here.
        </p>
      ) : (
        <ul className="mt-8 grid gap-3">
          {buildings.map((b) => (
            <li key={b.id}>
              <Link
                href={`/virtual/${b.id}`}
                className="border-hairline-strong hover:border-ink block rounded-lg border p-4"
              >
                <span className="font-medium">{b.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
