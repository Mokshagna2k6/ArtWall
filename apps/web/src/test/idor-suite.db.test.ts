import { NextRequest } from "next/server";
import { afterAll, describe, expect, it, vi } from "vitest";

import { actAs } from "@/test/db-setup";
import { makeArtwork, makeBooking, makeProfile, makeSlots, makeUser, purgeTestData, q, tid } from "@/test/fixtures";

// BC-3.09/3.10: an 'nfc' tag's UID must be real hex (it derives the tag's
// KMS-diversified keys) — tid()'s own id text isn't hex, so nfc fixtures in
// this file need a distinct hex UID instead.
const hexUid = () => Buffer.from(tid("uid")).toString("hex");

/**
 * SEC-2.01 / SEC-2.02: a cross-cutting BOLA/IDOR regression sweep.
 *
 * Every route and server action that takes a resource id was enumerated by
 * hand (routes under src/app/api, actions under src/features/*\/actions*.ts).
 * Most already check ownership — this suite is the automated proof of that,
 * and it also closes the handful of gaps found during the sweep:
 *
 *   - certificate confirm route had no non-owner regression test (the route
 *     itself was already correct: and eq(userId, user.id))
 *   - createMintCommitment / revokeCertificate had no cross-user test
 *   - art-tags bind/unbind had no test at all
 *   - getInvoice (booking -> invoice chain) had no cross-user test
 *   - attachArtwork (booking -> artwork chain) had no cross-user test
 *
 * Public-by-design routes are deliberately excluded and the reason is noted
 * at each exclusion: /verify/[hash], /api/coa/[id], /api/coa/[id]/proof,
 * /api/physical-wall/search, /api/physical-wall/community-gallery,
 * /api/physical-wall/ugc/upload-signature, art-tags.resolveTagScan,
 * exhibitions.getPublicExhibition, marketplace.* (published listings only).
 */

vi.mock("@/lib/blockchain/pinata", () => ({
  pinata: { upload: { public: { json: vi.fn(async () => ({ cid: "bafytestmetadata" })) } } },
}));

const { POST: createCert } = await import("@/app/api/blockchain/certificates/route");
const { POST: confirmMint } = await import("@/app/api/blockchain/certificates/[id]/confirm/route");
const { createMintCommitment, issueCertificate, revokeCertificate } = await import("@/features/coa/actions");
const { bindTagToArtwork, createTag, unbindTag } = await import("@/features/art-tags/actions");
const { getInvoice } = await import("@/features/physical-wall/actions/invoice");
const { attachArtwork } = await import("@/features/physical-wall/actions/booking");
const { settleFromWebhook } = await import("@/features/physical-wall/settlement");

afterAll(purgeTestData);

const post = (body: unknown = {}) =>
  new NextRequest("http://localhost/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function paidBooking(artistId: string, totalPaise = 11800) {
  const bk = await makeBooking(artistId, await makeSlots(1), { totalPaise, orderId: tid("order") });
  const paymentId = tid("pay");
  await settleFromWebhook({ bookingId: bk, eventId: paymentId, paymentId, orderId: null, amountPaise: totalPaise });
  return bk;
}

describe("IDOR sweep: booking -> invoice chain (SEC-2.02)", () => {
  it("getInvoice: only the invoiced artist or staff may read it; a different artist gets null", async () => {
    const owner = await makeUser();
    const bk = await paidBooking(owner.id);
    const admin = await makeUser("admin");
    actAs(admin);
    const [{ id: invoiceId }] = await q<{ id: string }>(
      `insert into pw_invoices (id, booking_id, number, issue_date, place_of_supply, hsn_sac, gstin_supplier,
         net_paise, cgst_paise, sgst_paise, igst_paise, total_paise, line_items, created_by)
       values ($1, $2, $1, current_date, '08-Rajasthan', '997212', 'X', 10000, 900, 900, 0, 11800, '[]', $3)
       returning id`,
      [tid("inv"), bk, admin.id]
    );

    actAs(owner);
    expect(await getInvoice(invoiceId)).not.toBeNull();

    const stranger = await makeUser();
    actAs(stranger);
    expect(await getInvoice(invoiceId)).toBeNull();

    actAs(null);
    expect(await getInvoice(invoiceId)).toBeNull();

    actAs(admin);
    expect(await getInvoice(invoiceId)).not.toBeNull();
  });
});

describe("IDOR sweep: booking -> artwork chain (SEC-2.02)", () => {
  it("attachArtwork: both the booking and the artwork must belong to the caller", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const art = await makeArtwork(other.id); // not the booking owner's artwork

    actAs(owner);
    const bk = await makeBooking(owner.id, await makeSlots(1), { status: "held" });

    const f1 = new FormData();
    f1.set("bookingId", bk);
    f1.set("artworkId", art);
    expect((await attachArtwork({ status: "idle" } as never, f1)).status).toBe("error");

    // Someone else's booking, caller's own artwork: still refused (the leaf
    // ownership of the artwork is not enough — the booking link matters too).
    const myArt = await makeArtwork(owner.id);
    actAs(other);
    const theirBooking = await makeBooking(other.id, await makeSlots(1), { status: "held" });
    actAs(owner);
    const f2 = new FormData();
    f2.set("bookingId", theirBooking);
    f2.set("artworkId", myArt);
    expect((await attachArtwork({ status: "idle" } as never, f2)).status).toBe("error");

    // Both owned by the caller: succeeds.
    const f3 = new FormData();
    f3.set("bookingId", bk);
    f3.set("artworkId", myArt);
    expect((await attachArtwork({ status: "idle" } as never, f3)).status).toBe("ok");
  });
});

describe("IDOR sweep: artwork -> certificate -> mint voucher chain (SEC-2.02)", () => {
  it("createMintCommitment: certificate must belong to the caller, tracing back to their artwork", async () => {
    const owner = await makeUser();
    await makeProfile(owner.id, { wallet: "0x1111111111111111111111111111111111111111" });
    const art = await makeArtwork(owner.id);
    actAs(owner);
    const issued = await issueCertificate(art);
    if (!issued.ok) throw new Error(issued.error);

    const stranger = await makeUser();
    await makeProfile(stranger.id, { wallet: "0x2222222222222222222222222222222222222222" });
    actAs(stranger);
    // The certificate exists (owner's), but belongs to someone else -> refused,
    // same as "no certificate at all" from the stranger's point of view.
    expect(await createMintCommitment(art)).toEqual({ ok: false, error: "Issue a certificate first" });

    actAs(owner);
    expect((await createMintCommitment(art)).ok).toBe(true);
  });

  it("revokeCertificate: only the issuing artist can revoke their certificate", async () => {
    const owner = await makeUser();
    const art = await makeArtwork(owner.id);
    actAs(owner);
    const issued = await issueCertificate(art);
    if (!issued.ok) throw new Error(issued.error);

    const stranger = await makeUser();
    actAs(stranger);
    expect(await revokeCertificate(issued.data.id, "not mine to revoke")).toEqual({
      ok: false,
      error: "Certificate not found",
    });

    actAs(owner);
    expect((await revokeCertificate(issued.data.id, "artist withdrew it")).ok).toBe(true);
  });

  it("confirm mint route: a different signed-in user gets 404, not the owner's certificate state", async () => {
    const owner = await makeUser();
    actAs(owner);
    const res = await createCert(post({ artworkId: await makeArtwork(owner.id), imageCid: "bafyimage", creatorName: "Asha" }));
    expect(res.status).toBe(200);
    const { id } = await res.json();
    await q(`update coa_certificates set status = 'minting', "txHash" = $2, "mintRequestedAt" = now() where id = $1`, [id, `0x${"ab".repeat(32)}`]);

    actAs(await makeUser());
    expect((await confirmMint(post({}), params(id))).status).toBe(404);

    actAs(null);
    expect((await confirmMint(post({}), params(id))).status).toBe(401);

    actAs(owner);
    expect((await confirmMint(post({}), params(id))).status).toBe(200);
  });
});

describe("IDOR sweep: tag -> binding -> artwork chain (SEC-2.02)", () => {
  it("bindTagToArtwork: both the tag and the artwork must belong to the caller", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    actAs(owner);
    const created = await createTag({ tagType: "nfc", tagUid: hexUid() });
    if (!created.ok) throw new Error(created.error);
    const tagId = created.data;

    // Own tag, someone else's artwork.
    const theirArt = await makeArtwork(other.id);
    expect(await bindTagToArtwork(tagId, theirArt)).toEqual({ ok: false, error: "Artwork not found" });

    // Someone else's tag, own artwork.
    actAs(other);
    const theirTag = await createTag({ tagType: "nfc", tagUid: hexUid() });
    if (!theirTag.ok) throw new Error(theirTag.error);
    const myArt = await makeArtwork(owner.id);
    actAs(owner);
    expect(await bindTagToArtwork(theirTag.data, myArt)).toEqual({ ok: false, error: "Tag not found" });

    // Both owned: succeeds.
    expect((await bindTagToArtwork(tagId, myArt)).ok).toBe(true);
  });

  it("unbindTag: only the tag's own binder may unbind it", async () => {
    const owner = await makeUser();
    actAs(owner);
    const created = await createTag({ tagType: "qr", tagUid: tid("uid"), artworkId: await makeArtwork(owner.id) });
    if (!created.ok) throw new Error(created.error);

    actAs(await makeUser());
    expect(await unbindTag(created.data)).toEqual({ ok: false, error: "Tag not found" });

    actAs(owner);
    expect((await unbindTag(created.data)).ok).toBe(true);
  });
});
