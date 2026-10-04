/**
 * BC-1.20: server-side magic-byte detection for the small, fixed set of
 * image types the IPFS upload route accepts. Never trusts the client-sent
 * `file.type` — that header is attacker-controlled and proves nothing about
 * the actual bytes.
 *
 * ponytail: a handful of fixed byte signatures covers every type this route
 * allows; not worth a new `file-type` dependency for six checks.
 */
export function sniffImageType(head: Uint8Array): string | null {
  const b = head;

  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    b.length >= 6 &&
    ((b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) &&
      (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61)
  ) {
    return "image/gif";
  }
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return "image/webp";
  }
  if (
    (b.length >= 4 && b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00) ||
    (b.length >= 4 && b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a)
  ) {
    return "image/tiff";
  }
  // AVIF/HEIF: ISO base media file format box "ftyp" at offset 4, with an
  // avif/avis/heic/heix/mif1 brand at offset 8.
  if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    if (brand === "avif" || brand === "avis") return "image/avif";
    if (brand === "heic" || brand === "heix" || brand === "mif1") return "image/heic";
  }

  return null;
}
