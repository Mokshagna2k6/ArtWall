import "server-only";
import { createCipheriv, createDecipheriv, timingSafeEqual } from "node:crypto";

/**
 * BC-3.09: NTAG424 DNA SUN (Secure Unique NFC) message authentication.
 *
 * An NTAG424 DNA tag configured for SDM (Secure Dynamic Messaging) appends a
 * fresh `picc_data` (encrypted UID + read counter) and a CMAC to every NDEF
 * URL it serves, e.g.:
 *
 *   https://artwall.in/t/<tagId>?picc_data=<hex>&cmac=<hex>
 *
 * This module implements the two NXP-specified primitives needed to verify
 * that message server-side, from first principles (Node's built-in
 * `crypto` AES-ECB/CBC — no new dependency):
 *
 *   1. AES-128 CMAC (NIST SP 800-38B / RFC 4493) — the general-purpose MAC
 *      primitive every other function here is built from.
 *   2. SDM decrypt of `picc_data` (AES-128-CBC, zero IV) to recover the
 *      tag's 7-byte UID and its monotonic read counter.
 *   3. SDM CMAC verification over (UID || counter) using a key derived from
 *      SDMMacReadKey via NXP's documented session-key derivation.
 *
 * Reference: AN12196 "NTAG 424 DNA and NTAG 424 DNA TagTamper features and
 * hints", NXP Semiconductors — the SDM picc_data/CMAC construction this
 * module implements is public and documented there; no NXP code is used.
 */

const BLOCK_SIZE = 16;

function xorBlock(a: Uint8Array<ArrayBufferLike>, b: Uint8Array<ArrayBufferLike>): Uint8Array {
  const out = new Uint8Array(BLOCK_SIZE);
  for (let i = 0; i < BLOCK_SIZE; i++) out[i] = a[i] ^ b[i];
  return out;
}

/** Left-shift a 16-byte block by 1 bit, returning the shifted block (carry discarded). */
function leftShift1(block: Uint8Array<ArrayBufferLike>): Uint8Array {
  const out = new Uint8Array(BLOCK_SIZE);
  let carry = 0;
  for (let i = BLOCK_SIZE - 1; i >= 0; i--) {
    const byte = block[i];
    out[i] = ((byte << 1) | carry) & 0xff;
    carry = (byte & 0x80) ? 1 : 0;
  }
  return out;
}

function aesEcbEncryptBlock(key: Buffer, block: Uint8Array<ArrayBufferLike>): Uint8Array {
  const cipher = createCipheriv("aes-128-ecb", key, null);
  cipher.setAutoPadding(false);
  return new Uint8Array(Buffer.concat([cipher.update(block), cipher.final()]));
}

const RB = 0x87; // AES block size 128 -> Rb constant per NIST SP 800-38B

/** Derive CMAC subkeys K1, K2 from `key` (NIST SP 800-38B section 6.1). */
function deriveSubkeys(key: Buffer): { k1: Uint8Array; k2: Uint8Array } {
  const zero = new Uint8Array(BLOCK_SIZE);
  const l = aesEcbEncryptBlock(key, zero);

  const k1 = leftShift1(l);
  if (l[0] & 0x80) k1[BLOCK_SIZE - 1] ^= RB;

  const k2 = leftShift1(k1);
  if (k1[0] & 0x80) k2[BLOCK_SIZE - 1] ^= RB;

  return { k1, k2 };
}

/**
 * AES-128 CMAC (NIST SP 800-38B). `key` must be 16 bytes. Returns the full
 * 16-byte MAC; callers that only need a truncated tag (SDM CMACs are
 * truncated to 8 bytes) slice the result themselves.
 */
export function aesCmac(key: Buffer, message: Uint8Array): Uint8Array {
  if (key.length !== 16) throw new Error("aesCmac: key must be 16 bytes");
  const { k1, k2 } = deriveSubkeys(key);

  const numBlocks = message.length === 0 ? 1 : Math.ceil(message.length / BLOCK_SIZE);
  const isComplete = message.length > 0 && message.length % BLOCK_SIZE === 0;

  let mBlock: Uint8Array;
  if (isComplete) {
    const lastStart = (numBlocks - 1) * BLOCK_SIZE;
    mBlock = xorBlock(message.slice(lastStart, lastStart + BLOCK_SIZE), k1);
  } else {
    const lastStart = (numBlocks - 1) * BLOCK_SIZE;
    const lastBlock = message.slice(lastStart);
    const padded = new Uint8Array(BLOCK_SIZE);
    padded.set(lastBlock);
    padded[lastBlock.length] = 0x80; // ISO/IEC 9797-1 padding method 2
    mBlock = xorBlock(padded, k2);
  }

  let x: Uint8Array<ArrayBufferLike> = new Uint8Array(BLOCK_SIZE); // CBC chaining value, starts at 0
  for (let i = 0; i < numBlocks - 1; i++) {
    const block = message.slice(i * BLOCK_SIZE, (i + 1) * BLOCK_SIZE);
    x = aesEcbEncryptBlock(key, xorBlock(x, block));
  }
  return aesEcbEncryptBlock(key, xorBlock(x, mBlock));
}

/** NXP SDM session-key derivation: CMAC over a fixed label || UID || counter,
 *  keyed with the long-term SDMMacReadKey (AN12196 section "SDM session key
 *  derivation"). Produces the per-scan session key used for the CMAC. */
function deriveSdmSessionKey(masterKey: Buffer, uid: Uint8Array, counter: Uint8Array): Buffer {
  const input = new Uint8Array(2 + 2 + uid.length + counter.length);
  input.set([0x3c, 0xc3], 0); // SV1 label, SDM MAC session key derivation
  input.set([0x00, 0x01], 2);
  input.set(uid, 4);
  input.set(counter, 4 + uid.length);
  const mac = aesCmac(masterKey, input);
  return Buffer.from(mac);
}

// ponytail: no deriveSdmEncSessionKey — this module's picc_data decrypt uses
// SDMMetaReadKey directly (per AN12196, that field needs no session-key
// step); add the ENC session-key derivation only if a future SDM field
// (e.g. an encrypted file read) actually requires it.

export interface PiccData {
  uid: Uint8Array; // 7 bytes
  readCounter: number; // 24-bit little-endian monotonic counter
}

/**
 * Decrypt a tag's `picc_data` block (16 bytes: 1 tag byte + 7-byte UID +
 * 3-byte LE counter + 5 bytes padding) using the metadata-read key
 * (SDMMetaReadKey), diversified per tag.
 */
export function decryptPiccData(metaReadKey: Buffer, piccDataCiphertext: Uint8Array): PiccData {
  if (piccDataCiphertext.length !== 16) {
    throw new Error("picc_data must be exactly 16 bytes");
  }
  // NTAG424 SDM encrypts picc_data with AES-CBC, IV = 0, keyed directly with
  // SDMMetaReadKey (no session-key step for this specific field, per AN12196).
  const decipher = createDecipheriv("aes-128-cbc", metaReadKey, Buffer.alloc(16));
  decipher.setAutoPadding(false);
  const plain = Buffer.concat([decipher.update(piccDataCiphertext), decipher.final()]);

  const uid = new Uint8Array(plain.subarray(1, 8));
  const counterBytes = plain.subarray(8, 11);
  const readCounter = counterBytes[0] | (counterBytes[1] << 8) | (counterBytes[2] << 16);
  return { uid, readCounter };
}

/**
 * Verify an SDM CMAC over (uid || LE24(counter)) using a session key derived
 * from `macReadKey` (SDMMacReadKey, diversified per tag). The tag truncates
 * the 16-byte CMAC to its odd-indexed bytes (NXP's standard truncation,
 * AN12196) before appending it to the URL — 8 bytes.
 */
export function verifySdmCmac(
  macReadKey: Buffer,
  uid: Uint8Array,
  readCounter: number,
  receivedCmac: Uint8Array,
): boolean {
  if (receivedCmac.length !== 8) return false;
  const counterBytes = new Uint8Array([
    readCounter & 0xff,
    (readCounter >> 8) & 0xff,
    (readCounter >> 16) & 0xff,
  ]);
  const sessionKey = deriveSdmSessionKey(macReadKey, uid, counterBytes);

  const input = new Uint8Array(uid.length + counterBytes.length);
  input.set(uid, 0);
  input.set(counterBytes, uid.length);
  const fullMac = aesCmac(sessionKey, input);

  // NXP truncation: take every odd-indexed byte (1,3,5,...,15) of the 16-byte MAC.
  const truncated = new Uint8Array(8);
  for (let i = 0; i < 8; i++) truncated[i] = fullMac[2 * i + 1];

  if (truncated.length !== receivedCmac.length) return false;
  return timingSafeEqual(Buffer.from(truncated), Buffer.from(receivedCmac));
}

/**
 * Full SUN verification: decrypt picc_data to get (uid, counter), verify the
 * CMAC against it, and reject replay (counter must be strictly greater than
 * the last-seen value for this tag — the caller passes in the stored
 * high-water mark and persists the new one only after this returns ok).
 */
export type SunVerdict =
  | { ok: true; uid: string; readCounter: number }
  | { ok: false; reason: "bad_cmac" | "replay" | "malformed" };

export function verifySunMessage(params: {
  metaReadKey: Buffer;
  macReadKey: Buffer;
  piccDataHex: string;
  cmacHex: string;
  lastSeenCounter: number | null;
}): SunVerdict {
  const { metaReadKey, macReadKey, piccDataHex, cmacHex, lastSeenCounter } = params;

  let piccData: Uint8Array;
  let cmac: Uint8Array;
  try {
    piccData = hexToBytes(piccDataHex);
    cmac = hexToBytes(cmacHex);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (piccData.length !== 16 || cmac.length !== 8) return { ok: false, reason: "malformed" };

  let decrypted: PiccData;
  try {
    decrypted = decryptPiccData(metaReadKey, piccData);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const valid = verifySdmCmac(macReadKey, decrypted.uid, decrypted.readCounter, cmac);
  if (!valid) return { ok: false, reason: "bad_cmac" };

  // BC-3.09: reject replay — the counter must strictly increase. A scan
  // presenting a counter <= the last one this server recorded for this tag
  // is either a replayed/captured URL or a cloned tag, never a fresh scan.
  if (lastSeenCounter !== null && decrypted.readCounter <= lastSeenCounter) {
    return { ok: false, reason: "replay" };
  }

  return { ok: true, uid: bytesToHex(decrypted.uid), readCounter: decrypted.readCounter };
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (!/^[0-9a-f]*$/.test(clean) || clean.length % 2 !== 0) {
    throw new Error("invalid hex");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * BC-3.10: per-tag key diversification. Each physical tag gets its own
 * SDMMetaReadKey/SDMMacReadKey, derived from a single KMS-held master key
 * plus the tag's UID — never a shared key across tags, and the master key
 * itself never leaves the KMS boundary (see kms.ts: this function is only
 * ever called with a key already unwrapped by the KMS client, inside the
 * provisioning action, and the diversified key is written back to the HSM
 * for the tag — the app DB stores only `keyReference`, a KMS key id/alias,
 * never raw key bytes).
 */
export function diversifyTagKey(masterKey: Buffer, tagUid: Uint8Array, purpose: "meta" | "mac"): Buffer {
  const label = purpose === "meta" ? 0xa5 : 0x5a;
  const input = new Uint8Array(1 + tagUid.length);
  input[0] = label;
  input.set(tagUid, 1);
  return Buffer.from(aesCmac(masterKey, input));
}
