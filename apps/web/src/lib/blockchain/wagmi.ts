"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base, baseSepolia, polygon, polygonAmoy } from "wagmi/chains";

// Inlined at build time. A placeholder id silently breaks every WalletConnect
// session, so refuse to build the config instead.
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
if (!projectId) {
  throw new Error(
    "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set; wallet connection cannot work without a WalletConnect Cloud project id.",
  );
}

export const config = getDefaultConfig({
  appName: "ArtWall",
  projectId,
  chains: [baseSepolia, base, polygonAmoy, polygon],
  ssr: true,
});

export const DEFAULT_CHAIN_ID = Number(
  process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID ?? baseSepolia.id,
);

export const NFT_CONTRACT_ADDRESS = process.env
  .NEXT_PUBLIC_NFT_CONTRACT_ADDRESS as `0x${string}` | undefined;
