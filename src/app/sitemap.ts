import type { MetadataRoute } from "next";
import { eq, and } from "drizzle-orm";

import {
  navItems,
  primaryCta,
  secondaryNavItems,
  visibleChildren,
} from "@/config/nav";
import { features, siteConfig } from "@/config/site";
import { db } from "@/lib/db/index";
import { artistProfiles, artworks } from "@/lib/db/schema";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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
  let rows: {
    artworks: { id: string; updatedAt: Date }[];
    artists: { handle: string; updatedAt: Date }[];
  };
  try {
    rows = {
      // Only works that are public AND whose artist has published their profile;
      // /artwork/[id] 404s for anything else.
      artworks: await db
        .select({ id: artworks.id, updatedAt: artworks.updatedAt })
        .from(artworks)
        .innerJoin(artistProfiles, eq(artworks.userId, artistProfiles.userId))
        .where(
          and(eq(artworks.isPublic, true), eq(artistProfiles.published, true))
        )
        .limit(5000),
      artists: await db
        .select({
          handle: artistProfiles.handle,
          updatedAt: artistProfiles.updatedAt,
        })
        .from(artistProfiles)
        .where(eq(artistProfiles.published, true))
        .limit(5000),
    };
  } catch (error) {
    console.error("[sitemap] could not load artworks/artists", error);
    throw error;
  }

  return [
    ...staticEntries,
    ...rows.artworks.map((r) => ({
      url: new URL(`/artwork/${r.id}`, siteConfig.url).toString(),
      lastModified: r.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...rows.artists.map((r) => ({
      url: new URL(`/artist/${r.handle}`, siteConfig.url).toString(),
      lastModified: r.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
