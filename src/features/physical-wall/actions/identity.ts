"use server";

import { z } from "zod";

import { recordAudit } from "@/features/physical-wall/audit";
import { requireRole } from "@/features/physical-wall/authorize";
import { notify } from "@/features/physical-wall/notifications";
import {
  type ActionState,
  fail,
  formInput,
  ok,
  readSafely,
  toActionError,
} from "@/features/physical-wall/actions/shared";
import { getSql } from "@/lib/db";

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

    // DB-3.01: artist_verification_status mirrors the same review verdict
    // identity_verified already tracks — one write path, two columns.
    await sql`update "user" set artist_verification_status = ${verdict} where id = ${userId}`;
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
