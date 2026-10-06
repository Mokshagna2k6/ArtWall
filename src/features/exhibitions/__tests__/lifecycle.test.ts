import { describe, it, expect } from "vitest";
import {
  EXHIBITION_STAGES,
  EXHIBITION_TRANSITIONS,
  canTransitionExhibition,
  assertExhibitionTransition,
  IllegalExhibitionTransitionError,
} from "../lifecycle";

/** BE-3.08: all 15 stages, every (from, to) pair exercised exhaustively. */
describe("EXHIBITION_STAGES", () => {
  it("has exactly 15 stages", () => {
    expect(EXHIBITION_STAGES).toHaveLength(15);
  });
});

for (const from of EXHIBITION_STAGES) {
  describe(`from ${from}`, () => {
    for (const to of EXHIBITION_STAGES) {
      const legal = (EXHIBITION_TRANSITIONS[from] as readonly string[]).includes(to);
      it(`-> ${to} is ${legal ? "legal" : "illegal"}`, () => {
        expect(canTransitionExhibition(from, to)).toBe(legal);
        if (legal) {
          expect(() => assertExhibitionTransition(from, to)).not.toThrow();
        } else {
          expect(() => assertExhibitionTransition(from, to)).toThrow(IllegalExhibitionTransitionError);
        }
      });
    }
  });
}

describe("terminal stages", () => {
  it("rejected, archived, cancelled, withdrawn have no outgoing moves", () => {
    for (const stage of ["rejected", "archived", "cancelled", "withdrawn"] as const) {
      expect(EXHIBITION_TRANSITIONS[stage]).toEqual([]);
    }
  });
});

describe("the real path this codebase uses today", () => {
  it("draft -> published is legal: publishExhibition's only real caller goes straight from draft to live", () => {
    // 0051's header comment: only draft and published are wired up by any
    // real caller today, with no separate submission/review/scheduling/
    // install step existing in this codebase yet. The fuller workflow stays
    // modelled in the graph for whoever builds it next.
    expect(canTransitionExhibition("draft", "published")).toBe(true);
  });

  it("published is otherwise only reachable from installing (go-live) or paused (resume)", () => {
    for (const from of EXHIBITION_STAGES) {
      if (from === "draft" || from === "installing" || from === "paused") continue;
      expect(canTransitionExhibition(from, "published")).toBe(false);
    }
  });
});
