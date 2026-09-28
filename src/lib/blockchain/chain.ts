import "server-only";
import {
  createPublicClient,
  http,
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

function rpcUrl(chainId: number): string | undefined {
  if (chainId === 84532) return process.env.BASE_SEPOLIA_RPC_URL;
  if (chainId === 8453) return process.env.BASE_RPC_URL;
  if (chainId === 137) return process.env.POLYGON_RPC_URL;
  if (chainId === 80002) return process.env.POLYGON_AMOY_RPC_URL;
  return undefined;
}

export function publicClientFor(chainId: number) {
  const chain = CHAINS[chainId as keyof typeof CHAINS];
  if (!chain) throw new Error(`unsupported chainId ${chainId}`);
  return createPublicClient({ chain, transport: http(rpcUrl(chainId)) });
}

const certificateMintedEvent = parseAbiItem(
  "event CertificateMinted(uint256 indexed tokenId, address indexed to, string uri)",
);

export type MintVerdict =
  | { state: "pending" }
  | { state: "confirmed"; tokenId: string; contractAddr: Address; chainId: number }
  | { state: "failed"; reason: string };

export async function verifyMintTx(
  txHash: Hex,
  chainId = DEFAULT_CHAIN_ID,
): Promise<MintVerdict> {
  const client = publicClientFor(chainId);

  const receipt = await client
    .getTransactionReceipt({ hash: txHash })
    .catch(() => null);

  if (!receipt) return { state: "pending" };
  if (receipt.status !== "success") {
    return { state: "failed", reason: "transaction reverted" };
  }
  if (receipt.to?.toLowerCase() !== NFT_CONTRACT_ADDRESS) {
    return { state: "failed", reason: "transaction did not target the Artwall contract" };
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

  return {
    state: "confirmed",
    tokenId: mintLog.args.tokenId.toString(),
    contractAddr: NFT_CONTRACT_ADDRESS,
    chainId,
  };
}
