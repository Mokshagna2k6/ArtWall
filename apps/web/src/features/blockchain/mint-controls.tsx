"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { encodeFunctionData } from "viem";

import { artwallCoaAbi } from "@/lib/blockchain/abi";

// Read from the environment rather than lib/blockchain/chain.ts: that module is
// `server-only`, and importing it here would fail the build. Both values are
// NEXT_PUBLIC_, so this is the same configuration, not a second source of truth.
const DEFAULT_CHAIN_ID = Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID ?? 84532);
const NFT_CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS ??
  "") as `0x${string}` | "";

/** The EIP-712 struct the contract's mintWithVoucher takes. */
interface MintVoucher {
  to: `0x${string}`;
  uri: string;
  royaltyReceiver: `0x${string}`;
  royaltyFeeBps: number | string;
  nonce: string;
  deadline: number | string;
}

/**
 * Wallet link + mint, the two steps that stood between an issued certificate
 * and blockchain provenance. Both backends already existed (SIWE challenge at
 * /api/blockchain/wallet/{nonce,link}, EIP-712 voucher at
 * /api/blockchain/certificates/[id]/mint-voucher, receipt check at .../confirm);
 * nothing called them, so `canExhibit` could never pass its
 * BLOCKCHAIN_NOT_ANCHORED gate (Bible rules 17-18) and exhibitions were a dead
 * end. This is that missing surface.
 *
 * The wallet signs in the browser and the private key never leaves it. The
 * server issues the voucher and verifies the receipt, so a client that lies
 * about having minted changes nothing: `confirm` reads the chain.
 *
 * Testnet only until Bible section 118's controls (multisig, pause, role
 * separation, timelock) and an audit exist — section 19 is explicit that
 * mainnet waits for them. The chain id comes back from the voucher, and the
 * banner names the network so nobody mistakes a testnet token for a mainnet one.
 */

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

function injectedProvider(): Eip1193Provider | null {
  const w = window as unknown as { ethereum?: Eip1193Provider };
  return w.ethereum ?? null;
}

/** Hex chain id -> readable name, for the few we actually target. */
const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum mainnet",
  137: "Polygon",
  8453: "Base",
  84532: "Base Sepolia (testnet)",
  11155111: "Sepolia (testnet)",
  2442: "Polygon zkEVM Cardona (testnet)",
};

export function chainName(id: number | null | undefined): string {
  if (id == null) return "unknown network";
  return CHAIN_NAMES[id] ?? `chain ${id}`;
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string; code?: string } | string };
    if (typeof body.error === "string") return body.error;
    return body.error?.message ?? body.error?.code ?? `Request failed (${res.status}).`;
  } catch {
    return `Request failed (${res.status}).`;
  }
}

export function ConnectWalletButton({ walletAddress }: { walletAddress: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setError(null);
    const provider = injectedProvider();
    if (!provider) {
      setError(
        "No browser wallet found. Install MetaMask (or another EIP-1193 wallet) and reload."
      );
      return;
    }
    setBusy(true);
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts?.[0];
      if (!address) throw new Error("No account was shared by the wallet.");

      // 1. Server issues a challenge bound to this address.
      const nonceRes = await fetch("/api/blockchain/wallet/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      });
      if (!nonceRes.ok) throw new Error(await readError(nonceRes));
      const challenge = (await nonceRes.json()) as { message?: string; nonce?: string };
      const message = challenge.message ?? challenge.nonce;
      if (!message) throw new Error("The server did not return a challenge to sign.");

      // 2. The wallet signs it. The key never leaves the browser.
      const signature = (await provider.request({
        method: "personal_sign",
        params: [message, address],
      })) as string;

      // 3. Server verifies the signature before it will store the address.
      const linkRes = await fetch("/api/blockchain/wallet/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address, signature }),
      });
      if (!linkRes.ok) throw new Error(await readError(linkRes));
      router.refresh();
    } catch (e) {
      // A user closing the wallet popup is a rejection, not a failure worth shouting about.
      const msg = e instanceof Error ? e.message : "Could not link the wallet.";
      setError(/user rejected|denied/i.test(msg) ? "Signature cancelled." : msg);
    } finally {
      setBusy(false);
    }
  }

  if (walletAddress) {
    return (
      <p className="text-studio-muted text-sm">
        Wallet linked:{" "}
        <span className="text-studio-ink font-mono text-xs">
          {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
        </span>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" className="studio-button w-fit" disabled={busy} onClick={connect}>
        {busy ? "Waiting for wallet…" : "Connect wallet"}
      </button>
      <p className="text-studio-muted text-xs">
        It receives the token and your royalties, so it has to be yours. You sign a
        message to prove it — no transaction, no gas.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function MintButton({
  certificateId,
  status,
  hasWallet,
}: {
  certificateId: string;
  status: string;
  hasWallet: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function mint() {
    setError(null);
    setNote(null);
    const provider = injectedProvider();
    if (!provider) {
      setError("No browser wallet found.");
      return;
    }
    setBusy(true);
    try {
      // 1. Server checks the policy gate and signs an EIP-712 voucher. Royalty
      //    bps come from the commission policy, never from the client.
      setNote("Preparing the voucher…");
      const voucherRes = await fetch(
        `/api/blockchain/certificates/${certificateId}/mint-voucher`,
        { method: "POST" }
      );
      if (!voucherRes.ok) throw new Error(await readError(voucherRes));
      const { voucher, signature } = (await voucherRes.json()) as {
        voucher?: MintVoucher;
        signature?: string;
      };
      if (!voucher || !signature) {
        throw new Error("The server did not return a signed voucher.");
      }
      if (!NFT_CONTRACT_ADDRESS) {
        throw new Error("No contract address is configured for this environment.");
      }

      // 2. Make sure the wallet is on the network the voucher was signed for.
      //    An EIP-712 signature is domain-bound: redeeming it on another chain
      //    just reverts, after the gas has been spent.
      const current = (await provider.request({ method: "eth_chainId" })) as string;
      if (parseInt(current, 16) !== DEFAULT_CHAIN_ID) {
        setNote(`Switching to ${chainName(DEFAULT_CHAIN_ID)}…`);
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${DEFAULT_CHAIN_ID.toString(16)}` }],
        });
      }

      const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
      const from = accounts?.[0];
      if (!from) throw new Error("Unlock your wallet and try again.");

      // The wallet redeems the voucher against the contract. Encoding here
      // rather than taking calldata from the server means the wallet shows the
      // real function and arguments, and a tampered response cannot smuggle in
      // a different call.
      const data = encodeFunctionData({
        abi: artwallCoaAbi,
        functionName: "mintWithVoucher",
        // The JSON voucher carries numbers as strings; the ABI wants bigints
        // and a bytes32 nonce. Converting here keeps the wire format readable
        // and the encoding exact.
        args: [
          {
            to: voucher.to,
            uri: voucher.uri,
            royaltyReceiver: voucher.royaltyReceiver,
            royaltyFeeBps: BigInt(voucher.royaltyFeeBps),
            nonce: voucher.nonce as `0x${string}`,
            deadline: BigInt(voucher.deadline),
          },
          signature as `0x${string}`,
        ],
      });

      setNote("Confirm the transaction in your wallet…");
      const txHash = (await provider.request({
        method: "eth_sendTransaction",
        params: [{ from, to: NFT_CONTRACT_ADDRESS, data }],
      })) as string;

      // 3. The server reads the receipt from the chain. A client claiming a
      //    mint it did not make gets nowhere: confirm verifies, it does not trust.
      setNote("Waiting for the network to confirm…");
      for (let attempt = 0; attempt < 30; attempt++) {
        const confirmRes = await fetch(
          `/api/blockchain/certificates/${certificateId}/confirm`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ txHash }),
          }
        );
        if (confirmRes.ok) {
          const result = (await confirmRes.json()) as { status?: string; error?: string };
          if (result.status === "minted") {
            setNote("Anchored on-chain.");
            router.refresh();
            return;
          }
          if (result.status === "failed") {
            throw new Error(result.error ?? "The transaction failed on-chain.");
          }
        }
        await new Promise((r) => setTimeout(r, 4000));
      }
      // Not an error: the mint is recorded and the cron reconciler picks it up.
      setNote("Still confirming. This page will show it once the network settles.");
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "The mint could not be completed.";
      setError(/user rejected|denied/i.test(msg) ? "Transaction cancelled." : msg);
    } finally {
      setBusy(false);
    }
  }

  if (status === "minted") return null;
  if (!hasWallet) {
    return (
      <p className="text-studio-muted text-xs">Connect a wallet above to anchor this.</p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button type="button" className="studio-button w-fit" disabled={busy} onClick={mint}>
        {busy ? "Working…" : status === "minting" ? "Retry anchoring" : "Anchor on-chain"}
      </button>
      {note && <p className="text-studio-muted text-xs">{note}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
