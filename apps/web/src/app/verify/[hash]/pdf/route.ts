import { NextResponse } from "next/server";

import { renderPublicCertificatePdf } from "@/features/coa/pdf-service";
import { limitPolicy, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /verify/:hashOrId/pdf. Public, no auth: a stranger checking a work gets
 * exactly what /verify/:hashOrId shows (see renderPublicCertificatePdf). Short
 * CDN caching absorbs repeated hits; a revocation shows within a minute here
 * (the owner route /api/coa/:id/pdf stays no-store).
 */
export async function GET(request: Request, { params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  if (!/^[\w-]{1,128}$/.test(hash)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Public read: fails open if the limiter store is down. After the cheap 404 so junk paths cost nothing.
  const limit = await limitPolicy("public-pdf", null, request.headers);
  if (!limit.ok) return tooManyRequests(limit, { error: "Too many requests. Slow down." });
  try {
    const bytes = await renderPublicCertificatePdf(hash);
    if (!bytes) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(bytes as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="certificate-${hash.slice(0, 24)}.pdf"`,
        "Cache-Control": "public, max-age=0, s-maxage=60",
      },
    });
  } catch (error) {
    console.error("[coa] public pdf", error);
    return NextResponse.json({ error: "Could not generate the certificate PDF" }, { status: 500 });
  }
}
