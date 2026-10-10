import "server-only";
import {
  createPublicClient,
  http,
  fallback,
  defineChain,
  parseAbiItem,
  type Hex,
  type Address,
} from "viem";

const CHAINS = {
  8453: defineChain({
    id: 8453,
    name: "Base",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["https://mainnet.base.org"] } },
    blockExplorers: { default: { name: "BaseScan", url: "https://basescan.org" } },
  }),
  84532: defineChain({
    id: 84532,
    name: "Base Sepolia",
    testnet: true,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["https://sepolia.base.org"] } },
    blockExplorers: {
      default: { name: "BaseScan", url: "https://sepolia.basescan.org" },
    },
  }),
  137: defineChain({
    id: 137,
    name: "Polygon",
    nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
    rpcUrls: { default: { http: ["https://polygon-rpc.com"] } },
  }),
  80002: defineChain({
    id: 80002,
    name: "Polygon Amoy",
    testnet: true,
    nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
    rpcUrls: { default: { http: ["https://rpc-amoy.polygon.technology"] } },
  }),
} as const;

export const DEFAULT_CHAIN_ID = Number(
  process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID ?? 84532,
);

export const NFT_CONTRACT_ADDRESS = (
  process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS ?? ""
).toLowerCase() as Address;

/** BC-2.06: the chain's own default public RPC is always included as a last
 *  resort fallback, after any configured primary (and, for Base Sepolia, a
 *  second well-known public endpoint) — so a single RPC provider outage
 *  doesn't take down mint verification or root anchoring. */
function rpcUrls(chainId: number): string[] {
  const urls: string[] = [];
  if (chainId === 84532) {
    if (process.env.BASE_SEPOLIA_RPC_URL) urls.push(process.env.BASE_SEPOLIA_RPC_URL);
    // A second, independently-operated public Base Sepolia RPC as fallback.
    urls.push("https://base-sepolia-rpc.publicnode.com");
  } else if (chainId === 8453) {
    if (process.env.BASE_RPC_URL) urls.push(process.env.BASE_RPC_URL);
    urls.push("https://base-rpc.publicnode.com");
  } else if (chainId === 137) {
    if (process.env.POLYGON_RPC_URL) urls.push(process.env.POLYGON_RPC_URL);
  } else if (chainId === 80002) {
    if (process.env.POLYGON_AMOY_RPC_URL) urls.push(process.env.POLYGON_AMOY_RPC_URL);
  }
  const chainDefault = CHAINS[chainId as keyof typeof CHAINS]?.rpcUrls.default.http[0];
  if (chainDefault && !urls.includes(chainDefault)) urls.push(chainDefault);
  return urls;
}

/** Typed error surfaced when every configured RPC endpoint for a chain has
 *  failed (BC-2.06) — callers can distinguish "the chain itself is
 *  unreachable right now" from a normal not-found/pending verdict. */
export class RpcUnavailableError extends Error {
  constructor(public readonly chainId: number, cause?: unknown) {
    super(`all RPC endpoints for chain ${chainId} failed`);
    this.name = "RpcUnavailableError";
    this.cause = cause;
  }
}

/** BC-2.06: shared by publicClientFor and gateway.ts's wallet client, so
 *  root anchoring (writeContract) gets the same retry+fallback RPC
 *  resilience as read-side mint verification, from one place. */
export function resilientTransport(chainId: number) {
  const urls = rpcUrls(chainId);
  // viem's http transport already retries (3x, exponential-ish backoff) per
  // endpoint; fallback() tries each configured URL in order before the whole
  // request is considered failed, and ranks endpoints by recent reliability.
  return urls.length > 1
    ? fallback(
        urls.map((url) => http(url, { retryCount: 2, retryDelay: 500 })),
        { rank: false },
      )
    : http(urls[0], { retryCount: 2, retryDelay: 500 });
}

export function publicClientFor(chainId: number) {
  const chain = CHAINS[chainId as keyof typeof CHAINS];
  if (!chain) throw new Error(`unsupported chainId ${chainId}`);
  return createPublicClient({ chain, transport: resilientTransport(chainId) });
}

export function chainFor(chainId: number) {
  const chain = CHAINS[chainId as keyof typeof CHAINS];
  if (!chain) throw new Error(`unsupported chainId ${chainId}`);
  return chain;
}

const certificateMintedEvent = parseAbiItem(
  "event CertificateMinted(uint256 indexed tokenId, address indexed to, string uri)",
);

/** BC-1.19: a tx needs this many confirmations behind the chain head before
 *  it counts as minted, so a block that gets reorged out cannot flip a
 *  certificate to "minted" on a transaction that later disappears. */
export const REQUIRED_CONFIRMATIONS = Number(
  process.env.MINT_REQUIRED_CONFIRMATIONS ?? 2,
);

export type MintVerdict =
  | { state: "pending" }
  | { state: "confirmed"; tokenId: string; contractAddr: Address; chainId: number }
  | { state: "failed"; reason: string };

/**
 * BC-1.18/1.19: validates that `txHash` is a real, sufficiently-confirmed
 * mint of exactly the certificate this caller expects — not merely a
 * same-named event emitted by some unrelated transaction.
 *
 * @param expected the recipient and tokenURI the voucher for this
 *   certificate was signed with; the on-chain event must match both.
 */
export async function verifyMintTx(
  txHash: Hex,
  chainId = DEFAULT_CHAIN_ID,
  expected?: { to: Address; uri: string },
): Promise<MintVerdict> {
  const client = publicClientFor(chainId);

  // BC-2.06: "transaction not mined yet" (TransactionReceiptNotFoundError,
  // the expected/common case) must be told apart from "every configured RPC
  // endpoint failed" (an infra outage) — the former is genuinely "pending",
  // the latter must not silently collapse into the same verdict, or a full
  // RPC outage looks identical to a slow mint forever.
  let receipt: Awaited<ReturnType<typeof client.getTransactionReceipt>> | null = null;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash });
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "TransactionReceiptNotFoundError") {
      receipt = null;
    } else {
      throw new RpcUnavailableError(chainId, err);
    }
  }

  if (!receipt) return { state: "pending" };
  if (receipt.status !== "success") {
    return { state: "failed", reason: "transaction reverted" };
  }
  if (receipt.to?.toLowerCase() !== NFT_CONTRACT_ADDRESS) {
    return { state: "failed", reason: "transaction did not target the Artwall contract" };
  }

  const currentBlock = await client.getBlockNumber();
  const confirmations = currentBlock - receipt.blockNumber + 1n;
  if (confirmations < BigInt(REQUIRED_CONFIRMATIONS)) {
    return { state: "pending" };
  }

  const logs = await client.getLogs({
    address: NFT_CONTRACT_ADDRESS,
    event: certificateMintedEvent,
    blockHash: receipt.blockHash,
  });
  const mintLog = logs.find((l) => l.transactionHash === txHash);
  if (!mintLog || mintLog.args.tokenId === undefined) {
    return { state: "failed", reason: "no CertificateMinted event in this transaction" };
  }

  if (expected) {
    if (mintLog.args.to?.toLowerCase() !== expected.to.toLowerCase()) {
      return { state: "failed", reason: "minted recipient does not match this certificate's voucher" };
    }
    if (mintLog.args.uri !== expected.uri) {
      return { state: "failed", reason: "minted tokenURI does not match this certificate's voucher" };
    }
  }

  return {
    state: "confirmed",
    tokenId: mintLog.args.tokenId.toString(),
    contractAddr: NFT_CONTRACT_ADDRESS,
    chainId,
  };
}

const ownerOfAbi = parseAbiItem("function ownerOf(uint256 tokenId) view returns (address)");
const tokenUriAbi = parseAbiItem("function tokenURI(uint256 tokenId) view returns (string)");

export type OnChainVerdict =
  | { verified: true; owner: Address; tokenUriMatches: boolean }
  | { verified: false; reason: string };

/**
 * BC-2.12: /verify/[hash] server-side on-chain check for a minted
 * certificate — confirms the token genuinely exists on-chain (ownerOf does
 * not revert) and, when we know the expected tokenURI, that it still
 * matches. This is a live call to the actual chain (through chain.ts's
 * retry+fallback transport, BC-2.06), not a DB-state read — a certificate
 * row claiming "minted" without a corresponding live token is reported as
 * unverified rather than trusted.
 */
export async function verifyTokenOnChain(
  tokenId: string,
  chainId: number,
  contractAddr: Address,
  expectedUri?: string,
): Promise<OnChainVerdict> {
  try {
    const client = publicClientFor(chainId);
    const owner = (await client.readContract({
      address: contractAddr,
      abi: [ownerOfAbi],
      functionName: "ownerOf",
      args: [BigInt(tokenId)],
    })) as Address;

    let tokenUriMatches = true;
    if (expectedUri) {
      const uri = (await client.readContract({
        address: contractAddr,
        abi: [tokenUriAbi],
        functionName: "tokenURI",
        args: [BigInt(tokenId)],
      })) as string;
      tokenUriMatches = uri === expectedUri;
    }

    return { verified: true, owner, tokenUriMatches };
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "ContractFunctionExecutionError" || name === "ContractFunctionRevertedError") {
      return { verified: false, reason: "token does not exist on-chain" };
    }
    return { verified: false, reason: err instanceof Error ? err.message : "on-chain check failed" };
  }
}
