import { describe, it, expect } from "vitest";
import {
  canPublishArtwork,
  canExhibit,
  canSecondarySell,
  canList,
  canMint,
  type TrustDimensions,
} from "../engine";

const FULL_TRUST: TrustDimensions = {
  identityVerified: true,
  physicalBindingVerified: true,
  blockchainAnchored: true,
  coaIssued: true,
  curationApproved: true,
};

const NO_TRUST: TrustDimensions = {
  identityVerified: false,
  physicalBindingVerified: false,
  blockchainAnchored: false,
  coaIssued: false,
  curationApproved: false,
};

describe("canPublishArtwork", () => {
  it("allows a complete artwork", () => {
    expect(canPublishArtwork({ hasTitle: true, hasImage: true }).allow).toBe(true);
  });
  it("denies a missing title or image", () => {
    expect(canPublishArtwork({ hasTitle: false, hasImage: true }).allow).toBe(false);
    expect(canPublishArtwork({ hasTitle: true, hasImage: false }).allow).toBe(false);
  });
});

// BE-3.04: section-14 hard gate — exhibitable only when BOTH physical binding
// is verified AND blockchain provenance is anchored. All four combinations.
describe("canExhibit (section 14 hard gate)", () => {
  it("denies when neither is verified", () => {
    const d = canExhibit({ trust: { ...NO_TRUST, physicalBindingVerified: false, blockchainAnchored: false } });
    expect(d.allow).toBe(false);
    expect(d.reasons).toEqual(
      expect.arrayContaining(["PHYSICAL_BINDING_NOT_VERIFIED", "BLOCKCHAIN_NOT_ANCHORED"])
    );
  });
  it("denies when only physical binding is verified", () => {
    const d = canExhibit({ trust: { ...NO_TRUST, physicalBindingVerified: true, blockchainAnchored: false } });
    expect(d.allow).toBe(false);
    expect(d.reasons).toEqual(["BLOCKCHAIN_NOT_ANCHORED"]);
  });
  it("denies when only blockchain is anchored", () => {
    const d = canExhibit({ trust: { ...NO_TRUST, physicalBindingVerified: false, blockchainAnchored: true } });
    expect(d.allow).toBe(false);
    expect(d.reasons).toEqual(["PHYSICAL_BINDING_NOT_VERIFIED"]);
  });
  it("allows only when both are verified", () => {
    const d = canExhibit({ trust: { ...NO_TRUST, physicalBindingVerified: true, blockchainAnchored: true } });
    expect(d.allow).toBe(true);
    expect(d.reasons).toEqual([]);
  });
});

describe("canSecondarySell", () => {
  it("allows a published, verified, COA'd work", () => {
    expect(canSecondarySell({ trust: FULL_TRUST, isPublished: true }).allow).toBe(true);
  });
  it("denies an unpublished work", () => {
    expect(canSecondarySell({ trust: FULL_TRUST, isPublished: false }).reasons).toContain(
      "ARTWORK_NOT_PUBLISHED"
    );
  });
  it("denies without identity verification", () => {
    expect(
      canSecondarySell({ trust: { ...FULL_TRUST, identityVerified: false }, isPublished: true }).reasons
    ).toContain("IDENTITY_NOT_VERIFIED");
  });
  it("denies without a COA", () => {
    expect(
      canSecondarySell({ trust: { ...FULL_TRUST, coaIssued: false }, isPublished: true }).reasons
    ).toContain("COA_NOT_ISSUED");
  });
});

describe("canList", () => {
  it("allows a published, verified, curated, unlisted work", () => {
    expect(canList({ trust: FULL_TRUST, isPublished: true, alreadyListed: false }).allow).toBe(true);
  });
  it("denies without curation approval", () => {
    expect(
      canList({ trust: { ...FULL_TRUST, curationApproved: false }, isPublished: true, alreadyListed: false })
        .reasons
    ).toContain("CURATION_NOT_APPROVED");
  });
  it("denies a work already listed", () => {
    expect(canList({ trust: FULL_TRUST, isPublished: true, alreadyListed: true }).reasons).toContain(
      "ALREADY_LISTED"
    );
  });
});

describe("canMint", () => {
  it("allows a verified, COA'd, not-yet-minted work", () => {
    expect(canMint({ trust: FULL_TRUST, alreadyMinted: false }).allow).toBe(true);
  });
  it("denies a work already minted", () => {
    expect(canMint({ trust: FULL_TRUST, alreadyMinted: true }).reasons).toContain("ALREADY_MINTED");
  });
  it("denies without a COA", () => {
    expect(canMint({ trust: { ...FULL_TRUST, coaIssued: false }, alreadyMinted: false }).reasons).toContain(
      "COA_NOT_ISSUED"
    );
  });
});

/**
 * BE-3.02: the full Master Eligibility Matrix. Every cell of every
 * combination of the dimensions each gate actually reads (confirmed by
 * reading engine.ts above, not assumed) — not just the hand-picked examples
 * above. `identityVerified`/`physicalBindingVerified` not read by a given
 * gate are held at FULL_TRUST's value throughout that gate's block, so a
 * failing assertion can only be caused by the dimension under test.
 */
function expectReasons(allow: boolean, present: string[], absent: string[]) {
  return (reasons: string[]) => {
    expect(allow ? reasons.length === 0 : reasons.length > 0).toBe(true);
    for (const code of present) expect(reasons).toContain(code);
    for (const code of absent) expect(reasons).not.toContain(code);
  };
}

describe("Master Eligibility Matrix: canSecondarySell (isPublished x identityVerified x coaIssued)", () => {
  const CASES: Array<[boolean, boolean, boolean]> = [
    [true, true, true],
    [true, true, false],
    [true, false, true],
    [true, false, false],
    [false, true, true],
    [false, true, false],
    [false, false, true],
    [false, false, false],
  ];
  it.each(CASES)(
    "isPublished=%s identityVerified=%s coaIssued=%s",
    (isPublished, identityVerified, coaIssued) => {
      const d = canSecondarySell({
        trust: { ...FULL_TRUST, identityVerified, coaIssued },
        isPublished,
      });
      const check = expectReasons(
        isPublished && identityVerified && coaIssued,
        [
          ...(!isPublished ? ["ARTWORK_NOT_PUBLISHED"] : []),
          ...(!identityVerified ? ["IDENTITY_NOT_VERIFIED"] : []),
          ...(!coaIssued ? ["COA_NOT_ISSUED"] : []),
        ],
        [
          ...(isPublished ? ["ARTWORK_NOT_PUBLISHED"] : []),
          ...(identityVerified ? ["IDENTITY_NOT_VERIFIED"] : []),
          ...(coaIssued ? ["COA_NOT_ISSUED"] : []),
        ]
      );
      check(d.reasons);
    }
  );
});

describe("Master Eligibility Matrix: canList (isPublished x identityVerified x curationApproved x alreadyListed)", () => {
  const BOOLS = [true, false];
  const CASES: Array<[boolean, boolean, boolean, boolean]> = [];
  for (const isPublished of BOOLS)
    for (const identityVerified of BOOLS)
      for (const curationApproved of BOOLS)
        for (const alreadyListed of BOOLS)
          CASES.push([isPublished, identityVerified, curationApproved, alreadyListed]);

  it.each(CASES)(
    "isPublished=%s identityVerified=%s curationApproved=%s alreadyListed=%s",
    (isPublished, identityVerified, curationApproved, alreadyListed) => {
      const d = canList({
        trust: { ...FULL_TRUST, identityVerified, curationApproved },
        isPublished,
        alreadyListed,
      });
      const shouldAllow = isPublished && identityVerified && curationApproved && !alreadyListed;
      expect(d.allow).toBe(shouldAllow);
      if (!isPublished) expect(d.reasons).toContain("ARTWORK_NOT_PUBLISHED");
      else expect(d.reasons).not.toContain("ARTWORK_NOT_PUBLISHED");
      if (!identityVerified) expect(d.reasons).toContain("IDENTITY_NOT_VERIFIED");
      else expect(d.reasons).not.toContain("IDENTITY_NOT_VERIFIED");
      if (!curationApproved) expect(d.reasons).toContain("CURATION_NOT_APPROVED");
      else expect(d.reasons).not.toContain("CURATION_NOT_APPROVED");
      if (alreadyListed) expect(d.reasons).toContain("ALREADY_LISTED");
      else expect(d.reasons).not.toContain("ALREADY_LISTED");
    }
  );
});

describe("Master Eligibility Matrix: canMint (identityVerified x coaIssued x alreadyMinted)", () => {
  const BOOLS = [true, false];
  const CASES: Array<[boolean, boolean, boolean]> = [];
  for (const identityVerified of BOOLS)
    for (const coaIssued of BOOLS)
      for (const alreadyMinted of BOOLS) CASES.push([identityVerified, coaIssued, alreadyMinted]);

  it.each(CASES)(
    "identityVerified=%s coaIssued=%s alreadyMinted=%s",
    (identityVerified, coaIssued, alreadyMinted) => {
      const d = canMint({ trust: { ...FULL_TRUST, identityVerified, coaIssued }, alreadyMinted });
      const shouldAllow = identityVerified && coaIssued && !alreadyMinted;
      expect(d.allow).toBe(shouldAllow);
      if (!identityVerified) expect(d.reasons).toContain("IDENTITY_NOT_VERIFIED");
      if (!coaIssued) expect(d.reasons).toContain("COA_NOT_ISSUED");
      if (alreadyMinted) expect(d.reasons).toContain("ALREADY_MINTED");
    }
  );
});
