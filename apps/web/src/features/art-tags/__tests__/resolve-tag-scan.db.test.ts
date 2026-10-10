import { afterAll, describe, expect, it } from "vitest";
import { createCipheriv } from "node:crypto";

import { makeUser, makeProfile, makeArtwork, purgeTestData, q, tid } from "@/test/fixtures";
import { resolveTagScan } from "@/features/art-tags/actions";
import { getKmsClient } from "@/lib/blockchain/kms";
import { aesCmac } from "@/lib/blockchain/ntag424";
import { signQrToken } from "@/lib/blockchain/qr-signing";

afterAll(purgeTestData);

/**
 * FE-3.20: the scan page's three security-distinct outcomes — unregistered
 * tag, registered tag with a crypto proof that fails, and a genuinely
 * verified scan — all come from resolveTagScan, so this is the one place
 * that needs a real end-to-end check against real NTAG424 SUN math
 * (ntag424.ts) and a real Ed25519-signed QR token (qr-signing.ts), not a
 * stubbed verdict.
 */

function bytesToHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

function deriveSdmSessionKey(masterKey: Buffer, uid: Uint8Array, counter: Uint8Array): Buffer {
  const input = new Uint8Array(2 + 2 + uid.length + counter.length);
  input.set([0x3c, 0xc3], 0);
  input.set([0x00, 0x01], 2);
  input.set(uid, 4);
  input.set(counter, 4 + uid.length);
  return Buffer.from(aesCmac(masterKey, input));
}

function encryptPiccData(metaReadKey: Buffer, uid: Uint8Array, counter: number): string {
  const plain = Buffer.alloc(16);
  plain[0] = 0xc7;
  plain.set(uid, 1);
  plain[8] = counter & 0xff;
  plain[9] = (counter >> 8) & 0xff;
  plain[10] = (counter >> 16) & 0xff;
  const cipher = createCipheriv("aes-128-cbc", metaReadKey, Buffer.alloc(16));
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(plain), cipher.final()]).toString("hex");
}

/** Build a real SUN (picc_data, cmac) pair for `uid` at `counter`, the way
 *  an actual NTAG424 chip configured for SDM would produce it. */
async function buildRealSun(keyReference: string, uid: Buffer, counter: number) {
  const kms = getKmsClient();
  const metaReadKey = await kms.deriveTagKey(keyReference, uid, "meta");
  const macReadKey = await kms.deriveTagKey(keyReference, uid, "mac");
  const counterBytes = new Uint8Array([counter & 0xff, (counter >> 8) & 0xff, (counter >> 16) & 0xff]);
  const sessionKey = deriveSdmSessionKey(macReadKey, uid, counterBytes);
  const input = new Uint8Array(uid.length + counterBytes.length);
  input.set(uid, 0);
  input.set(counterBytes, uid.length);
  const fullMac = aesCmac(sessionKey, input);
  const truncated = new Uint8Array(8);
  for (let i = 0; i < 8; i++) truncated[i] = fullMac[2 * i + 1];
  return { piccData: encryptPiccData(metaReadKey, uid, counter), cmac: bytesToHex(truncated) };
}

describe("resolveTagScan", () => {
  it("returns not_found for an unregistered uid", async () => {
    expect(await resolveTagScan("no-such-tag-uid")).toEqual({ status: "not_found" });
  });

  it("verifies a real NTAG424 SUN message end-to-end and resolves the bound artwork", async () => {
    const artist = await makeUser();
    await makeProfile(artist.id, { published: true });
    const artworkId = await makeArtwork(artist.id, { isPublic: true });

    const tagId = tid("tag");
    const uidHex = "04a1b2c3d4e5f6";
    const uid = Buffer.from(uidHex, "hex");
    const keyReference = await getKmsClient().provisionKeyReference(uid);
    await q(
      `insert into art_tags (id, tag_type, tag_uid, artwork_id, key_reference, binding_status, bound_at)
       values ($1, 'nfc', $2, $3, $4, 'bound', now())`,
      [tagId, uidHex, artworkId, keyReference],
    );

    const sun = await buildRealSun(keyReference, uid, 1);
    const result = await resolveTagScan(uidHex, { piccData: sun.piccData, cmac: sun.cmac });
    expect(result.status).toBe("verified");
    if (result.status === "verified") {
      expect(result.artwork?.id).toBe(artworkId);
    }
  });

  it("rejects a tampered CMAC as unverified, not as a successful scan", async () => {
    const artist = await makeUser();
    await makeProfile(artist.id, { published: true });
    const artworkId = await makeArtwork(artist.id, { isPublic: true });

    const tagId = tid("tag");
    const uidHex = "04b2c3d4e5f6a1";
    const uid = Buffer.from(uidHex, "hex");
    const keyReference = await getKmsClient().provisionKeyReference(uid);
    await q(
      `insert into art_tags (id, tag_type, tag_uid, artwork_id, key_reference, binding_status, bound_at)
       values ($1, 'nfc', $2, $3, $4, 'bound', now())`,
      [tagId, uidHex, artworkId, keyReference],
    );

    const sun = await buildRealSun(keyReference, uid, 1);
    const tamperedCmac = "00".repeat(8);
    const result = await resolveTagScan(uidHex, { piccData: sun.piccData, cmac: tamperedCmac });
    expect(result).toEqual({ status: "unverified", reason: "bad_signature" });
  });

  it("rejects a replayed SUN counter as unverified", async () => {
    const artist = await makeUser();
    await makeProfile(artist.id, { published: true });
    const artworkId = await makeArtwork(artist.id, { isPublic: true });

    const tagId = tid("tag");
    const uidHex = "04c3d4e5f6a1b2";
    const uid = Buffer.from(uidHex, "hex");
    const keyReference = await getKmsClient().provisionKeyReference(uid);
    await q(
      `insert into art_tags (id, tag_type, tag_uid, artwork_id, key_reference, binding_status, bound_at)
       values ($1, 'nfc', $2, $3, $4, 'bound', now())`,
      [tagId, uidHex, artworkId, keyReference],
    );

    const sun = await buildRealSun(keyReference, uid, 1);
    const first = await resolveTagScan(uidHex, { piccData: sun.piccData, cmac: sun.cmac });
    expect(first.status).toBe("verified");

    const replay = await resolveTagScan(uidHex, { piccData: sun.piccData, cmac: sun.cmac });
    expect(replay).toEqual({ status: "unverified", reason: "replay" });
  });

  it("verifies a real Ed25519-signed QR token end-to-end and resolves the bound artwork", async () => {
    const artist = await makeUser();
    await makeProfile(artist.id, { published: true });
    const artworkId = await makeArtwork(artist.id, { isPublic: true });

    const tagId = tid("tag");
    const token = signQrToken(tagId, artworkId);
    await q(
      `insert into art_tags (id, tag_type, tag_uid, artwork_id, binding_status, bound_at)
       values ($1, 'qr', $2, $3, 'bound', now())`,
      [tagId, token, artworkId],
    );

    const result = await resolveTagScan(token);
    expect(result.status).toBe("verified");
    if (result.status === "verified") {
      expect(result.artwork?.id).toBe(artworkId);
    }
  });

  it("does not resolve a tampered QR token as a successful scan", async () => {
    const artist = await makeUser();
    await makeProfile(artist.id, { published: true });
    const artworkId = await makeArtwork(artist.id, { isPublic: true });

    const tagId = tid("tag");
    const token = signQrToken(tagId, artworkId);
    await q(
      `insert into art_tags (id, tag_type, tag_uid, artwork_id, binding_status, bound_at)
       values ($1, 'qr', $2, $3, 'bound', now())`,
      [tagId, token, artworkId],
    );

    const tampered = token.slice(0, -4) + "AAAA";
    const result = await resolveTagScan(tampered);
    // A tampered QR token no longer matches any stored tagUid (the signed
    // token IS the lookup key for 'qr' tags), so it is indistinguishable
    // from an unregistered tag at the DB layer — never treated as verified.
    expect(result.status).not.toBe("verified");
  });

  it("gives the same generic result for an unbound tag and a verified scan of a privately-bound one (FE-2.11)", async () => {
    const privateArtist = await makeUser();
    await makeProfile(privateArtist.id, { published: true });
    const privateArtwork = await makeArtwork(privateArtist.id, { isPublic: false });

    const boundTagId = tid("tag");
    const boundToken = signQrToken(boundTagId, privateArtwork);
    await q(
      `insert into art_tags (id, tag_type, tag_uid, artwork_id, binding_status, bound_at)
       values ($1, 'qr', $2, $3, 'bound', now())`,
      [boundTagId, boundToken, privateArtwork],
    );
    const boundResult = await resolveTagScan(boundToken);

    const unboundTagId = tid("tag");
    const unboundToken = signQrToken(unboundTagId, "");
    await q(`insert into art_tags (id, tag_type, tag_uid, binding_status) values ($1, 'qr', $2, 'provisioned')`, [
      unboundTagId,
      unboundToken,
    ]);
    const unboundResult = await resolveTagScan(unboundToken);

    expect(boundResult).toEqual({ status: "verified", tagId: boundTagId, artwork: null });
    expect(unboundResult).toEqual({ status: "verified", tagId: unboundTagId, artwork: null });
  });
});
