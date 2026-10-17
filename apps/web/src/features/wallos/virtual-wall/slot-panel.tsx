"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import {
  placeArtworkOnSlot,
  removeArtworkFromSlot,
  type VirtualBuilding,
} from "@/features/wallos/virtual-wall/actions";
import type { SelectedSlot } from "@/features/wallos/virtual-wall/virtual-wall-viewer";

/**
 * What clicking a slot does: an in-app details panel.
 *
 * The reference site's artwork-click behaviour could not be determined
 * (docs/VIRTUAL-WALL-RESEARCH.md §3), so this shows what the Bible allows and
 * nothing more — title and a link to the artwork page. §A13: no owner, no
 * price, no price history, no wallet. §44: no demand score or band.
 *
 * For Super Admin only, the same panel is where art is hung and taken down.
 * The buttons are a convenience: `placeArtworkOnSlot`/`removeArtworkFromSlot`
 * each call `requireAdminRole("super_admin")` server-side on every invocation
 * (Locked Rule 42), so rendering them is not what grants the permission.
 */
export function SlotPanel({
  slot,
  building,
  canPlace,
  onClose,
}: {
  slot: SelectedSlot;
  building: VirtualBuilding;
  canPlace: boolean;
  onClose: () => void;
}) {
  const [artworkId, setArtworkId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const label = findSlotLabel(building, slot.slotId);
  const current = findArtwork(building, slot.slotId);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      // A refused write says so here rather than silently doing nothing — this
      // is also the path a non-super-admin hits if they call the action
      // directly, since the server, not this component, decides.
      setMessage(result.ok ? null : (result.error ?? "That didn't work."));
      if (result.ok) onClose();
    });
  }

  return (
    <aside className="border-hairline-strong rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-ink-muted text-label tracking-wider uppercase">
            Slot {label ?? slot.slotId}
          </p>
          {current ? (
            <h2 className="font-heading mt-1 text-lg">{current.title}</h2>
          ) : (
            <h2 className="font-heading text-ink-muted mt-1 text-lg">Empty slot</h2>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-ink-muted text-small hover:text-ink"
        >
          Close
        </button>
      </div>

      {current && (
        <Link
          href={`/artwork/${current.id}`}
          className="text-small mt-3 inline-block underline"
        >
          View this artwork
        </Link>
      )}

      {canPlace && (
        <div className="border-hairline mt-4 border-t pt-4">
          <p className="text-ink-muted text-xs">Super Admin · placement</p>
          {current ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => removeArtworkFromSlot(slot.slotId))}
              className="border-hairline-strong text-small mt-2 rounded-full border px-3 py-1.5 disabled:opacity-50"
            >
              {pending ? "Removing…" : "Remove from this slot"}
            </button>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="text-small" htmlFor="vw-artwork-id">
                Artwork id
              </label>
              <input
                id="vw-artwork-id"
                value={artworkId}
                onChange={(e) => setArtworkId(e.target.value)}
                placeholder="art_…"
                className="border-hairline-strong text-small rounded border px-2 py-1"
              />
              <button
                type="button"
                disabled={pending || artworkId.trim() === ""}
                onClick={() =>
                  run(() =>
                    placeArtworkOnSlot({ slotId: slot.slotId, artworkId: artworkId.trim() })
                  )
                }
                className="bg-ink text-small rounded-full px-3 py-1.5 text-white disabled:opacity-50"
              >
                {pending ? "Placing…" : "Place here"}
              </button>
            </div>
          )}
        </div>
      )}

      {message && <p className="text-small mt-3 text-red-700">{message}</p>}
    </aside>
  );
}

function findSlotLabel(building: VirtualBuilding, slotId: string): string | null {
  for (const floor of building.floors) {
    for (const wall of floor.walls) {
      const slot = wall.slots.find((s) => s.id === slotId);
      if (slot) return `${wall.name} · ${slot.label}`;
    }
  }
  return null;
}

function findArtwork(building: VirtualBuilding, slotId: string) {
  for (const floor of building.floors) {
    for (const wall of floor.walls) {
      const slot = wall.slots.find((s) => s.id === slotId);
      if (slot) return slot.artwork;
    }
  }
  return null;
}
