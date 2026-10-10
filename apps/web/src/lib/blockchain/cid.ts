import "server-only";
import { sha256 } from "@noble/hashes/sha2.js";

/**
 * BC-2.08: verify an IPFS CID actually matches a locally-computed hash of
 * the uploaded bytes, instead of trusting whatever the pinning provider
 * returns. Supports the two CID shapes Pinata actually returns for a plain
 * file upload:
 *   - CIDv1, codec `raw` (0x55), multihash sha2-256 — base32 (RFC4648,
 *     lowercase, no padding), multibase prefix 'b'. This is what
 *     `pinata.upload.public.file()` produces for a single file with no
 *     UnixFS wrapping (the common case for an image/metadata blob).
 *   - CIDv0: base58btc-encoded sha2-256 multihash, always starting 'Qm'
 *     (legacy dag-pb-wrapped single-file CIDs some gateways still mint).
 * Any other codec (e.g. dag-pb CIDv1 from a directory/UnixFS-wrapped
 * upload) cannot be re-derived from the raw bytes alone, so it is reported
 * as "unverifiable" rather than silently treated as valid.
 */

const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function toBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function toBase58(bytes: Uint8Array): string {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  // Leading zero bytes become leading '1's in base58.
  let leadingZeros = 0;
  for (const byte of bytes) {
    if (byte === 0) leadingZeros++;
    else break;
  }
  const encoded = digits
    .reverse()
    .map((d) => BASE58_ALPHABET[d])
    .join("");
  return BASE58_ALPHABET[0].repeat(leadingZeros) + encoded;
}

function varint(value: number): number[] {
  const out: number[] = [];
  let v = value;
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v > 0) b |= 0x80;
    out.push(b);
  } while (v > 0);
  return out;
}

/** multihash: <hash-fn-code varint><digest-length varint><digest> */
function sha256Multihash(bytes: Uint8Array): Uint8Array {
  const digest = sha256(bytes);
  return new Uint8Array([...varint(0x12), ...varint(digest.length), ...digest]);
}

function cidV1Raw(bytes: Uint8Array): string {
  const mh = sha256Multihash(bytes);
  // CIDv1 = <cid-version=1><multicodec=raw(0x55)><multihash>
  const cidBytes = new Uint8Array([...varint(1), ...varint(0x55), ...mh]);
  return "b" + toBase32(cidBytes); // multibase prefix 'b' = base32
}

function cidV0(bytes: Uint8Array): string {
  // CIDv0 is bare base58btc of the sha2-256 multihash, no version/codec prefix.
  return toBase58(sha256Multihash(bytes));
}

export type CidVerdict =
  | { verified: true; computedCid: string }
  | { verified: false; reason: string; computedCid?: string };

/**
 * Re-derive the CID locally from the exact bytes that were uploaded and
 * compare against what the pinning provider returned. Never throws; a
 * mismatch or an unsupported CID shape is reported, not swallowed.
 */
export function verifyCid(bytes: Uint8Array, returnedCid: string): CidVerdict {
  if (!returnedCid) return { verified: false, reason: "no CID returned" };

  if (returnedCid.startsWith("Qm")) {
    const computed = cidV0(bytes);
    return computed === returnedCid
      ? { verified: true, computedCid: computed }
      : { verified: false, reason: "CIDv0 does not match uploaded bytes", computedCid: computed };
  }

  if (returnedCid.startsWith("b")) {
    const computed = cidV1Raw(bytes);
    if (computed === returnedCid) return { verified: true, computedCid: computed };
    return {
      verified: false,
      reason: "CIDv1 does not match a raw-codec hash of the uploaded bytes (if this is a UnixFS/dag-pb CID, local verification cannot re-derive it)",
      computedCid: computed,
    };
  }

  return { verified: false, reason: `unsupported CID format: ${returnedCid.slice(0, 8)}…` };
}
