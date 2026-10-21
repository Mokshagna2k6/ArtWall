# Blockchain Phase 1 task list — fetched verbatim from Notion

Source: https://app.notion.com/p/3e92da5aa27e8176bf9cf764996dab7b ("ArtWall — Production Readiness Tracker")
Fetched by the parent session via mcp__notion__notion-fetch and saved to this file so the task
list is verifiable from disk rather than taken on trust from a prompt.

## Current false claims this phase corrects (context, not tasks)
FC-BC-01 through FC-BC-09: the smart contract was never actually deployed (Deploy.s.sol's run() is empty), mint() is unauthenticated, there's no used-leaf tracking, no safeTransferFrom, off-chain sha256 doesn't match on-chain keccak256, Merkle proofs are broken for 3+ leaves, the gateway is a console.log stub, Privy wallet integration is a dead stub with a guessed endpoint, Foundry tests have never actually been run, NFC/QR tags are plain user-chosen strings with zero cryptography, and mint confirmation only checks an event NAME (any tx emitting a same-named event can be falsely claimed as a mint).

## Phase 1: Fix

- [ ] BC-1.01. A single hashing scheme is chosen and documented for COA content hashes and Merkle leaves (recommended: keccak256 over ABI-encoded canonical fields). The off-chain src/features/coa/hash.ts and the contract produce identical hashes for the same certificate, verified by a cross-language test vector. [Source: F02]
- [ ] BC-1.02. A single contract design is chosen. Either ArtworkRegistry.sol is extended to cover the voucher mint flow, or ArtwallCOA is written and ArtworkRegistry retired. Only one contract remains in contracts/src, and abi.ts matches the compiled ABI of that contract exactly (generated, not hand-written). [Source: F04]
- [ ] BC-1.03. The contract mint function requires authorization: either an EIP-712 voucher signed by the platform signer role, or msg.sender having MINTER_ROLE. An unauthorized mint reverts, covered by a Foundry test. [Source: F24]
- [ ] BC-1.04. The mint leaf/voucher binds the recipient, royalty receiver, royalty bps, token URI/content hash, nonce and chainId, so a front-runner cannot mint the same leaf to a different recipient. Covered by a Foundry test. [Source: F24]
- [ ] BC-1.05. The contract records used leaves or nonces, and a second mint with the same leaf or nonce reverts. Covered by a Foundry test. [Source: F25]
- [ ] BC-1.06. The contract inherits a standard ERC-721 implementation (OpenZeppelin ERC721), so safeTransferFrom, approve and the full ERC-721 interface are present. An ERC-165 supportsInterface test passes for ERC-721 and ERC-2981. [Source: F26]
- [ ] BC-1.07. Transfers and mints to the zero address revert, and burning is either disallowed or restricted to an explicit authorized burn function. Covered by a Foundry test. [Source: F72]
- [ ] BC-1.08. Foundry is installed in the dev setup docs and in CI. forge build and forge test run in CI on every push, and the job fails on test failure. [Source: F27, F56, F57]
- [ ] BC-1.09. contracts/script/Deploy.s.sol run() deploys the chosen contract with constructor args from env (admin, signer, royalty default from policy) and logs the address. [Source: F27]
- [ ] BC-1.10. The contract is deployed to the target testnet (Polygon Amoy or the chosen chain) and verified on the block explorer. The address and chainId are recorded in env config and in the tracker. [Source: F27]
- [ ] BC-1.11. The committed gateway.ts (src/features/blockchain/gateway.ts) is the real viem implementation, and the console.log stub is deleted. [Source: F28]
- [ ] BC-1.12. The gateway has real callers: the merkle-root cron anchors roots through it, and the mint-confirm flow reads receipts through it. Verified by grep. [Source: F28, F01]
- [ ] BC-1.13. The Privy stub (src/features/wallet/privy.ts) is either removed with its references, or replaced by the official Privy SDK integration. No guessed REST endpoints remain. [Source: F29]
- [ ] BC-1.14. The WalletConnect projectId comes from env, and a missing value fails loudly at build or start in production. [Source: F31]
- [ ] BC-1.15. The mint-voucher route (src/app/api/blockchain/certificates/[id]/mint-voucher/route.ts) sets the recipient to the verified certificate owner's linked wallet and the royalty receiver to the artist's registered wallet. Neither is accepted from the request body. [Source: F33]
- [ ] BC-1.16. The mint-voucher route sets royalty bps from the commission policy, capped at the Bible-defined maximum. A request cannot raise it, and a value above the cap is rejected. [Source: F33, F22, F60]
- [ ] BC-1.17. The mint-voucher route issues at most one active voucher per certificate. A second request returns the existing unexpired voucher or rejects. [Source: F33]
- [ ] BC-1.18. The /confirm route (src/app/api/blockchain/certificates/[id]/confirm/route.ts) validates that the tx receipt is from the configured contract address on the configured chainId, and that the Transfer/Minted event's tokenId, recipient and content hash match this certificate's voucher. A mismatching tx is rejected, covered by a test. [Source: F34]
- [ ] BC-1.19. /confirm requires the tx to have the configured number of confirmations before marking the certificate minted. [Source: F34]
- [ ] BC-1.20. The IPFS upload route (src/app/api/blockchain/ipfs/upload/route.ts) detects the file type by magic bytes server-side, rejects non-image types regardless of the client-sent file.type, and enforces a size limit. [Source: F35]
- [ ] BC-1.21. createMintCommitment and the mint-voucher flow are unified into one path, so there is no second route that mints with hardcoded 400bps. [Source: F22, F33]
- [ ] BC-1.22. All untracked blockchain files (src/app/api/blockchain/*, src/lib/blockchain/*, src/components/blockchain/*) are either committed after the BC-1 fixes or deleted. None remain untracked. [Source: F28, F03, F04]
- [ ] BC-1.23. The reconcile-mints cron (src/app/api/blockchain/cron/reconcile-mints/route.ts) moves certificates stuck in "minting" to minted or failed by checking the chain, and is scheduled. [Source: F03, F17]

Cross-references, NOT tasks for this pillar (already tracked and resolved elsewhere — do not duplicate):
- BC-1.24: Merkle proof algorithm fix — tracked in BE-1.01 to BE-1.04 (already done, Backend Phase 1).
- BC-1.25: DB mint-state CHECK conflict — tracked in DB-1.02 (already done, Database Phase 1).
- BC-1.26: certificate-creation ownership IDOR — tracked in SEC-1.09 (already done, Security Phase 1).

## Important: BE-1.19/1.20 already did interim work you must not regress
Earlier Backend Phase 1 work (BE-1.19) made `createMintCommitment` read royalty bps from an env-configured value instead of hardcoding 400bps, as an interim step — explicitly noted in the tracker that this interim value does NOT satisfy BE-3.09/BE-3.10 (which require the full `commission_policies` table — already built in Backend Phase 3, see `src/features/policy/commission.ts` and `getActiveCommissionPolicy()`). BC-1.21 asks you to unify the mint flow onto one path — when you do this, route it through the REAL `commission_policies`-backed function Backend Phase 3 already built, not back to a hardcoded or env value. Read `docs/policy-engine.md` in this worktree first.
