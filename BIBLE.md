# ArtWall Product Bible — Canonical Reference

**Source:** `Artwall_FINAL_Product_Bible.pdf` — ARTWALL LABS PVT LTD, Complete Product Bible,
Artwall OS + WallOS. FINAL, September 2026. 165 pages, 200+ sections.
CIN U62099RJ2026PTC112452 · GSTIN 08ABFCA1595D1ZR · artwalllabs.com · Jaipur, Rajasthan.
Classification: **Confidential — Internal Strategy.**

**Structure:** Part 1 = CTO Blueprint v3.0 (§0–33 + addendum §A1–A15).
Part 2 = WallOS Master Specification (§1–167).
Where they conflict, **the v3.0 addendum supersedes the v2.0 base document** (stated on p.88),
and Part 2's eligibility/policy engine is the authoritative architecture (p.170).

**This file is a navigation index + the rules that constrain code.** It is not a replacement for
the PDF. Section numbers below map to the PDF so anything can be looked up at source.

---

## 0. THE ONE-PARAGRAPH ARCHITECTURE (PDF p.170 — "top of the engineering repository")

> An Artwall artwork is an independently managed digital/physical art asset. COA, blockchain
> provenance, physical binding, primary listing, exhibition, NFT status, ownership and
> secondary-market rights are **separate state domains**. Exhibition is optional and is permitted
> only when the artwork has an active physical binding AND approved blockchain provenance.
> WallOS independently manages physical wall inventory and slot identity; exhibition creates the
> temporary artwork-to-slot relationship.

---

## 1. THE 48 LOCKED PRODUCT RULES (§166) — THE CONSTITUTION

These are verbatim. **Any code that contradicts one of these is wrong.**
(This resolves the gap in `docs/locked-product-rules-traceability.md`, which could only
reconstruct partial groupings and left rules 9–15 and 36–40 unmapped. **Now fully sourced.**)

### Artwork (1–8)
1. Artwork registration does not require exhibition.
2. Artwork registration does not require binding.
3. Artwork registration does not require blockchain.
4. No COA is a valid documentation state, not a COA tier.
5. No-COA artwork can be primary-listed if otherwise eligible.
6. Holographic COA is physical documentation only.
7. Holographic COA does not imply blockchain provenance.
8. Artist verification is independent of artwork documentation.

### Blockchain (9–11)
9. Blockchain provenance is a separate trust layer.
10. Blockchain approval unlocks the secondary/royalty infrastructure subject to ownership rules.
11. Blockchain does not require exhibition.

### Binding (12–15)
12. Binding is independent of exhibition.
13. QR/NFC binding may exist with no exhibition.
14. Binding status is independently tracked.
15. Tag replacement creates a new immutable event.

### Exhibition (16–24)
16. Exhibition is always optional.
17. Exhibition requires active physical binding.
18. Exhibition requires blockchain approval.
19. Exhibition requires all fraud/policy gates to pass.
20. Wall slot may exist without exhibition.
21. Wall slot may exist without artwork.
22. Permanent slot QR identifies the slot.
23. Artwork-to-slot mapping occurs through exhibition/placement records.
24. Exhibition activation requires physical verification.

### Commerce (25–30)
25. Primary sales do not require exhibition.
26. Primary sales do not inherently require blockchain.
27. Secondary sales require the required provenance/ownership conditions.
28. Artwall royalties require royalty eligibility.
29. Price history is immutable.
30. Ownership history is immutable.

### WallOS (31–35)
31. Venue hierarchy is Venue → Building → Floor → Room/Zone → Wall → Slot.
32. Wall is physical inventory.
33. Slot is commercial inventory.
34. Wall Manager is distinct from Venue Owner.
35. Wall Consultant is distinct from Wall Manager.

### Community (36–40)
36. Every major public entity is shareable.
37. Physical scans should create discovery opportunities.
38. Community actions must be abuse-controlled.
39. Verified reviews require verified purchases.
40. Private information never appears in public share cards.

### Security (41–48)
41. Central policy engine controls eligibility.
42. Backend authorization is mandatory.
43. Provenance is append-only.
44. Payment webhooks are signed and idempotent.
45. Demand is fraud-resistant.
46. NFC keys remain protected by HSM architecture.
47. Privileged operations require strong authentication and audit.
48. Security verification should use OWASP ASVS 5.0 as the baseline.

---

## 2. MASTER ELIGIBILITY MATRIX (§2) — BACKEND BUSINESS-RULE TABLE

| Artist | COA | Blockchain | Binding | Primary | Exhibition | Secondary |
|---|---|---|---|---|---|---|
| Unverified | None | No | No | ❌ | ❌ | ❌ |
| Identity verified | None | No | No | ✅ | ❌ | ❌ |
| Portfolio verified | None | No | No | ✅ | ❌ | ❌ |
| Curator verified | None | No | No | ✅ | ❌ | ❌ |
| Eligible | Holographic | No | No | ✅ | ❌ | ❌ |
| Eligible | Holographic | Approved | No | ✅ | ❌ | ✅* |
| Eligible | Any | Approved | QR bound | ✅ | ✅ | ✅ |
| Eligible | Any | Approved | NFC bound | ✅ | ✅ | ✅ |
| Eligible | Any | Approved | ArtFrame | ✅ | ✅ | ✅ |

\* subject to configured provenance/ownership policy.

**The hard rule (§2):**
```
EXHIBITION_ELIGIBLE =
  ARTIST_ELIGIBLE
  AND PHYSICAL_BINDING_ACTIVE
  AND BLOCKCHAIN_PROVENANCE_APPROVED
  AND ARTWORK_NOT_BLOCKED
  AND VENUE_SLOT_ELIGIBLE
```

---

## 3. THE FIVE TRUST DIMENSIONS (§3) — NEVER COLLAPSE INTO ONE "VERIFIED"

1. Artist verification
2. Artwork documentation / COA
3. Blockchain provenance
4. Physical binding
5. Transaction eligibility

**Artist verification never means an artwork is authentic or documented (§5).**

### Artist levels (§4): A0 Unverified · A1 Identity · A2 Portfolio · A3 Peer · A4 Curator
Internal values: `identity`, `portfolio`, `peer`, `curator`.

### COA tiers (§6–9)
- **COA-0 / NONE** — a *state*, not a tier. Primary listing allowed; `secondary_eligible=false`,
  `royalty_eligible=false` until provenance met.
- **COA-1 Standard Holographic** — physical only. `HOLOGRAPHIC COA ≠ BLOCKCHAIN PROVENANCE`.
- **COA-2 Premium Holographic** — no automatic blockchain.
- **COA-3 Institutional** — still not automatically blockchain.

### Provenance levels (§10): P0 Registered · P1 Platform · P2 Blockchain Approved · P3 +Physical binding · P4 +Cryptographic NFC

### Binding levels (§11): B0 none · B1 ArtQR · B2 ArtTag NTAG424 DNA TT · B3 ArtFrame

---

## 4. STATE MODEL (§17–19) — NO SINGLE `status` FIELD

**§18 is an explicit technical instruction.** Use orthogonal state domains:
```
artwork_status · artist_verification_status · coa_status · provenance_status
binding_status · listing_status · exhibition_status · ownership_status
secondary_status · royalty_status
```
"This prevents state explosion." A single giant enum is a Bible violation.

**Artwork Control Center (§19)** — mandatory screen at `/studio/artworks/:id` showing every
dimension separately (Documentation / Blockchain / Physical identity / Marketplace /
Secondary / Royalty / Exhibition) with actions: Manage COA, Manage Provenance, Manage
Binding, List, Add to Exhibition, Mint NFT, Archive.

---

## 5. CENTRAL POLICY ENGINE (§154–155) — REQUIRED, NOT OPTIONAL

> "Do not scatter these rules across frontend components." (§155)
> "Do not let the frontend decide this." (§119)

`PolicyEngine` exposes: `canPublishArtwork()`, `canPrimarySell()`, `canBind()`, `canExhibit()`,
`canSecondarySell()`, `canReceiveRoyalty()`, `canTransferOwnership()`, `canCreateOffer()`,
`canActivateExhibition()`.

Inputs: ARTIST_STATUS, ARTWORK_STATUS, FRAUD_STATUS, COA_STATUS, PROVENANCE_STATUS,
BINDING_STATUS, LISTING_STATUS, OWNERSHIP_STATUS, EXHIBITION_POLICY, VENUE_POLICY, SLOT_STATUS.
Outputs: `primary_sale_allowed`, `exhibition_allowed`, `secondary_allowed`, `royalty_allowed`,
`nft_allowed`, `promotion_allowed`.

Repo already has `docs/policy-engine.md` and `src/features/policy/` — reconcile against this.

---

## 6. 15 DATABASE INVARIANTS (§69) — ENFORCE AT DB LEVEL

1. One active exhibition per slot.
2. No exhibition without physical binding.
3. No exhibition without blockchain approval.
4. No exhibition for blocked artwork.
5. No secondary listing without eligible provenance.
6. No royalty-enabled resale without royalty eligibility.
7. Provenance is append-only.
8. Condition reports are append-only.
9. Revenue attribution is immutable.
10. Ownership history is never overwritten.
11. Price history is never overwritten.
12. Slot QR remains slot-bound.
13. Artwork-slot relationship is represented by exhibition/placement.
14. A sold artwork cannot remain available for conflicting primary sale.
15. Decommissioned slot cannot accept exhibition.

---

## 7. PERSONAS & ROLES

### Six personas (§4 Part 1)
Emerging Artist (Priya, Jaipur) · First-Time Buyer (Ananya, Bengaluru) ·
**Venue Owner (Rajesh, Jaipur)** · Curator/Gallery (Meera, Mumbai) ·
NRI Collector (Arjun, Dubai) · Platform Admin (internal).

> **Note on terminology:** the Bible says **Venue Owner**, not "wall owner". The user's
> "wall owner" = Bible's Venue Owner. Distinct from **Wall Manager** (§13, §35) and
> **Wall Consultant** (§13, §35) — three different roles, per Locked Rules 34 and 35.

### WallOS roles (§35) — ten
Venue Owner · Venue Admin · Venue Manager · Wall Manager · Wall Technician ·
Installation Partner · Wall Consultant · Curator · Wall Network Admin · Hardware Admin.

### Admin roles (§24 Part 1, §61 Part 2) — eight, exactly
Super Admin · Operations · Finance · Content · Support · Analytics · Wall Network · Blockchain.

> Repo currently also has non-Bible `curator_admin` / `compliance_admin` (see AGENTS.md).
> These are **not** in the Bible's eight.

---

## 8. SCREENS — BIBLE ROUTES vs CURRENT REPO

Bible public routes (§5 Part 1, §55 Part 2):
`/` · `/explore` · `/artwork/:id` · `/artist/:slug` · `/curator/:slug` · `/exhibition/:id` ·
`/virtual/:id` · `/provenance/:tokenId` · `/verify/:hash` · `/nfc/:sun` · `/walls` ·
`/wall/:slotId` · `/art/:artform` · `/artists/:city`

Buyer: `/dashboard` · `/checkout` · `/orders/:id` · `/collection` · `/wishlist` ·
`/offer/:artworkId` · `/my-collections`

Artist: `/studio` + `/studio/{upload,artworks,verification,earnings,tags,exhibitions,articles,collections,analytics,commissions}`

Curator: `/curator/{dashboard,collections,artists,analytics}`

Venue: `/venue` · `/venue/{walls,calendar,analytics,settings}`

> **Discrepancy to resolve:** repo uses `/discover`, Bible says `/explore`.
> Repo has no `/venue/*` tree — that is the Venue Owner dashboard the user asked for.

---

## 9. WALLOS HIERARCHY (§30–34)

```
ORGANIZATION → VENUE → BUILDING → FLOOR → ROOM/ZONE → WALL → WALL SLOT → DEVICE → EXHIBITION → ARTWORK
```
- **Wall** = physical surface. **Wall slot** = commercial unit (§32).
- **Slot QR is permanent and identifies the SLOT, not the artwork** (§33, Rule 22):
  `QR → Wall Slot → Current Exhibition → Current Artwork`. Never `QR → Permanent Artwork`.
- A slot with no artwork is valid (§34, Rule 21).

---

## 10. EXHIBITION LIFECYCLE — 15 STAGES (§40)

1 MATCHING · 2 VENUE APPROVAL · 3 LOGISTICS · 4 RECEIPT · 5 CONDITION-BEFORE ·
6 INSTALLATION · 7 BINDING VERIFICATION · 8 BLOCKCHAIN VERIFICATION · 9 ACTIVATION ·
10 MONITORING · 11 SALE TRIGGER / ROTATION · 12 DEINSTALLATION · 13 CONDITION-AFTER ·
14 RETURN / SOLD · 15 NEXT CYCLE

State machine (§41): REQUESTED → ELIGIBILITY_APPROVED → MATCHED → VENUE_APPROVED →
LOGISTICS_PENDING → IN_TRANSIT → RECEIVED → INSTALLATION_PENDING → INSTALLED →
BINDING_VERIFIED → BLOCKCHAIN_VERIFIED → ACTIVE → MONITORING → (SALE_TRIGGERED | ROTATION)
→ DEINSTALLATION → CONDITION_CHECK → CLOSED

**§29/§86: installation cannot activate until physical binding scan + blockchain asset verify +
artwork match + slot match + installation evidence all pass.**

**§136 failure policy:** binding invalid → EXHIBITION PAUSED. Blockchain verify fails → PAUSED.
Both restored → REVIEW → ACTIVE.

---

## 11. DEMAND ENGINE (§42–45)

Signals: QR scan · NFC tap · dwell · save · inquiry · repeat visit · virtual-exhibition
interaction · share · buy click · offer.

Score (§43): `Demand = Σ(signal × confidence × recency_decay)` adjusted for venue, art form,
duration, historical conversion, visitor quality, fraud confidence. **Weights configurable.**

**§44 — DO NOT SHOW EXACT THRESHOLD LOGIC PUBLICLY.**
Public: "High Interest" / "Almost Available" / "Strong Demand".
Internal only: `score=81.22 threshold=85.00 confidence=.94`. This reduces gaming.

**§45 fraud defense:** visitor hash, device clustering, IP velocity, scan frequency, time-of-day
anomaly, NFC confidence, venue baseline, bot detection.
> "A thousand automated scans must not equal a thousand real visitors."

**Patent Cluster 2** (§14 Part 1): demand-triggered sale — artwork NOT listed for sale becomes
purchasable when demand crosses threshold. Zero prior art globally.

---

## 12. COMMERCE

### Escrow is OPTIONAL (§A1 — supersedes v2.0)
- **Path A: Escrow Protected** — 10 states, 72-hour inspection, dual-channel.
  Pre-selected if `buyer.order_count == 0 OR artwork.price > 10000`.
- **Path B: Direct Purchase** — 6 states, no inspection, T+2 settlement.
- Field: `checkout.escrow_mode = 'escrow' | 'direct'`.

### Commission on CERTIFICATE TRANSFER only (§A15 — supersedes the 30-day cookie model)
Gallery/curator commission accrues ONLY when the on-chain certificate actually transfers AND
the gallery is recorded as facilitator. `order.facilitator_id`. Consigned works: gallery always
facilitator. Direct discovery: `facilitator_id = null`, no commission.

### Revenue splits (§A15) — **store in versioned `commission_policies`, never hardcode (§91)**
| Scenario | Platform | Gallery | Wall | Royalty | Seller |
|---|---|---|---|---|---|
| Primary, no gallery/exhibition | 10% | — | — | — | 90% |
| Primary, exhibition (Basic) | 10% | — | 2.5% | — | 87.5% |
| Primary, gallery 5% | 10% | 5% | — | — | 85% |
| Primary, gallery + exhibition | 10% | 5% | 2.5% | — | 82.5% |
| Primary, consignment 15% | 10% | 15% | — | — | 75% |
| Secondary, no gallery | 2.5% | — | — | 4% | 93.5% |
| Secondary, gallery 5% | 2.5% | 5% | — | 4% | 88.5% |

### Royalties editable (§A2)
Artist sets 0–10%, auto-approved in range. Above 10% → admin queue. 0% allowed.
**Not retroactive.** Full audit trail. Gallery agreements may impose a floor.

### Offers (§17 Part 1): min 50% of ask, max 2 counter rounds, validity 7/14/30 days.

### Ledger (§92): `ledger_accounts` / `ledger_transactions` / `ledger_entries`.
Double-entry. **Never reconstruct money from orders.**
§83: never set `order.status = REFUNDED` without reversing ledger movements.

> **§82 LEGAL WARNING:** do NOT describe application logic as a legally autonomous "escrow"
> unless the regulated payment structure supports it. RBI requirements apply. Validate before launch.

---

## 13. PRICING (all INR, from the Bible — use these, not invented numbers)

| Item | Price |
|---|---|
| ArtQR Holographic | ₹49 |
| ArtTag NTAG424 DNA TT | ₹150 |
| ArtFrame Lite | ₹350 |
| ArtFrame Pro | ₹2,000 |
| ArtFrame Venue | ₹8,000 |
| Holographic Certificate | ₹99 |
| Polygon zkEVM Certification | ₹499 |
| Base L2 NFT mint | ₹299 + ~₹1 gas |
| Lazy Mint | **Free (default)** |
| WaaS Basic | Free + 2.5% rev share |
| WaaS Pro | ₹999/mo + 5% |
| WaaS Enterprise | ₹4,999/mo + 8% |

Bulk tag discounts: 10+ = 10% off, 50+ = 20% off (§9).
Artwork price validation (§A4): min ₹500, max ₹50,00,000. Stored in **paise, integer**.
GST 5% on fine art.

---

## 14. THREE MINTING PATHS (§10 Part 1)

| Path | Cost | Tradeable NFT | Immediate on-chain |
|---|---|---|---|
| Lazy Mint (default) | Free | No | No |
| Polygon zkEVM Cert | ₹499 | No | Yes |
| Base L2 NFT | ₹299 | Yes (ERC-721) | Yes |

Lazy mint triggers: first sale · NFC binding · exhibition placement · artist request ·
secondary listing. Daily Merkle root anchors all commitments (~₹0.8/tx, ₹292/year).

---

## 15. SMART CONTRACTS (§19 Part 1, §79, §118)

`ArtworkRegistry.sol` · `WallRegistry.sol` · `ExhibitionManager.sol` ·
`RevenueDistributor.sol` · `MerkleVerifier.sol`. Solidity 0.8, UUPS proxy, Polygon zkEVM.

**§118 required controls:** multisig · pause · role separation · upgrade timelock ·
transaction simulation · contract allowlist · rate/amount caps · event monitoring ·
formal invariant testing · audit · bug bounty.

**§19: "All contracts audited before mainnet deployment (planned for Growth phase;
testnet in MVP)."** → **MVP is testnet. Mainnet requires audit + §118 controls.**
This confirms the tracker's F73 gap is real and blocking.

**§80 — blockchain must NOT control everything.**
On-chain: artwork identity, ownership, provenance commitments, royalty rules, wall slot
identity, selected exhibition records, revenue distribution.
Off-chain: KYC, raw images, raw demand signals, visitor data, shipping, internal notes,
condition photos, private business data.

**§119: the application layer is the policy gate**, not the contract, not the frontend.

---

## 16. PRIVACY MASKING (§A13) — PUBLIC vs AUTHENTICATED

| Data | Public | Full access |
|---|---|---|
| Title, images, medium, dimensions | Full | Everyone |
| Artist name/profile | Full | Everyone |
| Verification & certification status | Badges | Everyone |
| Exhibition history | Full | Everyone |
| Scan count | Total | Everyone |
| Creation date | Year + month only | Everyone |
| **Current owner identity** | "Private Collection" | Owner full; artist anonymized ID; admin full |
| **Sale prices** | NOT shown | Buyer/seller of that txn, artist, admin |
| **Buyer name** | NOT shown | Buyer; artist sees first name only; admin full |
| **Transaction hashes** | NOT shown | Owner, artist, admin, authenticated provenance page |
| **Wallet addresses** | NOT shown | Owner (own), admin |

§126: share cards must never leak phone, email, address, private ownership info, KYC.

---

## 17. SECURITY & COMPLIANCE

- **OWASP ASVS 5.0** is the verification baseline (Rule 48, §102). Repo has `docs/asvs-baseline.md`.
- **22 security domains** (§103). **Highest risk** (§104): payment/fund flow, admin privileges,
  smart contracts = Critical.
- **BOLA (§105):** every API call validates user → organization → venue → building → floor →
  room → wall → slot → action. "Never trust an ID just because it is syntactically valid."
- **Admin (§106):** 2FA mandatory, 30-min idle timeout, IP allowlisting, audit log,
  step-up auth. Super Admin: passkey/WebAuthn + hardware key.
- **Payments (§107):** every webhook verifies signature, timestamp, provider event ID,
  idempotency, amount match, order match, currency match, state transition.
  "Never: webhook says success → blindly release money."
- **DPDP Rules 2025** (§120) — not just the Act. Granular consent, never blanket (§121).
  Repo has `docs/dpdp-data-processing-inventory.md`.
- **CERT-In (§123):** ICT logs 180 rolling days, within Indian jurisdiction.
- **9-layer anti-fraud (§112):** L1 pHash · L2 CNN · L3 metadata · L4 KYC · L5 behavior ·
  L6 velocity · L7 payment risk · L8 community · L9 curator. **L1+L2 are BLOCKING at listing.**

---

## 18. TECH STACK PER BIBLE vs ACTUAL REPO — KNOWN DIVERGENCES

| Bible says | Repo actually uses |
|---|---|
| NestJS modular monolith (26 modules, §73) | Next.js App Router + server actions |
| Privy.io auth + MPC wallets | better-auth |
| Supabase PostgreSQL | Neon Postgres + Drizzle |
| Kafka (40+ topics, §75) | Not present |
| TimescaleDB for demand signals | Plain Postgres `demand_signals` |
| MongoDB, Elasticsearch, Redis | Not present |
| AWS EKS + Terraform + ArgoCD | Vercel |
| Cloudflare R2 | Cloudinary |
| `/explore` | `/discover` |

**These are real divergences, not errors to "fix" blindly.** The Bible's *rules* (policy,
eligibility, invariants, privacy, security) are binding. Its *infrastructure choices* were made
for a different deployment target. Do not rewrite the stack; do enforce the rules.
Flag any conflict rather than silently picking one.

---

## 19. EXPLICITLY DEFERRED — NOT IN MVP (§0 Part 1)

CLIP embedding for Exhibition Engine matching (human curation in MVP) · Art-on-rent ·
EMI/BNPL · Soulbound tokens / Legacy Seal · AI pricing assistant · Full art exchange order
book · Visual search via CLIP KNN.

Growth-phase (not MVP): AR wall preview · gift cards · vernacular UI · push notifications ·
Robinhood distribution · custom 3D templates · WhatsApp Business API.

---

## 20. SECTION INDEX — WHERE TO LOOK THINGS UP

**Part 1 (CTO Blueprint):** §0 exec summary · §3 vertical scope (what belongs in ArtWall vs
Artist Wall) · §4 personas · §5 screen inventory · §6 six core flows · §7 design tokens &
component library · §8 artist profile + SEO · §9 physical binding products · §10 blockchain /
minting · §11 curator & collections · §12 wall network + WaaS tiers · §13 wall management
roles · §14 exhibition engine + demand-triggered sale · §15 3D virtual exhibitions ·
§16 marketplace (12-section artwork detail) · §17 offers · §18 provenance (14 event types) ·
§19 smart contracts · §20 DB schema · §21 API (15 endpoints) · §22 Kafka · §23 integrations ·
§24 admin panel (8 roles) · §25 security · §26 infra · §27 scalability · §28 cost · §29 risk ·
§31 roadmap · §32 council debates · §33 10-year roadmap.

**Addendum:** §A1 optional escrow · §A2 editable royalties · §A3 artist onboarding deep-dive ·
§A4 artwork listing deep-dive · §A9 flag & report · §A10 gallery virtual exhibitions ·
§A11 exhibition optional · §A12 NFC story · §A13 privacy masking · §A14 expanded gallery role ·
§A15 commission on certificate transfer.

**Part 2 (WallOS):** §1–2 philosophy + eligibility matrix · §3–5 trust dimensions ·
§6–9 COA · §10 provenance levels · §11–13 binding · §14–15 exhibition eligibility ·
§16–19 lifecycle + state machine + control center · §20–22 artwork screens ·
§23–25 artist flow + 8-step wizard · §26–27 binding/blockchain flows ·
§28–29 exhibition flow + installation · §30–34 WallOS hierarchy + data models ·
§35–38 roles + dashboards · §39–41 layout generator + exhibition state machine ·
§42–45 demand engine · §46–50 community + virality · §51–54 collections + 3D ·
§55–61 screens + admin roles · §62–70 database (13 domains, 80+ tables, SQL, ER, invariants) ·
§71–76 API + security + modular monolith + events · §77–81 infra/storage/blockchain ·
§82–83 payments + refunds · §84–88 logistics/insurance/installation/condition/rotation ·
§89–92 secondary/royalty/commission/ledger · §93–101 monetization (19 streams) ·
§102–119 security (22 domains) · §120–127 privacy/DPDP · §128–135 operational policies ·
§136–141 failure/maintenance/analytics · §142–148 analytics + packages ·
§149–153 enterprise/white-label · §154–157 eligibility + policy engine + system diagram ·
§158–164 flows + 6 valid artwork path variations · §165–167 final state model + **48 rules** +
business architecture.

---

## 21. SIX VALID ARTWORK PATHS (§159–164) — ALL LEGITIMATE

1. **No COA** → verification → primary listing → buyer. Valid (§161).
2. **Holographic COA, no blockchain** → primary sale only. Valid (§162).
3. **Blockchain, no exhibition** → primary + secondary + royalty. Valid (§163).
4. **Binding + blockchain, not exhibiting** → all four eligible, exhibition only when artist
   chooses. Valid (§164).
5. **Exhibition → demand → threshold → sale** → full revenue distribution (§159).
6. **Exhibition → insufficient demand → rotation → return.** No commerce required (§160).

**Any UI that forces artworks down one path contradicts Rules 1–3 and 16.**
