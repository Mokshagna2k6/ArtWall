"use client";

import { useState, useTransition } from "react";

import {
  addArtworkToCollection,
  removeArtworkFromCollection,
  reorderCollection,
  searchArtworksForCollection,
  setCollectionCover,
  setCollectionVisibility,
  setFeaturedCollection,
  updateCollection,
  publishCollection,
  unpublishCollection,
} from "@/features/collections/actions";
import type { MarketplaceItem } from "@/features/marketplace/actions";

type Member = {
  artworkId: string;
  title: string;
  imageUrl: string | null;
  pricePaise: number | null;
  artistName: string | null;
  artistHandle: string | null;
  position: number;
};

type Collection = {
  id: string;
  slug: string;
  type: "BUYER" | "ARTIST" | "CURATOR";
  title: string;
  description: string | null;
  thesis: string | null;
  visibility: "public" | "private";
  isFeatured: boolean;
  coverArtworkId: string | null;
  publishedAt: Date | string | null;
  artworks: Member[];
};

export function CollectionManager({ collection }: { collection: Collection }) {
  const [members, setMembers] = useState(collection.artworks);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MarketplaceItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const memberIds = new Set(members.map((m) => m.artworkId));

  function runSearch(q: string) {
    setQuery(q);
    start(async () => {
      const result = await searchArtworksForCollection(collection.id, q);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setResults(result.data);
    });
  }

  function add(artworkId: string, item: MarketplaceItem) {
    setError(null);
    start(async () => {
      const result = await addArtworkToCollection(collection.id, artworkId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMembers((prev) => [
        ...prev,
        { artworkId, title: item.title, imageUrl: item.imageUrl, pricePaise: item.pricePaise, artistName: item.artistName, artistHandle: item.artistHandle, position: prev.length },
      ]);
    });
  }

  function remove(artworkId: string) {
    setError(null);
    start(async () => {
      const result = await removeArtworkFromCollection(collection.id, artworkId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMembers((prev) => prev.filter((m) => m.artworkId !== artworkId));
    });
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...members];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setMembers(next);
    start(async () => {
      const result = await reorderCollection({ collectionId: collection.id, artworkIds: next.map((m) => m.artworkId) });
      if (!result.ok) setError(result.error);
    });
  }

  function toggleVisibility() {
    const next = collection.visibility === "public" ? "private" : "public";
    start(async () => {
      const result = await setCollectionVisibility(collection.id, next);
      if (!result.ok) setError(result.error);
    });
  }

  function toggleFeatured() {
    start(async () => {
      const result = await setFeaturedCollection(collection.id, !collection.isFeatured);
      if (!result.ok) setError(result.error);
    });
  }

  function togglePublish() {
    start(async () => {
      const result = collection.publishedAt ? await unpublishCollection(collection.id) : await publishCollection(collection.id);
      if (!result.ok) setError(result.error);
    });
  }

  function saveThesis(thesis: string) {
    start(async () => {
      const result = await updateCollection({ collectionId: collection.id, thesis });
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="studio-card flex flex-wrap items-center gap-3 p-4">
        <button type="button" className="studio-button" onClick={toggleVisibility} disabled={pending || collection.type === "CURATOR"}>
          {collection.visibility === "public" ? "Make private" : "Make public"}
        </button>
        <button type="button" className="studio-button" onClick={toggleFeatured} disabled={pending || collection.type === "BUYER"}>
          {collection.isFeatured ? "Unfeature" : "Feature this collection"}
        </button>
        <button type="button" className="studio-button" onClick={togglePublish} disabled={pending}>
          {collection.publishedAt ? "Unpublish" : "Publish"}
        </button>
        {collection.visibility === "public" && (
          <a href={`/collections/${collection.slug}`} className="text-sm underline underline-offset-4" target="_blank" rel="noreferrer">
            View public page →
          </a>
        )}
      </div>

      {collection.type !== "BUYER" && (
        <div className="studio-card p-4">
          <label className="studio-eyebrow" htmlFor="thesis">
            {collection.type === "CURATOR" ? "Curation thesis / statement" : "Series note (optional)"}
          </label>
          <textarea
            id="thesis"
            defaultValue={collection.thesis ?? ""}
            onBlur={(e) => saveThesis(e.target.value)}
            className="studio-input mt-2 w-full"
            rows={3}
            placeholder={collection.type === "CURATOR" ? "What ties these artworks together?" : "A note about this series"}
          />
        </div>
      )}

      <section>
        <h2 className="studio-eyebrow mb-3">Artworks in this collection ({members.length})</h2>
        {members.length === 0 ? (
          <p className="text-studio-muted text-sm">No artworks yet. Add some below.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {members.map((m, i) => (
              <li key={m.artworkId} className="studio-card flex items-center gap-3 p-3">
                <div className="flex flex-col">
                  <button type="button" aria-label="Move up" disabled={pending || i === 0} onClick={() => move(i, -1)}>
                    ▲
                  </button>
                  <button type="button" aria-label="Move down" disabled={pending || i === members.length - 1} onClick={() => move(i, 1)}>
                    ▼
                  </button>
                </div>
                <div className="flex-1">
                  <p className="font-medium">{m.title}</p>
                  <p className="text-studio-muted text-xs">{m.artistName}</p>
                </div>
                {collection.coverArtworkId === m.artworkId ? (
                  <span className="studio-eyebrow">Cover</span>
                ) : (
                  <button
                    type="button"
                    className="text-xs underline"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const result = await setCollectionCover(collection.id, m.artworkId);
                        if (!result.ok) setError(result.error);
                      })
                    }
                  >
                    Set as cover
                  </button>
                )}
                <button type="button" className="studio-icon-button" aria-label={`Remove ${m.title}`} disabled={pending} onClick={() => remove(m.artworkId)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="studio-eyebrow mb-3">
          {collection.type === "ARTIST" ? "Add your own artwork" : "Add artwork from the marketplace"}
        </h2>
        <input
          value={query}
          onChange={(e) => runSearch(e.target.value)}
          className="studio-input w-full"
          placeholder="Search by title…"
          aria-label="Search artworks"
        />
        {results.length > 0 && (
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {results
              .filter((r) => !memberIds.has(r.id))
              .map((r) => (
                <li key={r.id} className="studio-card flex items-center justify-between gap-3 p-3">
                  <div>
                    <p className="font-medium">{r.title}</p>
                    <p className="text-studio-muted text-xs">{r.artistName}</p>
                  </div>
                  <button type="button" className="studio-button" disabled={pending} onClick={() => add(r.id, r)}>
                    Add
                  </button>
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}
