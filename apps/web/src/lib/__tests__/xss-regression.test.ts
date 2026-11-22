import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { esc } from "@/lib/html-escape";

/**
 * SEC-2.06: XSS regression coverage for every place user- or admin-supplied
 * text reaches an HTML response — invoice HTML, JSON-LD (already covered by
 * src/components/seo/json-ld.test.ts), UGC captions, artist bio, exhibition
 * description.
 *
 * The standard payload every check below runs.
 */
const PAYLOAD = `</script><img src=x onerror=alert(1)>"'&`;

describe("invoice HTML escaping (SEC-2.06)", () => {
  it("esc() neutralises every HTML-significant character", () => {
    const out = esc(PAYLOAD);
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).not.toContain('"');
    expect(out).not.toContain("'");
  });

  it("esc() round-trips through an HTML parser back to the original text", () => {
    // The real property that matters: whatever esc() produces, when parsed
    // as HTML text content, must read back as the original string with no
    // tag boundaries created.
    const out = esc(PAYLOAD);
    const unescaped = out
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    expect(unescaped).toBe(PAYLOAD);
    expect(out).not.toMatch(/<[a-z!/]/i);
  });

  it("esc() handles null/undefined (optional invoice fields) without throwing", () => {
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
  });
});

/**
 * Static guard: UGC captions, artist bio and exhibition description are only
 * safe from XSS because they're rendered as plain JSX text (React escapes it),
 * not via dangerouslySetInnerHTML. This fails loudly if someone "upgrades" one
 * of these fields to rich/HTML rendering without re-adding server-side
 * sanitisation.
 */
describe("UGC caption / artist bio / exhibition description stay plain text (SEC-2.06)", () => {
  const SRC = join(__dirname, "..", "..");

  function allTsxFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        return name === "node_modules" || name === "__tests__" ? [] : allTsxFiles(path);
      }
      return name.endsWith(".tsx") ? [path] : [];
    });
  }

  const files = allTsxFiles(SRC);

  it("finds app source files to check", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("no component pipes .caption, .bio, or .description through dangerouslySetInnerHTML", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (!src.includes("dangerouslySetInnerHTML")) continue;
      // Flag only if one of the known free-text fields appears in the same
      // file as dangerouslySetInnerHTML — a human still has to read the
      // diff, but this catches the easy "moved caption into the html prop" case.
      for (const field of [".caption", ".bio", ".description"]) {
        if (src.includes(field)) offenders.push(`${file} (${field})`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
