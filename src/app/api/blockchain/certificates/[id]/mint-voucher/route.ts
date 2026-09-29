import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAddress, getAddress } from "viem";
import { eq, and } from "drizzle-orm";

import { db } from "@/lib/db/index";
import { coaCertificates } from "@/lib/db/schema";
import { getApiUser } from "@/lib/blockchain/auth";
import { apiError, handleRouteError, requestId } from "@/lib/blockchain/http";
import { limitRequest, tooManyRequests } from "@/lib/rate-limit";
import { newVoucherNonce, signMintVoucher } from "@/lib/blockchain/mint-voucher";

export const runtime = "nodejs";

const bodySchema = z.object({
  to: z.string().refine(isAddress, "invalid address"),
  royaltyReceiver: z.string().refine(isAddress, "invalid address"),
  royaltyFeeBps: z.number().int().min(0).max(10_000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const reqId = requestId();
  try {
    const user = await getApiUser();
    if (!user) return apiError("unauthenticated", { reqId });

    // 10/hour per user: a voucher is a server signature authorising an on-chain
    // mint. One per certificate is normal and a few retries after wallet errors
    // is generous; beyond that someone is farming signatures.
    const rl = await limitRequest("mint-voucher", { limit: 10, windowMs: 60 * 60 * 1000 }, user.id);
    if (!rl.ok) return tooManyRequests(rl, { error: { code: "rate_limited", reqId } });

    const { id } = await params;
    const [cert] = await db
      .select()
      .from(coaCertificates)
      .where(and(eq(coaCertificates.id, id), eq(coaCertificates.userId, user.id)));

    if (!cert) return apiError("not_found", { reqId });
    if (!cert.metadataUri) {
      return apiError("conflict", { reqId, details: "metadata not pinned yet" });
    }
    if (cert.status === "minted") {
      return apiError("conflict", { reqId, details: "already minted" });
    }

    const { to, royaltyReceiver, royaltyFeeBps } = bodySchema.parse(await req.json());

    const nonce = newVoucherNonce();
    const deadline = Math.floor(Date.now() / 1000) + 30 * 60;

    const { voucher, signature } = await signMintVoucher({
      to: getAddress(to),
      uri: cert.metadataUri,
      royaltyReceiver: getAddress(royaltyReceiver),
      royaltyFeeBps,
      nonce,
      deadline,
    });

    await db
      .update(coaCertificates)
      .set({ mintNonce: nonce, status: "metadata_pinned", mintError: null })
      .where(eq(coaCertificates.id, id));

    return NextResponse.json({
      voucher: {
        ...voucher,
        royaltyFeeBps: voucher.royaltyFeeBps,
        deadline: voucher.deadline,
      },
      signature,
    });
  } catch (err) {
    return handleRouteError(err, { route: "POST /api/blockchain/certificates/[id]/mint-voucher", reqId });
  }
}
