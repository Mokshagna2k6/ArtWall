import type { ReasonCode } from "@/features/policy/engine";

/**
 * Human-readable copy for each PolicyEngine reason code (FE-3.11).
 *
 * The PolicyEngine only ever returns the codes in `ReasonCode` — this map is
 * exhaustive over that union so adding a new code without updating this file
 * is a type error, not a silent blank message.
 */
export const REASON_COPY: Record<ReasonCode, string> = {
  IDENTITY_NOT_VERIFIED: "The artist's identity is not verified yet.",
  PHYSICAL_BINDING_NOT_VERIFIED:
    "The physical work is not bound to a verified tag yet.",
  BLOCKCHAIN_NOT_ANCHORED: "Blockchain provenance has not been anchored yet.",
  COA_NOT_ISSUED: "No Certificate of Authenticity has been issued yet.",
  CURATION_NOT_APPROVED: "This artwork has not been approved by curation yet.",
  ARTWORK_NOT_PUBLISHED: "This artwork is not published yet.",
  ALREADY_LISTED: "This artwork is already listed.",
  ALREADY_MINTED: "This artwork has already been minted.",
};
