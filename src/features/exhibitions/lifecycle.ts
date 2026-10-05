/**
 * The exhibition lifecycle state machine (BE-3.08).
 *
 * 15 stages (migration 0051's `exhibitions_status_check`; see that
 * migration's header comment for why these 15 and not the Bible's literal
 * text, which is not present in this repo). This module is the single
 * source of truth for which moves are legal, same pattern as
 * src/features/physical-wall/state-machine.ts (the slot lifecycle) and
 * src/features/artworks/state-machine.ts (the artwork domains): pure, no
 * database — every real transition goes through `assertExhibitionTransition`
 * and then `recordExhibitionTransition` writes the append-only audit row
 * (`exhibition_transitions`, 0051) inside the caller's own transaction.
 */

export const EXHIBITION_STAGES = [
  "draft",
  "submitted",
  "under_review",
  "changes_requested",
  "approved",
  "rejected",
  "scheduled",
  "installing",
  "published",
  "paused",
  "ending",
  "ended",
  "archived",
  "cancelled",
  "withdrawn",
] as const;

export type ExhibitionStage = (typeof EXHIBITION_STAGES)[number];

/**
 * Permitted moves, transcribed from 0051's header comment: submission ->
 * curator review with a revision loop and a rejection off-ramp -> scheduling
 * -> install -> live -> wind-down -> archive, plus cancellation/withdrawal as
 * terminal off-ramps from anywhere before `published`.
 */
export const EXHIBITION_TRANSITIONS: Record<ExhibitionStage, readonly ExhibitionStage[]> = {
  // draft -> published direct: the only real caller today
  // (publishExhibition) goes straight from draft to live with no separate
  // submission/review/scheduling/install step in this codebase yet (0051's
  // header comment says the same — only draft and published are wired up
  // today). The fuller submit -> review -> schedule -> install path stays
  // modelled for whoever builds that workflow next.
  draft: ["submitted", "published", "cancelled"],
  submitted: ["under_review", "withdrawn"],
  under_review: ["changes_requested", "approved", "rejected"],
  changes_requested: ["draft", "withdrawn"],
  approved: ["scheduled", "withdrawn"],
  rejected: [],
  scheduled: ["installing", "cancelled"],
  installing: ["published", "cancelled"],
  published: ["paused", "ending"],
  paused: ["published", "ending"],
  ending: ["ended"],
  ended: ["archived"],
  archived: [],
  cancelled: [],
  withdrawn: [],
};

export class IllegalExhibitionTransitionError extends Error {
  readonly status = 409;
  constructor(
    readonly from: ExhibitionStage,
    readonly to: ExhibitionStage
  ) {
    super(`An exhibition cannot move from ${from} to ${to}.`);
    this.name = "IllegalExhibitionTransitionError";
  }
}

export function canTransitionExhibition(from: ExhibitionStage, to: ExhibitionStage): boolean {
  return (EXHIBITION_TRANSITIONS[from] ?? []).includes(to);
}

export function assertExhibitionTransition(from: ExhibitionStage, to: ExhibitionStage): void {
  if (!canTransitionExhibition(from, to)) {
    throw new IllegalExhibitionTransitionError(from, to);
  }
}

