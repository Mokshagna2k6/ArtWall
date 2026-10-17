"use client";

import Link from "next/link";

import { CloudinaryImage as Image } from "@/components/media/cloudinary-image";
import type { VirtualBuilding } from "@/features/wallos/virtual-wall/actions";

/**
 * The 2D scrollable fallback required by Bible §15 / FE-3.09, and the view a
 * device without WebGL gets automatically.
 *
 * Same information, same privacy rules as the 3D view (§A13: no owner, price
 * or wallet; §44: no demand score): the building as a readable outline of
 * floors -> walls -> slots, with empty slots shown as empty rather than
 * hidden (Rule 21 — a slot with no artwork is a real, valid thing).
 */
export function VirtualWallFallback({
  building,
  canPlace,
}: {
  building: VirtualBuilding;
  canPlace: boolean;
}) {
  return (
    <div className="flex flex-col gap-10">
      {building.floors.map((floor) => (
        <section key={floor.id}>
          <h2 className="font-heading text-lg">{floor.name}</h2>
          <p className="text-ink-muted text-xs">Level {floor.level}</p>

          {floor.walls.length === 0 && (
            <p className="text-ink-muted mt-3 text-sm">No walls on this floor yet.</p>
          )}

          {floor.walls.map((wall) => (
            <div key={wall.id} className="mt-5">
              <h3 className="text-small font-medium">
                {wall.name}
                <span className="text-ink-muted"> · {wall.roomName}</span>
              </h3>
              {wall.slots.length === 0 ? (
                <p className="text-ink-muted mt-2 text-sm">No slots on this wall yet.</p>
              ) : (
                <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {wall.slots.map((slot) => (
                    <li key={slot.id}>
                      {slot.artwork ? (
                        <Link href={`/artwork/${slot.artwork.id}`} className="group block">
                          <div className="bg-band relative aspect-[4/3] overflow-hidden rounded">
                            {slot.artwork.imageUrl ? (
                              <Image
                                src={slot.artwork.imageUrl}
                                alt={slot.artwork.title}
                                fill
                                className="object-cover transition-transform group-hover:scale-105"
                                sizes="(min-width:1024px) 25vw, (min-width:640px) 50vw, 100vw"
                              />
                            ) : (
                              <span className="text-ink-muted flex h-full items-center justify-center text-xs">
                                No image
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-sm group-hover:underline">
                            {slot.artwork.title}
                          </p>
                          <p className="text-ink-muted text-xs">{slot.label}</p>
                        </Link>
                      ) : (
                        <div>
                          <div className="border-hairline-strong bg-band flex aspect-[4/3] items-center justify-center rounded border border-dashed">
                            <span className="text-ink-muted text-xs">Empty</span>
                          </div>
                          <p className="text-ink-muted mt-2 text-xs">{slot.label}</p>
                          {canPlace && (
                            <p className="text-ink-muted text-xs">
                              Slot id: <code>{slot.id}</code>
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
