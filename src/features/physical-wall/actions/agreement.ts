"use server";

import { updateTag } from "next/cache";
import { createHash } from "node:crypto";

import { recordAudit } from "@/features/physical-wall/audit";
import { requireRole } from "@/features/physical-wall/authorize";
import {
  agreementText,
  TERMS_VERSION,
  type AgreementFacts,
} from "@/features/physical-wall/agreement";
import { getCurrentRefundPolicy, getSettings } from "@/features/physical-wall/data/catalogs";
import {
  fail,
  newId,
  ok,
  toActionError,
  WALL_TAG,
  type ActionState,
} from "@/features/physical-wall/actions/shared";
import { getSql } from "@/lib/db";

/**
 * Signing the exhibition agreement (F20).
 *
 * The text is **rebuilt on the server** from the booking's stored facts and
 * hashed here — the browser's copy is never trusted, so a tampered form cannot
 * cause us to store an agreement nobody agreed to. The artist typing their name
 * is the signature; the hash is what makes it provable.
 *
 * Signing unlocks install scheduling, and its absence blocks go-live. That gate
 * lives in the ops action, not here, so an unsigned booking cannot be walked
 * past by calling a different endpoint.
 */

const GSTIN = "08ABFCA1595D1ZR";
const VENUE = "Ric Platter, Jaipur";

/** The facts an agreement is generated from, read fresh from the booking. */
async function factsFor(
  bookingId: string,
  artistId: string
): Promise<AgreementFacts | null> {
  const sql = getSql();

  const rows = (await sql`
    select b.id, b.start_date::text as start_date, b.end_date::text as end_date,
           b.duration_days, b.total_amount_paise, b.refund_policy_version,
           u.name as artist_name
    from pw_bookings b
    join "user" u on u.id = b.artist_id
    where b.id = ${bookingId} and b.artist_id = ${artistId}
    limit 1
  `) as Record<string, unknown>[];

  if (rows.length === 0) return null;
  const row = rows[0];

  const slots = (await sql`
    select s.label from pw_booking_slots bs
    join pw_slots s on s.id = bs.slot_id
    where bs.booking_id = ${bookingId}
    order by s.row_index asc, s.col_index asc
  `) as { label: string }[];

  const [settings, policy] = await Promise.all([
    getSettings(),
    getCurrentRefundPolicy(),
  ]);

  // The policy the *booking* was made under, not today's.
  const version = row.refund_policy_version
    ? Number(row.refund_policy_version)
    : null;

  let percentage = policy?.percentage ?? null;
  if (version !== null) {
    const snapshot = (await sql`
      select percentage from pw_refund_policy where version = ${version} limit 1
    `) as { percentage: number }[];
    percentage = snapshot[0] ? Number(snapshot[0].percentage) : percentage;
  }

  return {
    bookingId: String(row.id),
    artistName: String(row.artist_name),
    venueName: VENUE,
    slotLabels: slots.map((slot) => String(slot.label)),
    startDate: String(row.start_date),
    endDate: String(row.end_date),
    durationDays: Number(row.duration_days),
    totalPaise: Number(row.total_amount_paise),
    gstRatePct: settings.gstRateBp / 100,
    refundPercentage: percentage,
    refundPolicyVersion: version,
    gstin: GSTIN,
  };
}

/** The agreement as the artist will see it, before signing. */
export async function previewAgreement(
  bookingId: string
): Promise<{ ok: true; facts: AgreementFacts } | { ok: false; message: string }> {
  try {
    const actor = await requireRole("artist");
    const facts = await factsFor(bookingId, actor.id);
    if (!facts) return { ok: false, message: "We couldn't find that booking." };
    return { ok: true, facts };
  } catch (error) {
    console.error("[physical-wall] previewAgreement", error);
    return { ok: false, message: "Could not load the agreement." };
  }
}

export async function signAgreement(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("artist");

    const bookingId = String(formData.get("bookingId") ?? "");
    const typedName = String(formData.get("signedName") ?? "").trim();
    const agreed = formData.get("agreed") === "on";

    if (!bookingId) return fail("Which booking?");
    if (!agreed) return fail("Tick the box to sign.");
    if (typedName.length < 2) return fail("Type your full name to sign.");

    // A signature that doesn't match the account name isn't a signature. Compared
    // loosely — case and spacing vary — but it must be the same person.
    const normalise = (value: string) =>
      value.toLowerCase().replace(/\s+/g, " ").trim();
    if (normalise(typedName) !== normalise(actor.name)) {
      return fail(
        `Sign with the name on the account — ${actor.name}. Change your name in your profile first if it's wrong.`
      );
    }

    const facts = await factsFor(bookingId, actor.id);
    if (!facts) return fail("We couldn't find that booking.");
    if (facts.refundPercentage === null) {
      return fail(
        "No refund policy is published yet, so this agreement would not state its cancellation terms. Please contact us before signing."
      );
    }

    // Rebuilt server-side, never taken from the form.
    const body = agreementText(facts);
    const termsHash = createHash("sha256").update(body, "utf8").digest("hex");

    const sql = getSql();
    const inserted = (await sql`
      insert into pw_agreements
        (id, booking_id, artist_id, terms_version, terms_hash, body,
         refund_policy_version, total_amount_paise, signed_name)
      values (${newId("agr")}, ${bookingId}, ${actor.id}, ${TERMS_VERSION},
              ${termsHash}, ${body}, ${facts.refundPolicyVersion},
              ${facts.totalPaise}, ${typedName})
      on conflict (booking_id) do nothing
      returning id
    `) as { id: string }[];

    if (inserted.length === 0) {
      return fail("This booking is already signed.");
    }

    await recordAudit({
      actor,
      action: "agreement.signed",
      subjectType: "agreement",
      subjectId: inserted[0].id,
      after: {
        bookingId,
        termsVersion: TERMS_VERSION,
        termsHash,
        refundPolicyVersion: facts.refundPolicyVersion,
      },
    });

    updateTag(WALL_TAG);
    return ok("Signed. You can book an install window now.");
  } catch (error) {
    return toActionError("signAgreement", error);
  }
}
