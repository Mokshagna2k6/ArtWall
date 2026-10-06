import "server-only";

import { db } from "@/lib/db/index";
import { policyDecisions } from "@/lib/db/schema";
import type { Decision, ReasonCode, TrustDimensions } from "@/features/policy/engine";

/**
 * PolicyEngine decision logging (BE-3.06).
 *
 * Every gate call that guards a real action should be logged here for audit:
 * the decision, its inputs, the reason codes, and who triggered it. Mirrors
 * physical-wall/audit.ts's `recordAudit` — best-effort, never throws, because
 * losing one audit line is bad but failing the request the logger was only
 * *watching* is worse.
 */

export type Gate =
  | "canPublishArtwork"
  | "canExhibit"
  | "canSecondarySell"
  | "canList"
  | "canMint";

export interface LogDecisionInput {
  gate: Gate;
  subjectType: string;
  subjectId?: string | null;
  actorId?: string | null;
  decision: Decision;
  inputs: Record<string, unknown> | { trust?: TrustDimensions };
}

export async function logPolicyDecision(entry: LogDecisionInput): Promise<void> {
  try {
    await db.insert(policyDecisions).values({
      gate: entry.gate,
      subjectType: entry.subjectType,
      subjectId: entry.subjectId ?? null,
      actorId: entry.actorId ?? null,
      allowed: entry.decision.allow,
      reasons: entry.decision.reasons satisfies ReasonCode[],
      inputs: entry.inputs,
    });
  } catch (error) {
    console.error("[policy] Could not write decision log", entry.gate, error);
  }
}
