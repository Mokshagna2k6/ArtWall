import type { MetadataRoute } from "next";
import { eq, and } from "drizzle-orm";

import {
  navItems,
  primaryCta,
  secondaryNavItems,
  visibleChildren,
} from "@/config/nav";
import { features, siteConfig } from "@/config/site";

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
      ]
        .map((href) => href.split("#")[0] || "/")
    )
  );

  const staticEntries: MetadataRoute.Sitemap = routes.map((route) => ({
    url: new URL(route, siteConfig.url).toString(),
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: route === "/" ? 1 : 0.8,
  }));

  // Dynamic artwork pages
  let artworkEntries: MetadataRoute.Sitemap = [];
  try {
    const { db } = await import("@/lib/db/index");
    const { artworks } = await import("@/lib/db/schema");
    const rows = await db
      .select({ id: artworks.id, updatedAt: artworks.updatedAt })
      .from(artworks)
      .where(and(eq(artworks.isPublic, true), eq(artworks.status, "available")))
      .limit(500);

    artworkEntries = rows.map((r) => ({
      url: new URL(`/artwork/${r.id}`, siteConfig.url).toString(),
      lastModified: r.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));
  } catch {
    // DB may not be available at build time
  }

  // Dynamic artist profile pages
  let artistEntries: MetadataRoute.Sitemap = [];
  try {
    const { db } = await import("@/lib/db/index");
    const { artistProfiles } = await import("@/lib/db/schema");
    const rows = await db
      .select({ handle: artistProfiles.handle, updatedAt: artistProfiles.updatedAt })
      .from(artistProfiles)
      .where(eq(artistProfiles.published, true))
      .limit(500);

    artistEntries = rows.map((r) => ({
      url: new URL(`/artist/${r.handle}`, siteConfig.url).toString(),
      lastModified: r.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
  } catch {
    // DB may not be available at build time
  }

  return [...staticEntries, ...artworkEntries, ...artistEntries];
}
