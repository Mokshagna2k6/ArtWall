import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAddress, getAddress } from "viem";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db/index";
import { artistProfiles } from "@/lib/db/schema";
import { getApiUser } from "@/lib/blockchain/auth";
import { apiError, handleRouteError, requestId } from "@/lib/blockchain/http";
import { limitRequest, tooManyRequests } from "@/lib/rate-limit";
import { verifyWalletLinkSignature } from "@/lib/blockchain/wallet-link";

export const runtime = "nodejs";

const bodySchema = z.object({
  walletAddress: z.string(),
  nonce: z.string(),
  expiresAt: z.number(),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

/**
 * BC-2.11 step 2: verify the signed challenge (wallet-link.ts) and only
 * then persist walletAddress against this user — this is the single write
 * path for artist_profiles.wallet_address; there is no other route that
 * sets it, so proof-of-ownership is required every time it changes.
 */
export async function POST(req: NextRequest) {
  const reqId = requestId();
  try {
    const user = await getApiUser();
    if (!user) return apiError("unauthenticated", { reqId });

    const rl = await limitRequest("wallet-link", { limit: 20, windowMs: 60 * 60 * 1000 }, user.id);
    if (!rl.ok) return tooManyRequests(rl, { error: { code: "rate_limited", reqId } });

    const body = bodySchema.parse(await req.json());
    if (!isAddress(body.walletAddress)) {
      return apiError("validation_failed", { reqId, details: "invalid wallet address" });
    }
    const walletAddress = getAddress(body.walletAddress);

    const verdict = await verifyWalletLinkSignature({
      userId: user.id,
      walletAddress,
      nonce: body.nonce,
      expiresAt: body.expiresAt,
      signature: body.signature as `0x${string}`,
    });
    if (!verdict.ok) {
      return apiError("validation_failed", { reqId, details: verdict.reason });
    }

    await db
      .update(artistProfiles)
      .set({ walletAddress, updatedAt: new Date() })
      .where(eq(artistProfiles.userId, user.id));

    return NextResponse.json({ walletAddress });
  } catch (err) {
    return handleRouteError(err, { route: "POST /api/blockchain/wallet/link", reqId });
  }
}
