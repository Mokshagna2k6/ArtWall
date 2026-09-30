"use server";

import { updateTag } from "next/cache";

import { getActor, hasRole, requireRole } from "@/features/physical-wall/authorize";
import { recordAuditIn } from "@/features/physical-wall/audit";
import {
  fail,
  firstIssue,
  inTransaction,
  newId,
  ok,
  WALL_TAG,
  type ActionState,
} from "@/features/physical-wall/actions/shared";
import { limitRequest, retryIn } from "@/lib/rate-limit";
import { getSql } from "@/lib/db";
import { notifyUser } from "@/features/physical-wall/notifications";
import { isOwnAsset } from "@/lib/cloudinary";
import { getSessionUser } from "@/lib/session";
import { currentUgcFolder, UGC_FORMATS } from "@/features/physical-wall/image-validation";
import { ugcSubmitSchema, ugcModerateSchema, ugcWithdrawSchema } from "@/features/physical-wall/schema";

export async function submitUgc(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    // 5 per 15 minutes per visitor (user id when signed in, else IP): a selfie
    // plus a couple of retakes. Moderation is manual, so the queue is the cost.
    const user = await getSessionUser();
    const limit = await limitRequest("pw-ugc", { limit: 5, windowMs: 15 * 60 * 1000 }, user?.id);
    if (!limit.ok) return fail(`Too many submissions. Try again in ${retryIn(limit)}.`);

    const parsed = ugcSubmitSchema.safeParse({
      caption: formData.get("caption"),
      imageUrl: formData.get("imageUrl"),
      cloudinaryId: formData.get("cloudinaryId"),
      visitId: formData.get("visitId") || undefined,
      consent: formData.get("consent") === "on",
      adultConfirmed: formData.get("adultConfirmed") === "on",
    });
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const { caption, imageUrl, cloudinaryId, visitId } = parsed.data;

    // The browser uploads straight to Cloudinary and reports back the URL and
    // public id, so both are untrusted. BE-2.08: the id must sit in THIS
    // uploader's folder (an HMAC of their user id or guest cookie, which only
    // our signature route hands out), so nobody can claim someone else's
    // upload. The URL must be our own asset and the very one the id names.
    const folder = await currentUgcFolder(false);
    if (
      !folder ||
      !cloudinaryId.startsWith(`${folder}/`) ||
      !isOwnAsset(imageUrl, folder) ||
      !new URL(imageUrl).pathname.includes(`/${cloudinaryId}.`)
    ) {
      return fail("That photo did not come from our uploader. Please upload it again.");
    }
    const format = new URL(imageUrl).pathname.split(".").pop()?.toLowerCase() ?? "";
    if (!(UGC_FORMATS as readonly string[]).includes(format)) {
      return fail("That file type isn't supported. Upload a JPEG, PNG, WebP, HEIC or GIF photo.");
    }

    // Signed-in submitters are linked so their UGC shows up in a DPDP export
    // and is erased with their account. A registered visitor is linked through
    // their visit; anyone else is an anonymous guest.
    const id = newId("ugc");

    const duplicate = await inTransaction(async (client) => {
      // One submission per photo (0029). Checked under an advisory lock on the
      // asset so a double-submit gets a clear answer rather than a 23505.
      await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`ugc:${cloudinaryId}`]);
      const seen = await client.query(`select 1 from pw_ugc_submissions where cloudinary_id = $1`, [cloudinaryId]);
      if (seen.rowCount) return true;

      let visitorId: string | null = null;
      if (!user && visitId) {
        const visit = await client.query<{ visitor_id: string }>(
          `select visitor_id from pw_visits where id = $1`,
          [visitId]
        );
        visitorId = visit.rows[0]?.visitor_id ?? null;
      }

      // One live 'ugc_publication' consent per person (unique partial index),
      // reused across their submissions; a guest's consent is per submission.
      let consentId: string | null = null;
      if (user || visitorId) {
        const live = await client.query<{ id: string }>(
          `select id from pw_consents
           where purpose = 'ugc_publication' and withdrawn_at is null
             and ${user ? "user_id" : "visitor_id"} = $1
           limit 1`,
          [user?.id ?? visitorId]
        );
        consentId = live.rows[0]?.id ?? null;
      }
      if (!consentId) {
        consentId = newId("cns");
        await client.query(
          `insert into pw_consents (id, user_id, visitor_id, purpose, granted, notice_version)
           values ($1, $2, $3, 'ugc_publication', true, 'v1')`,
          [consentId, user?.id ?? null, visitorId]
        );
      }

      await client.query(
        `insert into pw_ugc_submissions
           (id, user_id, visitor_id, caption, cloudinary_id, url, consent_id, status, kind)
         values ($1, $2, $3, $4, $5, $6, $7, 'pending', 'selfie')`,
        [id, user?.id ?? null, visitorId, caption, cloudinaryId, imageUrl, consentId]
      );

      await recordAuditIn(client, {
        actor: null,
        action: "ugc.submitted",
        subjectType: "ugc",
        subjectId: id,
        after: { hasVisit: Boolean(visitId), captionLength: caption.length },
      });
      return false;
    });
    if (duplicate) return fail("That photo has already been submitted.");

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
      `select id, status, cloudinary_id, url, caption, visitor_id, kind, user_id
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
      user_id: string | null;
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

    // Guests left no address; signed-in submitters hear the outcome.
    if (row.user_id) {
      const caption = row.caption || "your photo";
      if (verdict === "approved") await notifyUser("ugc.approved", row.user_id, () => ({ caption }));
      else await notifyUser("ugc.removed", row.user_id, () => ({ caption }));
    }

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
    const parsed = ugcWithdrawSchema.safeParse({ submissionId: formData.get("submissionId") });
    if (!parsed.success) return fail("Which submission?");
    const { submissionId } = parsed.data;

    const sql = getSql();
    const rows = (await sql`
      select id, status, cloudinary_id, url, user_id
      from pw_ugc_submissions
      where id = ${submissionId}
      limit 1
    `) as { id: string; status: string; cloudinary_id: string; url: string; user_id: string | null }[];

    // Only the submitter (their account, or the guest cookie whose folder the
    // photo was uploaded into) or staff may withdraw. Gallery rows expose the
    // submission id publicly, so an id alone must not be enough.
    const actor = await getActor();
    const folder = await currentUgcFolder(false);
    const mine =
      rows[0] &&
      (hasRole(actor, "staff") ||
        (actor && rows[0].user_id === actor.id) ||
        (folder && rows[0].cloudinary_id.startsWith(`${folder}/`)));
    if (!mine) return fail("No such submission.");

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
