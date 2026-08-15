# ArtWall — Figma redesign brief

Paste this into Figma AI, or hand it to a designer. It describes the whole
product, every screen, and the file hygiene needed for the result to be
implemented in the codebase without guesswork.

When the file is ready, share it and the implementation happens from it directly.

---

## 1. What you are designing

**ArtWall Labs** is India's infrastructure for artists — 42 million of them,
in a ₹30,000 crore market where up to 85% of a sale is absorbed before the
maker is paid.

It is **three products in one codebase**:

1. **The marketing site** — the public argument for why this exists.
2. **The Studio** — an artist's private workspace (catalogue, sales,
   provenance, invoices).
3. **The Physical Wall** — operational software for a real, physical art wall
   inside the Ric Platter restaurant in Jaipur. Artists book slots, staff hang
   the work, visitors scan a QR beside it, and a coupon at the counter tracks
   the restaurant revenue the art drove.

These three must feel like one company. Today they nearly do; the redesign
must not split them into three visual languages.

---

## 2. The aesthetic — read this before drawing anything

The site is a **gallery, not a SaaS dashboard**. Every deviation below is a
regression, not a style choice:

- **Editorial, near-monochrome.** White paper, near-black ink, hairline rules.
  Colour is not how meaning is carried.
- **Straight edges.** Corner radius is `4px`. Rounded cards read as consumer
  app; a gallery frames things with straight edges.
- **One accent hue only** — a deep teal `#0e7490`. It is reserved for the
  short tracked chapter labels ("02 SERVICES") and the occasional live signal.
  **Never a button. Never body copy. Never twice in the same block** — the
  moment a second thing is teal, neither is emphasis.
- **Rules, not boxes.** Sections separate with a single hairline, not with
  cards, shadows or coloured bands. There is exactly one tonal band on the
  home page and that is deliberate.
- **Restraint.** Reference point is a real art business, not a startup landing
  page. Oversized display type is the main thing that makes a page read wrong.
- **The work is the loud thing.** Artwork images carry the colour. The
  interface does not compete with them.

**Do not introduce:** gradients, drop shadows, glassmorphism, coloured status
pills as the primary signal, illustration mascots, or a second accent colour.

---

## 3. Foundations — build these as Figma Variables first

Name them **exactly** as below. These are the live code tokens; matching names
means the build is a translation rather than an interpretation.

### Colour

| Variable | Hex | Use |
|---|---|---|
| `ink` | `#0c0f1d` | Primary text, primary buttons |
| `ink-muted` | `#64748b` | Secondary text |
| `wall-paper` | `#ffffff` | Page background |
| `wall-charcoal` | `#f1f5f9` | Rare tonal fill |
| `wall-elevated` | `#f8fafc` | Rare raised fill |
| `band` | `#f7f9fb` | The quiet band, input grounds |
| `hairline` | `#e2e8f0` | Default rules and borders |
| `hairline-strong` | `#cbd5e1` | Input borders, emphasised rules |
| `signal` | `#0e7490` | The one accent. Eyebrows, live states |
| `signal-bright` | `#38bdf8` | On-dark counterpart only |
| `footer` | `#1c2e38` | Footer ground, confirmation cards |
| `ember-glow` | `#2b3245` | Primary button hover |
| `terracotta` | `#94a3b8` | Warning / attention states |
| `destructive` | (define) | Errors, destructive actions |

Body copy on the footer sits at 70% white, quiet metadata at 45%. Both clear
WCAG AA — keep those ratios.

### Type

Two families: **Fraunces** (headings, `font-heading`) and **Inter** (body,
`font-sans`). Create these as Figma text styles, named by **role, not by
heading level** — a card title and a page title must never be sized by
whoever wrote the markup that day.

| Style | Size (375 → 1440) | Weight | Tracking | Leading |
|---|---|---|---|---|
| `display` | 36 → 56 | 500 | −0.03em | 1.1 |
| `section` | 26 → 36 | 500 | −0.025em | 1.25 |
| `subsection` | 20 → 24 | 500 | −0.02em | 1.35 |
| `card` | 18 fixed | 500 | −0.015em | 1.45 |
| `lead` | 17 → 19 | 400 | — | 1.65 |
| `body` | 16 fixed | 400 | — | 1.75 |
| `small` | 14 fixed | 400 | — | 1.6 |
| `label` | 13 fixed | 400 | — | 1.125rem |
| `caption` | 12 fixed | 400 | — | 1rem |
| `eyebrow` | 12 fixed | 500 | **0.16em**, uppercase | 1 |
| `numeral` | 64 → 144 | 500 | −0.04em | 0.8 |

The scale must be **strictly descending at every breakpoint** — a section
heading larger than the page heading above it is the bug this scale exists to
prevent.

### Spacing, radius, grid

- Spacing scale: `4, 8, 12, 16, 24, 32, 48, 64, 96` px.
- Radius: `4px` (`sm` 2.4, `md` 3.2, `lg` 4, `xl` 5.6).
- Page max width: `1240px`, gutters `20px` mobile / `32px` tablet / `64px`
  desktop.
- Breakpoints to design at: **375, 768, 1024, 1440**.

---

## 4. File structure Figma must deliver

This is what makes the file implementable. Please follow it exactly.

```
📄 Pages
   00 · Cover & changelog
   01 · Foundations        (variables, type, grid, iconography)
   02 · Components         (the library, with variants)
   03 · Marketing site
   04 · Auth & onboarding
   05 · Studio
   06 · Physical Wall — public
   07 · Physical Wall — artist
   08 · Physical Wall — staff & admin
   09 · Patterns & states   (empty, loading, error, success)
```

Rules:

1. **Name every top-level frame after its route.** `/physical-wall/book`, not
   "Booking screen v3". This is how designs get matched to files.
2. **Everything reusable is a Component with variants.** Variant properties
   should be named as props: `variant=primary|quiet|danger`, `state=default|
   hover|focus|disabled|pending`, `size=sm|md|lg`.
3. **No detached instances** in screen frames.
4. **No raw hex.** Every fill and stroke bound to a variable. If a new colour
   is genuinely needed, add it as a variable and flag it on the cover page.
5. **Auto Layout everywhere**, with real constraints, so responsive intent is
   readable.
6. **Annotate anything non-obvious** — interaction, motion, validation rules —
   in a note beside the frame, not in a separate document.
7. Show **every state**: default, hover, focus-visible, disabled, loading,
   empty, error, success. Empty states matter more than usual here — this is a
   pre-launch product and most screens start empty.

---

## 5. Component library to build (page 02)

**Primitives:** Button (primary / quiet / danger / ghost × sm/md/lg × states),
Input, Textarea, Select, Checkbox, Radio, Switch, Date picker, Search field,
File drop zone, Badge / status pill, Tooltip, Avatar, Tabs, Accordion,
Breadcrumb, Pagination, Toast, Modal / dialog, Drawer, Skeleton loader,
Progress bar, Stepper, Legend, Empty state, Table (with sortable header),
Metric card, Alert / callout.

**ArtWall-specific:**
- **Wordmark & logo** (existing marks — refine, do not replace outright)
- **Artwork card** — image-topped, slot badge, artist, medium, scan count
- **Artwork tile** (wall / masonry variant)
- **Wall slot** — the physical wall cell, in `read` / `select` / `edit` modes,
  and in all 9 lifecycle states (available, reserved, booked, received,
  installed, live, ended, maintenance, blocked)
- **Wall grid** — the whole wall, slots sized to their real proportions
- **City marker + city panel** — for the living map
- **QR poster / label** — the printed artwork label and the visitor coupon
- **Price breakdown** — line items, discounts, GST, total
- **Consent row** — the checkbox + plain-language notice pattern
- **Checklist item** — with the "why this is on the list" sub-line
- **Certificate / COA** — the provenance document
- **Founding member card** — the shareable graphic

---

## 6. Screens to design

### 03 · Marketing site

| Route | What it is |
|---|---|
| `/` | Home. Hero → stats bar → six systems → why (24 failures) → ArtWall for (3 audiences) → living map → testimonials → join |
| `/platform` | Services. The six systems in full, each with its diagram |
| `/journey` | How it works, registration → royalties |
| `/about` | The company, the mark, FAQs |
| `/community` | Community + the archetype quiz (multi-step, result state) |
| `/artists` | Artist directory / grid |
| `/artist/[handle]` | Public artist profile — bio, location, artwork grid |
| `/certificate` | How provenance works + interactive certificate demo |
| `/preview` | "See it hung" — put your work on a gallery wall (room picker) |
| `/wall` | The **digital** wall — a living collection, drag/scroll, tile dialog, upload flow |
| `/join` | Join the founding cohort — form, founder number, certificate |
| `/survey` | Pain-point survey (multi-step) |
| `/contact` | Contact |
| `404` | Not found |

**Home page detail.** Chapters are numbered (`01`…`07`) with a tracked eyebrow
and a large chapter numeral on the right at desktop. Each chapter: eyebrow →
`section` heading → `lead` paragraph → content. Keep that rhythm — a section
missing its heading is the single thing that made one chapter read as thin.

**The living map** deserves particular attention. It is a map of India with 46
art cities as points of light, sized by how many artists have joined from
each. It has: a stats header (cities lit / artists / practices), region filter
chips, a search field, the map itself with a hairline national outline, a
legend, and a **city detail panel** showing artist count, works on the wall,
founding members, a practice breakdown, and thumbnails of work from there.
Design the panel for **zero, one, and many** artists — the empty state is the
invitation and matters most.

### 04 · Auth & onboarding

| Route | Notes |
|---|---|
| `/sign-up` | Two-column: left is the argument + a 3-step "what happens next"; right is the form. Includes a **password strength meter** and a **plain-language data notice** at the point of collection |
| `/sign-in` | Same shell, leaner form. No meter, no notice |
| `/physical-wall/welcome` | **The consent gate.** Age declaration → required account consent → optional profile publication and marketing (separate, unticked) → founding member opt-in. Also design the **under-18 parental-consent path** |
| Auth error states | Wrong password, email already registered (with "sign in instead"), rate limited |

Consent design is legally load-bearing (India's DPDP Act). Optional consents
must never be pre-ticked or bundled with a required one. Withdrawal must look
exactly as easy as granting.

### 05 · Studio (artist workspace)

Shell: persistent sidebar + header. 20 screens, most currently empty states:

`/studio` (overview) · `artworks` · `artworks/new` · `collections` ·
`series` · `editions` · `exhibitions` · `rooms` · `locations` · `calendar` ·
`tasks` · `contacts` · `sales` · `invoices` · `payments` · `documents` ·
`certificates` · `provenance` · `insights` · `reports` · `settings` ·
`onboarding`

Design: the shell, the overview, **one rich example** (`artworks` with a
populated grid + the new-artwork form), and **the empty-state pattern** that
the other 17 inherit. Do not draw 20 unique empty screens.

### 06 · Physical Wall — public

| Route | Notes |
|---|---|
| `/physical-wall` | Hero with live count → "hanging now" (scroll-snap rail, grid when filtered, with search + medium filter) → the wall grid itself, read-only |
| `/physical-wall/a/[id]` | **The most-visited screen in the product** — where a QR scan lands. Artwork image, spec grid (medium / year / position / until), description, reactions, share. Also design the **archived state** for work that has come down |
| `/physical-wall/visit` | Walk-in registration. Two fields, unbundled consent, then the issued coupon QR |
| `/q/[token]` | The QR resolver's failure page — invalid, expired, revoked |

### 07 · Physical Wall — artist

| Route | Notes |
|---|---|
| `/physical-wall/book` | **The booking flow.** 5 steps (Slots → Dates → Artwork → Add-ons → Agreement) with a stepper and a **sticky summary** that keeps the GST-inclusive total on screen at every step. Design each step |
| Booking confirmed | A screenshot-ready confirmation card carrying nothing private |
| `/physical-wall/bookings` | Booking list. Card states: held (pay), paid (sign agreement → install window → coupon QR), expired, ended (feedback prompt) |
| Agreement panel | Scrollable terms + typed-name e-signature + the stored hash shown after signing |
| `/physical-wall/waitlist` | Join the queue, and the "you are number 4 of 12" state, and the "a slot is being held for you" state |
| `/physical-wall/account` | **The data rights centre.** Consent toggles per purpose, data export, correction, nominee, grievance form, and account deletion |
| `/physical-wall/feedback/[id]` | Post-exhibition survey — star rating, 0–10 recommendation, free text |

### 08 · Physical Wall — staff & admin

**Staff** (used one-handed, on a phone, holding a painting):

| Route | Notes |
|---|---|
| `/physical-wall/ops` | Install queue. Per booking: receive → checklist (derived items, each with its reason) → scan code → go live |
| `/physical-wall/ops/perk/[token]` | **The Ric Platter counter screen.** Used by someone else's staff at a till with a customer waiting. Scan → eligibility verdict → type bill total → discount shown as an amount and as "customer pays X". Also the ineligible and already-redeemed states |

**Admin** (left rail console):

| Route | Notes |
|---|---|
| `/physical-wall/admin` | Overview — metric cards, a computed "needs you" alert list, launch-readiness warnings |
| `admin/grid` | **Wall map editor.** Drag to reorder, resize the grid, save templates, and a **slot modal** with configuration, only-legal state transitions, service states and force-release |
| `admin/calendar` | Gantt over bookings, with gaps of 3+ days surfaced for filling |
| `admin/bookings` | All bookings, mark-as-paid, force-release with confirmation |
| `admin/queue` | Waitlist with promote / demote / note / remove / offer-a-slot |
| `admin/catalogs` | Sizes, slot types, add-ons, refund policy, wall settings |
| `admin/ledger` | Revenue and expense entries, monthly summary, CSV export, Platter attribution |

---

## 7. Accessibility — non-negotiable

Target **WCAG 2.1 AA**. This is a compliance requirement, not a preference.

- Every interactive element needs a visible `focus-visible` state. Design it
  once (2px `ink` outline, 2px offset) and show it in the component library.
- Colour is never the only signal — every state carries text too.
- Text contrast ≥ 4.5:1; large text ≥ 3:1. The teal at 12px is already at the
  edge — do not lighten it.
- Touch targets ≥ 44×44px.
- Design a **reduced-motion** variant of anything that animates.
- The wall grid editor needs a **keyboard path**, not drag-only. Show it.

---

## 8. What to hand back

1. The Figma file (view or edit access).
2. A short note on the cover page listing: any **new** variables added, any
   place you deliberately broke the existing system and why, and anything you
   were unsure about.
3. Flag any screen where the design assumes data the product does not yet
   have — that is the most common source of a design that cannot be built.

---

## 9. Notes for whoever implements this

Current stack: Next.js 16 (App Router, RSC), React 19, Tailwind v4 with
`@theme` tokens, Drizzle + Neon Postgres, better-auth, Framer Motion.

- Tokens live in `src/app/globals.css` under `@theme`. Figma variable names
  should map 1:1.
- Copy lives in `src/config/content.ts` and `src/config/platform.ts`, not in
  components. Copy changes go there.
- `AnimatePresence` does **not** unmount children in this React/Framer
  combination — the header works around it with plain conditional rendering.
  Do not design exit animations that depend on it without checking.
- The physical wall stores money as integer paise and multipliers as basis
  points. Any price mock should be realistic to that.
