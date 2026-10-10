import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * BC-3.10: the KMS/HSM boundary for NTAG424 tag master keys.
 *
 * The contract this module exists to enforce: a tag's raw AES-128 key bytes
 * are never written to the application database or committed to code. The
 * DB (`art_tags.keyReference`) stores only an opaque KMS key identifier —
 * never key material — exactly mirroring how `MINT_SIGNER_PRIVATE_KEY`
 * already keeps the voucher-signing key out of the DB (chain.ts/gateway.ts
 * read it from the environment/secret manager, never from a table).
 *
 * `KmsClient` is the provider-agnostic interface the rest of the app calls.
 * Swapping in a real AWS KMS / GCP Cloud KMS / Azure Key Vault / Thales HSM
 * client later is an implementation of this same interface — no caller
 * changes. No real KMS account exists in this environment to integrate
 * against (same blocker as BC-1.10's unfunded signer wallet), so the
 * concrete implementation below is `EnvMasterKeyKms`: it derives the tag
 * master key from a KMS-style wrapped secret
 * (`NTAG424_MASTER_KEY_KMS_REF`, an env var — the same pattern
 * MINT_SIGNER_PRIVATE_KEY already uses for a key that is conceptually
 * KMS-held but not yet wired to a live KMS account) and is explicitly
 * documented as a dev/CI stand-in, not production-grade HSM custody.
 *
 * Swap-in point for a real provider: implement `KmsClient` against the AWS
 * KMS / GCP KMS SDK (wrapping `GenerateDataKey`/`Decrypt` calls) and change
 * the single `getKmsClient()` factory below — nothing else in the codebase
 * needs to change, since every caller already goes through this interface.
 */
export interface KmsClient {
  /** Derive (never "look up a stored") the diversified key material for one
   *  tag/purpose, scoped to a KMS key reference. Returns raw key bytes ONLY
   *  in-process, for immediate use (CMAC/AES) — the caller must never
   *  persist the return value. */
  deriveTagKey(keyReference: string, tagUid: Uint8Array, purpose: "meta" | "mac"): Promise<Buffer>;
  /** Provision a new KMS key reference for a tag. Returns the opaque
   *  reference string to store in art_tags.keyReference — never key bytes. */
  provisionKeyReference(tagUid: Uint8Array): Promise<string>;
}

/**
 * ponytail: dev/CI stand-in, not a real HSM — the master key lives in an
 * env var (NTAG424_MASTER_KEY_KMS_REF, hex-encoded 16 bytes), the same
 * trust boundary MINT_SIGNER_PRIVATE_KEY already lives at. Upgrade path:
 * swap this class for one backed by a real cloud KMS SDK — see the
 * `KmsClient` doc comment above for the exact swap-in point. Do not point
 * this at a real NTAG424 fleet in production without that swap.
 */
class EnvMasterKeyKms implements KmsClient {
  private masterKey(): Buffer {
    const hex = process.env.NTAG424_MASTER_KEY_KMS_REF;
    if (!hex) {
      throw new Error(
        "NTAG424_MASTER_KEY_KMS_REF is not set — the tag master key must come from a KMS-held secret, never a hardcoded value",
      );
    }
    const key = Buffer.from(hex, "hex");
    if (key.length !== 16) {
      throw new Error("NTAG424_MASTER_KEY_KMS_REF must decode to exactly 16 bytes (AES-128)");
    }
    return key;
  }

  async deriveTagKey(keyReference: string, tagUid: Uint8Array, purpose: "meta" | "mac"): Promise<Buffer> {
    // keyReference namespaces the derivation (so rotating the reference
    // rotates every tag's effective key without touching the master key
    // itself) — it is mixed into the diversification input, not used to
    // "look up" anything, since this stub has exactly one master key.
    const { diversifyTagKey } = await import("@/lib/blockchain/ntag424");
    const refTag = createHash("sha256").update(keyReference).digest().subarray(0, 4);
    const salted = new Uint8Array(tagUid.length + refTag.length);
    salted.set(tagUid, 0);
    salted.set(refTag, tagUid.length);
    return diversifyTagKey(this.masterKey(), salted, purpose);
  }

  async provisionKeyReference(_tagUid: Uint8Array): Promise<string> {
    // A real KMS returns a key ARN/resource name here. This stub mints a
    // random opaque reference of the same shape (never derived from the
    // key itself, so it carries no key material even by accident).
    return `kmsref_${randomBytes(12).toString("base64url")}`;
  }
}

let client: KmsClient | null = null;

export function getKmsClient(): KmsClient {
  if (!client) client = new EnvMasterKeyKms();
  return client;
}

/** Test-only seam: swap in a fake KmsClient without touching env vars. */
export function __setKmsClientForTests(fake: KmsClient | null): void {
  client = fake;
}
