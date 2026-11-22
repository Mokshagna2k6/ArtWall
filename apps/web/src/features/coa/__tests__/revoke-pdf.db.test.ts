import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { actAs } from "@/test/db-setup";
import { makeArtwork, makeProfile, makeUser, purgeTestData } from "@/test/fixtures";

const { archive } = vi.hoisted(() => ({ archive: vi.fn(async (_id: string) => null as string | null) }));
vi.mock("@/features/coa/pdf-service", () => ({ archiveCertificatePdf: archive }));
// There is no request here, so run after() callbacks inline.
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (fn: () => unknown) => void Promise.resolve(fn()).catch(() => {}),
}));

import { issueCertificate, revokeCertificate } from "@/features/coa/actions";

afterAll(purgeTestData);
beforeEach(() => archive.mockClear());

describe("revoking re-archives the certificate PDF", () => {
  it("regenerates after a successful revoke", async () => {
    const artist = await makeUser();
    await makeProfile(artist.id);
    const art = await makeArtwork(artist.id);
    actAs(artist);
    const issued = await issueCertificate(art);
    if (!issued.ok) throw new Error(issued.error);
    archive.mockClear(); // issuance archives too
    expect((await revokeCertificate(issued.data.id, "Withdrawn")).ok).toBe(true);
    expect(archive).toHaveBeenCalledWith(issued.data.id);
  });

  it("a failing archive never breaks revocation", async () => {
    const artist = await makeUser();
    await makeProfile(artist.id);
    const art = await makeArtwork(artist.id);
    actAs(artist);
    const issued = await issueCertificate(art);
    if (!issued.ok) throw new Error(issued.error);
    archive.mockRejectedValueOnce(new Error("cloudinary down"));
    // archiveCertificatePdf itself never throws in production; even if it did, revoke has already committed.
    expect((await revokeCertificate(issued.data.id, "Withdrawn")).ok).toBe(true);
    expect((await revokeCertificate(issued.data.id, "again")).ok).toBe(false); // already revoked => state persisted
  });
});
