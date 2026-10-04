import { NextRequest, NextResponse } from "next/server";
import type { Address, Hex } from "viem";
import { getAddress } from "viem";
import { eq, and } from "drizzle-orm";

import { db } from "@/lib/db/index";
import { expireCatalog } from "@/lib/catalog-cache";
import { coaCertificates, artistProfiles } from "@/lib/db/schema";
import { getApiUser } from "@/lib/blockchain/auth";
import { apiError, handleRouteError, requestId } from "@/lib/blockchain/http";
import { verifyMintTx } from "@/lib/blockchain/chain";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const reqId = requestId();
  try {
    const user = await getApiUser();
    if (!user) return apiError("unauthenticated", { reqId });

    const { id } = await params;
    const [cert] = await db
      .select()
      .from(coaCertificates)
      .where(and(eq(coaCertificates.id, id), eq(coaCertificates.userId, user.id)));

    if (!cert) return apiError("not_found", { reqId });

    if (cert.status === "minted" || cert.status === "failed") {
      return NextResponse.json({ status: cert.status, tokenId: cert.tokenId });
    }
    if (cert.status !== "minting" || !cert.txHash) {
      return apiError("conflict", { reqId, details: "no mint in progress" });
    }

    // BC-1.18: the expected recipient is this certificate owner's own
    // registered wallet (the only address the mint-voucher route ever signs
    // a voucher for) and the expected tokenURI is this certificate's pinned
    // metadata — both read from verified DB state, never the request.
    let expected: { to: Address; uri: string } | undefined;
    if (cert.metadataUri) {
      const [profile] = await db
        .select({ walletAddress: artistProfiles.walletAddress })
        .from(artistProfiles)
        .where(eq(artistProfiles.userId, user.id));
      if (profile?.walletAddress) {
        expected = { to: getAddress(profile.walletAddress), uri: cert.metadataUri };
      }
    }

    const verdict = await verifyMintTx(
      cert.txHash as Hex,
      cert.chainId ?? undefined,
      expected,
    );

    if (verdict.state === "pending") {
      return NextResponse.json({ status: "minting" });
    }

    if (verdict.state === "failed") {
      await db
        .update(coaCertificates)
        .set({ status: "failed", mintError: verdict.reason })
        .where(eq(coaCertificates.id, id));
      expireCatalog();
      return NextResponse.json({ status: "failed", error: verdict.reason });
    }

    await db
      .update(coaCertificates)
      .set({
        status: "minted",
        tokenId: verdict.tokenId,
        contractAddr: verdict.contractAddr,
        chainId: verdict.chainId,
        mintedAt: new Date(),
        mintError: null,
      })
      .where(eq(coaCertificates.id, id));
    expireCatalog();

    return NextResponse.json({ status: "minted", tokenId: verdict.tokenId });
  } catch (err) {
    return handleRouteError(err, { route: "POST /api/blockchain/certificates/[id]/confirm", reqId });
  }
}
