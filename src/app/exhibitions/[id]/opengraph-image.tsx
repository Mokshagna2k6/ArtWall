import { ImageResponse } from "next/og";

import { getPublicExhibition } from "@/features/exhibitions/actions";
import { cachedCatalog } from "@/lib/catalog-cache";

export const alt = "An exhibition on ArtWall";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Same cache key/tag as the page's own load() (PERF-2.06) — this file is a
// separate module instance, so it gets its own unstable_cache entry, but the
// underlying query and invalidation are identical.
const load = cachedCatalog(getPublicExhibition, "exhibition", 3600);

/** Share card for a public exhibition; drafts and cancelled shows 404 here too. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const exh = await load((await params).id);
  if (!exh) return new Response("Not found", { status: 404 });
  const cover = exh.artworks.find((w) => w.imageUrl)?.imageUrl;

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
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" width={630} height={630} style={{ objectFit: "cover" }} />
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
            Exhibition · ArtWall
          </div>
          <div style={{ fontSize: 60, fontWeight: 700, marginTop: 24, lineHeight: 1.1 }}>
            {exh.title}
          </div>
          <div style={{ fontSize: 30, marginTop: 24, opacity: 0.8 }}>{exh.artistName}</div>
        </div>
      </div>
    ),
    size
  );
}
