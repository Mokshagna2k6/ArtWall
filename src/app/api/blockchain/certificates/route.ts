import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { siteConfig } from "@/config/site";
import { db } from "@/lib/db/index";
import { expireCatalog } from "@/lib/catalog-cache";
import { coaCertificates, artworks } from "@/lib/db/schema";
import { pinata, type NftMetadata } from "@/lib/blockchain/pinata";
import { getApiUser } from "@/lib/blockchain/auth";
import { apiError, handleRouteError, requestId } from "@/lib/blockchain/http";
import { limitRequest, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

const bodySchema = z.object({
  artworkId: z.string().min(1),
  imageCid: z.string().min(1),
  creatorName: z.string().min(1),
  objectType: z.string().default("painting"),
  medium: z.string().optional(),
  dimensions: z.string().optional(),
  year: z.string().optional(),
  privacy: z.enum(["public", "private"]).default("public"),
});

export async function POST(req: NextRequest) {
  const reqId = requestId();
  try {
    const user = await getApiUser();
    if (!user) return apiError("unauthenticated", { reqId });

    // 60/hour per user: a studio certifying its catalogue in one sitting fits;
    // each call pins metadata to paid IPFS storage, so a runaway script does not.
    const rl = await limitRequest("cert-create", { limit: 60, windowMs: 60 * 60 * 1000 }, user.id);
    if (!rl.ok) return tooManyRequests(rl, { error: { code: "rate_limited", reqId } });

    const input = bodySchema.parse(await req.json());

    // Verify the artwork belongs to this user
    const [artwork] = await db
      .select({ id: artworks.id, title: artworks.title })
      .from(artworks)
      .where(and(eq(artworks.id, input.artworkId), eq(artworks.userId, user.id)));
    if (!artwork) return apiError("not_found", { reqId, details: "artwork not found" });

    const certId = `coa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    // Build ERC-721 metadata. The content hash (BC-2.09) is computed over
    // this object BEFORE content_hash is added to it — it describes the
    // metadata's actual content, not itself — then embedded into the final
    // JSON that gets pinned, so a verifier can fetch the IPFS JSON and
    // check its own embedded hash against this certificate's DB record.
    const unhashed: Omit<NftMetadata, "content_hash"> = {
      name: artwork.title,
      description: `Certificate of Authenticity for "${artwork.title}" by ${input.creatorName}.`,
      image: `ipfs://${input.imageCid}`,
      external_url: `${process.env.NEXT_PUBLIC_APP_URL ?? siteConfig.url}/verify/${certId}`,
      attributes: [
        { trait_type: "Creator", value: input.creatorName },
        { trait_type: "Object type", value: input.objectType },
        ...(input.medium ? [{ trait_type: "Medium", value: input.medium }] : []),
        ...(input.dimensions ? [{ trait_type: "Dimensions", value: input.dimensions }] : []),
        ...(input.year ? [{ trait_type: "Year", value: input.year }] : []),
      ],
    };

    const canonical = JSON.stringify(unhashed);
    const metadataHash = createHash("sha256").update(canonical).digest("hex");
    const metadata: NftMetadata = { ...unhashed, content_hash: metadataHash };
    const pinned = await pinata.upload.public.json(metadata);

    await db.insert(coaCertificates).values({
      id: certId,
      artworkId: input.artworkId,
      userId: user.id,
      metadataHash,
      status: "metadata_pinned",
      imageCid: input.imageCid,
      metadataCid: pinned.cid,
      metadataUri: `ipfs://${pinned.cid}`,
      metadataSha256: metadataHash,
      creatorName: input.creatorName,
      objectType: input.objectType,
      privacy: input.privacy,
    });
    expireCatalog();

    return NextResponse.json({ id: certId, metadataUri: `ipfs://${pinned.cid}` });
  } catch (err) {
    return handleRouteError(err, { route: "POST /api/blockchain/certificates", reqId });
  }
}
