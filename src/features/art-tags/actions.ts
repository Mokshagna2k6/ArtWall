"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq, and, desc, sql } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db/index";
import { artTags, artTagScans, artworks, artistProfiles, provenanceEvents } from "@/lib/db/schema";
import {
  attempt,
  parseInput,
  PreconditionError,
  readSafely,
  type Result,
} from "@/features/physical-wall/actions/shared";
import { getKmsClient } from "@/lib/blockchain/kms";
import { verifySunMessage } from "@/lib/blockchain/ntag424";
import { signQrToken, verifyQrToken } from "@/lib/blockchain/qr-signing";

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new PreconditionError("Sign in first.");
  return session.user.id;
}

const id = z.string().trim().min(1).max(64);
const createTagSchema = z
  .object({
    tagType: z.enum(["qr", "nfc"]),
    tagUid: z.string({ error: "Enter the tag's UID." }).trim().min(4, "Enter the tag's UID.").max(128),
    artworkId: id.optional(),
  })
  .refine(
    // BC-3.09/3.10: an 'nfc' tag's UID is the chip's real hex UID (used to
    // derive its KMS-diversified keys) — must be valid hex, unlike a 'qr'
    // tag's free-text label.
    (v) => v.tagType !== "nfc" || /^[0-9a-fA-F]+$/.test(v.tagUid),
    { error: "An NFC tag's UID must be hex (e.g. its 7-byte chip UID)." },
  );
const scanSchema = z.object({
  tagUid: z.string().trim().min(1).max(128),
  ip: z.string().max(64).optional(),
  ua: z.string().max(512).optional(),
  // BC-3.09: present only for an 'nfc' tag's SUN message — the NTAG424's
  // SDM-appended picc_data/cmac query params, hex-encoded.
  piccData: z.string().trim().regex(/^[0-9a-fA-F]*$/).optional(),
  cmac: z.string().trim().regex(/^[0-9a-fA-F]*$/).optional(),
});

function newId(prefix: string): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Buffer.from(bytes).toString("base64url")}`;
}

export async function getArtTags() {
  return readSafely("getArtTags", [], async () => {
    const userId = await getUserId();
    return db
    .select({
      id: artTags.id,
      tagType: artTags.tagType,
      tagUid: artTags.tagUid,
      artworkId: artTags.artworkId,
      scanCount: artTags.scanCount,
      boundAt: artTags.boundAt,
      artworkTitle: artworks.title,
      artworkIsPublic: artworks.isPublic,
    })
    .from(artTags)
    .leftJoin(artworks, eq(artTags.artworkId, artworks.id))
    .where(eq(artTags.boundBy, userId))
    .orderBy(desc(artTags.createdAt));
  });
}

/**
 * BC-3.13: provisioning workflow. Creating a tag row now mints a KMS key
 * reference for 'nfc' tags (never raw key bytes — see kms.ts) and a signed
 * Ed25519 QR token for 'qr' tags (qr-signing.ts) up front, so `tagUid` is no
 * longer a bare user-chosen string by the time a tag can ever be scanned —
 * it is either an NTAG424 UID whose SUN messages this server can verify
 * cryptographically (BC-3.09), or a server-signed QR token (BC-3.11).
 * `bindingStatus` starts at 'provisioned' (not 'bound') until an artwork is
 * actually attached via bindTagToArtwork.
 */
export async function createTag(raw: z.input<typeof createTagSchema>): Promise<Result<string>> {
  return attempt("createTag", async () => {
    const input = parseInput(createTagSchema, raw);
    const userId = await getUserId();
    if (input.artworkId) {
      const [artwork] = await db
        .select({ id: artworks.id })
        .from(artworks)
        .where(and(eq(artworks.id, input.artworkId), eq(artworks.userId, userId)));
      if (!artwork) throw new PreconditionError("Artwork not found");
    }
    const [taken] = await db.select({ id: artTags.id }).from(artTags).where(eq(artTags.tagUid, input.tagUid));
    if (taken) throw new PreconditionError("That tag UID is already registered.");

    const tagId = newId("tag");

    let keyReference: string | null = null;
    let tagUid = input.tagUid;
    if (input.tagType === "nfc") {
      // BC-3.10: provision a KMS key reference for this tag's diversified
      // AES-128 keys. The physical NTAG424 chip's keys are written through
      // the HSM/KMS at the point of physically provisioning the chip (an
      // ops/hardware step outside this server); this call records which KMS
      // reference governs that tag's crypto from here on.
      keyReference = await getKmsClient().provisionKeyReference(Buffer.from(input.tagUid, "hex"));
    } else {
      // BC-3.11: a QR tag's "uid" becomes a server-signed token, not the
      // raw string the operator typed in — a plain unsigned string can no
      // longer be presented as a valid tag identity.
      tagUid = signQrToken(tagId, input.artworkId ?? "");
    }

    await db.insert(artTags).values({
      id: tagId,
      tagType: input.tagType,
      tagUid,
      artworkId: input.artworkId ?? null,
      boundBy: userId,
      keyReference,
      bindingStatus: input.artworkId ? "bound" : "provisioned",
      // Same invariant as unbindTag: no artwork, no bound_at.
      boundAt: input.artworkId ? new Date() : null,
    });

    revalidatePath("/studio/tags");
    return tagId;
  });
}

export async function bindTagToArtwork(tagId: string, artworkId: string): Promise<Result> {
  return attempt("bindTagToArtwork", async () => {
    const input = parseInput(z.object({ tagId: id, artworkId: id }), { tagId, artworkId });
    const userId = await getUserId();
    const [tag] = await db
      .select()
      .from(artTags)
      .where(and(eq(artTags.id, input.tagId), eq(artTags.boundBy, userId)));
    if (!tag) throw new PreconditionError("Tag not found");
    if (tag.bindingStatus === "revoked") {
      throw new PreconditionError("This tag has been revoked and cannot be bound.");
    }

    // Only to your own work: a scan shows whatever the tag is bound to.
    const [artwork] = await db
      .select({ id: artworks.id })
      .from(artworks)
      .where(and(eq(artworks.id, input.artworkId), eq(artworks.userId, userId)));
    if (!artwork) throw new PreconditionError("Artwork not found");

    await db
      .update(artTags)
      .set({ artworkId: input.artworkId, boundAt: new Date(), bindingStatus: "bound" })
      .where(eq(artTags.id, input.tagId));

    // BC-3.13: the binding event lands in append-only provenance — the same
    // table BC-3.08's on-chain anchoring and coa/actions.ts's mint-commitment
    // events use, so an artwork's physical-binding history and its
    // blockchain history live in one auditable timeline.
    await db.insert(provenanceEvents).values({
      id: newId("prov"),
      artworkId: input.artworkId,
      eventType: "bound",
      actorId: userId,
      label: `Tag ${input.tagId} (${tag.tagType}) bound to artwork`,
      metadata: { tagId: input.tagId, tagType: tag.tagType },
    });

    revalidatePath("/studio/tags");
    return null;
  });
}

export async function unbindTag(tagId: string): Promise<Result> {
  return attempt("unbindTag", async () => {
    const tag = parseInput(id, tagId);
    const userId = await getUserId();
    const [row] = await db
      .update(artTags)
      .set({ artworkId: null, boundAt: null })
      .where(and(eq(artTags.id, tag), eq(artTags.boundBy, userId)))
      .returning({ id: artTags.id });
    if (!row) throw new PreconditionError("Tag not found");

    revalidatePath("/studio/tags");
    return null;
  });
}

/**
 * Public: resolve a tag scan, verifying the cryptographic proof of identity
 * before ever showing binding info (BC-3.09, BC-3.11, BC-3.12).
 *
 *   - 'nfc' tags: `piccData`/`cmac` must be present (the NTAG424's SDM
 *     message) and verify against that tag's KMS-diversified keys, with a
 *     strictly-increasing counter (no replay). `tagUid` is used only to
 *     look up which row's keys to check against — the identity claim itself
 *     is the verified UID recovered from picc_data, not the URL path.
 *   - 'qr' tags: `tagUid` (really a signed Ed25519 token minted by
 *     createTag, see qr-signing.ts) must verify; a plain unsigned string no
 *     longer resolves to anything (BC-3.11).
 */
export async function resolveTagScan(
  tagUid: string,
  ip?: string,
  ua?: string,
  sun?: { piccData?: string; cmac?: string },
) {
  return readSafely("resolveTagScan", null, () =>
    recordScan(parseInput(scanSchema, { tagUid, ip, ua, piccData: sun?.piccData, cmac: sun?.cmac })),
  );
}

async function recordScan({ tagUid, ip, ua, piccData, cmac }: z.infer<typeof scanSchema>) {
  const [tag] = await db
    .select({
      id: artTags.id,
      artworkId: artTags.artworkId,
      tagType: artTags.tagType,
      keyReference: artTags.keyReference,
      sunCounterLastSeen: artTags.sunCounterLastSeen,
      bindingStatus: artTags.bindingStatus,
    })
    .from(artTags)
    .where(eq(artTags.tagUid, tagUid));
  if (!tag) return null;
  if (tag.bindingStatus === "revoked") return null;

  let verifiedCounter: number | null = null;

  if (tag.tagType === "nfc") {
    // BC-3.09: an NFC tag requires a real SUN message — no picc_data/cmac
    // means this is not a genuine scan of the chip (e.g. someone copied the
    // bare URL), so it must not resolve.
    if (!piccData || !cmac || !tag.keyReference) return null;
    const metaReadKey = await getKmsClient().deriveTagKey(tag.keyReference, Buffer.from(tagUid, "hex"), "meta");
    const macReadKey = await getKmsClient().deriveTagKey(tag.keyReference, Buffer.from(tagUid, "hex"), "mac");
    const verdict = verifySunMessage({
      metaReadKey,
      macReadKey,
      piccDataHex: piccData,
      cmacHex: cmac,
      lastSeenCounter: tag.sunCounterLastSeen,
    });
    if (!verdict.ok) return null; // bad CMAC, replay, or malformed — never resolve
    verifiedCounter = verdict.readCounter;
  } else {
    // BC-3.11: tagUid for a 'qr' tag is the server-signed token itself.
    const verdict = verifyQrToken(tagUid);
    if (!verdict.ok) return null;
  }

  await db.insert(artTagScans).values({
    id: newId("tscan"),
    tagId: tag.id,
    ipAddress: ip ?? null,
    userAgent: ua ?? null,
  });

  await db
    .update(artTags)
    .set({
      scanCount: sql`scan_count + 1`,
      ...(verifiedCounter !== null ? { sunCounterLastSeen: verifiedCounter } : {}),
    })
    .where(eq(artTags.id, tag.id));

  if (!tag.artworkId) return { tagId: tag.id, artworkId: null };

  const [artwork] = await db
    .select({
      id: artworks.id,
      title: artworks.title,
      imageUrl: artworks.imageUrl,
      medium: artworks.medium,
      year: artworks.year,
      artistName: artistProfiles.displayName,
      artistHandle: artistProfiles.handle,
    })
    .from(artworks)
    .innerJoin(artistProfiles, eq(artworks.userId, artistProfiles.userId))
    // A scan must not reveal a private work or an unpublished artist.
    .where(
      and(
        eq(artworks.id, tag.artworkId),
        eq(artworks.isPublic, true),
        eq(artistProfiles.published, true)
      )
    );

  return { tagId: tag.id, artwork: artwork ?? null, private: !artwork };
}
