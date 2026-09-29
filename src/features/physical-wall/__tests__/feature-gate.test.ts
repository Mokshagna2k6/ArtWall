import { readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * FE-2.17: with PHYSICAL_WALL_ENABLED off, every physical-wall server action
 * refuses before touching auth or the database — the /physical-wall layout's
 * notFound() only hides pages, and actions are callable by id from anywhere.
 *
 * Walks the actions directory so a new action that forgets the gate fails here.
 */

const ACTIONS_DIR = join(__dirname, "..", "actions");
// The webhook must settle money already in flight even with the wall switched off.
const UNGATED = new Set(["settleFromWebhook"]);

const saved = { ...process.env };
beforeAll(() => {
  process.env.PHYSICAL_WALL_ENABLED = "false";
  process.env.BETTER_AUTH_SECRET ??= "unit-test-secret-unit-test-secret";
});
afterAll(() => {
  process.env = saved;
});

describe("physical-wall feature gate (FE-2.17)", () => {
  const files = readdirSync(ACTIONS_DIR).filter(
    (f) => f.endsWith(".ts") && f !== "shared.ts"
  );

  it.each(files)("%s: every exported action refuses while the wall is off", async (file) => {
    const mod = (await import(join(ACTIONS_DIR, file))) as Record<string, unknown>;
    const actions = Object.entries(mod).filter(
      ([name, value]) => typeof value === "function" && !UNGATED.has(name)
    );
    expect(actions.length).toBeGreaterThan(0);
    for (const [name, fn] of actions) {
      await expect(
        (async () => (fn as (...a: unknown[]) => unknown)({ status: "idle" }, new FormData()))(),
        `${file}:${name}`
      ).rejects.toThrow("The physical wall is not open yet.");
    }
  });
});
