import { describe, it, expect } from "vitest";
import {
  LIFECYCLE_STATES,
  LIFECYCLE_TRANSITIONS,
  COMMERCE_STATES,
  COMMERCE_TRANSITIONS,
  EXHIBITION_STATES,
  EXHIBITION_TRANSITIONS,
  CUSTODY_STATES,
  CUSTODY_TRANSITIONS,
  canTransitionArtwork,
  assertArtworkTransition,
  IllegalArtworkTransitionError,
} from "../state-machine";

/**
 * BE-3.07: the artwork state machine's four orthogonal domains. Each domain's
 * full transition table is exercised exhaustively (every (from, to) pair,
 * not just the legal ones) so an accidental new edge is caught the moment
 * someone adds one to the map without a matching test.
 */
const DOMAINS = [
  { name: "lifecycle" as const, states: LIFECYCLE_STATES, transitions: LIFECYCLE_TRANSITIONS },
  { name: "commerce" as const, states: COMMERCE_STATES, transitions: COMMERCE_TRANSITIONS },
  { name: "exhibition" as const, states: EXHIBITION_STATES, transitions: EXHIBITION_TRANSITIONS },
  { name: "custody" as const, states: CUSTODY_STATES, transitions: CUSTODY_TRANSITIONS },
].map((d) => ({ ...d, transitions: d.transitions as Record<string, readonly string[]> }));

for (const { name, states, transitions } of DOMAINS) {
  describe(`${name} domain`, () => {
    for (const from of states) {
      for (const to of states) {
        const legal = transitions[from].includes(to);
        it(`${from} -> ${to} is ${legal ? "legal" : "illegal"}`, () => {
          expect(canTransitionArtwork(name, from, to)).toBe(legal);
          if (legal) {
            expect(() => assertArtworkTransition(name, from, to)).not.toThrow();
          } else {
            expect(() => assertArtworkTransition(name, from, to)).toThrow(IllegalArtworkTransitionError);
          }
        });
      }
    }
  });
}

describe("IllegalArtworkTransitionError", () => {
  it("names the domain and both states", () => {
    try {
      assertArtworkTransition("commerce", "sold", "listed");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(IllegalArtworkTransitionError);
      const err = error as IllegalArtworkTransitionError;
      expect(err.domain).toBe("commerce");
      expect(err.from).toBe("sold");
      expect(err.to).toBe("listed");
    }
  });
});
