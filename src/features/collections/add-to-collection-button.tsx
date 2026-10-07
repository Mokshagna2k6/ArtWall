"use client";

import { useState, useTransition } from "react";

import { addArtworkToCollection, createCollection, getCollectionsForArtwork } from "@/features/collections/actions";

type Picker = { id: string; title: string; type: string }[];

/**
 * Spec section 5: "[ + Add to Collection ]" on an artwork page. Opens a list
 * of collections the signed-in user is authorized to add this artwork to
 * (loaded fresh from the server on open, never trusted from a prior render),
 * plus "+ Create New Collection".
 */
export function AddToCollectionButton({ artworkId }: { artworkId: string }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Picker | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [pending, start] = useTransition();

  function openPicker() {
    setOpen(true);
    setStatus(null);
    start(async () => {
      const rows = await getCollectionsForArtwork(artworkId);
      setOptions(rows.map((r) => ({ id: r.id, title: r.title, type: r.type })));
    });
  }

  function addTo(collectionId: string) {
    start(async () => {
      const result = await addArtworkToCollection(collectionId, artworkId);
      setStatus(result.ok ? "Added." : result.error);
    });
  }

  function createAndAdd() {
    if (!newTitle.trim()) return;
    start(async () => {
      const created = await createCollection({ type: "BUYER", title: newTitle });
      if (!created.ok) {
        setStatus(created.error);
        return;
      }
      const added = await addArtworkToCollection(created.data.id, artworkId);
      if (!added.ok) {
        setStatus(added.error);
        return;
      }
      setNewTitle("");
      setStatus("Added to a new collection.");
    });
  }

  return (
    <div className="relative inline-block">
      <button type="button" className="studio-button" onClick={() => (open ? setOpen(false) : openPicker())}>
        + Add to Collection
      </button>
      {open && (
        <div className="studio-card absolute z-10 mt-2 w-72 p-3">
          {options === null ? (
            <p className="text-studio-muted text-sm">Loading…</p>
          ) : options.length === 0 ? (
            <p className="text-studio-muted text-sm">No collections yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {options.map((c) => (
                <li key={c.id}>
                  <button type="button" disabled={pending} className="w-full rounded px-2 py-1 text-left text-sm hover:bg-black/5" onClick={() => addTo(c.id)}>
                    {c.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex gap-2 border-t pt-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="New collection name"
              className="studio-input flex-1 text-sm"
              aria-label="New collection name"
            />
            <button type="button" className="studio-button" disabled={pending} onClick={createAndAdd}>
              Create
            </button>
          </div>
          {status && <p className="mt-2 text-xs">{status}</p>}
        </div>
      )}
    </div>
  );
}
