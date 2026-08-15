"use server";

import { updateTag } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/features/physical-wall/audit";
import { getActor, requireRole } from "@/features/physical-wall/authorize";
import {
  GRIEVANCE_RESPONSE_DAYS,
  NOTICE_VERSION,
  PURPOSES,
  type ConsentPurpose,
} from "@/features/physical-wall/consent";
import { mintQrToken } from "@/features/physical-wall/qr";
import {
  fail,
  firstIssue,
  newId,
  ok,
  toActionError,
  WALL_TAG,
  type ActionState,
} from "@/features/physical-wall/actions/shared";
import { getSql } from "@/lib/db";

/**
 * The account: onboarding, consent, and the data-principal rights (§5.2, §5.3).
 *
 * These are features, not policy documents. The Act is explicit that access,
 * correction, erasure, grievance, nomination and withdrawal have to be things a
 * person can *do* — so each one here is a server action reachable from one
 * screen, and withdrawal in particular is a single click with no confirmation
 * maze, because "as easy as giving consent" is the standard.
 */

const PURPOSE_IDS = PURPOSES.map((p) => p.purpose) as [
  ConsentPurpose,
  ...ConsentPurpose[],
];

const onboardingSchema = z.object({
  /** Required. Without it there is no account to have. */
  account: z.literal(true, {
    error: "We can't open an account without this one.",
  }),
  profilePublication: z.coerce.boolean().default(false),
  marketing: z.coerce.boolean().default(false),
  /** DPDP §5.4: under-18s need a verifiable parental-consent path, not a tick. */
  isAdult: z.literal(true, {
    error:
      "ArtWall accounts are for over-18s. If you're under 18, ask a parent or guardian to contact us and we'll set you up properly.",
  }),
  foundingMember: z.coerce.boolean().default(false),
});

/**
 * Finish registration (F31).
 *
 * Runs after the credential step, for every route in — including Google, which
 * cannot carry checkboxes through an OAuth redirect. That is why this is a gate
 * rather than a longer sign-up form: it is the only place both paths meet.
 *
 * Issues the artist's personal QR here too, so the coupon exists from the
 * moment the account does rather than being minted on first use.
 */
export async function completeOnboarding(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("artist");

    const parsed = onboardingSchema.safeParse({
      account: formData.get("account") === "on",
      profilePublication: formData.get("profile_publication") === "on",
      marketing: formData.get("marketing") === "on",
      isAdult: formData.get("isAdult") === "on",
      foundingMember: formData.get("foundingMember") === "on",
    });
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const input = parsed.data;
    const sql = getSql();

    const granted: ConsentPurpose[] = ["account"];
    if (input.profilePublication) granted.push("profile_publication");
    if (input.marketing) granted.push("marketing");

    for (const purpose of granted) {
      await sql`
        insert into pw_consents (id, user_id, purpose, granted, notice_version)
        values (${newId("con")}, ${actor.id}, ${purpose}, true, ${NOTICE_VERSION})
        on conflict (user_id, purpose) where withdrawn_at is null and user_id is not null
        do nothing
      `;
    }

    await sql`
      update "user"
      set "ageDeclaredAdult" = true,
          "foundingMember" = ${input.foundingMember},
          "onboardedAt" = now()
      where id = ${actor.id}
    `;

    // The artist's coupon (F31/RP01). Minted once; re-running onboarding does
    // not issue a second one.
    const existing = (await sql`
      select token from pw_qr_tokens
      where subject_type = 'artist' and subject_id = ${actor.id} and revoked_at is null
      limit 1
    `) as { token: string }[];

    if (existing.length === 0) {
      await sql`
        insert into pw_qr_tokens (token, subject_type, subject_id)
        values (${mintQrToken()}, 'artist', ${actor.id})
      `;
    }

    await recordAudit({
      actor,
      action: "account.onboarded",
      subjectType: "user",
      subjectId: actor.id,
      after: {
        consents: granted,
        foundingMember: input.foundingMember,
        noticeVersion: NOTICE_VERSION,
      },
    });

    updateTag(WALL_TAG);
    return ok("You're set up. Welcome to the wall.");
  } catch (error) {
    return toActionError("completeOnboarding", error);
  }
}

/**
 * Grant or withdraw one purpose (§5.2).
 *
 * One purpose at a time, by design. Withdrawal is a single submit with no
 * "are you sure" — the Act says withdrawal must be as easy as giving consent,
 * and a confirmation dialog on the way out but not on the way in is precisely
 * the asymmetry it forbids.
 *
 * `account` cannot be withdrawn here: that is account closure, which is the
 * erasure flow below and needs to say what happens to paid bookings first.
 */
export async function setConsent(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("artist");

    const purpose = String(formData.get("purpose") ?? "");
    const next = String(formData.get("next") ?? "");

    if (!PURPOSE_IDS.includes(purpose as ConsentPurpose)) {
      return fail("Unknown purpose.");
    }
    if (next !== "grant" && next !== "withdraw") return fail("Unknown action.");
    if (purpose === "account" && next === "withdraw") {
      return fail(
        "Withdrawing account consent closes the account — use 'Delete my data' below, which explains what happens to your bookings."
      );
    }

    const sql = getSql();

    if (next === "withdraw") {
      await sql`
        update pw_consents set withdrawn_at = now()
        where user_id = ${actor.id} and purpose = ${purpose} and withdrawn_at is null
      `;

      // Withdrawal has to actually stop the processing, not just record an
      // intention. Unpublishing here is that.
      if (purpose === "profile_publication") {
        await sql`
          update artist_profiles set published = false
          where "userId" = ${actor.id}
        `;
      }
    } else {
      await sql`
        insert into pw_consents (id, user_id, purpose, granted, notice_version)
        values (${newId("con")}, ${actor.id}, ${purpose}, true, ${NOTICE_VERSION})
        on conflict (user_id, purpose) where withdrawn_at is null and user_id is not null
        do nothing
      `;
    }

    await recordAudit({
      actor,
      action: `consent.${next}`,
      subjectType: "consent",
      subjectId: actor.id,
      after: { purpose, noticeVersion: NOTICE_VERSION },
    });

    updateTag(WALL_TAG);
    return ok(
      next === "withdraw"
        ? "Withdrawn. We've stopped processing for that purpose."
        : "Thank you — that's on."
    );
  } catch (error) {
    return toActionError("setConsent", error);
  }
}

/**
 * Everything we hold about you, as JSON (§5.3 access & summary).
 *
 * Assembled at request time rather than from a cached profile, so it reflects
 * the database rather than a summary that has drifted from it. Returned as a
 * string for the browser to save — that keeps it inside this action's auth
 * check instead of needing a separately-guarded download route.
 */
export async function exportMyData(): Promise<
  { ok: true; json: string; filename: string } | { ok: false; message: string }
> {
  try {
    const actor = await requireRole("artist");
    const sql = getSql();

    const [account, profile, consents, bookings, agreements, feedback, grievances] =
      await Promise.all([
        sql`select id, name, email, role, "foundingMember", "verifiedAt",
                   "ageDeclaredAdult", "onboardedAt", "nomineeName", "nomineeContact",
                   "createdAt"
            from "user" where id = ${actor.id}`,
        sql`select handle, "displayName", discipline, location, bio, website,
                   instagram, published, "createdAt"
            from artist_profiles where "userId" = ${actor.id}`,
        sql`select purpose, granted, notice_version, granted_at, withdrawn_at
            from pw_consents where user_id = ${actor.id} order by granted_at`,
        sql`select id, status, start_date::text as start_date, end_date::text as end_date,
                   duration_days, total_amount_paise, refund_policy_version, created_at
            from pw_bookings where artist_id = ${actor.id} order by created_at`,
        sql`select id, booking_id, terms_version, terms_hash, total_amount_paise,
                   signed_name, signed_at
            from pw_agreements where artist_id = ${actor.id} order by signed_at`,
        sql`select booking_id, rating, nps, note, created_at
            from pw_feedback where artist_id = ${actor.id}`,
        sql`select id, subject, status, created_at, responded_at
            from pw_grievances where user_id = ${actor.id}`,
      ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      notice:
        "Everything ArtWall holds that identifies you. Amounts are in paise. " +
        "Aggregate signals such as scan and reaction counts are not listed because they are not linked to you.",
      account,
      artistProfile: profile,
      consents,
      physicalWallBookings: bookings,
      agreements,
      feedback,
      grievances,
    };

    return {
      ok: true,
      json: JSON.stringify(payload, null, 2),
      filename: `artwall-my-data-${new Date().toISOString().slice(0, 10)}.json`,
    };
  } catch (error) {
    console.error("[physical-wall] exportMyData", error);
    return { ok: false, message: "Could not build the export." };
  }
}

/**
 * Erasure (§5.3).
 *
 * "Erase or irreversibly anonymise, **except records law requires we keep**" —
 * so this anonymises rather than deletes, and says so before it runs. Bookings,
 * payments and signed agreements are contract and tax records; destroying them
 * would breach a different obligation than the one being honoured.
 *
 * What actually goes: the name, the email, the profile, the consent contact
 * trail. What stays is a booking row whose artist is a tombstone.
 */
export async function eraseMyData(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("artist");

    if (String(formData.get("confirm") ?? "") !== "DELETE") {
      return fail("Type DELETE to confirm.");
    }

    const sql = getSql();
    const tombstone = `deleted-${newId("u")}@removed.artwalllabs.com`;

    // Live holds are released first: an anonymised account cannot be chased for
    // payment, and leaving slots held by a ghost blocks the wall.
    await sql`
      update pw_bookings set status = 'cancelled', hold_expires_at = null
      where artist_id = ${actor.id} and status = 'held'
    `;
    await sql`
      update pw_slots set state = 'available', version = version + 1
      where state = 'reserved' and id in (
        select bs.slot_id from pw_booking_slots bs
        join pw_bookings b on b.id = bs.booking_id
        where b.artist_id = ${actor.id} and b.status = 'cancelled'
      )
    `;

    await sql`delete from artist_profiles where "userId" = ${actor.id}`;
    await sql`update pw_qr_tokens set revoked_at = now()
              where subject_type = 'artist' and subject_id = ${actor.id}`;
    await sql`update pw_consents set withdrawn_at = now()
              where user_id = ${actor.id} and withdrawn_at is null`;
    await sql`update pw_feedback set note = null where artist_id = ${actor.id}`;

    await sql`
      update "user"
      set name = 'Deleted account',
          email = ${tombstone},
          image = null,
          "nomineeName" = null,
          "nomineeContact" = null,
          role = 'visitor'
      where id = ${actor.id}
    `;

    await recordAudit({
      actor: null,
      action: "account.erased",
      subjectType: "user",
      subjectId: actor.id,
      after: {
        method: "anonymised",
        retained: "bookings, payments and signed agreements (tax and contract law)",
      },
    });

    updateTag(WALL_TAG);
    return ok(
      "Done. Your name, email and profile are gone. Bookings, payments and signed agreements are kept in anonymised form because tax and contract law require it. Sign out to finish."
    );
  } catch (error) {
    return toActionError("eraseMyData", error);
  }
}

const grievanceSchema = z.object({
  subject: z.string().trim().min(3, "Give it a short subject.").max(140),
  body: z.string().trim().min(10, "Tell us what happened.").max(4000),
  contact: z.string().trim().min(3, "How should we reply?").max(140),
});

/**
 * Raise a grievance (§5.3).
 *
 * Open to anyone signed in, at any role — a complaint about how their data was
 * handled should not require the complainant to still be in good standing.
 * The response clock is written onto the row at creation.
 */
export async function raiseGrievance(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await getActor();

    const parsed = grievanceSchema.safeParse({
      subject: formData.get("subject"),
      body: formData.get("body"),
      contact: formData.get("contact"),
    });
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const sql = getSql();
    const id = newId("gr");

    await sql`
      insert into pw_grievances (id, user_id, contact, subject, body, due_at)
      values (${id}, ${actor?.id ?? null}, ${parsed.data.contact},
              ${parsed.data.subject}, ${parsed.data.body},
              now() + (${String(GRIEVANCE_RESPONSE_DAYS)} || ' days')::interval)
    `;

    await recordAudit({
      actor,
      action: "grievance.raised",
      subjectType: "grievance",
      subjectId: id,
      after: { subject: parsed.data.subject },
    });

    return ok(
      `Received. A named person will reply to you within ${GRIEVANCE_RESPONSE_DAYS} days.`
    );
  } catch (error) {
    return toActionError("raiseGrievance", error);
  }
}

/**
 * Nominate someone to exercise your rights (§5.3).
 *
 * Required by the Act and easy to forget. Stored on the user row rather than in
 * its own table because it is one name and one contact, and a table would be
 * ceremony around two columns.
 */
export async function setNominee(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const actor = await requireRole("artist");

    const name = String(formData.get("nomineeName") ?? "").trim();
    const contact = String(formData.get("nomineeContact") ?? "").trim();

    if (name && !contact) return fail("Add a way to reach your nominee.");
    if (name.length > 120 || contact.length > 160) return fail("That's too long.");

    const sql = getSql();
    await sql`
      update "user"
      set "nomineeName" = ${name || null}, "nomineeContact" = ${contact || null}
      where id = ${actor.id}
    `;

    await recordAudit({
      actor,
      action: name ? "account.nominee.set" : "account.nominee.cleared",
      subjectType: "user",
      subjectId: actor.id,
    });

    return ok(
      name
        ? `${name} can now exercise your rights on your behalf.`
        : "Nominee removed."
    );
  } catch (error) {
    return toActionError("setNominee", error);
  }
}
