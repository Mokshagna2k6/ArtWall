"use server";

import { z } from "zod";

import { recordAudit } from "@/features/physical-wall/audit";
import { getActor, hasRole, requireRole } from "@/features/physical-wall/authorize";
import { notify } from "@/features/physical-wall/notifications";
import {
  type ActionState,
  attempt,
  fail,
  formInput,
  ok,
  parseInput,
  PreconditionError,
  readSafely,
  type Result,
  toActionError,
} from "@/features/physical-wall/actions/shared";
import {
  createSignedIdentityViewUrl,
  createUploadSignature,
  IDENTITY_DELIVERY_TYPE,
  IDENTITY_DOC_FOLDER,
  IMAGE_UPLOAD_FORMATS,
  type UploadSignature,
} from "@/lib/cloudinary";
import { getSql } from "@/lib/db";

/**
 * SEC-2.08: a signed direct-upload for an identity document. Forces
 * `type: "authenticated"` (private delivery - never resolvable by public id
 * alone) via createUploadSignature's `type` option. No submission action
 * writes pw_identity_verifications yet (see the comment on that table in
 * src/lib/db/schema.ts), so nothing calls this today; it exists so whoever
 * wires up the submission flow gets the authenticated delivery type for free
 * instead of reaching for the public-upload signature every other photo path
 * here uses.
 */
export async function requestIdentityUploadSignature(): Promise<Result<UploadSignature>> {
  return attempt("requestIdentityUploadSignature", async () => {
    await requireRole("artist");
    return createUploadSignature(IDENTITY_DOC_FOLDER, {
      allowedFormats: IMAGE_UPLOAD_FORMATS,
      type: IDENTITY_DELIVERY_TYPE,
    });
  });
}

/**
 * SEC-2.08: a short-lived signed URL to view one identity document.
 *
 * Gated to the verification's owner or an admin (the role that reviews
 * identity documents here - see requireRole("admin") in reviewIdentity
 * below; this codebase has no narrower "identity-review" role, so admin is
 * the gate, same as the review action itself). Every successful access is
 * audit-logged with the viewer and the verification, so "who looked at this
 * person's ID and when" is answerable later.
 */
export async function getIdentityDocumentUrl(
  verificationId: string
): Promise<Result<{ url: string }>> {
  return attempt("getIdentityDocumentUrl", async () => {
    const actor = await getActor();
    if (!actor) throw new PreconditionError("Sign in required.");

    const id = parseInput(z.string().min(1).max(64), verificationId);

    const sql = getSql();
    const rows = (await sql`
      select user_id, doc_cloudinary_id from pw_identity_verifications
      where id = ${id}
      limit 1
    `) as { user_id: string; doc_cloudinary_id: string }[];
    const verification = rows[0];
    if (!verification) throw new PreconditionError("Not found.");

    const isOwner = verification.user_id === actor.id;
    // Not found, not "forbidden" - same reasoning as requireRolePage: telling
    // a non-owner, non-admin caller that the row exists but they lack access
    // would confirm the id is real and someone's identity document is behind
    // it, for no benefit to them.
    if (!isOwner && !hasRole(actor, "admin")) throw new PreconditionError("Not found.");

    const url = await createSignedIdentityViewUrl(verification.doc_cloudinary_id);

    await recordAudit({
      actor,
      action: "identity.document-viewed",
      subjectType: "identity_verification",
      subjectId: verificationId,
      after: { viewerIsOwner: isOwner },
    });

    return { url };
  });
}

export async function reviewIdentity(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("admin");
    const { verificationId, verdict, note } = formInput(
      z.object({
        verificationId: z.string({ error: "Which verification?" }).min(1, "Which verification?").max(64),
        verdict: z.enum(["approved", "rejected"], { error: "Approve or reject." }),
        note: z.string().trim().max(1000).default(""),
      }),
      formData
    );

    const sql = getSql();

    const rows = (await sql`
      update pw_identity_verifications
      set status = ${verdict}, reviewer_id = ${actor.id},
          review_note = ${note || null}, reviewed_at = now()
      where id = ${verificationId} and status = 'pending'
      returning user_id
    `) as { user_id: string }[];

    if (rows.length === 0) return fail("Already reviewed or not found.");

    const userId = rows[0].user_id;

    if (verdict === "approved") {
      await sql`update "user" set identity_verified = true where id = ${userId}`;
    }

    const user = (await sql`
      select email, name from "user" where id = ${userId} limit 1
    `) as { email: string; name: string }[];

    if (user.length > 0) {
      const to = { userId, email: user[0].email };
      if (verdict === "approved") await notify("identity.approved", to, { name: user[0].name });
      else await notify("identity.rejected", to, { name: user[0].name, note: note || null });
    }

    await recordAudit({
      actor,
      action: `identity.${verdict}`,
      subjectType: "identity_verification",
      subjectId: verificationId,
      after: { userId, note: note || null },
    });

    return ok(verdict === "approved" ? "Verified — payouts unlocked." : "Rejected — artist notified.");
  } catch (error) {
    return toActionError("reviewIdentity", error);
  }
}

export async function listPendingVerifications() {
  return readSafely("listPendingVerifications", [], loadPendingVerifications);
}

// Staff only: this returns names, emails and identity-document ids, and an
// exported server action is callable by anyone who has its id. The admin page
// gates itself, but the action must not rely on that.
async function loadPendingVerifications() {
  await requireRole("staff");
  const sql = getSql();
  return (await sql`
    select v.id, v.user_id, v.doc_cloudinary_id, v.doc_kind, v.created_at,
           u.name, u.email
    from pw_identity_verifications v
    join "user" u on u.id = v.user_id
    where v.status = 'pending'
    order by v.created_at asc
    limit 50
  `) as {
    id: string;
    user_id: string;
    doc_cloudinary_id: string;
    doc_kind: string;
    created_at: string;
    name: string;
    email: string;
  }[];
}
