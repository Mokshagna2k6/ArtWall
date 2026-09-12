"use server";

import { recordAudit } from "@/features/physical-wall/audit";
import { requireRole } from "@/features/physical-wall/authorize";
import { queueNotification } from "@/features/physical-wall/notifications";
import {
  fail,
  newId,
  ok,
  toActionError,
  type ActionState,
} from "@/features/physical-wall/actions/shared";
import { getSql } from "@/lib/db";

export async function reviewIdentity(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("admin");
    const verificationId = String(formData.get("verificationId") ?? "");
    const verdict = String(formData.get("verdict") ?? "");
    const note = String(formData.get("note") ?? "").trim();

    if (!verificationId) return fail("Which verification?");
    if (verdict !== "approved" && verdict !== "rejected") return fail("Approve or reject.");

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
      await queueNotification({
        userId,
        recipient: user[0].email,
        subject: verdict === "approved"
          ? "Identity verified — payouts are now enabled"
          : "Identity verification needs attention",
        body: verdict === "approved"
          ? `Hi ${user[0].name},\n\nYour identity has been verified. You can now receive payouts for your exhibitions.\n\n— Artwall Labs`
          : `Hi ${user[0].name},\n\nWe could not verify your identity from the document you submitted.${note ? `\n\nNote: ${note}` : ""}\n\nPlease upload a clearer image and try again.\n\n— Artwall Labs`,
        kind: verdict === "approved" ? "identity.approved" : "identity.rejected",
      });
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
