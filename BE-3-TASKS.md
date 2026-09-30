# Backend Phase 3 task list — fetched verbatim from Notion

Source: https://app.notion.com/p/3e92da5aa27e8176bf9cf764996dab7b ("ArtWall — Production Readiness Tracker")
Fetched by the parent session via `mcp__notion__notion-fetch` and saved to this file so the task
list is verifiable from disk rather than taken on trust from a prompt. The raw fetch output that
this was extracted from is saved at:
C:\Users\MOKSHAGNA\.claude\projects\e--Internship-Work-ArtWall\6e136bf7-7efc-4c9f-900e-6f60f2f089df\tool-results\mcp-notion-notion-fetch-1790765396040.txt
(that path is on the host machine running this session, not necessarily readable from inside a
worktree/agent sandbox — it's cited here for audit trail, not as something you need to open).

If you have Notion MCP access in this session, you are encouraged to re-fetch the page yourself at
the URL above and confirm this transcription matches exactly before proceeding. If you don't have
Notion access, this file is the verbatim source of truth for BE-3.xx scope — do not guess beyond it.

---

- [ ] BE-3.01. A central PolicyEngine module exists as the single backend gate for eligibility decisions, exposing at least canPublishArtwork, canExhibit, canSecondarySell, canList and canMint, each returning allow/deny plus reason codes. [Source: F59; Bible section 119, section 154-157, section 166 rules 41-42]
- [ ] BE-3.02. The PolicyEngine implements the Master Eligibility Matrix from Bible section 2. Each matrix cell has a unit test. [Source: F59; Bible section 2]
- [ ] BE-3.03. Every server action and API route that performs a gated operation calls the PolicyEngine and rejects on deny. Verified by grep plus a test per route. [Source: F59, F53; Bible section 119]
- [ ] BE-3.04. canExhibit enforces the section 14 hard gate: an artwork is exhibitable only when physical binding is verified (cryptographic, B-level per Bible) AND blockchain provenance is anchored. A test covers each of the four combinations. [Source: F71; Bible section 14, section 166 rules 16-24]
- [ ] BE-3.05. The PolicyEngine reads its inputs from the five independent trust dimensions (DB-3.01) and never from a single collapsed status. [Source: F61; Bible section 3-11]
- [ ] BE-3.06. The PolicyEngine decisions are logged (decision, inputs, reason codes, actor) for audit. [Source: Bible section 119, section 69]
- [ ] BE-3.07. The artwork state machine is implemented as orthogonal domains (for example lifecycle, commerce, exhibition, custody) per Bible section 17-19. Each domain's allowed transitions are enforced server-side and tested. [Source: Bible section 17-19, section 166 rules 1-8]
- [ ] BE-3.08. The exhibition lifecycle implements all 15 stages from Bible section 40-41, with server-enforced allowed transitions and an audit entry per transition. [Source: Bible section 40-41, section 166 rules 16-24]
- [ ] BE-3.09. The commission and royalty calculation reads the active commission_policies version at transaction time and stores that policy version id on every ledger entry it produces. [Source: F60; Bible section 90-92]
- [ ] BE-3.10. No commission, royalty or curator percentage is hardcoded anywhere in src. Verified by a grep check for bps literals recorded in the task. [Source: F22, F60; Bible section 90-92 "do not hard-code"]
- [ ] BE-3.11. Marketplace purchases use a dual-channel escrow flow: funds are captured, held, and released to the artist, platform and curator/venue per the commission policy only after delivery confirmation or the dispute window. [Source: F66; Bible section 166 rules 25-30]
- [ ] BE-3.12. The escrow release and refund paths each write double-entry ledger records that balance to zero per transaction. [Source: F66; Bible section 69]
- [ ] BE-3.13. The WallOS hierarchy service supports CRUD for Organization, Venue, Building, Floor, Room/Zone, Wall and Slot with parent-child integrity, and bookings reference a Slot within this hierarchy. [Source: F64; Bible section 30-34, section 166 rules 31-35]
- [ ] BE-3.14. WallOS slots carry an on-chain slot ID, and venue revenue share is computed per the Bible WallOS rules (smart-contract revenue share recorded; the WallOS B2B rental product is MVP-deferred). [Source: F64; Bible section 30-34] (confirm scope: cited Bible section 30-34 should be checked against whether on-chain slot IDs are truly required for MVP, not just Growth phase)
- [ ] BE-3.15. The Demand Engine computes the demand signals defined in Bible section 42-45 (views, saves, inquiries, booking interest) and exposes them via a read endpoint. Predictive demand scoring is MVP-deferred. [Source: Bible section 42-45]
- [ ] BE-3.16. Shiprocket integration creates shipments for sold artworks, stores the AWB/tracking id, and ingests status webhooks. It has at least one real caller from the order flow. [Source: F69]
- [ ] BE-3.17. DigiLocker integration fetches and verifies identity documents for artist verification. The artist verification trust dimension is updated from the result. [Source: F68; Bible section 3-11]
- [ ] BE-3.18. Basic insurance coverage recording for artworks in transit or on wall is implemented per the Bible MVP scope. The insurance marketplace is MVP-deferred and excluded. [Source: F68] (confirm scope: grounding is thin, based on F68 and a general Bible MVP reference with no specific section cited)
- [ ] BE-3.19. A self-service data correction action lets a user update their personal data, logs the correction, and propagates it to dependent records. [Source: F51; Bible section 120-127]
- [ ] BE-3.20. DPDP Rules 2025 compliance items are implemented: itemized consent records per purpose, consent withdrawal, a grievance officer contact, retention-based deletion via the data-retention cron, and a breach-notification runbook. Each is a separate verified sub-item. [Source: Bible section 120-127]
- [ ] BE-3.21. An Architecture Decision Record documents the DB outbox as the MVP substitute for Kafka, with the migration trigger conditions. This task is the documentation of the deviation, not building Kafka. [Source: F70]
- [ ] BE-3.22. The notification outbox event schema is versioned, so it can later be bridged to a broker without code changes to producers. [Source: F70]
- [ ] BE-3.23. The edition service supports numbered editions with an edition size cap enforced server-side, with an artist proof designation per Bible artwork rules. [Source: F20; Bible section 166 rules 1-8]
- [ ] BE-3.24. The COA service models COA levels 0 to 3, and issuing a COA moves the COA dimension from 0 to the appropriate level with the required evidence. [Source: F62; Bible section 3-11]
- [ ] BE-3.25. The Locked Product Rules (Bible section 166, rules 1-48) each map to at least one enforcing server check or explicitly "N/A for MVP" in a traceability table. The table is kept in the tracker. [Source: Bible section 166]

Note: BE-3.14 and BE-3.18 carry "(confirm scope: ...)" caveats already written into the tracker
itself — these are pre-existing open questions in the tracker, not something added by any agent.
Use judgment on MVP-appropriate scope for those two per the caveat text, and note the interpretation
taken in the final report.
