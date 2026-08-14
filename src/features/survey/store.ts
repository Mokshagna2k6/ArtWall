import "server-only";

import type { SurveyInput } from "@/features/survey/schema";
import { getSql } from "@/lib/db";

export interface SurveyRecord extends SurveyInput {
  userId: string | null;
  userAgent: string | null;
}

/**
 * Persist one survey response.
 *
 * Append-only: a person can answer more than once as their practice changes,
 * and overwriting the earlier answer would destroy exactly the signal we want.
 * There is no unique key here on purpose.
 *
 * Every value is a tagged-template parameter, so it reaches Postgres bound
 * rather than interpolated into SQL text.
 */
export async function saveSurveyResponse(record: SurveyRecord): Promise<void> {
  const sql = getSql();

  await sql`
    insert into survey_responses (
      user_id, email, role, practice, city,
      pain_points, biggest_problem, fair_commission, earns_from_art,
      notes, user_agent
    )
    values (
      ${record.userId},
      ${record.email || null},
      ${record.role},
      ${record.practice || null},
      ${record.city || null},
      ${record.painPoints},
      ${record.biggestProblem || null},
      ${record.fairCommission || null},
      ${record.earnsFromArt || null},
      ${record.notes || null},
      ${record.userAgent}
    )
  `;
}

/**
 * How many people have answered.
 *
 * Returns 0 when the database is unreachable: the survey page must still
 * render and still accept an answer. A missing count is a cosmetic loss.
 */
export async function countSurveyResponses(): Promise<number> {
  try {
    const sql = getSql();
    const rows = (await sql`
      select count(*)::int as count from survey_responses
    `) as { count: number }[];
    return rows[0]?.count ?? 0;
  } catch (error) {
    console.error("[survey] Could not read response count", error);
    return 0;
  }
}
