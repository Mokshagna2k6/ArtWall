import { ImageResponse } from "next/og";

import { getPublicArtistProfile } from "@/lib/artist-profiles";
import { cachedCatalog } from "@/lib/catalog-cache";

export const alt = "An artist on ArtWall";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Same cache key/tag as the page's own loader (PERF-2.06); this is a separate
// module instance so it gets its own entry, but the query and invalidation
// are identical.
const load = cachedCatalog(getPublicArtistProfile, "artist", 3600);

/**
 * Share card for a public artist profile.
 *
 * The portrait where there is one, otherwise their first work — a card with a
 * face or a painting on it is the whole reason this file exists, and a blank
 * branded rectangle would not be worth the render.
 */
export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const artist = await load((await params).handle.toLowerCase());
  if (!artist) return new Response("Not found", { status: 404 });

  const { profile, artworks } = artist;
  const portrait = profile.avatarUrl ?? artworks.find((w) => w.imageUrl)?.imageUrl ?? null;
  const descriptor = [profile.discipline, profile.location].filter(Boolean).join(" · ");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#14110f",
          color: "#f5efe6",
        }}
      >
        {portrait && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={portrait} alt="" width={630} height={630} style={{ objectFit: "cover" }} />
        )}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: 64,
          }}
        >
          <div
            style={{
              fontSize: 24,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: "#e0703a",
            }}
          >
            Artist · ArtWall
          </div>
          <div style={{ fontSize: 60, fontWeight: 700, marginTop: 24, lineHeight: 1.1 }}>
            {profile.displayName}
          </div>
          {descriptor && (
            <div style={{ fontSize: 30, marginTop: 24, opacity: 0.8 }}>{descriptor}</div>
          )}
        </div>
      </div>
    ),
    size
  );
}
