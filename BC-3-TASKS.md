# Blockchain Phase 3 task list — fetched verbatim from Notion earlier in this session

Source: https://app.notion.com/p/3e92da5aa27e8176bf9cf764996dab7b ("ArtWall — Production Readiness Tracker")

---

- [ ] BC-3.01. The contract uses role separation (DEFAULT_ADMIN_ROLE, MINTER/SIGNER_ROLE, PAUSER_ROLE, ANCHOR_ROLE), with no single EOA holding all roles in production. [Source: F73; Bible section 118]
- [ ] BC-3.02. The contract is Pausable, and the pause is exercisable by the PAUSER_ROLE. Covered by test. [Source: F73; Bible section 118]
- [ ] BC-3.03. The admin role is held by a multisig (Safe) with a documented signer threshold. The deployment transfers admin to the multisig, and this is verified on-chain. [Source: F73; Bible section 118]
- [ ] BC-3.04. Privileged parameter changes (signer rotation, royalty cap change, upgrades if upgradeable) go through a timelock with a documented delay. [Source: F73; Bible section 118]
- [ ] BC-3.05. On-chain caps are enforced per the Bible (max royalty bps, per-period mint caps or equivalent), and covered by tests. [Source: F73, F33; Bible section 118]
- [ ] BC-3.06. An external or independent smart contract security audit is completed before mainnet deployment, the findings are resolved, and the report is linked in the tracker. [Source: F73; Bible section 118]
- [ ] BC-3.07. Mainnet deployment happens only after BC-3.01 to BC-3.06. The mainnet address is recorded and verified on the explorer. [Source: F27, F73] (confirm scope: only a broad Bible section range is cited, not a specific requirement line)
- [ ] BC-3.08. The P0 to P4 blockchain provenance levels are computed from actual on-chain state (P0 none, through anchored root, minted token and so on, per the Bible definitions), and written to the provenance trust dimension. [Source: F63; Bible section 3-11]
- [ ] BC-3.09. NFC tags use NTAG424 DNA with SUN (Secure Unique NFC) message authentication. The server verifies the CMAC and the monotonically increasing counter on each scan, and rejects replays. [Source: F43; Bible section 109-111]
- [ ] BC-3.10. The NTAG424 tag keys are generated and stored in an HSM or cloud KMS, never in the app DB or code. Key diversification per tag is implemented. [Source: F43; Bible section 109-111]
- [ ] BC-3.11. QR codes on artworks carry server-signed tokens (for example Ed25519 or HMAC with a KMS key), and a scan verifies the signature before showing binding info. Plain user-chosen strings are no longer accepted as tag identities. [Source: F43; Bible section 109-111]
- [ ] BC-3.12. The physical binding level B0 to B3 is computed from the cryptographic tag verification state and written to the binding trust dimension. [Source: F43; Bible section 3-11]
- [ ] BC-3.13. The tag provisioning workflow exists: admin/ops provisions a tag (writes keys through the HSM), binds it to an artwork with ownership verified, and the binding event is recorded in append-only provenance and optionally anchored on-chain. [Source: F43, F41; Bible section 109-111]
- [ ] BC-3.14. WallOS slot IDs are registered on-chain, and the venue revenue-share split is recorded on-chain per Bible section 30-34. [Source: F64; Bible section 30-34] (confirm scope: cited Bible section 30-34 should be checked against whether on-chain slot IDs are truly required for MVP, not just Growth phase)
- [ ] BC-3.15. The exhibition hard gate (section 14) consumes the real BC-3.08 provenance level and BC-3.12 binding level, making F71 no longer moot. Verified by an end-to-end test with a bound and anchored artwork. [Source: F71; Bible section 14]

Out of MVP scope, not a task: BC-3.16 (soulbound tokens, MVP-deferred per the Bible, must not be built or penalized).

## Critical context: no live mainnet/testnet deployment exists yet
BC-1.10 (Base Sepolia testnet deployment) is still blocked — the signer wallet has 0 ETH and the user has not yet funded it. This means:
- BC-3.06 (external audit) and BC-3.07 (mainnet deployment) are hard-blocked on BC-1.10 happening first, then presumably more real-world process (hiring an auditor) beyond what an agent can do. Do NOT attempt these — report as blocked, don't fake them.
- BC-3.01 through BC-3.05 are mostly CONTRACT CODE changes (role separation, Pausable, access control) that can be built and tested locally via Foundry without a live deployment. BC-3.03 (multisig) can have its CODE/integration tested locally (e.g. against a Gnosis Safe test deployment on a local anvil chain) even without the real contract being live yet.
- BC-3.08/3.12/3.15 (provenance/binding levels consuming real on-chain state) can be partially built: the LOGIC for computing P0-P4/B0-B3 from on-chain state can be written and unit-tested against a local anvil chain with the ArtwallCOA contract deployed there (same pattern Blockchain Phase 2 already used for BC-2.10's anvil integration test) — just not against the real Base Sepolia deployment, which doesn't exist yet.
- BC-3.09/3.10/3.11/3.13 (NTAG424/SUN crypto tags, HSM key storage, signed QR) are a large, mostly-independent body of work — real cryptographic tag security, genuinely new infrastructure, not just hardening what exists. Database Phase 3 already built the schema groundwork (`art_tags.key_reference`, `sun_counter_last_seen`, `binding_status` — migration `0049_db3_escrow_admin_tags_shipments.sql`) but no application code implements the actual SUN/CMAC verification yet.
- BC-3.14 (on-chain WallOS slot registration) needs the WallOS hierarchy tables (built in Database Phase 3, DB-3.06/3.07) — check they exist in this branch's history (they should, since Database Phase 3 merged into phase-3-complete which this branch descends from).

## Your priority order, given the above
1. BC-3.01, 3.02, 3.05 — pure contract-code changes, fully testable locally via Foundry, no deployment needed. Do these first.
2. BC-3.09, 3.10, 3.11, 3.13 — the NTAG424/SUN crypto tag work. Large but genuinely buildable without a live deployment (it's server-side crypto verification + a KMS integration, not on-chain).
3. BC-3.08, 3.12, 3.15 — provenance/binding levels from on-chain state. Buildable against local anvil, logic-complete, but genuinely can't be "fully proven against the real Base Sepolia deployment" until BC-1.10 happens — be honest about this distinction in your report.
4. BC-3.03, 3.04 — multisig/timelock. Can be designed and code-tested locally; actual on-chain verification needs a deployment.
5. BC-3.06, 3.07 — explicitly out of reach for this session, report as blocked.
6. BC-3.14 — needs WallOS tables (should exist), on-chain registration itself needs a deployment — same honesty caveat as item 3.
