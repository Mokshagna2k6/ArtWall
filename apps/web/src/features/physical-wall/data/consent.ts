import "server-only";

import type { ConsentPurpose } from "@/features/physical-wall/consent";
import { getSql } from "@/lib/db";

/**
 * Reading the Consent Manager record.
 *
 * Every question here is "is this purpose authorised *right now*", which means
 * a row that exists but has been withdrawn is not a yes. The queries all filter
 * on `withdrawn_at is null` for that reason — forgetting it once would mean
 * processing on a consent someone had already taken back.
 */

export interface ConsentRecord {
  purpose: ConsentPurpose;
  grantedAt: string;
  noticeVersion: string;
}

/** Purposes this user currently authorises. */
export async function liveConsents(userId: string): Promise<ConsentRecord[]> {
  try {
    const sql = getSql();
    const rows = (await sql`
      select purpose, granted_at, notice_version
      from pw_consents
      where user_id = ${userId} and withdrawn_at is null and granted = true
      order by granted_at asc
    `) as Record<string, unknown>[];

    return rows.map((row) => ({
      purpose: row.purpose as ConsentPurpose,
      grantedAt: String(row.granted_at),
      noticeVersion: String(row.notice_version),
    }));
  } catch (error) {
    console.error("[physical-wall] Could not read consents", error);
    return [];
  }
}

export async function hasConsent(
  userId: string,
  purpose: ConsentPurpose
): Promise<boolean> {
  const consents = await liveConsents(userId);
  return consents.some((c) => c.purpose === purpose);
}

/**
 * The full history, withdrawals included, for the rights centre.
 *
 * Someone asking "what have I agreed to" deserves to see what they agreed to
 * and stopped agreeing to, not a filtered view that quietly forgets.
 */
export async function consentHistory(userId: string) {
  try {
    const sql = getSql();
    const rows = (await sql`
      select purpose, granted, notice_version, granted_at, withdrawn_at
      from pw_consents
      where user_id = ${userId}
      order by granted_at desc
    `) as Record<string, unknown>[];

    return rows.map((row) => ({
      purpose: row.purpose as ConsentPurpose,
      granted: Boolean(row.granted),
      noticeVersion: String(row.notice_version),
      grantedAt: String(row.granted_at),
      withdrawnAt: (row.withdrawn_at as string) ?? null,
    }));
  } catch (error) {
    console.error("[physical-wall] Could not read consent history", error);
    return [];
  }
}

export interface AccountFacts {
  foundingMember: boolean;
  verifiedAt: string | null;
  ageDeclaredAdult: boolean | null;
  onboardedAt: string | null;
  nomineeName: string | null;
  nomineeContact: string | null;
}

/** The F31 facts that live on the user row rather than in the consent table. */
export async function getAccountFacts(
  userId: string
): Promise<AccountFacts | null> {
  try {
    const sql = getSql();
    const rows = (await sql`
      select "foundingMember", "verifiedAt", "ageDeclaredAdult",
             "onboardedAt", "nomineeName", "nomineeContact"
      from "user" where id = ${userId} limit 1
    `) as Record<string, unknown>[];

    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      foundingMember: Boolean(row.foundingMember),
      verifiedAt: (row.verifiedAt as string) ?? null,
      ageDeclaredAdult:
        row.ageDeclaredAdult === null || row.ageDeclaredAdult === undefined
          ? null
          : Boolean(row.ageDeclaredAdult),
      onboardedAt: (row.onboardedAt as string) ?? null,
      nomineeName: (row.nomineeName as string) ?? null,
      nomineeContact: (row.nomineeContact as string) ?? null,
    };
  } catch (error) {
    console.error("[physical-wall] Could not read account facts", error);
    return null;
  }
}

/**
 * Has this artist finished onboarding?
 *
 * Two conditions, and both matter: they have given account consent, and they
 * have answered the age question. An account created through Google never saw a
 * consent form, so this is what stops it slipping past the gate.
 */
export async function needsOnboarding(userId: string): Promise<boolean> {
  const [facts, consents] = await Promise.all([
    getAccountFacts(userId),
    liveConsents(userId),
  ]);

  if (!facts) return true;
  if (facts.ageDeclaredAdult === null) return true;
  return !consents.some((c) => c.purpose === "account");
}
