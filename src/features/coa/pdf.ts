import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import QRCode from "qrcode";

export interface CertificatePdfData {
  certificateId: string;
  status: string;
  title: string;
  artist: string;
  medium?: string | null;
  dimensions?: string | null;
  year?: number | null;
  issuedAt?: Date | null;
  metadataHash: string;
  verifyUrl: string;
  /** JPEG or PNG bytes of the artwork; omitted when it could not be fetched. */
  image?: { bytes: Uint8Array; kind: "jpg" | "png" } | null;
  onChain?: { chainId?: number | null; contract?: string | null; tokenId?: string | null; txHash?: string | null } | null;
  merkle?: { root: string; leaf: string; rootTxHash?: string | null } | null;
}

/** Standard PDF fonts are WinAnsi only; an unencodable glyph (e.g. Devanagari) would throw. */
function safe(font: PDFFont, text: string): string {
  const set = new Set(font.getCharacterSet());
  return [...text].map((c) => (set.has(c.codePointAt(0)!) ? c : "?")).join("");
}

/** Pastel hue sweep (HSV, s=.45, v=1): reads as iridescent foil. */
function hue(t: number) {
  const h = (((t % 1) + 1) % 1) * 6;
  const k = (n: number) => {
    const x = (n + h) % 6;
    return 1 - 0.45 * Math.max(0, Math.min(x, 4 - x, 1));
  };
  return rgb(k(5), k(3), k(1));
}

export async function buildCertificatePdf(d: CertificatePdfData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  pdf.setTitle(`Certificate of Authenticity - ${safe(serifBold, d.title)}`);
  pdf.setSubject(`ArtWall certificate ${d.certificateId}`);
  pdf.setProducer("ArtWall");
  const W = 595.28;
  const H = 841.89;
  const page = pdf.addPage([W, H]);
  const ink = rgb(0.1, 0.1, 0.18);
  const grey = rgb(0.45, 0.45, 0.5);

  // Holographic border: a hue-swept ring of short segments, plus a fine gold inner rule.
  const seg = 120;
  const m = 24;
  const th = 9;
  for (let i = 0; i < seg; i++) {
    const t = i / seg;
    const w = (W - 2 * m) / seg;
    const h = (H - 2 * m) / seg;
    page.drawRectangle({ x: m + i * w, y: H - m - th, width: w + 0.5, height: th, color: hue(t * 2) });
    page.drawRectangle({ x: m + i * w, y: m, width: w + 0.5, height: th, color: hue(1 - t) });
    page.drawRectangle({ x: m, y: m + i * h, width: th, height: h + 0.5, color: hue(0.3 + t) });
    page.drawRectangle({ x: W - m - th, y: m + i * h, width: th, height: h + 0.5, color: hue(0.6 - t) });
  }
  const inset = m + th + 6;
  page.drawRectangle({
    x: inset, y: inset, width: W - 2 * inset, height: H - 2 * inset,
    borderColor: rgb(0.7, 0.62, 0.35), borderWidth: 0.8,
  });

  const center = (text: string, y: number, font: PDFFont, size: number, color = ink) => {
    const s = safe(font, text);
    page.drawText(s, { x: (W - font.widthOfTextAtSize(s, size)) / 2, y, size, font, color });
  };
  const fit = (text: string, font: PDFFont, size: number, max: number) => {
    let s = safe(font, text);
    while (s.length > 4 && font.widthOfTextAtSize(s, size) > max) s = s.slice(0, -2);
    return s;
  };

  center("ARTWALL", H - 92, serifBold, 13, grey);
  center("Certificate of Authenticity", H - 128, serifBold, 28);
  const revoked = d.status === "revoked";
  center(revoked ? "REVOKED" : "VERIFIED", H - 152, serifBold, 11, revoked ? rgb(0.75, 0.1, 0.1) : rgb(0.09, 0.55, 0.28));

  let y = H - 190;
  if (d.image) {
    try {
      const img = d.image.kind === "png" ? await pdf.embedPng(d.image.bytes) : await pdf.embedJpg(d.image.bytes);
      const s = Math.min(260 / img.width, 200 / img.height);
      page.drawImage(img, { x: (W - img.width * s) / 2, y: y - img.height * s, width: img.width * s, height: img.height * s });
      y -= img.height * s + 28;
    } catch {
      // Undecodable image: the certificate is still valid without it.
    }
  }

  center(fit(d.title, serifBold, 20, W - 160), y, serifBold, 20);
  center(`by ${d.artist}`, y - 22, serif, 14, grey);
  y -= 62;

  const rows: [string, string][] = [
    ["Medium", d.medium ?? ""],
    ["Dimensions", d.dimensions ?? ""],
    ["Year", d.year ? String(d.year) : ""],
    ["Issued", d.issuedAt ? d.issuedAt.toISOString().slice(0, 10) : ""],
    ["Certificate ID", d.certificateId],
  ];
  for (const [label, value] of rows.filter(([, v]) => v)) {
    page.drawText(label.toUpperCase(), { x: 90, y, size: 8, font: serifBold, color: grey });
    page.drawText(fit(value, serif, 12, 340), { x: 190, y: y - 1, size: 12, font: serif, color: ink });
    y -= 20;
  }

  y -= 6;
  const small = (label: string, value: string) => {
    page.drawText(label.toUpperCase(), { x: 90, y, size: 7, font: serifBold, color: grey });
    page.drawText(fit(value, mono, 7, 330), { x: 190, y, size: 7, font: mono, color: ink });
    y -= 13;
  };
  small("Fingerprint", d.metadataHash);
  if (d.onChain?.txHash) small("Mint tx", d.onChain.txHash);
  if (d.onChain?.contract) {
    small("Contract", `${d.onChain.contract}${d.onChain.tokenId ? ` #${d.onChain.tokenId}` : ""}${d.onChain.chainId ? ` (chain ${d.onChain.chainId})` : ""}`);
  }
  if (d.merkle) {
    small("Merkle root", d.merkle.root);
    small("Merkle leaf", d.merkle.leaf);
    if (d.merkle.rootTxHash) small("Root tx", d.merkle.rootTxHash);
  }

  const qr = await pdf.embedPng(await QRCode.toBuffer(d.verifyUrl, { margin: 1, width: 240, errorCorrectionLevel: "M" }));
  const q = 92;
  page.drawImage(qr, { x: (W - q) / 2, y: 86, width: q, height: q });
  center("Scan to verify, or visit", 72, serif, 9, grey);
  center(d.verifyUrl, 60, mono, 7, grey);

  // No object streams: keeps the info dictionary (title, certificate id) readable in the raw bytes.
  return pdf.save({ useObjectStreams: false });
}
