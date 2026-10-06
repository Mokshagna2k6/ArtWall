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
  /**
   * BC-2.09: the certificate's content hash (coa_certificates.metadata_hash
   * — the same value used as the /verify/[hash] slug), embedded in the
   * pinned metadata itself so a verifier can go tokenURI → fetched IPFS
   * JSON → this field → compare against the DB record, without trusting
   * anything that isn't on IPFS. Computed over the metadata WITHOUT this
   * field (see certificates/route.ts) — it describes the rest of the
   * object, not itself.
   */
  content_hash: string;
}
