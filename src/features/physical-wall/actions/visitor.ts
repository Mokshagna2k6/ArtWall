"use server";

import { cookies, headers } from "next/headers";
import { createHash } from "node:crypto";

import { mintQrToken } from "@/features/physical-wall/qr";
import { visitorRegisterSchema } from "@/features/physical-wall/schema";
import {
  fail,
  firstIssue,
  inTransaction,
  newId,
  ok,
  toActionError,
  type ActionState,
} from "@/features/physical-wall/actions/shared";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSql } from "@/lib/db";

/**
 * Walk-in visitor registration and scan tracking (F26, F21).
 *
 * The DPDP position drives the shape of both:
 *
 *  - Registration is **consent-first**. `consentPurpose` is a literal `true` in
 *    the schema, so no consent is a schema failure and the row is never written.
 *    Marketing consent is a separate, optional field — bundling them is exactly
 *    the dark pattern the spec rules out.
 *  - Scans store no IP address and no user agent. Rate limiting uses a hash
 *    that never reaches the database, so the demand signal stays honest without
 *    the platform holding a log of who stood in front of which painting.
 */

/** How long a walk-in registration is kept before it expires. */
const VISITOR_RETENTION_DAYS = 90;

/**
 * A rotating key for rate limiting only.
 *
 * The IP is hashed together with the current hour, so the key changes on its
 * own and cannot be used to follow one person through the evening. It exists in
 * memory for a rate-limit window and is never persisted.
 */
async function rotatingKey(prefix: string): Promise<string> {
  const headerList = await headers();
  const ip =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerList.get("x-real-ip") ||
    "unknown";
  const hour = Math.floor(Date.now() / 3_600_000);
  return `${prefix}:${createHash("sha256").update(`${ip}:${hour}`).digest("hex").slice(0, 16)}`;
}

export async function registerVisitor(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const limit = checkRateLimit(await rotatingKey("pw-visitor"), {
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    if (!limit.ok) return fail("Too many sign-ups from here. Try again shortly.");

    const parsed = visitorRegisterSchema.safeParse({
      name: formData.get("name"),
      contact: formData.get("contact"),
      contactKind: formData.get("contactKind"),
      consentPurpose: formData.get("consentPurpose") === "on",
      consentMarketing: formData.get("consentMarketing") === "on",
    });
    if (!parsed.success) return fail(firstIssue(parsed.error));

    const input = parsed.data;

    // Shape check on the contact itself, matching what the rest of the site
    // accepts. A phone number we cannot reach is a record we should not keep.
    if (input.contactKind === "phone") {
      if (!/^[6-9]\d{9}$/.test(input.contact.replace(/\D/g, "").slice(-10))) {
        return fail("Enter a valid 10-digit mobile number.");
      }
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contact)) {
      return fail("Enter a valid email address.");
    }

    const result = await inTransaction(async (client) => {
      const visitorId = newId("vis");
      const visitId = newId("visit");
      const token = mintQrToken();

      await client.query(
        `insert into pw_visitors
           (id, name, contact, contact_kind, consent_purpose, consent_marketing, expires_at)
         values ($1, $2, $3, $4, true, $5, now() + ($6 || ' days')::interval)`,
        [
          visitorId,
          input.name,
          input.contact,
          input.contactKind,
          input.consentMarketing,
          String(VISITOR_RETENTION_DAYS),
        ]
      );

      await client.query(
        `insert into pw_visits (id, visitor_id) values ($1, $2)`,
        [visitId, visitorId]
      );

      // The coupon expires with the visit, not with the account: it is good for
      // this evening at the counter, which is what "one redemption per visit,
      // time-boxed" means.
      await client.query(
        `insert into pw_qr_tokens (token, subject_type, subject_id, expires_at)
         values ($1, 'visitor', $2, now() + interval '1 day')`,
        [token, visitId]
      );

      return { token, visitId };
    });

    // Tie this browser to the visit so subsequent artwork scans attach to it.
    // The cookie holds an opaque visit id and nothing else — no name, no
    // contact — and expires with the visit, so it cannot follow anyone home.
    (await cookies()).set("pw_visit", result.visitId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 12,
      path: "/",
    });

    return ok(
      "You're registered. Show this code at the counter for 10% off your bill.",
      result
    );
  } catch (error) {
    return toActionError("registerVisitor", error);
  }
}

/**
 * Record a QR scan (F21).
 *
 * Fire-and-forget from the resolver's point of view: the page load must never
 * wait on, or fail because of, analytics. Duplicate rapid scans of the same
 * artwork in the same visit are deduped in a short window so a visitor waving
 * their phone twice does not double the count.
 */
export async function recordScan(
  artworkId: string,
  visitId: string | null
): Promise<void> {
  try {
    const limit = checkRateLimit(await rotatingKey(`pw-scan:${artworkId}`), {
      limit: 30,
      windowMs: 60 * 1000,
    });
    if (!limit.ok) return;

    const sql = getSql();
    await sql`
      insert into pw_scans (artwork_id, visit_id, source)
      select ${artworkId}, ${visitId}, 'qr'
      where not exists (
        select 1 from pw_scans
        where artwork_id = ${artworkId}
          and visit_id is not distinct from ${visitId}
          and created_at > now() - interval '30 seconds'
      )
    `;
  } catch (error) {
    console.error("[physical-wall] Could not record scan", error);
  }
}

/**
 * Withdraw consent and erase the record (DPDP s.6(6), spec §8.3).
 *
 * Withdrawal has to be as easy as giving consent, so this is one action with no
 * account required — the visitor's own coupon token is the credential. The row
 * is deleted rather than flagged; scans cascade to null and stay as anonymous
 * aggregate signal, which is the whole reason they were stored without a
 * personal identifier in the first place.
 */
export async function withdrawVisitorConsent(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const token = String(formData.get("token") ?? "");
    if (!token) return fail("We need your code to find the record.");

    const { resolveToken } = await import("@/features/physical-wall/data/tokens");
    const resolved = await resolveToken(token);
    if (!resolved.ok || resolved.subject.subjectType !== "visitor") {
      return fail("We couldn't find a registration for that code.");
    }

    const sql = getSql();
    await sql`
      delete from pw_visitors
      where id = (select visitor_id from pw_visits where id = ${resolved.subject.subjectId})
    `;
    await sql`
      update pw_qr_tokens set revoked_at = now() where token = ${token}
    `;

    return ok("Your details have been deleted. Your coupon no longer works.");
  } catch (error) {
    return toActionError("withdrawVisitorConsent", error);
  }
}
