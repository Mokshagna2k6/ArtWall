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
