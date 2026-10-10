import { describe, it, expect } from "vitest";

import type { ReasonCode } from "../engine";
import { REASON_COPY } from "../reason-codes";

// The set of codes engine.ts's Decision can ever contain, kept in sync by
// hand since ReasonCode is a string union with no runtime values to iterate.
const ALL_REASON_CODES: ReasonCode[] = [
  "IDENTITY_NOT_VERIFIED",
  "PHYSICAL_BINDING_NOT_VERIFIED",
  "BLOCKCHAIN_NOT_ANCHORED",
  "COA_NOT_ISSUED",
  "CURATION_NOT_APPROVED",
  "ARTWORK_NOT_PUBLISHED",
  "ALREADY_LISTED",
  "ALREADY_MINTED",
];

describe("REASON_COPY", () => {
  it("has non-empty copy for every reason code the engine can return", () => {
    for (const code of ALL_REASON_CODES) {
      expect(REASON_COPY[code]).toBeTruthy();
    }
  });
});
