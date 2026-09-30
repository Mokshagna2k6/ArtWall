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
