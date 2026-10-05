"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { expireCatalog } from "@/lib/catalog-cache";
import { db } from "@/lib/db/index";
import {
  exhibitions,
  exhibitionArtworks,
  exhibitionTransitions,
  artworks,
  artistProfiles,
} from "@/lib/db/schema";
import { recordAudit } from "@/features/physical-wall/audit";
import { getActor, hasRole, NotAuthorisedError } from "@/features/physical-wall/authorize";
import {
  attempt,
  parseInput,
  PreconditionError,
  readSafely,
  type Result,
} from "@/features/physical-wall/actions/shared";
import { canExhibit } from "@/features/policy/engine";
import { logPolicyDecision } from "@/features/policy/log";
import { loadTrustDimensions } from "@/features/policy/trust";
import { assertArtworkTransition, type ExhibitionStatus } from "@/features/artworks/state-machine";
import { assertExhibitionTransition, type ExhibitionStage } from "@/features/exhibitions/lifecycle";

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new PreconditionError("Sign in first.");
  return session.user.id;
}

const id = z.string({ error: "Which exhibition?" }).trim().min(1, "Which exhibition?").max(64);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2027-01-31.");
const createSchema = z.object({
  title: z.string({ error: "Give the exhibition a title." }).trim().min(1, "Give the exhibition a title.").max(160),
  description: z.string().trim().max(4000).optional(),
  venue: z.string().trim().max(160).optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
});

function newId(prefix: string): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Buffer.from(bytes).toString("base64url")}`;
}

export async function getExhibitions() {
  return readSafely("getExhibitions", [], async () => {
    const userId = await getUserId();
    return db
      .select()
      .from(exhibitions)
      .where(eq(exhibitions.userId, userId))
      .orderBy(desc(exhibitions.createdAt));
  });
}

export async function createExhibition(raw: z.input<typeof createSchema>): Promise<Result<string>> {
  return attempt("createExhibition", async () => {
    const input = parseInput(createSchema, raw);
    if (input.startDate && input.endDate && input.endDate < input.startDate) {
      throw new PreconditionError("The end date is before the start date.");
    }
    const userId = await getUserId();
    const exhibitionId = newId("exh");
    await db.transaction(async (tx) => {
      await tx.insert(exhibitions).values({
        id: exhibitionId,
        userId,
        title: input.title,
        description: input.description ?? null,
        venue: input.venue ?? null,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        status: "draft",
      });
      // BE-3.08: an audit entry per transition, even the first one into draft.
      await tx.insert(exhibitionTransitions).values({
        exhibitionId,
        fromStatus: null,
        toStatus: "draft",
        actorId: userId,
      });
    });
    revalidatePath("/studio/exhibitions");
    return exhibitionId;
  });
}

export async function addArtworkToExhibition(exhibitionId: string, artworkId: string): Promise<Result> {
  return attempt("addArtworkToExhibition", async () => {
    const input = parseInput(z.object({ exhibitionId: id, artworkId: id }), { exhibitionId, artworkId });
    const userId = await getUserId();
    const [exh] = await db
      .select({ id: exhibitions.id })
      .from(exhibitions)
      .where(and(eq(exhibitions.id, input.exhibitionId), eq(exhibitions.userId, userId)));
    if (!exh) throw new PreconditionError("Exhibition not found");

    // Only your own works: a published exhibition shows them publicly.
    const [art] = await db
      .select({ id: artworks.id })
      .from(artworks)
      .where(and(eq(artworks.id, input.artworkId), eq(artworks.userId, userId)));
    if (!art) throw new PreconditionError("Artwork not found");

    await db
      .insert(exhibitionArtworks)
      .values({ exhibitionId: input.exhibitionId, artworkId: input.artworkId, displayOrder: 0 })
      .onConflictDoNothing();

    expireCatalog();
    revalidatePath("/studio/exhibitions");
    return null;
  });
}

/**
 * draft → published (BE-1.23). The owner, or an admin. After this,
 * getPublicExhibition(id) returns it.
 *
 * BE-2.18: only a complete exhibition goes public — a title, both dates (in
 * order) and at least one artwork. Checked on the row the update will change,
 * inside one transaction with the row locked, so the checks and the publish
 * see the same exhibition.
 */
export async function publishExhibition(
  exhibitionId: string
): Promise<Result<{ id: string; status: string }>> {
  return attempt("publishExhibition", async () => {
    const exhId = parseInput(id, exhibitionId);
    const actor = await getActor();
    if (!actor) throw new NotAuthorisedError("artist");
    const isAdmin = hasRole(actor, "admin");

    const row = await db.transaction(async (tx) => {
      const [exh] = await tx
        .select()
        .from(exhibitions)
        .where(
          isAdmin
            ? and(eq(exhibitions.id, exhId), eq(exhibitions.status, "draft"))
            : and(eq(exhibitions.id, exhId), eq(exhibitions.status, "draft"), eq(exhibitions.userId, actor.id))
        )
        .for("update");
      if (!exh) throw new PreconditionError("Exhibition not found, not yours, or not a draft.");

      const missing: string[] = [];
      if (!exh.title?.trim()) missing.push("a title");
      if (!exh.startDate || !exh.endDate) missing.push("start and end dates");
      const memberRows = await tx
        .select({ artworkId: exhibitionArtworks.artworkId })
        .from(exhibitionArtworks)
        .where(eq(exhibitionArtworks.exhibitionId, exh.id));
      if (memberRows.length === 0) missing.push("at least one artwork");
      if (missing.length) throw new PreconditionError(`Before publishing, add ${missing.join(", ")}.`);
      if (exh.endDate! < exh.startDate!) throw new PreconditionError("The end date is before the start date.");

      // BE-3.03/BE-3.04: every artwork going on public display must clear the
      // section-14 hard gate — physical binding verified AND blockchain
      // anchored — read from the five real trust dimensions (BE-3.05), never
      // from a collapsed status column.
      for (const { artworkId } of memberRows) {
        const trust = await loadTrustDimensions(artworkId);
        const decision = canExhibit({ trust });
        await logPolicyDecision({
          gate: "canExhibit",
          subjectType: "artwork",
          subjectId: artworkId,
          actorId: actor.id,
          decision,
          inputs: { trust },
        });
        if (!decision.allow) {
          throw new PreconditionError(
            `Artwork ${artworkId} is not eligible to exhibit: ${decision.reasons.join(", ")}.`
          );
        }

        // BE-3.07: the artwork's exhibition domain (one of its four
        // orthogonal status domains, 0047) moves to on_display alongside the
        // exhibition going live. An illegal current state (shouldn't occur,
        // since nothing else writes this column yet) throws rather than
        // silently writing an inconsistent value.
        const [art] = await tx
          .select({ exhibitionStatus: artworks.exhibitionStatus })
          .from(artworks)
          .where(eq(artworks.id, artworkId));
        const current = (art?.exhibitionStatus ?? "not_exhibited") as ExhibitionStatus;
        if (current !== "on_display") {
          assertArtworkTransition("exhibition", current, "on_display");
          await tx
            .update(artworks)
            .set({ exhibitionStatus: "on_display", updatedAt: new Date() })
            .where(eq(artworks.id, artworkId));
        }
      }

      // BE-3.08: server-enforced lifecycle transition + an audit entry. The
      // select above already filters to status = 'draft', but asserting
      // through the real 15-stage graph (not just assuming the filter is
      // airtight) is what makes this the enforcement point, not a comment.
      assertExhibitionTransition(exh.status as ExhibitionStage, "published");

      const [row] = await tx
        .update(exhibitions)
        .set({ status: "published", updatedAt: new Date() })
        .where(eq(exhibitions.id, exh.id))
        .returning({ id: exhibitions.id, status: exhibitions.status, userId: exhibitions.userId });

      await tx.insert(exhibitionTransitions).values({
        exhibitionId: exh.id,
        fromStatus: exh.status,
        toStatus: "published",
        actorId: actor.id,
      });

      return row;
    });

    if (row.userId !== actor.id) {
      await recordAudit({ actor, action: "exhibition.published", subjectType: "exhibition", subjectId: row.id });
    }
    expireCatalog();
    revalidatePath("/studio/exhibitions");
    revalidatePath(`/exhibitions/${row.id}`);
    return { id: row.id, status: row.status };
  });
}

export async function getPublicExhibition(exhibitionId: string) {
  return readSafely("getPublicExhibition", null, () => loadPublicExhibition(parseInput(id, exhibitionId)));
}

async function loadPublicExhibition(id: string) {
  const [exh] = await db
    .select()
    .from(exhibitions)
    .where(and(eq(exhibitions.id, id), eq(exhibitions.status, "published")));
  if (!exh) return null;

  const works = await db
    .select({
      id: artworks.id,
      title: artworks.title,
      imageUrl: artworks.imageUrl,
      medium: artworks.medium,
      year: artworks.year,
      displayOrder: exhibitionArtworks.displayOrder,
    })
    .from(exhibitionArtworks)
    .innerJoin(artworks, eq(exhibitionArtworks.artworkId, artworks.id))
    .where(and(eq(exhibitionArtworks.exhibitionId, id), eq(artworks.isPublic, true)))
    .orderBy(exhibitionArtworks.displayOrder);

  const [artist] = await db
    .select({ name: artistProfiles.displayName })
    .from(artistProfiles)
    .where(eq(artistProfiles.userId, exh.userId));

  return { ...exh, artworks: works, artistName: artist?.name ?? "Unknown" };
}
