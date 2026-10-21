# Database Phase 3 task list — fetched verbatim from Notion

Source: https://app.notion.com/p/3e92da5aa27e8176bf9cf764996dab7b ("ArtWall — Production Readiness Tracker")
Fetched by the parent session via `mcp__notion__notion-fetch` and saved to this file so the task
list is verifiable from disk rather than taken on trust from a prompt.

---

- [ ] DB-3.01. The five independent trust-dimension columns or tables exist for artworks and artists: artist_verification_status, coa_level (0 to 3), provenance_level (P0 to P4), binding_level (B0 to B3) and transaction_eligibility. Each has a CHECK on allowed values. [Source: F61, F62, F63; Bible section 3-11]
- [ ] DB-3.02. coa_level 0 is a real stored state (the default), distinct from NULL and from a revoked certificate. [Source: F62; Bible section 3-11]
- [ ] DB-3.03. The artwork state machine orthogonal domains are stored as separate status columns per domain, each with its own CHECK, instead of one overloaded status. [Source: Bible section 17-19]
- [ ] DB-3.04. A commission_policies table exists with version, effective_from, effective_to, and platform, artist, curator, venue and royalty bps fields. Rows are immutable once effective (trigger enforced), and there is a CHECK that shares sum to 10000. [Source: F60; Bible section 90-92]
- [ ] DB-3.05. Ledger entries and mint commitments store a commission_policy_version_id FK. [Source: F60; Bible section 90-92]
- [ ] DB-3.06. The WallOS hierarchy tables exist (organizations, venues, buildings, floors, rooms_zones, walls, slots) with FK parent chains. Slots have an on_chain_slot_id column. [Source: F64; Bible section 30-34]
- [ ] DB-3.07. The existing flat wall/slot data is migrated into the WallOS hierarchy under a default organization, venue and building. No existing booking loses its slot reference. [Source: F64]
- [ ] DB-3.08. The exhibition table supports the 15 lifecycle stages via a CHECK plus a transitions history table (append-only). [Source: Bible section 40-41]
- [ ] DB-3.09. Escrow tables exist (escrow_holds, escrow_releases) linked to orders and ledger, with a CHECK that releases do not exceed holds. [Source: F66; Bible section 69]
- [ ] DB-3.10. An admin_roles table exists supporting the 8 Bible admin roles, with a user to role mapping and an audit trail of role grants and revocations. [Source: F67]
- [ ] DB-3.11. The cryptographic tag tables store the NTAG424 tag UID, key reference (not the key), SUN counter last-seen value and binding status. [Source: F43; Bible section 109-111]
- [ ] DB-3.12. DPDP consent records exist per purpose with granted_at and withdrawn_at, and are append-only. [Source: Bible section 120-127]
- [ ] DB-3.13. The PolicyEngine decision log table exists and is append-only. [Source: Bible section 119, section 69]

  **ALREADY SATISFIED by Backend Phase 3's work, already merged into your branch's history**: the `policy_decisions` table exists (migration `0043_be3_policy_engine.sql`, append-only trigger) — see `docs/policy-engine.md` in this worktree for the full contract. Confirm this yourself (read the migration + the doc) before marking DB-3.13 done in your own report — don't just take this note's word for it, but you likely do not need to build this table yourself.

- [ ] DB-3.14. The Demand Engine signal tables exist (event-level, append-only) with aggregation views. [Source: Bible section 42-45]
- [ ] DB-3.15. Shipment tables exist (shipments, shipment_events) linked to orders, for Shiprocket. [Source: F69]

Note: DB-3.01 is explicitly what Backend Phase 3's PolicyEngine (`docs/policy-engine.md`, `TrustDimensions`
type in `src/features/policy/engine.ts`) needs a real canonical loader for — Backend's gates are pure
functions that take `TrustDimensions` as an argument; nothing yet assembles that object from the database.
Building DB-3.01's columns AND a loader function that reads them into the exact `TrustDimensions` shape
Backend already defined (`identityVerified, physicalBindingVerified, blockchainAnchored, coaIssued,
curationApproved`) is probably the single most valuable thing this track can do — it's what unblocks
BE-3.03 (wiring the gates into real call sites) for whoever picks that up next.
