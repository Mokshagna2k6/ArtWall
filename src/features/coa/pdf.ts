// @pdf-lib/fontkit's Indic (Devanagari) shaper is babel-compiled and needs this global.
import "regenerator-runtime/runtime";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
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
  /** Omitted on the public copy (not shown on the public verify page). */
  metadataHash?: string | null;
  verifyUrl: string;
  /** JPEG or PNG bytes of the artwork; omitted when it could not be fetched. */
  image?: { bytes: Uint8Array; kind: "jpg" | "png" } | null;
  onChain?: { chainId?: number | null; contract?: string | null; tokenId?: string | null; txHash?: string | null } | null;
  merkle?: { root: string; leaf: string; rootTxHash?: string | null } | null;
}

const FONT_DIR = path.join(process.cwd(), "src/features/coa/fonts");

/**
 * Embedded (subset) Noto fonts, Latin first. The Devanagari face (which also covers ASCII, for
 * mixed titles) is only embedded when some text needs it, so English certificates stay small.
 */
async function loadUnicodeFonts(pdf: PDFDocument, weight: "Regular" | "Bold", text: string): Promise<PDFFont[]> {
  const embed = async (name: string) =>
    pdf.embedFont(await readFile(path.join(FONT_DIR, `${name}-${weight}.ttf`)), { subset: true });
  const latin = await embed("NotoSans");
  const set = new Set(latin.getCharacterSet());
  const needsMore = [...text].some((c) => !set.has(c.codePointAt(0)!));
  return needsMore ? [latin, await embed("NotoSansDevanagari")] : [latin];
}

/**
 * Split text into runs, each in the first face that has every glyph in it (Noto Sans Devanagari
 * has no Latin letters, so mixed titles switch faces). A glyph no face has becomes "?" rather
 * than making the PDF unwritable.
 */
function runs(fonts: PDFFont[], text: string): { font: PDFFont; text: string }[] {
  const sets = fonts.map((f) => new Set(f.getCharacterSet()));
  const out: { font: PDFFont; text: string }[] = [];
  for (const ch of text) {
    let i = sets.findIndex((set) => set.has(ch.codePointAt(0)!));
    const c = i < 0 ? "?" : ch;
    if (i < 0) i = Math.max(0, sets.findIndex((set) => set.has(63)));
    const last = out[out.length - 1];
    if (last && last.font === fonts[i]) last.text += c;
    else out.push({ font: fonts[i], text: c });
  }
  return out;
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
  let regulars: PDFFont[] = [await pdf.embedFont(StandardFonts.TimesRoman)];
  let bolds: PDFFont[] = [await pdf.embedFont(StandardFonts.TimesRomanBold)];
  const userText = [d.title, d.artist, d.medium, d.dimensions].join("");
  try {
    pdf.registerFontkit(fontkit);
    [regulars, bolds] = [
      await loadUnicodeFonts(pdf, "Regular", userText),
      await loadUnicodeFonts(pdf, "Bold", userText),
    ];
  } catch (error) {
    console.error("[coa] unicode fonts unavailable, using standard fonts", error);
  }
  const serif = regulars[0];
  const serifBold = bolds[0];
  const mono = await pdf.embedFont(StandardFonts.Courier);
  pdf.setTitle(`Certificate of Authenticity - ${d.title}`);
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

  const faces = new Map<PDFFont, PDFFont[]>([[serif, regulars], [serifBold, bolds], [mono, [mono]]]);
  const width = (text: string, base: PDFFont, size: number) =>
    runs(faces.get(base)!, text).reduce((w, r) => w + r.font.widthOfTextAtSize(r.text, size), 0);
  const draw = (text: string, x: number, y: number, base: PDFFont, size: number, color = ink) => {
    for (const r of runs(faces.get(base)!, text)) {
      page.drawText(r.text, { x, y, size, font: r.font, color });
      x += r.font.widthOfTextAtSize(r.text, size);
    }
  };
  const center = (text: string, y: number, base: PDFFont, size: number, color = ink) =>
    draw(text, (W - width(text, base, size)) / 2, y, base, size, color);
  const fit = (text: string, base: PDFFont, size: number, max: number) => {
    let s = [...text];
    while (s.length > 4 && width(s.join(""), base, size) > max) s = s.slice(0, -2);
    return s.join("");
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
    draw(label.toUpperCase(), 90, y, serifBold, 8, grey);
    draw(fit(value, serif, 12, 340), 190, y - 1, serif, 12);
    y -= 20;
  }

  y -= 6;
  const small = (label: string, value: string) => {
    draw(label.toUpperCase(), 90, y, serifBold, 7, grey);
    draw(fit(value, mono, 7, 330), 190, y, mono, 7);
    y -= 13;
  };
  if (d.metadataHash) small("Fingerprint", d.metadataHash);
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
