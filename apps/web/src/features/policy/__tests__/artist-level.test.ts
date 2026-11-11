import { describe, it, expect } from "vitest";

import { deriveArtistLevel, type ArtistLevelInputs } from "../artist-level";

const A0: ArtistLevelInputs = {
  identityVerified: false,
  artistVerificationStatus: "unverified",
  portfolioPublished: false,
  endorsementStatus: "unverified",
};

const level = (overrides: Partial<ArtistLevelInputs>) =>
  deriveArtistLevel({ ...A0, ...overrides }).level;

describe("deriveArtistLevel — each rung", () => {
  it("A0 for a bare profile", () => {
    expect(level({})).toBe("A0");
  });

  it("A1 for identity only", () => {
    expect(level({ identityVerified: true })).toBe("A1");
  });

  it("A2 for identity + published portfolio", () => {
    expect(level({ identityVerified: true, portfolioPublished: true })).toBe("A2");
  });

  it("A3 for identity + portfolio + peer", () => {
    expect(
      level({
        identityVerified: true,
        portfolioPublished: true,
        endorsementStatus: "peer_verified",
      })
    ).toBe("A3");
  });

  it("A4 for identity + portfolio + curator", () => {
    expect(
      level({
        identityVerified: true,
        portfolioPublished: true,
        endorsementStatus: "curator_verified",
      })
    ).toBe("A4");
  });
});

describe("deriveArtistLevel — cumulative, not max()", () => {
  it("peer endorsements without identity are NOT A3", () => {
    expect(level({ portfolioPublished: true, endorsementStatus: "peer_verified" })).toBe("A0");
  });

  it("curator endorsement without identity is NOT A4", () => {
    expect(level({ portfolioPublished: true, endorsementStatus: "curator_verified" })).toBe("A0");
  });

  it("curator endorsement without a published portfolio stops at A1", () => {
    expect(level({ identityVerified: true, endorsementStatus: "curator_verified" })).toBe("A1");
  });

  it("a published portfolio without identity is NOT A2", () => {
    expect(level({ portfolioPublished: true })).toBe("A0");
  });
});

describe("deriveArtistLevel — identity axis", () => {
  it("artistVerificationStatus 'approved' satisfies identity on its own", () => {
    expect(level({ artistVerificationStatus: "approved", portfolioPublished: true })).toBe("A2");
  });

  it("'pending' and 'rejected' do not", () => {
    expect(level({ artistVerificationStatus: "pending" })).toBe("A0");
    expect(level({ artistVerificationStatus: "rejected" })).toBe("A0");
  });

  it("null columns are treated as unverified", () => {
    expect(level({ artistVerificationStatus: null, endorsementStatus: null })).toBe("A0");
  });
});

describe("deriveArtistLevel — summary fields", () => {
  it("reports the satisfied rungs and the next one", () => {
    const summary = deriveArtistLevel({
      ...A0,
      identityVerified: true,
      portfolioPublished: true,
    });
    expect(summary).toMatchObject({
      level: "A2",
      label: "Portfolio verified",
      identity: true,
      portfolio: true,
      peer: false,
      curator: false,
      nextStep: "Peer endorsement",
    });
  });

  it("curator_verified satisfies the peer rung too", () => {
    const summary = deriveArtistLevel({
      ...A0,
      identityVerified: true,
      portfolioPublished: true,
      endorsementStatus: "curator_verified",
    });
    expect(summary.peer).toBe(true);
    expect(summary.curator).toBe(true);
    expect(summary.nextStep).toBeNull();
  });

  it("an unverified artist is still told the rungs it is missing", () => {
    expect(deriveArtistLevel(A0)).toMatchObject({
      level: "A0",
      identity: false,
      nextStep: "Identity verification",
    });
  });
});
