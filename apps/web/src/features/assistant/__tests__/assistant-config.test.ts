import { afterEach, describe, expect, it } from "vitest";

import { assistantEnabled, systemPrompt, ASSISTANT_MODEL } from "@/features/assistant/config";

/**
 * The two things that must not regress:
 *  - a missing ANTHROPIC_API_KEY disables the feature (so the launcher is
 *    hidden and a missing key never breaks a page or the build);
 *  - the system prompt actually carries the refusals that keep the assistant
 *    from inventing authenticity, price or policy claims.
 */

const original = process.env.ANTHROPIC_API_KEY;
afterEach(() => {
  if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = original;
});

describe("assistantEnabled", () => {
  it("is false with no key, so the widget never renders", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(assistantEnabled()).toBe(false);
  });

  it("is false for an empty key rather than attempting a doomed call", () => {
    process.env.ANTHROPIC_API_KEY = "";
    expect(assistantEnabled()).toBe(false);
  });

  it("is true once a key is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-not-a-real-key";
    expect(assistantEnabled()).toBe(true);
  });
});

describe("systemPrompt", () => {
  const prompt = systemPrompt();

  it("forbids judging authenticity or provenance", () => {
    expect(prompt).toMatch(/[Nn]ever judge authenticity/);
    expect(prompt.toLowerCase()).toContain("provenance");
  });

  it("forbids quoting a price for a specific artwork", () => {
    expect(prompt).toMatch(/[Nn]ever quote, estimate or negotiate a price/);
  });

  it("forbids inventing policy", () => {
    expect(prompt).toMatch(/[Nn]ever invent policy/);
  });

  it("tells the model to escalate instead of guessing", () => {
    expect(prompt.toLowerCase()).toContain("do not guess");
  });

  it("is grounded in the site's own content rather than invented copy", () => {
    // Pulled from config/content.ts — if the grounding wiring breaks, these go.
    expect(prompt).toContain("Frequently asked questions");
    expect(prompt).toContain("What ArtWall offers");
    expect(prompt).toContain("How it works");
  });

  it("carries no demand score, threshold or confidence figure (Bible §44)", () => {
    expect(prompt).not.toMatch(/\bthreshold=\d|\bscore=\d|\bconfidence=[\d.]/);
  });
});

describe("model", () => {
  it("pins an exact model id with no date suffix", () => {
    expect(ASSISTANT_MODEL).toBe("claude-opus-5-5");
  });
});
