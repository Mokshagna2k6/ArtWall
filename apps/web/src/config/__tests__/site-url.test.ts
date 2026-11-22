import { expect, test } from "vitest";

import { siteConfig } from "../site";

/**
 * siteConfig.url is the origin for every canonical tag, OpenGraph url,
 * robots.txt entry and all 452+ sitemap URLs. If it names a host that does
 * not serve this app, Google is handed hundreds of URLs that 404 and no page
 * can be indexed — which is exactly what happened when it pointed at
 * www.artwalllabs.com, a separate one-page site.
 */
test("the site origin is an absolute https origin with no trailing slash", () => {
  const url = new URL(siteConfig.url);
  expect(url.protocol).toBe("https:");
  // A trailing slash would double up once joined with a path.
  expect(siteConfig.url).not.toMatch(/\/$/);
  expect(url.pathname).toBe("/");
});

test("the site origin is not a host that serves a different app", () => {
  // www.artwalllabs.com is the company site, not this app: /discover and
  // every /artwork/* return a hard 404 there. Until that domain is pointed at
  // this deployment, using it as the SEO origin silently deindexes the site.
  expect(siteConfig.url).not.toMatch(/artwalllabs\.com/);
});
