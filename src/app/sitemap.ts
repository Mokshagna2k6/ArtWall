import type { MetadataRoute } from "next";

import { navItems, primaryCta, secondaryNavItems } from "@/config/nav";
import { siteConfig } from "@/config/site";

/**
 * Generated from the nav config rather than hand-listed, so a new route can
 * never be added to the site and silently left out of the sitemap.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const routes = [
    "/",
    "/artists",
    ...navItems.map((item) => item.href),
    ...secondaryNavItems.map((item) => item.href),
    primaryCta.href,
  ];

  return routes.map((route) => ({
    url: new URL(route, siteConfig.url).toString(),
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: route === "/" ? 1 : 0.8,
  }));
}
