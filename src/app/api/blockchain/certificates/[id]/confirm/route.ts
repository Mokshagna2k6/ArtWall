import { NextRequest, NextResponse } from "next/server";
import type { Hex } from "viem";
import { eq, and } from "drizzle-orm";

import { db } from "@/lib/db/index";
import { coaCertificates } from "@/lib/db/schema";
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

    const verdict = await verifyMintTx(
      cert.txHash as Hex,
      cert.chainId ?? undefined,
    );

    if (verdict.state === "pending") {
      return NextResponse.json({ status: "minting" });
    }

    if (verdict.state === "failed") {
      await db
        .update(coaCertificates)
        .set({ status: "failed", mintError: verdict.reason })
        .where(eq(coaCertificates.id, id));
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

    return NextResponse.json({ status: "minted", tokenId: verdict.tokenId });
  } catch (err) {
    return handleRouteError(err, { route: "POST /api/blockchain/certificates/[id]/confirm", reqId });
  }
}
