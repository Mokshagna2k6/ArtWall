"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base, baseSepolia, polygon, polygonAmoy } from "wagmi/chains";

export const config = getDefaultConfig({
  appName: "ArtWall",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "PLACEHOLDER_PROJECT_ID",
  chains: [baseSepolia, base, polygonAmoy, polygon],
  ssr: true,
});

export const DEFAULT_CHAIN_ID = Number(
  process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID ?? baseSepolia.id,
);

export const NFT_CONTRACT_ADDRESS = process.env
  .NEXT_PUBLIC_NFT_CONTRACT_ADDRESS as `0x${string}` | undefined;
