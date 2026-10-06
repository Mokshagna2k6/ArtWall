# Blockchain Phase 2 task list — fetched verbatim from Notion

Source: https://app.notion.com/p/3e92da5aa27e8176bf9cf764996dab7b ("ArtWall — Production Readiness Tracker")
Fetched earlier in this session by the parent session via mcp__notion__notion-fetch, recorded here
so the task list is verifiable rather than taken on trust from a prompt.

---

- [ ] BC-2.01. The Foundry test suite covers voucher signature validation (wrong signer, expired voucher, wrong chainId, replayed nonce), royalty cap, pause behavior and role checks. Each case is a named test. [Source: F24, F25, F33, F56]
- [ ] BC-2.02. A Foundry fuzz test on mint parameters and an invariant test ("a token id cannot be minted twice", "the royalty is never above the cap") run in CI. [Source: F24, F25, F33]
- [ ] BC-2.03. The contract passes Slither with no high or medium findings unaddressed. The report is recorded in the tracker. [Source: F73; Bible section 118]
- [ ] BC-2.04. The EIP-712 domain includes name, version, chainId and verifyingContract, and the server signer test verifies that a voucher from another chain or contract is rejected. [Source: F24, F33]
- [ ] BC-2.05. The platform voucher signer key is stored in a managed secret (KMS or an env secret with restricted access), not in the repo or a .env committed file, and a key rotation procedure is documented. [Source: F33; Bible section 118]
- [ ] BC-2.06. The gateway handles RPC failures with retries and a fallback RPC endpoint, and surfaces a typed error. The merkle-root cron marks a batch "anchor-failed" for retry instead of losing it. [Source: F28, F01]
- [ ] BC-2.07. Chain reorg handling: the mint confirmation waits N confirmations, and the reconcile cron re-checks recently minted records for receipt presence. [Source: F34]
- [ ] BC-2.08. The IPFS pinning (src/lib/blockchain/pinata.ts) verifies that the returned CID matches the locally computed CID/hash of the uploaded bytes. [Source: F35]
- [ ] BC-2.09. Metadata JSON pinned to IPFS contains the certificate content hash, and a test asserts that the on-chain tokenURI to metadata to content hash chain matches the DB record. [Source: F02]
- [ ] BC-2.10. Integration tests cover the mint-voucher, confirm, IPFS upload and certificates routes (currently zero coverage), running against a local anvil chain in CI. [Source: F56]
- [ ] BC-2.11. The wallet linking flow requires a SIWE-style signed message proving wallet ownership before a wallet address is stored against a user. [Source: F33, F34]
- [ ] BC-2.12. /verify/[hash] performs an on-chain check (Merkle proof against the anchored root, or token existence) server-side, and shows a verified or unverified result. [Source: F01, F02, F23]

## Critical constraint for this session: NO LIVE DEPLOYMENT YET
The ArtwallCOA contract built in Blockchain Phase 1 (`contracts/src/ArtwallCOA.sol`, 18 passing Foundry
tests) has NOT been deployed to Base Sepolia yet — BC-1.10 is blocked on funding the signer wallet
(0xc2941C98643f6D4D353FCa59EFf12e2b9D456094), which has 0 ETH as of this session start. The user has
explicitly chosen to hold that deployment for later, funded by them manually.

This means: work on everything in BC-2.xx that does NOT require a live deployed contract address.
Local Foundry tests (BC-2.01, 2.02, 2.03), EIP-712 domain hardening (BC-2.04), gateway retry/fallback
logic (BC-2.06), IPFS CID verification (BC-2.08/2.09), SIWE wallet-linking (BC-2.11), integration tests
against a LOCAL anvil chain (BC-2.10, explicitly local per the task's own wording, not testnet) — all of
these work against a local Foundry/anvil chain or purely off-chain logic, not the real Base Sepolia
deployment. Do NOT attempt to deploy anything to Base Sepolia yourself, and do NOT spend the signer's
real testnet ETH on anything (it has none anyway, but to be explicit: don't ask the user to fund it for
Phase 2 work — Phase 2 doesn't need a live deployment).

BC-2.05 (managed-secret key storage) and BC-2.12 (/verify on-chain check against a real anchored root)
may be partially blocked by the lack of a live deployment too — read each task carefully; if a sub-part
genuinely needs a real deployed contract to verify against, do what CAN be verified now (e.g. BC-2.05's
"key rotation procedure is documented" doesn't need a live contract; BC-2.12's Merkle-proof-against-
anchored-root logic can likely be built and tested against local/mocked on-chain state) and clearly flag
in your report which sub-parts remain blocked on BC-1.10's eventual deployment, same honesty standard as
every other phase of this project — don't force a tick that isn't genuinely earned.

## Context: work done in Blockchain Phase 1 (already on this branch's history)
Read `contracts/src/ArtwallCOA.sol`, `contracts/test/ArtwallCOA.t.sol`, `src/lib/blockchain/chain.ts`,
`src/lib/blockchain/file-sniff.ts`, `src/features/blockchain/gateway.ts`, and the mint-voucher/confirm
routes before starting — this phase builds directly on top of that work, don't duplicate or regress it.
