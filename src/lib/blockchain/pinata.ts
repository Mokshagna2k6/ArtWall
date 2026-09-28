import "server-only";
import { PinataSDK } from "pinata";

if (!process.env.PINATA_JWT) {
  console.warn("[pinata] PINATA_JWT is not set — IPFS uploads will fail.");
}

export const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT ?? "",
  pinataGateway: process.env.NEXT_PUBLIC_PINATA_GATEWAY ?? "",
});

export interface NftMetadata {
  name: string;
  description: string;
  image: string; // ipfs://<cid>
  external_url?: string;
  attributes: { trait_type: string; value: string | number }[];
}
