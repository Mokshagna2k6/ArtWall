"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useAccount,
  useSwitchChain,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { WalletConnectButton } from "@/components/blockchain/wallet-connect-button";
import { artwallCoaAbi } from "@/lib/blockchain/abi";
import { config, DEFAULT_CHAIN_ID, NFT_CONTRACT_ADDRESS } from "@/lib/blockchain/wagmi";

type Phase = "idle" | "authorizing" | "signing" | "confirming" | "minted" | "failed";

interface VoucherResponse {
  voucher: {
    to: `0x${string}`;
    uri: string;
    royaltyReceiver: `0x${string}`;
    royaltyFeeBps: number;
    nonce: `0x${string}`;
    deadline: number;
  };
  signature: `0x${string}`;
}

const CHAIN_NAME =
  config.chains.find((c) => c.id === DEFAULT_CHAIN_ID)?.name ?? `chain ${DEFAULT_CHAIN_ID}`;
const CONFIRM_MS = 4_000;
const CONFIRM_TRIES = 75; // five minutes

/** Wallet errors are long and technical; say what happened in one line. */
function walletMessage(e: unknown): string {
  const err = (e ?? {}) as { name?: string; shortMessage?: string; message?: string };
  const text = `${err.name ?? ""} ${err.shortMessage ?? err.message ?? ""}`;
  if (/UserRejected|denied|rejected/i.test(text)) {
    return "You cancelled in your wallet. Nothing was sent; you can try again.";
  }
  if (/insufficient funds/i.test(text)) {
    return `Not enough ${CHAIN_NAME} funds in this wallet to pay the network fee.`;
  }
  return (err.shortMessage ?? err.message ?? "The mint did not go through.").split("\n")[0];
}

type ConfirmJson = { status?: string; error?: string };

/**
 * Wallet + mint states (FE-2.07/2.08): a wallet on the wrong network is
 * offered a switch instead of minting on a chain the server won't verify; a
 * rejected signature, a failed receipt, or a confirm poll that never resolves
 * each end in a readable state; and a certificate already "minting" (page
 * reloaded mid-mint) resumes confirming instead of offering Mint again, which
 * would issue a fresh voucher and risk a second on-chain mint.
 */
export function CertificateMintPanel({
  certificateId,
  initialStatus,
}: {
  certificateId: string;
  initialStatus?: string;
}) {
  const router = useRouter();
  const { address, isConnected, chainId } = useAccount();
  const { switchChain, isPending: switching } = useSwitchChain();
  const [bps, setBps] = useState(500);
  const [phase, setPhase] = useState<Phase>(
    initialStatus === "minting" ? "confirming" : "idle"
  );
  const [error, setError] = useState<string | null>(null);

  const { data: txHash, writeContractAsync } = useWriteContract({});
  const {
    isSuccess: broadcast,
    isError: receiptFailed,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash: txHash, chainId: DEFAULT_CHAIN_ID });
  const poll = useRef<ReturnType<typeof setInterval>>(undefined);
  const tries = useRef(0);

  useEffect(() => () => clearInterval(poll.current), []);

  const confirm = useCallback(async () => {
    const json: ConfirmJson = await fetch(
      `/api/blockchain/certificates/${certificateId}/confirm`,
      { method: "POST" }
    )
      .then((r) => r.json() as Promise<ConfirmJson>)
      .catch(() => ({})); // transient: the next tick retries
    if (json.status === "minted") {
      clearInterval(poll.current);
      setPhase("minted");
      router.refresh();
    } else if (json.status === "failed") {
      clearInterval(poll.current);
      setPhase("failed");
      setError(json.error ?? "The mint did not succeed on-chain.");
      router.refresh();
    } else if (++tries.current >= CONFIRM_TRIES) {
      clearInterval(poll.current);
      setError(
        "Still waiting for the network. Your transaction is recorded; reload this page later to see the result. Don't mint again."
      );
    }
  }, [certificateId, router]);

  /** Poll the server until the mint settles. Callers set phase "confirming". */
  const startConfirming = useCallback(() => {
    tries.current = 0;
    clearInterval(poll.current);
    setTimeout(confirm, 0); // first check now, as a callback rather than in the effect body
    poll.current = setInterval(confirm, CONFIRM_MS);
  }, [confirm]);

  // Reloaded mid-mint: pick the confirm loop back up.
  useEffect(() => {
    if (initialStatus === "minting") startConfirming();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!txHash || phase !== "signing" || !broadcast) return;
    (async () => {
      const res = await fetch(`/api/blockchain/certificates/${certificateId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ txHash }),
      }).catch(() => null);
      if (!res?.ok) {
        setPhase("failed");
        setError(
          `Your transaction was sent (${txHash.slice(0, 10)}…) but we couldn't record it. Don't mint again; contact us with that hash.`
        );
        return;
      }
      setPhase("confirming");
      startConfirming();
    })();
  }, [broadcast, txHash, phase, certificateId, startConfirming]);

  async function mint() {
    if (!address || chainId !== DEFAULT_CHAIN_ID) return;
    if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
      setError("Royalty must be a whole number from 0 to 10000 basis points.");
      return;
    }
    setError(null);
    setPhase("authorizing");
    try {
      const res = await fetch(
        `/api/blockchain/certificates/${certificateId}/mint-voucher`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            to: address,
            royaltyReceiver: address,
            royaltyFeeBps: bps,
          }),
        },
      );
      if (!res.ok) throw new Error("Could not get a mint authorization.");
      const { voucher, signature } = (await res.json()) as VoucherResponse;

      setPhase("signing");
      await writeContractAsync({
        chainId: DEFAULT_CHAIN_ID,
        abi: artwallCoaAbi,
        address: NFT_CONTRACT_ADDRESS!,
        functionName: "mintWithVoucher",
        args: [
          {
            to: voucher.to,
            uri: voucher.uri,
            royaltyReceiver: voucher.royaltyReceiver,
            royaltyFeeBps: BigInt(voucher.royaltyFeeBps),
            nonce: voucher.nonce,
            deadline: BigInt(voucher.deadline),
          },
          signature,
        ],
      });
    } catch (e) {
      setPhase("failed");
      setError(walletMessage(e));
    }
  }

  // A dropped/failed receipt ends the signing phase; derived, not stored.
  const receiptLost = phase === "signing" && receiptFailed;
  const shownError = error ?? (receiptLost ? walletMessage(receiptError) : null);
  const busy = phase !== "idle" && phase !== "failed" && phase !== "minted" && !receiptLost;
  const wrongChain = isConnected && chainId !== DEFAULT_CHAIN_ID;

  return (
    <div className="flex flex-col gap-4">
      <WalletConnectButton />

      <label className="flex max-w-xs flex-col gap-1.5 text-sm">
        Secondary-sale royalty (basis points)
        <input
          type="number"
          min={0}
          max={10000}
          step={1}
          value={bps}
          onChange={(e) => setBps(Number(e.target.value))}
          disabled={busy}
          aria-describedby="mint-royalty-hint"
          className="border-input focus:border-foreground h-10 border bg-white px-3 text-base outline-none"
        />
        <span id="mint-royalty-hint" className="text-muted-foreground text-xs">
          {(bps / 100).toFixed(2)}% to {address ?? "your connected wallet"}
        </span>
      </label>

      {wrongChain && !busy && (
        <button
          type="button"
          onClick={() => switchChain({ chainId: DEFAULT_CHAIN_ID })}
          disabled={switching}
          className="border-foreground inline-flex h-11 max-w-xs items-center justify-center border px-5 text-sm font-medium disabled:opacity-60"
        >
          {switching ? "Switching…" : `Switch wallet to ${CHAIN_NAME}`}
        </button>
      )}

      <button
        type="button"
        onClick={mint}
        disabled={
          !isConnected || wrongChain || !NFT_CONTRACT_ADDRESS || busy || phase === "minted"
        }
        aria-busy={busy}
        className="bg-foreground inline-flex h-11 max-w-xs items-center justify-center px-5 text-sm font-medium text-white disabled:opacity-60"
      >
        {phase === "authorizing"
          ? "Authorizing…"
          : phase === "signing" && !receiptLost
            ? "Confirm in wallet…"
            : phase === "confirming"
              ? "Verifying on-chain…"
              : phase === "minted"
                ? "Minted"
                : "Mint NFT"}
      </button>

      <p role="status" aria-live="polite" className="text-muted-foreground text-xs">
        {!isConnected
          ? "Connect a wallet to mint."
          : wrongChain && !busy
            ? `Your wallet is on another network. This certificate mints on ${CHAIN_NAME}.`
            : phase === "confirming"
              ? "Transaction sent. Verifying on-chain; this can take a minute and you can leave this page."
              : phase === "minted"
                ? "Minted and verified on-chain."
                : ""}
        {!NFT_CONTRACT_ADDRESS && " Contract address not configured."}
      </p>
      {shownError && (
        <p role="alert" className="text-xs text-red-600">
          {shownError}
        </p>
      )}
    </div>
  );
}
