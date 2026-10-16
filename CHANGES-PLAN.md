# ArtWall — Marketplace-First Restructure (Plan)

Status: **planning only — nothing implemented yet.**
Created 2026-10-15. Reference: https://verisart.com/ (a *subset* of ArtWall, used only
as a layout reference, never as a feature ceiling).

This file exists so the plan survives into a new chat. Read it before touching
the homepage, the header, or the admin/team routes.

---

## 0. What already exists (verified in the repo, do not rebuild)

| Need | Already in repo |
|---|---|
| Catalogue query w/ filters, keyset paging | `features/marketplace/actions.ts` → `discoverArtworks` |
| Catalogue page w/ URL-driven filters | `app/discover/page.tsx` |
| Catalogue caching | `lib/catalog-cache.ts` → `cachedCatalog` |
| Categories + labels | `features/marketplace/categories.ts` |
| Engagement scoring engine | `demand_signals` + `demand_aggregates`, `features/demand/aggregate.ts`, cron `api/cron/demand-aggregate` |
| Curator-chosen works | `curator_picks` table |
| Reaction counts (physical wall) | `pw_reactions` (artworkId, kind, count) |
| Scan/footfall events | `art_tag_scans`, `pw_scans`, `pw_visits` |
| Current marketing homepage | `features/home/landing-page.tsx` (rendered by `app/page.tsx`) |
| Header nav model | `config/nav.ts` (`navItems`, `secondaryNavItems`, `primaryCta`) |
| Admin shell | `/physical-wall/admin` + layout takeover in `app/layout.tsx` |

**There is no `favorites` / `likes` / `views` table.** "Recently favorited" must be
derived from the demand engine, not invented from scratch. See §4.

---

## 1. Logged-out homepage = marketplace

**Decision:** `/` renders the marketplace, not the current marketing landing page.

- `app/page.tsx` becomes the marketplace home for logged-out and logged-in visitors.
- **DECIDED (2026-10-15):** the existing marketing narrative (`LandingPage`) is kept
  and re-routed to its own URL (`/platform` or similar), linked from the header.
  The component is not deleted — the six-systems narrative, living map and stats
  stay reachable for investors and press.
- `/discover` stays as the deep catalogue with full filters. The homepage *Discover*
  section links into it and shares the same `discoverArtworks` action.

### Auth gating (ref image 1)
A logged-out visitor browses freely. Interaction requires auth:

- **Free, no auth:** viewing the homepage, scrolling Discover, opening an artwork
  detail page (SEO depends on this — do not gate artwork pages).
- **Requires auth:** Buy / Add to cart / Favorite / Follow / Make offer / Contact artist.
- Mechanism: those controls link to `/sign-in?next=<current path>` when there is no
  session. Server actions keep their own auth check — the UI gate is UX, not security.
- Do **not** add a blanket middleware redirect. It would break SEO and the artwork
  pages the sitemap already publishes.

---

## 2. Homepage section order (logged out)

Top to bottom, matching the brief:

1. **Hero** — full-bleed, rotating slides (Verisart uses 4). Editorial statement +
   one CTA. Reuse the existing type scale (`font-heading`, `text-display`).
2. **Two-column band:**
   - *Left (wide):* **Trending** — works with the highest recent demand score.
   - *Right (rail):* **Newly listed today** — `artworks` ordered by `createdAt`,
     today first, compact rows (thumb, title, artist, price, BUY).
3. **Second two-column band:**
   - *Left:* **Recently favorited** — see §4 for the signal definition.
   - *Right:* **Today's Pick** — single highest-engagement work of the day,
     large card, with its demand meter (`features/demand/demand-meter.tsx`).
4. **Discover** — tabbed, infinite scroll. Tabs = categories from
   `ARTWORK_CATEGORIES` plus "All". Infinite scroll uses the existing keyset
   cursor from `discoverArtworks`; a visible "Load more" button stays as the
   no-JS and accessibility fallback.

### Why this order
It front-loads inventory and social proof before asking for anything, which is the
point of the Verisart layout. Nothing here needs a new data model except §4.

---

## 3. Header / top bar

ArtWall has far more surface than Verisart, so the extra features move into the bar
rather than being dropped.

- Marketplace-first primary nav: **Discover · Artists · Exhibitions · The Wall · Services**.
- Everything currently in `secondaryNavItems` (Certification, Survey, …) plus
  Community / How It Works / About folds into grouped dropdowns. `config/nav.ts`
  already supports `children` and `visibleChildren` — extend the data, not the
  component.
- Right side: **Login** + **Sign up** when logged out (Verisart pattern), replacing
  the single "Join the Wall" CTA for logged-out visitors.

---

## 4. "Recently favorited" and "Today's Pick" — the data question

**Blocker to resolve before implementation.** There is no favorites table.

Two options:

- **(A) Derive from the demand engine (preferred, no migration).**
  `demand_signals` already records weighted signals per artwork with a timestamp,
  and `demand_aggregates.score` is the rolled-up score. "Recently favorited" =
  top artworks by summed signal weight in the last N days. "Today's Pick" = highest
  `score` with a signal recorded today. Zero schema change; reuses the cron that
  already runs. The label "favorited" becomes a presentation choice over a real
  engagement score — which is how it was described in the brief
  ("validating based on footcount and much more").

- **(B) Add a real `artwork_favorites` table + migration.**
  Honest semantics, but it starts empty, so the section renders blank on launch and
  needs a backfill or a hidden-until-populated state. Also needs auth-gated write
  paths, a new server action, and RLS.

**DECIDED (2026-10-15): (A) — derive from the demand engine. No migration.**
(B) stays available later if an explicit favorite button is wanted as its own feature;
it would write a new signal type into `demand_signals`, leaving the read model unchanged.

A new signal type can be appended to `demand_signals` when a favorite button lands,
so (A) and (B) are not mutually exclusive — (A) is the read model either way.

---

## 5. Admin / team routing

Requested:
- Super admin → `/admin`
- Team member → `/team`

**Both paths are already occupied and this is a real collision:**

- `/admin` today is an unrelated password-gated virtual-wall-tiles tool
  (`app/admin/page.tsx` → `features/admin/admin-panel`), and `app/layout.tsx`
  explicitly *exempts* `/admin` from the admin takeover (`bypassesTakeover`).
- `/team` today is a public marketing page listing the founders
  (`app/team/page.tsx`), linked from the About dropdown in `config/nav.ts`, and
  carries `alternates: { canonical: "/team" }` for SEO.

**DECIDED (2026-10-15):**
1. Tile tool moves to `/admin/tiles`.
2. Public founders page moves to `/about/team`, with a **permanent redirect** from
   `/team` (it carries a canonical tag and a nav link, so the redirect preserves SEO).
   Update the About dropdown in `config/nav.ts` to point at `/about/team`.
3. `/admin` then serves the super admin, `/team` serves team members.
4. The real admin shell lives at `/physical-wall/admin`. Moving it to `/admin`
   touches the layout takeover, every internal link, and the `bypassesTakeover`
   guard — a larger change than the homepage work, hence its own PR.

**Deliberately not bundled with the homepage PR.** It is a routing migration with
SEO and access-control consequences and deserves its own PR.

---

## 6. Suggested PR sequence

1. **PR 1 — Marketplace homepage (logged out).** §1, §2, §4(A). The bulk of the work.
2. **PR 2 — Header restructure.** §3. Small, data-only change to `config/nav.ts`.
3. **PR 3 — Admin/team route migration.** §5.
4. **PR 4–7 — Logged-in studio restructure.** Specified in §8 below.

**DECIDED (2026-10-15):** PRs 1–3 are in scope for the first agent run, as three
separate PRs. **Preview only — no production deploy.** Vercel preview URLs on the
PRs are the review surface; promotion to production is a manual human decision.

---

## 7. Verification (non-negotiable, from AGENTS.md)

- `pnpm typecheck` and `pnpm lint` are necessary but **not sufficient**.
- A real `pnpm build` must pass — `tsc` does not catch a Client Component importing
  from a Server Component page file, which is a live risk here since the homepage
  gains client-side tabs and infinite scroll.
- `pnpm build` needs a working `DATABASE_URL` (sitemap queries the DB at build time).
- Any migration (only if §4 option B is chosen) must be verified against a disposable
  local Postgres first, never production.

---

# PHASE 2 — Logged-in studio + artwork detail (added 2026-10-15)

Reference images: Verisart dashboard (grouped sidebar, "Getting started" checklist,
collections row, All/Certificates/NFTs tabs), artwork detail (Buy Now / Inquire,
Details / COA Plus / History tabs, NFC + printed-certificate panels), and the
inquiry modal.

## 8.0 What already exists (verified — do not rebuild)

| Need | Already in repo |
|---|---|
| Every studio section | `/studio/{artworks,collections,contacts,certificates,exhibitions,tags,calendar,tasks,orders,...}` — 25 routes |
| Studio sidebar | `components/dashboard/studio-shell.tsx` — flat 10-item `navigation` array |
| Studio auth + persona gate | `app/studio/layout.tsx` |
| Contacts table + actions | `contacts` table, `app/actions/contacts.ts` |
| Artwork detail page | `app/artwork/[id]/page.tsx` (259 lines, has provenance + cart buttons) |
| Cart / buy | `features/orders/components/cart-buttons.tsx` |
| QR / NFC tags | `art_tags`, `art_tag_scans`, `features/art-tags/actions.ts` |
| COA / certificates | `coa_certificates`, `provenance_events`, `features/coa` |

**Gaps that need genuinely new code:**
- **No inquiry/message table or UI anywhere.** (§8.5)
- **No AI SDK installed** — no `anthropic`/`openai` dependency. (§8.1)
- Sidebar is flat, not grouped. (§8.3, §8.4)

---

## 8.1 AI assistant (logged-out AND logged-in)

Bottom-right launcher on every page, answering ArtWall questions; escalates hard
ones to a human team member.

- Model: Claude. Use `@anthropic-ai/sdk`; default to the latest Claude model.
  **New dependency — the only one this whole plan adds.**
- Route handler streams the reply. Do **not** ship the API key to the client.
- Grounding: the assistant answers from ArtWall's own content (certification,
  the Wall, pricing, how-it-works). Do not let it invent policy, prices, or
  provenance claims — wrong answers about authenticity are a trust problem, not
  a UX one. Keep its scope explicit in the system prompt.
- **Rate limit it.** An unauthenticated LLM endpoint on a public homepage is a
  direct cost-abuse vector. `packages/ratelimit` already exists — use it.
- Escalation: when the model cannot answer, hand off to a human. Reuse the
  §8.5 inquiry/message pipeline rather than inventing a second one.

**DECIDED (2026-10-15):** an escalated chat lands in the **§8.5 inquiries inbox** —
one message system, one inbox. Escalations appear alongside artwork inquiries.

**DECIDED (2026-10-15):** build the real assistant, strictly rate-limited, key
server-side only. `ANTHROPIC_API_KEY` must be set in Vercel env before it works;
the feature must degrade gracefully (hidden or inert) when the key is absent, so a
missing key never breaks the page.

## 8.2 Overview / dashboard = the one real workspace

Per reference image 1, and the instruction that Artworks gets no separate sidebar entry.

- `/studio` gains a **verification / completion progress** panel ("Getting started",
  N/7 complete) — which steps exist must be derived from real state (profile
  complete, first artwork, first certificate, tag linked, listed for sale,
  collection created, plan selected). Do not hardcode a fake percentage.
- A **collections row** (New collection / Favorites / Purchased style tiles).
- A **tabbed work list** below it: All / Artworks / Certificates / Tags, with
  Filter, Sort and Search — this is what replaces the standalone Artworks page.
- Keep the existing overview panels that already earn their place; add to it,
  do not gut it. The brief says "keep them but add these and make it clean".

## 8.3 Sidebar group 1 — Works

Collapse into ONE sidebar entry containing: **Artworks, Collections, Certificates,
Tags (NFTs)**. Artworks must not remain a top-level item.

## 8.4 Sidebar group 2 — Programme

Collapse into ONE sidebar entry containing: **Exhibitions, Calendar, Tasks**
(reference image 2 — tabbed within a single section).

Net sidebar: Overview · Works · Programme · Contacts · Orders · Settings.
Extend the `navigation` array in `studio-shell.tsx` to support children; keep the
existing active-state logic.

## 8.5 Inquiries → Contacts (the main new build)

Today `contacts` are manually typed in. They should be created by real inquiries.

Flow: visitor opens an artwork → **Inquire about work** → modal (ref image 4:
name, message prefilled with the artwork, 2000-char limit, "sent to the owner")
→ submit → appears in the owner's **Contacts**, where the conversation continues.

Needs a new table (inquiries/messages) linking artwork, sender, recipient, body,
timestamps and a read/replied state, plus a thread view in `/studio/contacts`.

**Requirements that must not be cut:**
- Server-side validation (Zod) and the existing `Result<T>` action contract from
  `src/features/physical-wall/actions/shared.ts` — `action-contracts.test.ts`
  statically scans for this shape.
- **Rate limit + spam protection.** This is an unauthenticated-ish write path that
  emails/notifies a real person. Abuse here goes straight to users.
- Never expose the owner's email to the sender; relay through the platform.
- A migration in `packages/db/migrations/`. Get the next number with
  `ls packages/db/migrations | sort -V | tail -5` — never trust a remembered number.
  **Verify against a disposable local Postgres before it touches the real DB.**

**DECIDED (2026-10-15): sending an inquiry REQUIRES sign-in.** A logged-out visitor
clicking Inquire goes to `/sign-in?next=<artwork path>` and returns to the modal.
This matches the Phase 1 rule (browse free, interact signed in) and gives a real
identity to rate-limit and block. The reference image's name field is therefore
prefilled from the account, not typed.

## 8.6 Marketplace: logged-in vs logged-out

Same layout both ways (Phase 1 §2). Difference: logged-out sees a **limited** set;
logged-in gets **infinite scroll** over the full catalogue. Keep the "Load more"
fallback for no-JS/accessibility.

## 8.7 Artwork detail page

Rebuild `app/artwork/[id]/page.tsx` toward reference images 3 and 5–9:

- Two-column: image viewer (thumbnail strip, prev/next) left; details right.
- Artist name + verified mark, title, price, collection, **NFC/QR linked** indicator.
- **Buy Now only when the work is actually purchasable.** Otherwise show
  **Inquire about work** only — this is explicit in the brief and is a correctness
  requirement, not styling. Derive from real availability/listing state.
- Favourite + Share in the header.
- Bottom tabs: **Details · COA Plus · History**.
  - Details: production year, object type, edition, dimensions, medium, location.
  - COA Plus: verified issuer / creator authorized / physical link, created by,
    signed by, issued by, owned by (respect privacy — ref image shows "Private").
  - History: provenance timeline (already exists), plus **Physical link**
    (NFC tag serial, date linked, linked by) and **Printed certificate** panels.
- Keep the page public and indexable — Phase 1 §1 depends on it for SEO.

---

## 9. PR sequence for Phase 2

5. **PR 5 — Sidebar grouping + Overview rebuild.** §8.2, §8.3, §8.4. No new tables.
6. **PR 6 — Artwork detail rebuild.** §8.7. No new tables.
7. **PR 7 — Inquiries → Contacts.** §8.5. Has a migration; verify on throwaway PG.
8. **PR 8 — AI assistant.** §8.1. Adds a dependency and a billed external call.

Phase 2 PRs must not start until the Phase 1 PRs are merged — they touch
`config/nav.ts`, `app/artwork/[id]/page.tsx` and the homepage, which Phase 1 is
already editing. Overlapping them causes conflicts.

## 10. Still to specify (user will explain)

- The **Create** and **Purchase** actions in the top-right of the logged-in header.
  Placement to be chosen once the options are known.
---

# PHASE 3 — Create/Purchase, Settings, personas, WallOS (added 2026-10-15)

## 11. THE BIBLE — RESOLVED (2026-10-15)

**The Bible has been supplied and is now at `BIBLE.md` in the repo root.**
Read `BIBLE.md` before any Phase 3 work. It carries the 48 Locked Product Rules, the
Master Eligibility Matrix, the 15 DB invariants, the policy-engine contract, privacy
masking, real INR pricing, and a section index back into the source PDF.

**Corrections it forces to this plan — see §22 below.**

### Historical note (what follows was written before the Bible arrived)

## 11b. THE BIBLE PROBLEM (historical)

The user repeatedly says "make sure everything is according to the Bible."
**The Bible is not in this repository and not in the connected Notion workspace.**

Verified 2026-10-15:
- `docs/locked-product-rules-traceability.md` — a *previous session* hit this exact
  wall and documented it: "the original Bible document (**not present in this
  repository**)". It reconstructed rules 1–48 groupings purely from task-level
  citations, and honestly marked **rules 9–15 and 36–40 as ungrouped** because no
  source existed. It explicitly refused to invent them.
- Notion search finds only **ArtWall — Production Readiness Tracker**
  (`3e92da5aa27e8176bf9cf764996dab7b`), which *cites* the Bible
  ("Bible section 118 contract controls", "Bible 15-stage exhibition") but is not
  the Bible. Searches for the document itself fall through to unrelated templates.

**Consequence:** nobody — human or agent — can currently build "according to the
Bible" except where a local citation pins a specific rule. Known citations:
- §118 — smart-contract controls (multisig, pause, role separation) — **F73 says
  none of these exist**. Directly blocks §14 (Mint NFT).
- §166 rules 1–48 — Locked Product Rules (partial reconstruction only).
- "15-stage exhibition" — exhibition flow (FE-3.10).

**STATUS (2026-10-15): the user is sending the Bible.** Phase 3 build work is
PAUSED until it arrives. When it lands: read it first, reconcile §11–§21 against it,
and correct anything below that it contradicts. The Bible wins over this plan and
over the reference screenshots.

**Required action from the user: supply the Bible** (file, Notion link with access,
or PDF). Until then, any agent must build to the *images + existing code* and mark
every Bible-dependent decision as an assumption, rather than claiming compliance it
cannot verify. **Claiming "built per the Bible" without the Bible is a false claim
and must not appear in any PR description.**

---

## 12. Create menu (top-right)

Dropdown: **Create Certificate · Mint NFT · Create Collection** (ref img 10).
Entry points must converge: the overview checklist's "create certificate" and this
menu lead to the same wizard.

## 13. Create Certificate wizard (ref img 11, 12)

Three stages with a progress bar: **Define objects → Add details → List for sale**.
- Define objects: creator selection ("I am the creator" confirmation), object type,
  artwork type (Unique / Edition), privacy (public/private), physical link
  (QR or NFC — yes/no).
- Existing material to reuse: `coa_certificates`, `editions`, `art_tags`,
  `provenance_events`, `features/coa`, `features/art-tags`.
- **Creator confirmation is a legal attestation, not a checkbox.** It must be
  recorded (who, when, what was attested) — this is the basis of every authenticity
  claim downstream. Do not reduce it to UI state.
- Verisart gates some options behind paid plans ("Upgrade to customize", "Unlock").
  **ArtWall has no plan/billing tier model in the schema.** Do not copy the
  upsell UI. Tiers are defined in the Bible — see §17, WAITING.

## 14. Mint NFT — BLOCKED

Ref img 13: wallet connect (MetaMask, Rabby, Coinbase, Ledger, WalletConnect),
chain selection (Ethereum / Base / Polygon / Sepolia testnet), who pays minting cost.

Existing: `contracts/` (Foundry), `features/blockchain/gateway.ts`,
`mint_commitments`, `api/blockchain/*` routes, wallet link/nonce endpoints.

**BLOCKER:** the tracker's F73 states none of the Bible §118 contract controls
(multisig, pause, role separation) exist, and SEC-3.10 tracks the same gap.
Minting real NFTs on mainnet without those controls is an irreversible,
funds-bearing operation. **Do not ship mainnet minting until §118 is supplied and
its controls are implemented and audited.** Testnet-only is acceptable meanwhile,
clearly labelled as such.

## 15. Create Collection (ref img 14)

Cover image, name, description, website URL, privacy toggle, "Add works".
`collections` + `collectionArtworks` already exist, with a `type` field
(BUYER / ARTIST / CURATOR) that drives authorization in
`features/collections/policy.ts` and **is never client-trusted**. The new form must
respect that policy — do not let the client choose the type freely.

## 16. Purchase — printed certificate / starter pack (ref img 15, 16)

"Order your certificate": printed holographic certificate + pre-linked NFC tag +
delivery. Verisart shows $25 for 1 Starter Pack, plus a "See other products" catalogue.

**User instruction: prices must be editable in the admin panel, not hardcoded.**
**DECIDED (2026-10-15): admin-editable products priced in INR/paise.**
- Needs a products/SKU model with admin CRUD, or reuse of `pwAddonCatalog` /
  `marketplaceSettings` if either fits. **Check before adding a table.**
- Currency: ArtWall is INR (`formatINR`, paise everywhere). **Do not copy USD.**
- Physical fulfilment implies shipping/address/tax. `shipments` + `shipment_events`
  exist. Scope this carefully — it is a real commerce flow, not a modal.

## 17. Settings (ref img 16)

Sub-sidebar: Account · Billing · Wallets & Contracts · Payouts · Authorizations ·
Customization · Security · Notifications · API Access.

Existing: `/studio/settings`, `payouts` table, wallet link endpoints,
`admin_role_assignments`.
**Not existing:** billing/plans, API access/keys, customization, authorizations.

**WAITING ON THE BIBLE (2026-10-15):** the user states the Bible contains the
plan/tier and billing information. Do NOT invent a pricing model, do NOT copy
Verisart's Upgrade/Unlock UI, and do NOT build Billing or API Access until the
Bible defines them. Build only the Settings tabs backed by real data today
(Account, Wallets, Payouts, Security, Notifications).

## 18. Personas — wall owner is a NEW fourth persona

Today `features/onboarding/actions.ts` has `PERSONAS = ["artist","curator","buyer"]`
and `destination.ts` routes artist→`/studio/onboarding`, curator→`/curator/apply`.

User wants sign-in to ask **wall owner vs artist/curator**, with a **completely
different dashboard** for wall owners.

**DECIDED (2026-10-15): two-step sign-in choice.** Step 1 asks **wall owner vs
artist/curator**; step 2 (for the latter) is the existing artist/curator/buyer
choice. Wall owners get an entirely different dashboard. This CHANGES the existing
onboarding flow for everyone — `features/onboarding/persona-choice.tsx` and
`destination.ts` both change, and existing users with a persona must not be
re-prompted or have their persona reset.

- Add `wall_owner` to PERSONAS + `persona-choice.tsx` + `destinationFor`.
- **`user.role` must NOT change.** Per AGENTS.md, role is a flat access tier
  (`visitor|artist|staff|admin`) and persona is a separate axis. Do not conflate.
- Wall owner dashboard is a new surface. `walls`, `wallos_slots`, `venues`,
  `buildings`, `floors`, `rooms_zones`, `organizations` already exist.

## 19. WallOS placement under Exhibitions

User: "WallOS is an entirely different thing and should come under the exhibition
section for the artist, for choosing which place they should place them."

So: **artists** browse/choose wall placements from inside Exhibitions (Phase 2
"Programme" group). **Wall owners** manage their walls from their own dashboard.
Same data (`wallos_slots`), two very different views. `features/wallos/actions.ts`
exists — read it before designing either.

---

## 20. PR sequence for Phase 3

9.  **PR 9 — Create menu + Create Collection.** §12, §15. Smallest, no new tables.
10. **PR 10 — Create Certificate wizard.** §13. Large; attestation recording matters.
11. **PR 11 — Wall owner persona + dashboard.** §18. Touches onboarding + auth.
12. **PR 12 — WallOS under Exhibitions.** §19.
13. **PR 13 — Settings expansion.** §17, only the tabs backed by real data.
14. **PR 14 — Purchase / printed certificates.** §16, needs the pricing decision.
15. **BLOCKED — Mint NFT.** §14, until Bible §118 is supplied.

## 21. Open questions for the user (ask before building)

1. ~~Supply the Bible.~~ **User is sending it. Phase 3 is PAUSED until it lands.**
2. ~~Plans/billing tiers~~ — **in the Bible.** Do not invent. (§13, §17)
3. ~~Printed-certificate pricing~~ — **DECIDED: admin-editable, INR.** (§16)
4. API Access — a public API is not in the schema; check the Bible. (§17)
5. ~~Buyer persona~~ — **DECIDED: two-step choice, wall owner asked first.** (§18)
6. Mainnet vs testnet minting policy — check Bible §118. (§14) **Still blocked.**

---

## 22. BIBLE CORRECTIONS TO THIS PLAN (2026-10-15)

The Bible arrived after Phases 1–2 were built. These are the conflicts. **`BIBLE.md` wins.**

### 22.1 "Recently favorited" — the demand score must NOT be shown publicly
Phase 1 §4 chose to derive Trending / Recently favorited / Today's Pick from
`demand_signals` + `demand_aggregates`. That data source is correct and stays.

**BUT Bible §44 is explicit: "DO NOT SHOW EXACT THRESHOLD LOGIC PUBLICLY."**
Public surfaces may show only qualitative bands — "High Interest", "Almost Available",
"Strong Demand". Exact `score` / `threshold` / `confidence` are internal only, because
exposing them lets people game the demand-triggered sale (Patent Cluster 2).
**AUDITED (2026-10-16): PASS — no leak.**
- `demand-meter.tsx`: renders a *relative* bar (score/maxScore) plus a qualitative
  "Trending" label. No raw score, threshold or confidence rendered.
- Phase 1 homepage (`marketplace-home.tsx`, `artwork-card.tsx`): zero references to
  score/threshold/confidence.
- `marketplace-data.ts`: uses `score` only in server-side SQL `order by` / `where`.
Numbers never cross to the client. §44 satisfied as built. Re-audit if any section
later renders a figure.

### 22.2 Artwork detail "Buy vs Inquire" — now has a precise rule
Phase 2 §8.7 said "Buy Now only when genuinely purchasable", derived loosely.
Bible §14/§42 makes it exact: an exhibited artwork is **not** listed for sale by default.
It shows **Save + Inquire** only. "Buy Now" appears when the demand threshold is crossed
and the Sale Trigger Service flips it to purchasable. Direct marketplace listings are
separately purchasable under the eligibility matrix (§2).

### 22.3 Inquiries are a DEMAND SIGNAL, not just a contact form
Phase 2 §8.5 modelled inquiries as messages → contacts. Correct, but incomplete.
Bible §14 lists **"Inquiry count — MEDIUM, purchase intent"** as a weighted demand signal.
An inquiry must therefore also write a `demand_signals` row. Missing this breaks the
demand engine's inputs.

### 22.4 "Favorites/Save" is a real Bible feature after all
Bible §14 and §46 list **Save / wishlist** as a first-class signal and community action,
and §5 defines `/wishlist` as an MVP buyer screen. So option (B) from §4 — a real
favorites table — is not merely "later", it is **in the MVP**. (A) remains the correct
read model for ranking; the explicit Save button writes both a favorite row and a
`demand_signals` row.

### 22.5 Route naming — DECIDED: rename to `/explore` per the Bible
Bible §5 / §55. **DECIDED (2026-10-15): rename `/discover` → `/explore`.**
Needs a permanent 308 redirect from `/discover` (it is in the sitemap and linked from the
Phase 1 homepage + footer). Touches the Phase 1 branch before it merges. Update
`config/nav.ts`, the homepage Discover section links, and the footer.

### 22.6 Personas: "wall owner" = Bible's **Venue Owner**
Phase 3 §18 used the user's wording. The Bible's persona is **Venue Owner** (§4), with
**Wall Manager** and **Wall Consultant** as separate roles (Locked Rules 34, 35).
The venue dashboard tree is `/venue`, `/venue/walls`, `/venue/calendar`,
`/venue/analytics`, `/venue/settings` (§57). Do not invent new paths.

### 22.7 Billing/tiers — ANSWERED by the Bible
WaaS: Basic free + 2.5% · Pro ₹999/mo + 5% · Enterprise ₹4,999/mo + 8% (§12).
Artist packages: Free / Trust / Premium (§146). Buyer side stays free (§145 — "do not
charge buyers for everything"). **No invented pricing. Verisart's Upgrade/Unlock UI is
still not a model to copy.**

### 22.8 Printed certificates — real prices exist
Holographic Certificate ₹99 · ArtQR ₹49 · ArtTag ₹150 · ArtFrame ₹350/₹2,000/₹8,000.
Bulk: 10+ = 10% off, 50+ = 20% off. Still admin-editable per the user's instruction,
but seed from these, in paise.

### 22.9 Mint NFT — still blocked, now confirmed by the Bible itself
§19: "All contracts audited before mainnet deployment (planned for Growth phase;
**testnet in MVP**)." Plus §118's control list (multisig, pause, role separation, timelock).
**MVP ships testnet-only, clearly labelled. Mainnet needs the audit + §118 controls.**

### 22.10 The Create wizard is 8 steps, not 3
Phase 3 §13 used Verisart's 3-stage wizard from the screenshot.
**Bible §24 defines 8 steps:** images → details → authentication → COA → digital
provenance → physical identity → marketplace → exhibition. §25 adds the exhibition
eligibility check with a BLOCKED state listing what is missing.
**DECIDED (2026-10-15): build the Bible's 8 steps, progressively disclosed is acceptable
only if all 8 remain independently settable.** The screenshot's 3-stage flow is rejected
because it bundles COA + provenance + binding, contradicting Locked Rules 1–4 and §18.

### 22.11 No single `status` field (§18) — applies to everything we build
`artworks` in the repo today has a single `status`. The Bible mandates orthogonal domains:
`coa_status`, `provenance_status`, `binding_status`, `listing_status`, `exhibition_status`,
`ownership_status`, `secondary_status`, `royalty_status`. Any new artwork work must not
deepen the single-enum design.

### 22.12 Stack divergences are NOT defects
See `BIBLE.md` §18. The Bible specifies NestJS/Kafka/Privy/Supabase/AWS; the repo is
Next.js/Drizzle/better-auth/Neon/Vercel. **Do not rewrite the stack.** The Bible's *rules*
bind; its *infrastructure* was chosen for a different target. Flag conflicts, never silently
"fix" them.

---

## 23. DUMMY / SEED DATA (decided 2026-10-15)

**DECIDED: seed a Neon BRANCH database wired to PR preview deploys. NOT production.**
Production (`ep-royal-wildflower`, per HANDOFF §2) stays clean. Removing the seed later is
dropping a branch, not surgery on live tables.

### Requirements
- Every row carries `is_seed = true` (or lives only on the branch) so a purge is one command.
- Data must behave like real data: editable, deletable, flowing through the same policy engine,
  eligibility matrix and invariants. No special-casing seeded rows in application logic.
- **Credentials are written to a local gitignored file and handed to the user directly — never
  echoed in chat, never committed.** (AGENTS.md: never echo credentials in any output.)
- Passwords are per-account and random, not a shared literal.

### Accounts to seed — one per role so every surface can be verified

**Platform personas (Bible §4):**
| Persona | Verification | Purpose |
|---|---|---|
| Artist A0 | Unverified | proves primary listing is BLOCKED (eligibility matrix row 1) |
| Artist A1 | Identity | primary listing allowed, exhibition blocked |
| Artist A2 | Portfolio | same, with portfolio badge |
| Artist A4 | Curator verified, fully enabled artwork | exhibition + secondary + royalty all live |
| Buyer (first-time) | — | escrow pre-selected (§A1: order_count==0) |
| Buyer (repeat) | — | direct-purchase path available |
| NRI Collector | KYC | owned portfolio, re-exhibition, secondary listing |
| Curator | Curator Verified | collections, commission, attribution |
| Gallery | Gallery Verified | team roles, consignment, white-label (§A14) |
| **Venue Owner** | GSTIN verified | WaaS Basic/Pro/Enterprise — one of each tier |
| Wall Manager | — | multi-venue ops dashboard (§36) |
| Wall Consultant | — | advisory role (Rule 35) |

**Admin — all 8 Bible roles (§24/§61), one account each:**
Super Admin · Operations · Finance · Content · Support · Analytics · Wall Network · Blockchain.
Each must demonstrably see only its permitted sections.

### Content to seed
- Artworks covering **all 6 valid paths** (§159–164): no-COA, holographic-only,
  blockchain-no-exhibition, bound+blockchain-not-exhibiting, exhibited-and-sold,
  exhibited-and-rotated.
- WallOS tree: ≥1 organization → venue → building → floor → room → wall → slots,
  including an **empty slot with an active QR** (Rule 21).
- Demand signals across several artworks so Trending / Today's Pick render with real data
  — **but public surfaces show only qualitative bands (§44), never numeric scores.**
- Orders in both escrow and direct paths, at several of the 10/6 states.
- Inquiries that also wrote `demand_signals` rows (§22.3).
- Provenance chains with append-only events (Invariant 7).

### Purge
A single documented command removes all seed data. The user says when.

---

## 24. AGENT RUN STATUS (2026-10-16)

Both background agents stalled on a 600s watchdog timeout (not a rate limit). Work on disk
was assessed directly rather than trusting the agents' last words.

### Landed and committed
| Branch | State |
|---|---|
| `pr5-studio-overview` | 1 commit — sidebar grouping + overview rebuild |
| `pr6-artwork-detail` | 3 commits — detail rebuild, sign-in param fix, **Bible §14/§42 fix (exhibited work is not for sale)** |
| `pr7-inquiries` | Shares pr6's commits; **inquiry modal NOT yet committed** |
| `seed-demo-data` | **Empty — no commits, no seed script produced** |

### Uncommitted on disk
- `packages/db/migrations/0068_pw_qr_slot_subject.sql` — widens `pw_qr_tokens` subject CHECK
  so a QR can bind to a **slot** rather than an artwork. Written against **Locked Rules 21/22
  and Invariant 12** (slot QR is permanent and slot-bound, never artwork-bound). Correct in
  intent; **unverified against a throwaway Postgres.** Do not apply until tested.

### Pre-existing, NOT agent output — and a real gap
`apps/web/scripts/seed-accounts.mjs` (dated Oct 10) already exists. Its only guard is
`NODE_ENV === "production" && !SEED_PASSWORD`. **That is not sufficient**: NODE_ENV is not
set to "production" when running a script locally against a production `DATABASE_URL`, so
this script would happily seed the live Neon instance. The new seed work must guard on the
**hostname** of DATABASE_URL, not on NODE_ENV.

### Still outstanding
- PR 7 inquiry modal + the `demand_signals` write (§22.3).
- Entire seed/dummy-data deliverable (§23) — not started.
- PR 8 AI assistant — not started.
- `/discover` → `/explore` rename — assigned to nobody yet (Phase 1 branch).

---

## 25. SEED DATA — DELIVERED (2026-10-16)

Branch `seed-demo-data`, commit `1c02c66`. Not deployed. 22 accounts, all 6 artwork paths.

### Independently verified by the main session (not taken on trust)
- `SEED-CREDENTIALS.md` exists (7.3KB) and is **untracked** — `git ls-files` errors on it.
- Commit contains **zero** password-like strings; credentials file absent from the commit.
- Live refusal test, production pooler host → `REFUSED: ...is the PRODUCTION database.`
- Live refusal test, no URL → refuses, explicitly states it never falls back to `.env`.
- Guard unit-tested earlier by this session: prod host, prod pooler, branch, localhost,
  unparseable, undefined — all six behave correctly, fails closed.

### Key design decisions (agent's, accepted)
- **Reads `SEED_DATABASE_URL`, never `DATABASE_URL`** — production cannot be inherited
  from `apps/web/.env`. Confirmed: that .env does point at production.
- **Fixed, not superseded,** the weak `NODE_ENV` guard in the pre-existing
  `seed-accounts.mjs` — it is the only super-admin bootstrap, so leaving it loaded
  and pointed at production was not acceptable.
- **No `is_seed` column.** Seeded rows carry a `seed_` id prefix instead, avoiding a
  ~25-table migration. No application logic special-cases seeded rows, so data flows
  through the real policy engine exactly as required.
- Eligibility verified by recomputing gates over seeded rows via `features/policy/trust.ts`,
  not by setting status fields. Rules 17–18, Invariants 1 and 12 all hold.

### Known limitations — carried forward, do not lose
1. **Purge cannot empty `demand_signals`.** Its trigger (migration 0045) raises on DELETE
   unconditionally, with no erasing-user hatch. Purge removes the artwork + aggregate and
   leaves orphan analytics rows (no personal data). **Correct call — a production invariant
   must not be disabled to tidy demo data.** Dropping the Neon branch is the real cleanup.
2. **Nothing is seeded anywhere persistent yet.** It ran on a throwaway Docker container
   that was deleted. To use it: create a Neon branch, apply migrations, run with
   `SEED_DATABASE_URL` set.
3. **Slot QRs are skipped** unless migration `0068_pw_qr_slot_subject.sql` (the Phase 2
   agent's, still uncommitted) is applied. The seed warns rather than failing or bypassing
   the constraint. If 0068 is dropped, the seed needs its own renumbered migration.
4. **No `/venue/*` route tree** — the three Venue Owner accounts have correct data but
   nowhere to land. Phase 3 §18/§19 work.
5. **`orders` has no `escrow_mode` column**, contrary to Bible §A1's field name. The agent
   represented escrow by the presence of an `escrow_holds` row (how migration 0067 models
   it) rather than inventing a column. **Open question:** add the literal field or keep the
   current modelling?

### Not verified by anyone
No seeded account was signed into via a browser. Role gating is verified at the data layer
(correct `admin_roles` rows + `user.role='admin'`), not by clicking through all 8 consoles.

---

## 26. PHASE 2 — DELIVERED (2026-10-16)

Four PRs open on `Mokshagna2k6/ArtWall`. **Stacked — merge in order 5 → 6 → 7 → 8.**

| PR | Branch | Base | URL |
|---|---|---|---|
| 5 | `pr5-studio-overview` | `production-v2` | https://github.com/Mokshagna2k6/ArtWall/pull/1 |
| 6 | `pr6-artwork-detail` | `production-v2` | https://github.com/Mokshagna2k6/ArtWall/pull/2 |
| 7 | `pr7-inquiries` | `pr6-artwork-detail` | https://github.com/Mokshagna2k6/ArtWall/pull/3 |
| 8 | `pr8-ai-assistant` | `pr7-inquiries` | https://github.com/Mokshagna2k6/ArtWall/pull/4 |

### Independently verified by the main session
- All four PRs confirmed OPEN via `gh pr list`. **PR creation now works** — the token
  limitation recorded in §24/HANDOFF §4 no longer applies. Phase 1's three branches can
  and should get PRs too.
- **§44 satisfied structurally:** `purchasability()` takes `thresholdCrossed` as a
  **boolean only, never the score** — the signature makes a leak impossible, not merely
  unlikely. Verified in `features/marketplace/purchasable.ts`.
- **§22.3 satisfied:** `features/demand/signals.ts` inserts into `demand_signals` with a
  weight and catches failures (fire-and-forget, so telemetry cannot fail a real inquiry).
- **Escalation LEFT join confirmed** at `features/inquiries/actions.ts:300` — escalations
  with no artwork appear in the inbox instead of being silently hidden.

### Migrations: 0069 + 0070 (NOT 0068)
The agent found the other agent's uncommitted `0068_pw_qr_slot_subject.sql` and renumbered
around it. Verified on disposable postgres:17 **with 0068 present**, so coexistence is
proven. CHECK constraints were *executed*, not read: 5 inserts / 5 rejections on 0069;
all three invalid shapes rejected on 0070. Containers removed. Never production.

### Decisions the agent had to make — review these
1. **No plan/subscription table exists**, so §8.2's "plan selected" checklist step was
   substituted with "publish your public profile" (real state) rather than faking it.
   One-line change if plans ever land.
2. **`artworks` stores ONE image**, so the multi-image viewer's thumbnail strip only
   appears from a second image onward. `shortcut:` comment left; needs an image table.
3. **Escalation routes to the oldest `role='admin'` account** — no support-queue model
   exists. Resolved at write time, not hardcoded. `shortcut:` comment left.
4. **Used `callbackUrl`, not `next`.** On `production-v2` the sign-in page reads
   `callbackUrl` and ignores `next`; using `next` would have silently dropped the return
   trip. Works before *and* after Phase 1 adds `next` as an alias.
5. **PR 8 required migration 0070** because PR 7's `artwork_id` was `NOT NULL`, making
   "escalate into the inquiries inbox" unimplementable without it.

### Dependency hazard — fixed, worth knowing
`@anthropic-ai/sdk` pulls `@opentelemetry/api`, an **optional peer of drizzle-orm** → two
drizzle copies → **every `eq(column, value)` in the repo failed typecheck**. Fixed by
declaring that peer in `packages/db`. The symptom (hundreds of unrelated drizzle errors)
looks nothing like the cause — note this before anyone adds another SDK.

### Open risk — one test flake, disclosed
`action-contracts.test.ts > "a database failure comes back as a flat message"` failed once
at 5092ms during PR 7's first full run while Docker was starting. Passed 4 consecutive runs
after, passes in isolation, and imports no inquiry code. Judged environment contention —
**but it is a single observed failure, not provably clean.**

### Not verified by anyone
No browser/manual UI testing — nobody has clicked the modal, viewer, tabs or chat widget.
The Anthropic API was never called live (no key), so the assistant's streaming path is
verified only to compilation and the no-key path.
