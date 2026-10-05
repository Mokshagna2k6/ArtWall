"use server";

import { z } from "zod";

import { recordAuditIn } from "@/features/physical-wall/audit";
import { requireRole } from "@/features/physical-wall/authorize";
import {
  type ActionState,
  attempt,
  fail,
  formInput,
  inTransaction,
  newId,
  ok,
  PreconditionError,
  type Result,
  toActionError,
} from "@/features/physical-wall/actions/shared";
import { createUploadSignature, IMAGE_UPLOAD_FORMATS, isOwnAsset, type UploadSignature } from "@/lib/cloudinary";

/**
 * Condition reports (BE-1.36, BE-1.37). Staff/admin only.
 *
 * Photos are uploaded straight to Cloudinary (folder CONDITION_FOLDER) and
 * then recorded here by public id + URL; the URL is checked to be our own
 * asset in that folder, and to actually be the public id it claims.
 */

const CONDITION_FOLDER = "artwall/condition";

/** Staff: a signed direct-upload for a condition photo (folder artwall/condition). */
export async function requestConditionUploadSignature(): Promise<Result<UploadSignature>> {
  return attempt("requestConditionUploadSignature", async () => {
    await requireRole("staff");
    return createUploadSignature(CONDITION_FOLDER, { allowedFormats: IMAGE_UPLOAD_FORMATS });
  });
}

/**
 * Form fields: bookingId, stage ('install' | 'deinstall'), itemKey (checklist
 * item, e.g. "frame" or "wall-surface"), cloudinaryId, url, slotId (optional).
 */
export async function addConditionPhoto(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireRole("staff");
    const input = formInput(
      z.object({
        bookingId: z.string({ error: "Which booking and checklist item?" }).min(1, "Which booking and checklist item?").max(64),
        itemKey: z.string({ error: "Which booking and checklist item?" }).trim().min(1, "Which booking and checklist item?").max(100),
        stage: z.enum(["install", "deinstall"], { error: "Stage must be install or de-install." }),
        cloudinaryId: z.string().trim().max(300).default(""),
        url: z.string().trim().max(1000).default(""),
        slotId: z.string().max(64).optional(),
      }),
      formData
    );
    const { bookingId, itemKey, stage, cloudinaryId, url } = input;
    const slotId = input.slotId || null;
    if (!cloudinaryId.startsWith(`${CONDITION_FOLDER}/`) || !isOwnAsset(url, CONDITION_FOLDER) || !url.includes(`/${cloudinaryId}`)) {
      return fail("That photo isn't a condition-report upload.");
    }

    const id = await inTransaction(async (client) => {
      const booking = await client.query(`select 1 from pw_bookings where id = $1`, [bookingId]);
      if (!booking.rowCount) throw new PreconditionError("No such booking.");
      if (slotId) {
        const onBooking = await client.query(`select 1 from pw_booking_slots where booking_id = $1 and slot_id = $2`, [bookingId, slotId]);
        if (!onBooking.rowCount) throw new PreconditionError("That slot isn't on this booking.");
      }
      const photoId = newId("cp");
      await client.query(
        `insert into pw_condition_photos (id, booking_id, slot_id, item_key, cloudinary_id, url, stage, uploaded_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [photoId, bookingId, slotId, itemKey, cloudinaryId, url, stage, actor.id]
      );
      await recordAuditIn(client, {
        actor,
        action: "condition.photo-added",
        subjectType: "booking",
        subjectId: bookingId,
        after: { photoId, stage, itemKey },
      });
      return photoId;
    });
    return ok("Condition photo saved.", { id });
  } catch (error) {
    return toActionError("addConditionPhoto", error);
  }
}

/**
 * Form fields: bookingId, itemKey, description (≥ 5 chars), severity
 * ('minor' | 'major'), photoId (optional, a condition photo on this booking),
 * slotId (optional). The artwork is taken from the booking, not the form.
 */
export async function recordDamage(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await requireRole("staff");
    const input = formInput(
      z.object({
        bookingId: z.string({ error: "Which booking and checklist item?" }).min(1, "Which booking and checklist item?").max(64),
        itemKey: z.string({ error: "Which booking and checklist item?" }).trim().min(1, "Which booking and checklist item?").max(100),
        description: z.string({ error: "Describe the damage." }).trim().min(5, "Describe the damage.").max(2000),
        severity: z.enum(["minor", "major"], { error: "Severity must be minor or major." }).default("minor"),
        photoId: z.string().max(64).optional(),
        slotId: z.string().max(64).optional(),
      }),
      formData
    );
    const { bookingId, itemKey, description, severity } = input;
    const photoId = input.photoId || null;
    const slotId = input.slotId || null;

    const id = await inTransaction(async (client) => {
      const booking = await client.query<{ artwork_id: string | null }>(
        `select artwork_id from pw_bookings where id = $1`,
        [bookingId]
      );
      if (!booking.rowCount) throw new PreconditionError("No such booking.");
      if (photoId) {
        const photo = await client.query(`select 1 from pw_condition_photos where id = $1 and booking_id = $2`, [photoId, bookingId]);
        if (!photo.rowCount) throw new PreconditionError("That photo isn't on this booking.");
      }
      const damageId = newId("dmg");
      await client.query(
        `insert into pw_damage_records (id, booking_id, slot_id, item_key, description, severity, photo_id, artwork_id, recorded_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [damageId, bookingId, slotId, itemKey, description, severity, photoId, booking.rows[0].artwork_id, actor.id]
      );
      await recordAuditIn(client, {
        actor,
        action: "condition.damage-recorded",
        subjectType: "booking",
        subjectId: bookingId,
        after: { damageId, itemKey, severity, artworkId: booking.rows[0].artwork_id },
      });
      return damageId;
    });
    return ok("Damage recorded.", { id });
  } catch (error) {
    return toActionError("recordDamage", error);
  }
}
