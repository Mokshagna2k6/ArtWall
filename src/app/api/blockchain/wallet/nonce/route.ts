import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAddress, getAddress } from "viem";

import { getApiUser } from "@/lib/blockchain/auth";
import { apiError, handleRouteError, requestId } from "@/lib/blockchain/http";
import { limitRequest, tooManyRequests } from "@/lib/rate-limit";
import { createWalletLinkChallenge } from "@/lib/blockchain/wallet-link";

export const runtime = "nodejs";

const bodySchema = z.object({ walletAddress: z.string() });

/**
 * BC-2.11 step 1: issue a signed, time-bound challenge message for the
 * caller to sign with the wallet they want to link. No DB write — the
 * challenge is self-verifying (see wallet-link.ts).
 */
export async function POST(req: NextRequest) {
  const reqId = requestId();
  try {
    const user = await getApiUser();
    if (!user) return apiError("unauthenticated", { reqId });

    const rl = await limitRequest("wallet-nonce", { limit: 20, windowMs: 60 * 60 * 1000 }, user.id);
    if (!rl.ok) return tooManyRequests(rl, { error: { code: "rate_limited", reqId } });

    const { walletAddress } = bodySchema.parse(await req.json());
    if (!isAddress(walletAddress)) {
      return apiError("validation_failed", { reqId, details: "invalid wallet address" });
    }

    const challenge = createWalletLinkChallenge(user.id, getAddress(walletAddress));
    return NextResponse.json(challenge);
  } catch (err) {
    return handleRouteError(err, { route: "POST /api/blockchain/wallet/nonce", reqId });
  }
}
