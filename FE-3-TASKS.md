# Frontend Phase 3 task list — fetched verbatim from Notion

Source: https://app.notion.com/p/3e92da5aa27e8176bf9cf764996dab7b ("ArtWall — Production Readiness Tracker")
Fetched by the parent session via `mcp__notion__notion-fetch` and saved to this file so the task
list is verifiable from disk rather than taken on trust from a prompt.

---

- [ ] FE-3.01. The artwork detail page has a trust panel showing the five independent trust dimensions (artist verification, COA level, blockchain provenance level, physical binding level, transaction eligibility), each with its own state. [Source: F61; Bible section 3-11]
- [ ] FE-3.02. The trust panel shows the COA level as 0 to 3, with COA-0 shown explicitly as "No certificate". [Source: F62; Bible section 3-11 COA levels]
- [ ] FE-3.03. The trust panel shows the blockchain provenance level P0 to P4, with an explanation for each level. [Source: F63; Bible section 3-11 provenance levels]
- [ ] FE-3.04. The trust panel shows the physical binding level B0 to B3. [Source: Bible section 3-11 binding levels; F43]
- [ ] FE-3.05. Eligibility-dependent actions (buy, exhibit, secondary sell, publish) are shown or hidden from PolicyEngine results fetched from the server, never computed on the client. [Source: F59; Bible section 119, section 154-157, section 166 rules 41-42]
- [ ] FE-3.06. A demand meter UI component shows the demand signals defined by the Demand Engine on artwork and exhibition pages. [Source: Bible section 42-45]
- [ ] FE-3.07. 3D virtual exhibitions are built with Three.js / react-three-fiber, and a published exhibition can be viewed in 3D. [Source: F65; CTO Blueprint] (confirm scope: sourced from the original CTO Blueprint rather than the revised Bible architecture document)
- [ ] FE-3.08. The six standard 3D exhibition templates from the CTO Blueprint are each implemented and selectable by the exhibition owner. Custom templates are MVP-deferred and not required. [Source: F65; Bible MVP-deferred list excludes only custom 3D templates] (confirm scope: sourced from the original CTO Blueprint rather than the revised Bible architecture document)
- [ ] FE-3.09. The 3D exhibition viewer has a non-WebGL fallback: a 2D gallery list. [Source: F65; accessibility] (confirm scope: sourced from the original CTO Blueprint rather than the revised Bible architecture document)
- [ ] FE-3.10. The exhibition studio UI walks through the Bible 15-stage exhibition lifecycle, showing the current stage and the allowed next transitions from the server. [Source: Bible section 40-41]
- [ ] FE-3.11. The exhibition "submit for exhibit" UI shows why an artwork is ineligible (binding missing, provenance missing) from the PolicyEngine reason codes. [Source: F71; Bible section 14]
- [ ] FE-3.12. There is a WallOS admin UI to manage Organization, Venue, Building, Floor, Room/Zone, Wall and Slot hierarchically. [Source: F64; Bible section 30-34]
- [ ] FE-3.13. The booking flow lets the artist choose a slot by walking the WallOS hierarchy (venue, then wall, then slot) instead of the flat grid. [Source: F64; Bible section 30-34]
- [ ] FE-3.14. The checkout UI for marketplace purchases shows the dual-channel escrow split (artist share, platform commission, curator/venue share) computed from the active commission policy version. [Source: F66, F60; Bible section 90-92]
- [ ] FE-3.15. There is a self-service data correction UI where a user edits their personal data fields and sees a confirmation. [Source: F51; Bible section 120-127]
- [ ] FE-3.16. The DPDP consent and notice UI shows itemized purpose-wise consent, with withdrawal as easy as giving. [Source: Bible section 120-127]
- [ ] FE-3.17. The admin UI supports the 8-role model: an admin sees only the sections their role permits, as enforced from the server role claims. [Source: F67; Bible section 102-119]
- [ ] FE-3.18. There is a shipping/logistics UI for sold artworks showing the Shiprocket shipment status and tracking. [Source: F69]
- [ ] FE-3.19. An insurance/DigiLocker verification entry point exists in identity onboarding (DigiLocker document fetch). The insurance marketplace is MVP-deferred. [Source: F68; MVP-deferred list excludes the insurance marketplace] (confirm scope: grounding is thin, based on F68 and a general Bible MVP reference with no specific section cited)
- [ ] FE-3.20. A secure NFC/QR tag scan page validates signed tag tokens (SUN / signed QR) and shows the verified binding result. [Source: F43; Bible section 109-111]

## Important dependency note

Many of these tasks (FE-3.01, FE-3.05, FE-3.11, FE-3.14) depend on data that DOESN'T YET EXIST in the
database — the WallOS hierarchy (FE-3.12/3.13), escrow tables (FE-3.14), Demand Engine tables (FE-3.06),
shipment tables (FE-3.18), and the trust-dimension columns themselves (FE-3.01-04) are Database Phase 3's
job (DB-3.01, 3.06, 3.09, 3.14, 3.15) and are being worked on in PARALLEL by a separate agent right now in
worktree `agent-database-phase3` / branch `database-phase3-complete` — not yet merged into your branch.

What IS ready now: Backend Phase 3's PolicyEngine contract (`docs/policy-engine.md`, already in your
worktree's history) — read it. FE-3.05 and FE-3.11 (show/hide by PolicyEngine result, show PolicyEngine
reason codes) can be built against the `Decision`/`ReasonCode` shape it defines RIGHT NOW even before the
DB-side loader exists, as long as you build them to consume a `Decision` object from wherever the caller
gets it — do not hardcode eligibility logic in the client (that's the whole point of FE-3.05).

Given this, prioritize tasks that are least blocked by Database Phase 3's in-flight work:
- FE-3.05, FE-3.11 (PolicyEngine-driven UI, contract exists now)
- FE-3.07, FE-3.08, FE-3.09 (3D exhibition viewer — independent of trust-dimension DB work)
- FE-3.15, FE-3.16 (DPDP self-service UI — independent)
- FE-3.20 (NFC/QR tag scan page — depends on existing `art_tags` table, not new Phase 3 schema)

Tasks that genuinely need Database Phase 3's new tables (FE-3.01-04, FE-3.06, FE-3.12-14, FE-3.18) should
either be stubbed against a reasonable assumed shape (documented clearly as an assumption to reconcile at
merge time) or deferred and reported as blocked-on-database-phase3 — do not guess at real column names or
table structures for tables you haven't seen; ask in your report rather than inventing schema assumptions
that would conflict with what Database Phase 3 actually builds.
