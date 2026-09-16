"use server";

import { updateTag } from "next/cache";
import { createHash } from "node:crypto";
import { headers } from "next/headers";

import { requireRole } from "@/features/physical-wall/authorize";
import { recordAuditIn } from "@/features/physical-wall/audit";
import {
  fail,
  firstIssue,
  inTransaction,
  newId,
  ok,
  toActionError,
  WALL_TAG,
  type ActionState,
} from "@/features/physical-wall/actions/shared";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSql } from "@/lib/db";
import { ugcSubmitSchema, ugcModerateSchema } from "@/features/physical-wall/schema";

async function rotatingKey(prefix: string): Promise<string> {
  const headerList = await headers();
  const ip =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerList.get("x-real-ip") ||
    "unknown";
  const hour = Math.floor(Date.now() / 3_600_000);
  return `${prefix}:${createHash("sha256").update(`${ip}:${hour}`).digest("hex").slice(0, 16)}`;
}

export async function submitUgc(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const limit = checkRateLimit(await rotatingKey("pw-ugc"), {
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });
    if (!limit.ok) return fail("Too many submissions. Try again shortly.");

    const parsed = ugcSubmitSchema.safeParse({
      caption: formData.get("caption"),
      imageUrl: formData.get("imageUrl"),
      visitId: formData.get("visitId") || undefined,
      consent: formData.get("consent") === "on",
      adultConfirmed: formData.get("adultConfirmed") === "on",
    });
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const { caption, imageUrl, visitId } = parsed.data;

    const sql = getSql();
    const id = newId("ugc");
    const consentId = newId("cns");

    await sql`
      insert into pw_consents (id, purpose, granted, notice_version)
      values (${consentId}, 'ugc_display', true, 'v1')
    `;

    await inTransaction(async (client) => {
      await client.query(
        `insert into pw_ugc_submissions
           (id, visitor_id, caption, cloudinary_id, url, consent_id, status, kind)
         values ($1, $2, $3, $4, $5, $6, 'pending', 'selfie')`,
        [id, visitId ?? null, caption, imageUrl, imageUrl, consentId]
      );

      await recordAuditIn(client, {
        actor: null,
        action: "ugc.submitted",
        subjectType: "ugc",
        subjectId: id,
        after: { hasVisit: Boolean(visitId), captionLength: caption.length },
      });
    });

    updateTag(WALL_TAG);
    return ok("Submitted for moderation. We'll let you know when it's live.");
  } catch (error) {
    console.error("[physical-wall] submitUgc", error);
    return fail("That didn't submit. Try again.");
  }
}

export async function moderateUgc(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("staff");

    const parsed = ugcModerateSchema.safeParse({
      submissionId: formData.get("submissionId"),
      verdict: formData.get("verdict"),
    });
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const { submissionId, verdict } = parsed.data;

    const sql = getSql();

    const existing = (await sql.query(
      `select id, status, cloudinary_id, url, caption, visitor_id, kind
       from pw_ugc_submissions
       where id = $1
       limit 1`,
      [submissionId]
    )) as Record<string, unknown>[];

    if (existing.length === 0) return fail("No such submission.");

    const row = existing[0] as {
      id: string;
      status: string;
      cloudinary_id: string;
      url: string;
      caption: string;
      visitor_id: string | null;
      kind: string;
    };

    if (row.status === "approved" || row.status === "rejected") {
      return fail("That submission has already been moderated.");
    }

    await inTransaction(async (client) => {
      if (verdict === "removed") {
        await client.query(
          `update pw_ugc_submissions
           set status = 'rejected', removed_at = now(), moderator_id = $2, moderation_note = $3
           where id = $1`,
          [submissionId, actor.id, "removed by moderator"]
        );

        await recordAuditIn(client, {
          actor,
          action: "ugc.removed",
          subjectType: "ugc",
          subjectId: submissionId,
          before: { status: row.status },
          after: null,
        });
      } else {
        await client.query(
          `update pw_ugc_submissions
           set status = 'approved', moderator_id = $2, reviewed_at = now()
           where id = $1`,
          [submissionId, actor.id]
        );

        const galleryId = newId("gal");
        await client.query(
          `insert into pw_community_gallery
             (id, submission_id, image_url, caption, byline)
            values ($1, $2, $3, $4, $5)
            on conflict (submission_id) do nothing`,
          [
            galleryId,
            submissionId,
            String(row.url),
            row.caption || "Spotted at The Wall",
            row.visitor_id ? "Visitor" : "Guest",
          ]
        );

        await recordAuditIn(client, {
          actor,
          action: "ugc.approved",
          subjectType: "ugc",
          subjectId: submissionId,
          before: { status: row.status },
          after: { galleryId, kind: row.kind },
        });
      }
    });

    updateTag(WALL_TAG);
    return ok(
      verdict === "approved"
        ? "Approved — it's now in the community gallery."
        : "Removed — deleted from the queue."
    );
  } catch (error) {
    console.error("[physical-wall] moderateUgc", error);
    return fail("That didn't work. The error has been logged.");
  }
}

export async function listPendingUgc(): Promise<
  { id: string; caption: string; imageUrl: string; cloudinaryId: string; kind: string; createdAt: string }[]
> {
  try {
    const sql = getSql();
    const rows = (await sql`
      select id, caption, url, cloudinary_id, kind, created_at
      from pw_ugc_submissions
      where status = 'pending'
      order by created_at asc
      limit 100
    `) as Record<string, unknown>[];
    return rows.map((row) => ({
      id: String(row.id),
      caption: String(row.caption),
      imageUrl: String(row.url),
      cloudinaryId: String(row.cloudinary_id),
      kind: String(row.kind),
      createdAt: String(row.created_at),
    }));
  } catch (error) {
    console.error("[physical-wall] listPendingUgc", error);
    return [];
  }
}

export async function listCommunityGallery(): Promise<
  { id: string; submissionId: string; imageUrl: string; caption: string; byline: string }[]
> {
  try {
    const sql = getSql();
    const rows = (await sql`
      select id, submission_id, image_url, caption, byline
      from pw_community_gallery
      order by sort_order asc, created_at desc
      limit 200
    `) as Record<string, unknown>[];
    return rows.map((row) => ({
      id: String(row.id),
      submissionId: String(row.submission_id),
      imageUrl: String(row.image_url),
      caption: String(row.caption),
      byline: String(row.byline),
    }));
  } catch (error) {
    console.error("[physical-wall] listCommunityGallery", error);
    return [];
  }
}

export async function withdrawUgc(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const submissionId = String(formData.get("submissionId") ?? "");
    if (!submissionId) return fail("Which submission?");

    const sql = getSql();
    const rows = (await sql`
      select id, status, cloudinary_id, url
      from pw_ugc_submissions
      where id = ${submissionId}
      limit 1
    `) as { id: string; status: string; cloudinary_id: string; url: string }[];

    if (rows.length === 0) return fail("No such submission.");

    await inTransaction(async (client) => {
      await client.query(
        `update pw_ugc_submissions
         set status = 'rejected', withdrawn_at = now(), removed_at = now()
         where id = $1`,
        [submissionId]
      );

      await client.query(
        `delete from pw_community_gallery where submission_id = $1`,
        [submissionId]
      );

      await recordAuditIn(client, {
        actor: null,
        action: "ugc.withdrawn",
        subjectType: "ugc",
        subjectId: submissionId,
        before: { status: rows[0].status },
        after: null,
      });
    });

    updateTag(WALL_TAG);
    return ok("Withdrawn and removed from the gallery.");
  } catch (error) {
    console.error("[physical-wall] withdrawUgc", error);
    return fail("That didn't work. The error has been logged.");
  }
}
