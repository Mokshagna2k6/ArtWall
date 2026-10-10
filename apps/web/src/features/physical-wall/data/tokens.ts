import "server-only";

import { verifyQrToken } from "@/features/physical-wall/qr";
import { getSql } from "@/lib/db";

/**
 * Resolving a scanned QR code (C06, F15, F21, RP01).
 *
 * Two gates, in this order, and the order is the point:
 *
 *  1. **Signature.** Cheap, no database. Junk and hand-typed guesses die here,
 *     so spraying the /q/ endpoint costs a hash and not a connection.
 *  2. **Lookup.** Confirms the token was actually issued and has not been
 *     revoked or expired. A signature cannot revoke itself.
 */

export type QrSubjectType = "artwork" | "artist" | "visitor" | "booking";

export interface ResolvedToken {
  token: string;
  subjectType: QrSubjectType;
  subjectId: string;
}

export type TokenFailure = "malformed" | "unknown" | "revoked" | "expired";

export type TokenResult =
  | { ok: true; subject: ResolvedToken }
  | { ok: false; reason: TokenFailure };

export async function resolveToken(token: string): Promise<TokenResult> {
  if (!verifyQrToken(token)) return { ok: false, reason: "malformed" };

  try {
    const sql = getSql();
    const rows = (await sql`
      select token, subject_type, subject_id, expires_at, revoked_at
      from pw_qr_tokens where token = ${token} limit 1
    `) as Record<string, unknown>[];

    if (rows.length === 0) return { ok: false, reason: "unknown" };
    const row = rows[0];

    if (row.revoked_at) return { ok: false, reason: "revoked" };
    if (row.expires_at && new Date(String(row.expires_at)) < new Date()) {
      return { ok: false, reason: "expired" };
    }

    return {
      ok: true,
      subject: {
        token: String(row.token),
        subjectType: row.subject_type as QrSubjectType,
        subjectId: String(row.subject_id),
      },
    };
  } catch (error) {
    console.error("[physical-wall] Could not resolve token", error);
    return { ok: false, reason: "unknown" };
  }
}

/** The current token for a subject, if one has been issued. */
export async function getTokenForSubject(
  subjectType: QrSubjectType,
  subjectId: string
): Promise<string | null> {
  try {
    const sql = getSql();
    const rows = (await sql`
      select token from pw_qr_tokens
      where subject_type = ${subjectType}
        and subject_id = ${subjectId}
        and revoked_at is null
      order by issued_at desc
      limit 1
    `) as { token: string }[];
    return rows[0]?.token ?? null;
  } catch (error) {
    console.error("[physical-wall] Could not read token", error);
    return null;
  }
}
