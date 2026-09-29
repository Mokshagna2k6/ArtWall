import type { MetadataRoute } from "next";
import { and, asc, count, eq } from "drizzle-orm";

import {
  navItems,
  primaryCta,
  secondaryNavItems,
  visibleChildren,
} from "@/config/nav";
import { features, siteConfig } from "@/config/site";
import { db } from "@/lib/db/index";
import { artistProfiles, artworks } from "@/lib/db/schema";

// Regenerate hourly; otherwise the build-time snapshot never lists new work.
export const revalidate = 3600;

/**
 * Chunked (PERF-2.08): search engines take at most 50,000 URLs per sitemap.
 * /sitemap/0.xml is the static pages + artists; /sitemap/1.xml onwards are
 * artworks, 50k each. robots.ts lists every chunk. Each chunk is one bounded
 * query, and the whole thing is cached for an hour (`revalidate`).
 * ponytail: artists stay in chunk 0 (capped at 50k minus the static pages);
 * give them their own chunks if there are ever that many.
 */
const PER_SITEMAP = 50_000;

const publicArtwork = and(eq(artworks.isPublic, true), eq(artistProfiles.published, true));

export async function generateSitemaps() {
  const [{ n }] = await db
    .select({ n: count() })
    .from(artworks)
    .innerJoin(artistProfiles, eq(artworks.userId, artistProfiles.userId))
    .where(publicArtwork);
  const chunks = Math.ceil(n / PER_SITEMAP);
  return Array.from({ length: chunks + 1 }, (_, id) => ({ id }));
}

export default async function sitemap(props?: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const id = Number((await props?.id) ?? 0);
  if (id > 0) return artworkChunk(id);

  const routes = Array.from(
    new Set(
      [
        "/",
        "/artists",
        "/discover",
        ...navItems.map((item) => item.href),
        ...navItems.flatMap((item) =>
          visibleChildren(item, {
            physicalWallEnabled: features.physicalWall,
          }).map((child) => child.href)
        ),
        ...secondaryNavItems.map((item) => item.href),
        primaryCta.href,
      ].map((href) => href.split("#")[0] || "/")
    )
  );

  const staticEntries: MetadataRoute.Sitemap = routes.map((route) => ({
    url: new URL(route, siteConfig.url).toString(),
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: route === "/" ? 1 : 0.8,
  }));

  // A swallowed DB error here used to ship a sitemap with every artist and
  // artwork silently missing. Log it and fail the request/build instead.
  let artists: { handle: string; updatedAt: Date }[];
  try {
    artists = await db
      .select({ handle: artistProfiles.handle, updatedAt: artistProfiles.updatedAt })
      .from(artistProfiles)
      .where(eq(artistProfiles.published, true))
      .orderBy(asc(artistProfiles.handle))
      .limit(PER_SITEMAP - staticEntries.length);
  } catch (error) {
    console.error("[sitemap] could not load artists", error);
    throw error;
  }

  return [
    ...staticEntries,
    ...artists.map((r) => ({
      url: new URL(`/artist/${r.handle}`, siteConfig.url).toString(),
      lastModified: r.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}

/**
 * Artworks for chunk `id` (1-based). Only works that are public AND whose artist
 * has published their profile; /artwork/[id] 404s for anything else.
 * ponytail: OFFSET scan, fine for an hourly job at tens of chunks; switch to
 * keyset on id if it ever gets slow.
 */
async function artworkChunk(id: number): Promise<MetadataRoute.Sitemap> {
  let rows: { id: string; updatedAt: Date }[];
  try {
    rows = await db
      .select({ id: artworks.id, updatedAt: artworks.updatedAt })
      .from(artworks)
      .innerJoin(artistProfiles, eq(artworks.userId, artistProfiles.userId))
      .where(publicArtwork)
      .orderBy(asc(artworks.id))
      .limit(PER_SITEMAP)
      .offset((id - 1) * PER_SITEMAP);
  } catch (error) {
    console.error("[sitemap] could not load artworks", error);
    throw error;
  }
  return rows.map((r) => ({
    url: new URL(`/artwork/${r.id}`, siteConfig.url).toString(),
    lastModified: r.updatedAt,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));
}
