import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/index";
import { artistProfiles } from "@/lib/db/schema";

/**
 * Create an MPC wallet for an artist via Privy.
 * No-ops if PRIVY_APP_ID / PRIVY_APP_SECRET not set.
 *
 * ponytail: stub — replace fetch body with actual Privy server SDK call
 * when @privy-io/server-auth is installed and keys are in .env.
 */
export async function ensureWallet(userId: string): Promise<string | null> {
  const appId = process.env.PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!appId || !appSecret) return null;

  const [profile] = await db
    .select({ walletAddress: artistProfiles.walletAddress })
    .from(artistProfiles)
    .where(eq(artistProfiles.userId, userId));

  if (profile?.walletAddress) return profile.walletAddress;

  // ponytail: actual Privy call when SDK installed:
  //   import { PrivyClient } from "@privy-io/server-auth";
  //   const privy = new PrivyClient(appId, appSecret);
  //   const wallet = await privy.walletApi.create({ chainType: "ethereum" });
  //   const address = wallet.address;

  const res = await fetch("https://auth.privy.io/api/v1/wallets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "privy-app-id": appId,
      Authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`,
    },
    body: JSON.stringify({ chain_type: "ethereum" }),
  });

  if (!res.ok) {
    console.error("[privy] Wallet creation failed:", res.status, await res.text());
    return null;
  }

  const data = (await res.json()) as { address?: string };
  const address = data.address;
  if (!address) return null;

  await db
    .update(artistProfiles)
    .set({ walletAddress: address })
    .where(eq(artistProfiles.userId, userId));

  return address;
}
