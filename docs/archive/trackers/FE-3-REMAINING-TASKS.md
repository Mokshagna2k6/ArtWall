# Frontend Phase 3 remaining task list — fetched verbatim from Notion earlier in this session

Source: https://app.notion.com/p/3e92da5aa27e8176bf9cf764996dab7b ("ArtWall — Production Readiness Tracker")

Already done in an earlier Frontend Phase 3 session (do not duplicate): FE-3.07/3.08/3.09 (3D exhibition viewer), FE-3.15/3.16 (DPDP UI, found pre-existing). Groundwork built but not wired: FE-3.05/3.11 (`eligibility-notice.tsx`/`reason-codes.ts` exist but had nothing real to call — THIS IS NOW FIXED, Backend Phase 3 wiring (BE-3.03) just landed real PolicyEngine call sites with real reason codes; wire these components in for real now).

## Remaining items for this session

- [ ] FE-3.01. The artwork detail page has a trust panel showing the five independent trust dimensions (artist verification, COA level, blockchain provenance level, physical binding level, transaction eligibility), each with its own state. [Source: F61; Bible section 3-11]
- [ ] FE-3.02. The trust panel shows the COA level as 0 to 3, with COA-0 shown explicitly as "No certificate". [Source: F62; Bible section 3-11 COA levels]
- [ ] FE-3.03. The trust panel shows the blockchain provenance level P0 to P4, with an explanation for each level. [Source: F63; Bible section 3-11 provenance levels]
- [ ] FE-3.04. The trust panel shows the physical binding level B0 to B3. [Source: Bible section 3-11 binding levels; F43]
- [ ] FE-3.05. Eligibility-dependent actions (buy, exhibit, secondary sell, publish) are shown or hidden from PolicyEngine results fetched from the server, never computed on the client. [Source: F59; Bible section 119, section 154-157, section 166 rules 41-42]
- [ ] FE-3.06. A demand meter UI component shows the demand signals defined by the Demand Engine on artwork and exhibition pages. [Source: Bible section 42-45]
- [ ] FE-3.10. The exhibition studio UI walks through the Bible 15-stage exhibition lifecycle, showing the current stage and the allowed next transitions from the server. [Source: Bible section 40-41]
- [ ] FE-3.11. The exhibition "submit for exhibit" UI shows why an artwork is ineligible (binding missing, provenance missing) from the PolicyEngine reason codes. [Source: F71; Bible section 14]
- [ ] FE-3.12. There is a WallOS admin UI to manage Organization, Venue, Building, Floor, Room/Zone, Wall and Slot hierarchically. [Source: F64; Bible section 30-34]
- [ ] FE-3.13. The booking flow lets the artist choose a slot by walking the WallOS hierarchy (venue, then wall, then slot) instead of the flat grid. [Source: F64; Bible section 30-34]
- [ ] FE-3.14. The checkout UI for marketplace purchases shows the dual-channel escrow split (artist share, platform commission, curator/venue share) computed from the active commission policy version. [Source: F66, F60; Bible section 90-92]
- [ ] FE-3.17. The admin UI supports the 8-role model: an admin sees only the sections their role permits, as enforced from the server role claims. [Source: F67; Bible section 102-119]
- [ ] FE-3.18. There is a shipping/logistics UI for sold artworks showing the Shiprocket shipment status and tracking. [Source: F69]
- [ ] FE-3.19. An insurance/DigiLocker verification entry point exists in identity onboarding (DigiLocker document fetch). The insurance marketplace is MVP-deferred. [Source: F68; MVP-deferred list excludes the insurance marketplace] (confirm scope: grounding is thin, based on F68 and a general Bible MVP reference with no specific section cited)
- [ ] FE-3.20. A secure NFC/QR tag scan page validates signed tag tokens (SUN / signed QR) and shows the verified binding result. [Source: F43; Bible section 109-111]

## Critical context: what real data now exists to build against (read these first)

- **Database Phase 3** built real schema: `coa_certificates.coa_level` (0-3), a `provenance_level` view (P0-P4), a `binding_level` generated column (B0-B3) on `art_tags`, and a `transaction_eligibility` view. Read `src/features/policy/trust.ts`'s `loadTrustDimensionLevels(artworkId)` — this is the real function FE-3.01-3.04's trust panel should call (via a server component or server action, never compute levels on the client).
- **Backend Phase 3 wiring** just landed real PolicyEngine call sites: artwork publish (`canPublishArtwork`), exhibition publish (`canExhibit`), mint-voucher issuance (`canMint`). Each returns `{allow, reasons}` with real reason codes (see `src/features/policy/engine.ts` for the exact `ReasonCode` union). FE-3.05/3.11 should consume these real decisions — the existing `eligibility-notice.tsx`/`reason-codes.ts` components (built in an earlier session) are ready to wire in; find the real call sites and use them. IMPORTANT: `canSecondarySell` and `canList` have NO real call sites in the backend (this codebase has no marketplace listing/purchase action yet) — do not build frontend UI for features with no backend to call; if FE-3.05's task text implies showing/hiding buy/sell actions and those don't exist as real actions yet, note this honestly rather than building UI against a fake action.
- **Backend Phase 3** also built `src/features/artworks/state-machine.ts` (4 orthogonal domains: lifecycle/commerce/exhibition/custody) and `src/features/exhibitions/lifecycle.ts` (the real 15-stage transition graph + `exhibition_transitions` audit table). FE-3.10 should read the exhibition's current stage and allowed-next-states from here.
- **Database Phase 3** built the full WallOS hierarchy (`organizations → venues → buildings → floors → rooms_zones → walls → slots`, migration `0050_db3_wallos_hierarchy.sql`) as a PARALLEL structure alongside the existing flat `pw_slots` — read that migration's header comment. No application code (Drizzle schema entries in the app's query layer, actions, or UI) reads/writes it yet. FE-3.12/3.13 would be the first real consumers — check if `src/lib/db/schema.ts` has Drizzle definitions for these new tables already (Database Phase 3 may have added raw SQL only) and add them if missing before building UI on top.
- **Database Phase 3** built `demand_signals`/`demand_aggregates` tables and un-stubbed `src/features/demand/aggregate.ts` (FE-3.06 depends on this existing — it does, read it for the real shape).
- **Database Phase 3** built escrow tables (`escrow_holds`/`escrow_releases`) and the versioned `commission_policy_versions` table (FE-3.14 depends on both).
- **Database Phase 3** built `admin_roles`/`admin_role_assignments` (8 Bible roles, seeded) for FE-3.17.
- FE-3.18 (Shiprocket UI) and FE-3.19 (DigiLocker) depend on Backend features (BE-3.16 Shiprocket integration, BE-3.17 DigiLocker integration) that are NOT built yet (confirmed not started per the tracker) — these are correctly out of reach this session; report as blocked, do not build UI for a backend integration that doesn't exist.
- FE-3.20 (NFC/QR tag scan) depends on Blockchain Phase 3's BC-3.09/3.11 (SUN/signed-QR verification) which is being worked on in PARALLEL right now in a different worktree (`agent-blockchain-phase3`, branch `blockchain-phase3-complete`) — not yet merged into your branch. Do not guess at its exact API shape; either defer this item or build against a clearly-documented assumed interface to reconcile at merge time.

## What you can realistically build this session, roughly in priority/dependency order
1. FE-3.01, 3.02, 3.03, 3.04 — the trust panel (real data exists now, this is the most valuable UI work given what's actually backed)
2. FE-3.05, 3.11 — wire the existing eligibility-notice components to the real new gate call sites
3. FE-3.10 — exhibition studio lifecycle UI (real data exists)
4. FE-3.06 — demand meter (real data exists)
5. FE-3.12, 3.13, 3.14, 3.17 — WallOS admin UI, WallOS-aware booking flow, escrow checkout UI, 8-role admin UI (all have real backend data, but are larger UI builds — budget time accordingly, don't rush something broken)
6. FE-3.18, 3.19 — correctly defer, no backend to call
7. FE-3.20 — check if Blockchain Phase 3 has landed a usable interface yet; defer if not
