"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { recordAudit, recordAuditIn } from "@/features/physical-wall/audit";
import {
  eraseUserIn,
  exportUserData,
  logDataRightsRequest,
  processAssetDeletions,
} from "@/features/physical-wall/data-rights";
import { pool } from "@/lib/db/index";
import { getActor, requireRole } from "@/features/physical-wall/authorize";
import {
  GRIEVANCE_RESPONSE_DAYS,
  NOTICE_VERSION,
  PURPOSES,
  type ConsentPurpose,
} from "@/features/physical-wall/consent";
import { mintQrToken } from "@/features/physical-wall/qr";
import {
  type ActionState,
  fail,
  firstIssue,
  formInput,
  inTransaction,
  newId,
  ok,
  toActionError,
  WALL_TAG,
} from "@/features/physical-wall/actions/shared";
import { notify } from "@/features/physical-wall/notifications";
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

    const { purpose, next } = formInput(
      z.object({
        purpose: z.enum(PURPOSE_IDS, { error: "Unknown purpose." }),
        next: z.enum(["grant", "withdraw"], { error: "Unknown action." }),
      }),
      formData
    );
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
    await logDataRightsRequest(pool, actor.id, "export", "requested");
    let payload: Awaited<ReturnType<typeof exportUserData>>;
    try {
      payload = await exportUserData(actor.id);
    } catch (error) {
      await logDataRightsRequest(pool, actor.id, "export", "failed").catch(() => {});
      throw error;
    }
    await logDataRightsRequest(pool, actor.id, "export", "completed", {
      categories: Object.keys(payload).filter((k) => Array.isArray(payload[k as keyof typeof payload])),
    });

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
 * Erasure (§5.3). What is deleted, what is kept and why: data-rights.ts.
 *
 * One transaction for every DB change (BE-1.28), including sign-in sessions
 * and OAuth links (BE-1.29/1.30). Cloudinary files are deleted after commit
 * from a durable queue that the data-retention cron retries (BE-1.31/1.32).
 */
export async function eraseMyData(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  let pending: string | null = null; // user id once "requested" is logged, until "completed" commits
  try {
    const actor = await requireRole("artist");

    formInput(z.object({ confirm: z.literal("DELETE", { error: "Type DELETE to confirm." }) }), formData);

    // Requested is logged on its own, before the erasure: a failed erasure
    // still leaves a record that it was asked for (BE-2.22).
    await logDataRightsRequest(pool, actor.id, "erasure", "requested");
    pending = actor.id;
    await inTransaction(async (client) => {
      const { assetsQueued } = await eraseUserIn(client, actor.id);
      await logDataRightsRequest(client, actor.id, "erasure", "completed", { assetsQueued });
      await recordAuditIn(client, {
        actor: null,
        action: "account.erased",
        subjectType: "user",
        subjectId: actor.id,
        after: {
          method: "deleted + pseudonymised",
          assetsQueued,
          retained: "bookings, payments, refunds, invoices, ledger (tax law); agreements (contract law); withdrawn consents, grievances, audit log (accountability), all pseudonymised",
        },
      });
    });
    pending = null;

    await processAssetDeletions();

    updateTag(WALL_TAG);
  } catch (error) {
    if (pending) await logDataRightsRequest(pool, pending, "erasure", "failed").catch(() => {});
    return toActionError("eraseMyData", error);
  }
  // The sessions are gone, so re-rendering the account page would bounce to
  // sign-in and the result would never be seen. Land on the confirmation instead.
  // Outside the try: redirect() works by throwing.
  redirect("/physical-wall/account/erased");
}

const grievanceSchema = z.object({
  subject: z.string({ error: "Give it a short subject." }).trim().min(3, "Give it a short subject.").max(140),
  body: z.string({ error: "Tell us what happened." }).trim().min(10, "Tell us what happened.").max(4000),
  contact: z.string({ error: "How should we reply?" }).trim().min(3, "How should we reply?").max(140),
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

    const ack = { subject: parsed.data.subject, dueDays: GRIEVANCE_RESPONSE_DAYS };
    if (!(await notify("grievance.received", { userId: actor?.id, email: parsed.data.contact }, ack)) && actor) {
      await notify("grievance.received", { userId: actor.id, email: actor.email }, ack);
    }

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

    const { nomineeName: name, nomineeContact: contact } = formInput(
      z
        .object({
          nomineeName: z.string().trim().max(120, "That's too long.").default(""),
          nomineeContact: z.string().trim().max(160, "That's too long.").default(""),
        })
        .refine((n) => !n.nomineeName || n.nomineeContact, { message: "Add a way to reach your nominee." }),
      formData
    );

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
