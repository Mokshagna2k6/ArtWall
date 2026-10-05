"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useSignMessage } from "wagmi";
import { WalletConnectButton } from "@/components/blockchain/wallet-connect-button";

/**
 * BC-2.11: connect a wallet, then sign a server-issued challenge to prove
 * ownership before it's stored against this account (POST /api/blockchain/
 * wallet/nonce then /wallet/link — see src/lib/blockchain/wallet-link.ts).
 * This is the only UI path that can set artist_profiles.wallet_address.
 */
export function WalletLinkPanel({ linkedWallet }: { linkedWallet?: string | null }) {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function link() {
    if (!address) return;
    setLinking(true);
    setError(null);
    try {
      const nonceRes = await fetch("/api/blockchain/wallet/nonce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      });
      if (!nonceRes.ok) throw new Error("Could not start wallet verification.");
      const challenge = (await nonceRes.json()) as {
        nonce: string;
        message: string;
        expiresAt: number;
      };

      const signature = await signMessageAsync({ message: challenge.message });

      const linkRes = await fetch("/api/blockchain/wallet/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          walletAddress: address,
          nonce: challenge.nonce,
          expiresAt: challenge.expiresAt,
          signature,
        }),
      });
      if (!linkRes.ok) {
        const json = (await linkRes.json().catch(() => null)) as { error?: { details?: string } } | null;
        throw new Error(json?.error?.details ?? "Could not verify wallet ownership.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wallet linking failed.");
    } finally {
      setLinking(false);
    }
  }

  const alreadyLinkedToThisAddress =
    linkedWallet && address && linkedWallet.toLowerCase() === address.toLowerCase();

  return (
    <div className="flex flex-col gap-3">
      <WalletConnectButton />
      {isConnected && !alreadyLinkedToThisAddress && (
        <button
          onClick={link}
          disabled={linking}
          className="h-10 max-w-xs border border-zinc-300 px-4 text-sm font-medium disabled:opacity-60 dark:border-zinc-700"
        >
          {linking ? "Verifying ownership…" : "Prove ownership & link this wallet"}
        </button>
      )}
      {alreadyLinkedToThisAddress && (
        <p className="text-xs text-green-600">This wallet is linked and verified.</p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
