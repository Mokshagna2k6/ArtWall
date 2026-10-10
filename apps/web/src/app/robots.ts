import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";

import { generateSitemaps } from "./sitemap";

// Same hourly cadence as the sitemap chunks it lists.
export const revalidate = 3600;

export default async function robots(): Promise<MetadataRoute.Robots> {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/studio/", "/physical-wall/admin/", "/api/"],
      },
    ],
    // One entry per 50k-URL chunk (app/sitemap.ts).
    sitemap: (await generateSitemaps()).map(({ id }) =>
      new URL(`/sitemap/${id}.xml`, siteConfig.url).toString()
    ),
  };
}
