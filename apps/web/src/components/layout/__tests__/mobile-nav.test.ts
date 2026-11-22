import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { navItems, secondaryNavItems } from "@/config/nav";

/**
 * The mobile menu's shape.
 *
 * Reported from the deployed site: the menu was "cluttering, too lengthy".
 * It rendered every section pre-expanded and printed a sentence of
 * `description` under every link, so a six-item menu became a wall of prose
 * you scrolled past to reach "Artists".
 */
describe("mobile navigation", () => {
  const header = readFileSync(
    resolve(__dirname, "../site-header.tsx"),
    "utf8"
  );
  // Only the mobile panel, so desktop's dropdowns (which keep descriptions on
  // purpose) cannot satisfy or break these assertions.
  const mobile = header.slice(header.indexOf('aria-label="Mobile"'));

  it("stays a short top level", () => {
    // The accordion is only enough because the top level is short. navItems
    // is the five primary sections; the mobile panel also appends
    // secondaryNavItems, which is what the header renders as "More".
    expect(navItems).toHaveLength(5);
    expect(navItems.length + secondaryNavItems.length).toBeLessThanOrEqual(10);
  });

  it("collapses sections instead of listing every child at once", () => {
    expect(mobile).toMatch(/openSection === item\.href/);
    expect(mobile).toMatch(/aria-expanded=\{openSection === item\.href\}/);
  });

  it("shows labels only — no description prose", () => {
    expect(mobile).not.toMatch(/child\.description/);
    expect(mobile).not.toMatch(/item\.description/);
  });
});
