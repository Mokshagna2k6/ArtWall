import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/studio/", "/physical-wall/admin/", "/api/"],
      },
    ],
    sitemap: new URL("/sitemap.xml", siteConfig.url).toString(),
  };
}
