import { NextResponse, after } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { archiveCertificatePdf, renderCertificatePdf } from "@/features/coa/pdf-service";
import { getActor, hasRole } from "@/features/physical-wall/authorize";
import { db } from "@/lib/db/index";
import { coaCertificates } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const idSchema = z.string().trim().min(1).max(64);

/**
 * GET /api/coa/:certificateId/pdf. Owner or staff/admin only (the public view
 * is the HTML certificate / verify page). Always renders fresh so a revocation
 * shows immediately, and refreshes the archived Cloudinary copy + pdf_url.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "Invalid certificate id" }, { status: 400 });

  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const [cert] = await db
    .select({ userId: coaCertificates.userId, status: coaCertificates.status })
    .from(coaCertificates)
    .where(eq(coaCertificates.id, id.data));
  // Same 404 for missing and not-yours: do not confirm a certificate id exists.
  if (!cert || (cert.userId !== actor.id && !hasRole(actor, "staff"))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const bytes = await renderCertificatePdf(id.data);
    if (!bytes) return NextResponse.json({ error: "Not found" }, { status: 404 });
    after(() => archiveCertificatePdf(id.data));
    return new NextResponse(bytes as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="COA-${id.data}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[coa] pdf", error);
    return NextResponse.json({ error: "Could not generate the certificate PDF" }, { status: 500 });
  }
}
