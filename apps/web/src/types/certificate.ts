export type ProvenanceEventType =
  "created" | "certified" | "exhibited" | "sold" | "owned";

export interface ProvenanceEvent {
  type: ProvenanceEventType;
  occurredAt: string;
  /** Human-readable label, e.g. "Owned by Priya K." (Phase 1 #43). */
  label: string;
}

export interface Certificate {
  /** Human-readable edition ID, e.g. "WALL-2026-DIWALI-0417" (Phase 1 #44). */
  id: string;
  artworkId: string;
  mintedAt: string;
  provenance: ProvenanceEvent[];
}
