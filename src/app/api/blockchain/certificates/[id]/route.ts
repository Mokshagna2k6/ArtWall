import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";

import { db } from "@/lib/db/index";
import { coaCertificates } from "@/lib/db/schema";
import { getApiUser } from "@/lib/blockchain/auth";
import { apiError, handleRouteError, requestId } from "@/lib/blockchain/http";
import { DEFAULT_CHAIN_ID, NFT_CONTRACT_ADDRESS } from "@/lib/blockchain/chain";

export const runtime = "nodejs";

const patchSchema = z.object({
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, "not a transaction hash"),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const reqId = requestId();
  try {
    const user = await getApiUser();
    if (!user) return apiError("unauthenticated", { reqId });

    const { id } = await params;
    const [cert] = await db
      .select({ status: coaCertificates.status, userId: coaCertificates.userId })
      .from(coaCertificates)
      .where(and(eq(coaCertificates.id, id), eq(coaCertificates.userId, user.id)));

    if (!cert) return apiError("not_found", { reqId });
    if (cert.status !== "metadata_pinned" && cert.status !== "minting") {
      return apiError("conflict", { reqId, details: `cannot start a mint from status ${cert.status}` });
    }

    const { txHash } = patchSchema.parse(await req.json());

    await db
      .update(coaCertificates)
      .set({
        status: "minting",
        txHash: txHash.toLowerCase(),
        chainId: DEFAULT_CHAIN_ID,
        contractAddr: NFT_CONTRACT_ADDRESS,
        mintRequestedAt: new Date(),
        mintError: null,
      })
      .where(eq(coaCertificates.id, id));

    return NextResponse.json({ id, status: "minting" });
  } catch (err) {
    return handleRouteError(err, { route: "PATCH /api/blockchain/certificates/[id]", reqId });
  }
}
