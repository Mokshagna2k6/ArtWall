# ArtWall Experience & Design System

_Phase 2 — Experience Design, UI/UX, Design System_

Prepared for: Alok | Date: August 7, 2026
Source of truth: `ArtWall_Creative_Blueprint.md` (Phase 1). This document translates the Phase 1 research and the Top 20 shortlist into a complete, buildable experience and design system. No code, no components, no markup — visual and interaction planning only.

> **Note on Phase 1 fidelity.** Every experience below traces back to a Phase 1 idea. Two additions are made explicitly, with reasoning: **The Founding Roster** (Phase 1 idea #53, scored 8/7/6/8 but left out of the original Top 20 for space) is promoted to its own page here, because Phase 2 requires a dedicated Founding Artists page and no Top 20 idea covers that role as completely. **Circles** (Phase 1 idea #36) is designed at low fidelity as a placeholder page, explicitly marked Phase 2+/post-launch per the Phase 1 deferral list — included so the architecture has a home for it later, not because it ships at launch.

---

## 1. Design Philosophy

1. **This is a museum, not a marketplace.** Every layout decision is judged by whether it would feel at home in a considered gallery space — generous air, one focal idea per room, nothing competing for attention.
2. **Ritual over feature.** Recurring, consistent ceremonies (the seal, the nameplate, the signature) build more identity than one-off flourishes. The system is built around a small number of rituals, repeated with discipline.
3. **Restraint is the luxury.** Premium here does not mean maximal. It means everything unnecessary has already been removed.
4. **Presence over performance.** The interface should feel like it's responding to _you specifically_ being there — cursor-as-spotlight, live drift, personalization — never like it's performing for an audience.
5. **India-specific, not India-flavored.** Script, festival, and craft references are structural (multilingual welcome, festival takeovers, craft lineage), not decorative skins applied on top of a generic template.
6. **Motion tells the story; it does not decorate it.** If an animation can be removed without losing meaning, it's decoration and gets cut.

---

## 2. Website Architecture

```
ArtWall (pre-launch)
│
├── Home                          /
├── The Wall (discovery)          /wall
│   ├── Artist Profile            /@artistname
│   └── Artwork Detail            /wall/[artwork-id]
│        └── Certificate          /wall/[artwork-id]/certificate
├── Vision                        /vision
├── Founding Artists              /founding-artists
├── Exhibitions                   /exhibitions
│   └── Exhibition Detail         /exhibitions/[slug]
├── Circles (Phase 2+)            /circles          — placeholder, not launch scope
└── Contact                       /contact
```

**Routing philosophy:** every page is reachable within two clicks from Home. The primary navigation carries a maximum of five items (The Wall, Artists, Exhibitions, Vision, Join) so it reads as a gallery directory, not a SaaS product menu. Utility links (Contact, language) live in the footer and a lightweight top-right utility corner — never competing with the primary wayfinding.

---

## 3. Complete User Journey

| Stage          | Primary page(s)                  | Emotion               | What happens                                                                                                            | Why they keep going                                                                   |
| -------------- | -------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Arrival**    | Home                             | Wonder, curiosity     | The Unlit Wall greets them; embers glow, one line rewrites itself in their language.                                    | The site feels considered within one second — worth a few more.                       |
| **Wander**     | The Wall                         | Curiosity             | Cursor-spotlight, drifting thumbnails, bento grid inviting exploration rather than a menu demanding a decision.         | Nothing is asking anything of them yet — low-pressure browsing keeps them scrolling.  |
| **Recognize**  | Artist Profile, Artwork Detail   | Recognition, intimacy | A real Nameplate, a Studio Window, a deep-zoomed brushstroke — this is a person, not a listing.                         | They start to care about a specific artist, not "the platform."                       |
| **Understand** | Vision                           | Hope, clarity         | The mission is told as a story (art economy, provenance problem, Diwali anchor), not a pitch deck.                      | They understand _why_ ArtWall exists, which converts curiosity into intent.           |
| **Trust**      | Artwork Detail → Certificate     | Relief, confidence    | The Wax Seal and Certification Ceremony demonstrate authenticity concretely.                                            | Trust is proven, not claimed — removes the last hesitation.                           |
| **Belong**     | Founding Artists                 | Belonging, pride      | The Founding Roster shows real, numbered names already there; joining becomes claiming a spot, not submitting an email. | Seeing peers already present is the single strongest belonging signal on the site.    |
| **Commit**     | Founding Artists (join flow)     | Anticipation          | A short, warm onboarding (Section 5.6) turns "sign up" into claiming a numbered seat on the roster.                     | Commitment feels like joining a room, not filling a form.                             |
| **Share**      | Any page, via Framed Share Cards | Pride                 | A beautifully framed, exportable artifact worth posting.                                                                | Sharing something beautiful they made _feels_ different from sharing a referral link. |
| **Return**     | Home (returning-visitor state)   | Recognition           | The Ember Clock has moved, the roster count has grown, something is different since last visit.                         | Evidence of change is what pulls people back — not notifications, but a changed room. |

---

## 4. Information Architecture

- **Primary navigation (5 items max):** The Wall · Artists · Exhibitions · Vision · Join the Wall (CTA, visually distinct).
- **Utility corner (top-right, quiet):** language selector, sound mute toggle (once any sound exists), Contact link.
- **Footer navigation:** Vision, Founding Artists, Exhibitions, Contact, legal (privacy/terms — required but visually minimized), social.
- **URL structure:** clean and human — `/wall`, `/@artistname`, `/wall/[artwork-id]`, `/exhibitions/[slug]`, `/founding-artists`, `/vision`, `/contact`. No query-string clutter on primary pages.
- **Content hierarchy per page:** every page has exactly one primary object of attention (a wall of art, one artist, one certificate, one roster) — secondary content (filters, related links, footer) is visually and structurally subordinate, never competing in size or color weight.
- **Search & filter taxonomy:** Medium (painting, sculpture, textile, photography, mixed media, folk/traditional), Region (state-level), Mood (warm, quiet, bold, minimal, traditional, experimental), Price band. Filters are shared vocabulary across The Wall, Exhibitions, and Circles so the same mental model works everywhere.

---

## 5. Page-by-Page Breakdown

### 5.1 Home

- **Goal:** Convert a cold visitor's first five seconds into curiosity strong enough to scroll.
- **User Emotion:** Wonder → curiosity → hope (Diwali anticipation).
- **Layout:** Full-bleed dark canvas. Centered hero zone with the Ember Clock and welcome line; drifting thumbnail field fills the negative space behind and around it, dimmed under the text layer.
- **Storytelling:** The page opens like walking into a gallery before the lights are fully up — a few pieces already glowing, more will follow. The scroll-assembly sequence (logo forming from scattered brushstrokes) is the second beat, transitioning into The Wall.
- **Interactions:** Cursor-as-spotlight (Phase 1 #3) brightens thumbnails it passes over; welcome line cross-fades through Indian scripts (#6) before settling on the visitor's browser language; scroll triggers the assemble-from-scatter hero transition (#8).
- **Animations:** Threshold breath fade-in on load (600–900ms, organic ease); ember pulse loop (2.4s cycle, subtle); scroll-linked hero assembly (900–1400ms across the first two scroll-screens).
- **Mobile Experience:** The drifting field simplifies to a slower, lower-density version (fewer tiles, no cursor-spotlight since there's no cursor); the welcome line and Ember Clock stack vertically above a single clear CTA ("Explore the Wall").
- **Accessibility:** Motion reduces to a static warm gradient + simple fade for `prefers-reduced-motion`; welcome line remains readable as static text if language cross-fade is disabled; contrast of ember-amber against wall-black verified for large text only (see Section 10).
- **Future Improvements:** Post-launch, the Waiting Room Wall's founding-member count becomes a live, real number, replacing the placeholder.

### 5.2 The Wall (Discovery)

- **Goal:** Turn browsing into a self-directed, low-pressure act of discovery.
- **User Emotion:** Curiosity, delight, occasional surprise.
- **Layout:** Bento-style grid (Phase 1 #13) with mixed tile sizes; a slim, styled filter bar (#19) above; a horizontal "Discovered Near You" strip (#15) breaking the grid rhythm partway down.
- **Storytelling:** No two visits look identical — the "Surprise Me, Gently" mechanic (#16) actively favors underexposed artists, so the Wall itself narrates "there's always more to find here, and it's not just the popular names."
- **Interactions:** Tilt-on-hover (glass-like, #14); click opens artwork via shared-element transition (tile grows into detail page, never a hard cut); filter bar updates the grid in place with a soft cross-fade, never a full reload.
- **Animations:** Tile entrance stagger (60–90ms delay per tile, capped at ~12 tiles per stagger group); tilt response is cursor-tracked and spring-based, not linear.
- **Mobile Experience:** Bento grid collapses to a single-column, alternating large/small rhythm rather than a uniform grid — reimagined, not resized; filter bar becomes a bottom sheet triggered by a single filter icon, not a persistent bar competing for header space.
- **Accessibility:** Full keyboard tab order follows visual reading order (not raw DOM order, which bento layouts can scramble); tilt/hover effects have no keyboard-only dependency — focus states use a visible outline instead.
- **Future Improvements:** "Who's Here Right Now" live counter (#51) added once real traffic makes it meaningful; deep-zoom viewer performance tuned per real image sizes.

### 5.3 Artist Profile

- **Goal:** Make a visitor feel they've met a specific person, not opened a listing.
- **User Emotion:** Recognition, warmth, respect.
- **Layout:** Museum wall-label header (Nameplate, #22) at top; Studio Window strip; a Works grid; a Recognition Wall of pinned praise near the bottom.
- **Storytelling:** The page is sequenced like reading a gallery placard, then stepping into the studio, then viewing the work, then hearing what others say about it — in that order, deliberately.
- **Interactions:** Hovering the profile photo softly plays the Making-Of Reel (#27); the Signature (#21) appears beside the artist's name and can be tapped to replay the stroke animation.
- **Animations:** Nameplate content fades up on load in three staggered lines (name → medium/city → line); Recognition Wall notes drift in like sticky notes being pinned, one at a time, first-visit only.
- **Mobile Experience:** Studio Window becomes a swipeable horizontal strip instead of a grid; Recognition Wall becomes a vertical stack; the Nameplate stays fixed-width and centered rather than shrinking text disproportionately.
- **Accessibility:** Signature replay has a static, described alt version ("Riya Desai's signature") for screen readers; all video/audio content (Making-Of Reel) is muted by default with visible captions if dialogue exists.
- **Future Improvements:** Thank a Teacher (#26) and Wall Marks (#30) expand as the founding cohort grows and cross-links between teacher/student profiles become meaningful.

### 5.4 Artwork Detail & Certificate

- **Goal:** Let the work be seen properly, then prove it's authentic without ever sounding like a blockchain company.
- **User Emotion:** Awe (at the zoom), then relief/trust (at certification).
- **Layout:** Large centered artwork viewer with deep-zoom (#20); metadata panel beside it; the Wax Seal and Provenance Timeline appear as a distinct section below, visually separated from the commercial metadata.
- **Storytelling:** The page deliberately paces you: first you look closely at the work itself (zoom), only afterward are you shown proof of its authenticity — trust is earned in the right order, not led with.
- **Interactions:** Pinch/scroll to zoom into brushwork; "Collect this" opens checkout with the artist's note playing first (#62); tapping the certificate ID reveals the full Certification Ceremony replay.
- **Animations:** The Wax Seal presses down with a short stamp animation (400–600ms) the first time a visitor reaches that section; Provenance Timeline nodes light up sequentially as they scroll into view.
- **Mobile Experience:** Deep-zoom uses native pinch gestures; the Provenance Timeline switches from horizontal to a vertical stepper; the certificate becomes a full-screen takeover rather than an inline panel, matching its ceremonial weight.
- **Accessibility:** Deep-zoom has a "view full image" fallback for users who can't or don't want gesture-based zoom; the wax-seal stamp animation has a static "Certified" seal graphic fallback under reduced motion.
- **Future Improvements:** QR-to-Physical bridge (#45) print flow added once physical fulfillment exists.

### 5.5 Vision

- **Goal:** Convert curiosity about the platform into belief in its mission.
- **User Emotion:** Hope, clarity, quiet conviction.
- **Layout:** Long-form editorial page — generous type, few images, no grid clutter. Reads more like a considered essay than a "features" page.
- **Storytelling:** Told as a story with a clear arc: the problem (invisibility, broken provenance, geography, pricing power) → the belief (art belongs on the wall, not locked in a circuit) → the anchor (why Diwali 2026 matters) → the invitation (join before it opens).
- **Interactions:** Minimal — a few scroll-triggered reveals of key statements, no decorative motion competing with the reading experience.
- **Animations:** Paragraph-level fade-up on scroll only; nothing else. This page is the calmest in the entire site by design.
- **Mobile Experience:** Type scale steps down one level from desktop but line length and rhythm are preserved — this page is optimized for reading, not browsing.
- **Accessibility:** Highest-contrast page in the system by design (long-form reading requires it); fully navigable and skimmable via heading structure for screen readers.
- **Future Improvements:** Founder video/voice note added once available, kept optional and below the fold so text remains primary.

### 5.6 Founding Artists

- **Goal:** Make joining feel like claiming a numbered seat in something real, not submitting an email address.
- **User Emotion:** Belonging, pride, anticipation.
- **Layout:** The Waiting Room Wall (#10) as hero — a field of embers, most unlit, a growing number lit for each founding member; below it, the Founding Roster (Phase 1 #53) listed with real names and numbers; the join flow itself is a short, warm three-step form.
- **Storytelling:** "This wall is already being lit, one artist at a time. Here's who's here. Here's your ember, waiting." The page performs the exact belonging mechanic described in Section 3.
- **Interactions:** On successful join, the visitor's own ember visibly ignites and takes its numbered place on the roster in real time — the single most important conversion moment on the site, and it's designed as a small ceremony, not a form-submit confirmation toast.
- **Animations:** Ember-ignite animation (600ms, paired with the reserved Ignite Sound, #81, opt-in); roster list entrance stagger.
- **Mobile Experience:** The ember field simplifies to a scrollable, lower-density strip; the join form is a single-column, three-field flow (name, medium, email) with no more than one field visible at a time to avoid form fatigue.
- **Accessibility:** The ember-lighting metaphor has a parallel, plain-text roster list (name, number, join date) so the information isn't locked inside a purely visual metaphor.
- **Future Improvements:** "I Was Here First" (#93) shareable card auto-offered immediately after joining.

### 5.7 Exhibitions

- **Goal:** Make upcoming and past exhibitions feel like real events worth attending or remembering, not calendar entries.
- **User Emotion:** Anticipation (upcoming), warmth/nostalgia (past).
- **Layout:** City Exhibition Map (#72) at top; upcoming shows below as large, editorial cards; a quieter "After the Show" archive section for closed exhibitions.
- **Storytelling:** Each exhibition page (linked from here) opens with a Curator's Note (#78) — a human voice framing the show before any logistics.
- **Interactions:** Map pins glow and reveal a preview card on hover/tap; RSVP produces a Guestbook-style photo-dot (#80) rather than a plain confirmation.
- **Animations:** Map pin pulse (loop, 2s) for live/upcoming shows; guestbook dots drift in as they're added.
- **Mobile Experience:** Map becomes a simplified, pannable illustration with a list view toggle for users who prefer scanning text over geography.
- **Accessibility:** Every map pin has an equivalent text list entry; RSVP flow works fully via keyboard and screen reader without depending on the map interaction.
- **Future Improvements:** Recap Reel (#75) and full Walk the Room 3D walkthrough (#71) added once show volume and production resources support them; launches with a simpler scroll-gallery version of the walkthrough.

### 5.8 Circles _(Phase 2+, placeholder only)_

- **Goal:** Reserve architectural and navigational space for cohort-based community, without shipping it before there's a real population to populate it.
- **User Emotion:** Curiosity ("something's coming"), not yet belonging (that requires real members).
- **Layout:** A single, honest "Circles are coming" placeholder — city/medium/school cohort concept explained in one short paragraph, no fake content.
- **Storytelling:** Framed explicitly as _next_, not _missing_ — consistent with the Phase 1 principle of never faking scale-dependent features.
- **Interactions:** None beyond a "notify me" link back into the Founding Artists join flow.
- **Animations:** Minimal — this page should feel deliberately quiet, not empty by accident.
- **Mobile Experience:** Identical simplicity; no special treatment needed.
- **Accessibility:** Standard text/contrast rules apply; no special considerations given the minimal interactivity.
- **Future Improvements:** Full Circles experience (mini-walls, Crit Circle, Mentor Marks) designed in a future phase once the founding cohort is large enough to populate it authentically.

### 5.9 Contact

- **Goal:** Give a real, human way to reach the founders without breaking the site's tone into a corporate "support" page.
- **User Emotion:** Reassurance — "there are real people here."
- **Layout:** Short, quiet, mostly type — a single message form and the plain human contact details already present on the live teaser, styled consistently but without ceremony (this page intentionally has the least motion in the system).
- **Storytelling:** No pitch, no reiteration of the mission — by the time someone reaches Contact, they've already heard the story elsewhere.
- **Interactions:** A single message form; standard input focus/validation states only.
- **Animations:** None beyond standard page-load fade — this is the calm, functional counterpart to the rest of the site's ceremony.
- **Mobile Experience:** Straightforward single-column form; no special reimagining needed — this is the one page where simplicity is the entire design goal.
- **Accessibility:** Fully labeled form fields, clear error states, no reliance on color alone for validation feedback.
- **Future Improvements:** None planned — deliberately kept simple as the system matures.

---

## 6. Wireframes

Low-fidelity block wireframes followed by a plain-language description of what to build. `░` = dark canvas, `▤` = artwork/image block, `▭` = text block, `○` = avatar/dot, `≈` = motion layer.

### 6.1 Home

```
┌───────────────────────────────────┐
│  ░ logo        nav · nav · [Join] │
├───────────────────────────────────┤
│  ░░░ ≈ drifting thumbnails ░░░░░  │
│         ● countdown ember         │
│      ▭▭▭▭▭▭▭▭▭▭ (welcome line)   │
│      ▭▭▭▭▭ (tagline)             │
│      [ Join the Wall ] [ Explore ]│
│              ↓                    │
└───────────────────────────────────┘
```

Build: a full-bleed hero section with a low-density, slow-looping background image field (real artist thumbnails, blurred/dimmed), a centered content column with the countdown, welcome line, tagline, and two CTAs, and a scroll affordance at the bottom edge.

### 6.2 The Wall

```
┌───────────────────────────────────┐
│ Filter▾ Filter▾ Filter▾  [✦Surprise]│
├───────────────────────────────────┤
│ ▤▤▤▤  ▤▤  ▤▤▤▤▤▤▤  ▤▤  ▤▤        │
│ ▤▤  ▤▤▤▤  ▤▤       ▤▤▤▤▤▤        │
│ ─── Discovered near you ───       │
│ ▤ ▤ ▤ ▤ ▤ ▤ ▤ ▤  (scroll strip)   │
└───────────────────────────────────┘
```

Build: a filter bar (medium/region/price/mood + surprise-me action), a mixed-size masonry/bento grid of artwork tiles below it, and one horizontal scroll-snap strip breaking the grid rhythm.

### 6.3 Artist Profile

```
┌───────────────────────────────────┐
│  ▤▤▤▤▤▤▤▤▤▤ (dimmed cover work)   │
│  ○ NAME                [Message]  │
│    medium · city    @handle       │
├───────────────────────────────────┤
│  Studio: [▶] [▤] [▤]              │
├───────────────────────────────────┤
│  Works: ▤ ▤ ▤ ▤ ▤                 │
├───────────────────────────────────┤
│  Recognition: ▭ card   ▭ card      │
└───────────────────────────────────┘
```

Build: a cover-image header with the nameplate overlapping its lower edge, a horizontal studio strip, a standard works grid, and a two-to-three-column recognition card row at the bottom.

### 6.4 Artwork Detail & Certificate

```
┌───────────────────────────────────┐
│ ← Back                            │
│   ┌───────────┐   Title           │
│   │   ▤▤▤▤▤   │   Artist          │
│   │  (zoom)   │   Price           │
│   └───────────┘   [Collect]       │
│  ── 🔶 CERTIFIED ──               │
│  Created ● Certified ● Owned      │
│  Cert ID: WALL-2026-0417 [View →] │
└───────────────────────────────────┘
```

Build: a two-column layout (image left/large, metadata right on desktop; stacked on mobile), a visually distinct certification band beneath, and a horizontal provenance stepper.

### 6.5 Vision

```
┌───────────────────────────────────┐
│           Vision                  │
│  ▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭        │
│  ▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭        │
│  ▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭        │
│           [ Join the Wall ]       │
└───────────────────────────────────┘
```

Build: a single narrow reading column (max ~680px), generous line-height, no sidebar, ending in one quiet CTA.

### 6.6 Founding Artists

```
┌───────────────────────────────────┐
│   ● ● ● ○ ○ ○ ○ ○ ○ ○ ○  (embers) │
│      "84 artists have joined"     │
├───────────────────────────────────┤
│  #1  Riya Desai · Ahmedabad       │
│  #2  Aman Rathore · Jaipur        │
│  #3  ...                          │
├───────────────────────────────────┤
│  Claim your ember:                │
│  Name ▭▭▭  Medium ▭▭▭  Email ▭▭▭ │
│           [ Join the Roster ]     │
└───────────────────────────────────┘
```

Build: an ember field visualization at the top tied to a live count, a plain numbered roster list beneath it, and a short single-column join form at the bottom.

### 6.7 Exhibitions

```
┌───────────────────────────────────┐
│   [ stylized India map, pins ]    │
├───────────────────────────────────┤
│  ▤▤▤▤  Five Painters from...      │
│        Kolkata · Aug 14–21        │
│  ▤▤▤▤  Monsoon Studies            │
│        Jaipur · Sep 3–10          │
│  ── After the Show (archive) ──   │
└───────────────────────────────────┘
```

Build: a map block, a vertical stack of large editorial exhibition cards, and a visually quieter archive list below.

### 6.8 Circles (placeholder)

```
┌───────────────────────────────────┐
│         Circles                   │
│   "Small groups of artists,       │
│    coming soon."                  │
│      [ Notify me → Join Wall ]    │
└───────────────────────────────────┘
```

Build: a single centered block, no grid, honest and short.

### 6.9 Contact

```
┌───────────────────────────────────┐
│   Contact                         │
│   Name ▭▭▭                        │
│   Email ▭▭▭                       │
│   Message ▭▭▭▭▭▭▭▭                │
│           [ Send ]                │
│   or write to us directly: ...    │
└───────────────────────────────────┘
```

Build: a single-column form, plain and calm, with the existing human contact details listed below it.

---

## 7. Visual Language

- **Premium feeling:** achieved through negative space and restraint, not ornamentation — large type, few colors used at full saturation, generous margins. Premium is what's _absent_, not what's added.
- **Museum feeling:** every artwork gets identical presentational respect regardless of the artist's fame; captions are typeset like real gallery labels; nothing is ever cropped or auto-generated over the art itself.
- **Luxury feeling:** slow, considered motion (organic easing, no snap transitions); amber used sparingly so it still feels precious when it appears; certificate and seal moments treated with ceremony, not efficiency.
- **Editorial feeling:** the Vision page and artist statements are typeset like a well-made print magazine — real reading rhythm, pull-quote-style emphasis, no dense UI chrome.
- **Calm feeling:** one strong idea per screen; sound off by default; no autoplaying video with audio; page transitions that pause rather than snap.

### Iconography & Imagery

- **Icon style:** thin-stroke (1.5px), geometric with slightly rounded terminals — quiet enough to disappear next to the art, never illustrative or playful.
- **Illustration style:** used sparingly, only for the City Exhibition Map and empty-state moments — hand-drawn-adjacent, single-color line work in ember-amber or ink, never full-color cartoon illustration.
- **Photography style:** natural light, unstaged studio and process photography preferred over posed marketing photography; artist and studio photos are never over-retouched.
- **Artwork presentation style:** always shown at the highest available fidelity, deep-zoomable, letterboxed rather than cropped to fit a tile — the tile adapts to the art's aspect ratio, not the reverse.
- **Empty states:** framed as invitations, not errors ("space for you" on the Wall's unfinished corner; "Circles are coming").
- **Loading states:** the Easel Loader (#84) — an easel-shaped skeleton that fills with color — used everywhere a generic spinner would otherwise appear.
- **Error states:** calm, specific, and warm in tone ("We couldn't find that page — here's a blank canvas instead" on 404, #83), never alarming red-and-exclamation-mark UI patterns.

---

## 8. Design System

### 8.1 Grid System

| Breakpoint | Range       | Container | Columns | Gutter | Margins |
| ---------- | ----------- | --------- | ------- | ------ | ------- |
| Mobile     | < 640px     | fluid     | 4       | 16px   | 20px    |
| Tablet     | 640–1023px  | 834px     | 8       | 20px   | 48px    |
| Desktop    | 1024–1439px | 1200px    | 12      | 24px   | 64px    |
| Wide       | ≥ 1440px    | 1440px    | 12      | 24px   | 96px    |

Bento tiles snap to a 2×2 base unit (small/medium/large/hero) on the discovery grid so the Wall never looks randomly assembled at any breakpoint.

### 8.2 Border Radius

| Token         | Value | Use                                                           |
| ------------- | ----- | ------------------------------------------------------------- |
| `radius-none` | 0px   | Artwork images themselves — art is presented, not "app-ified" |
| `radius-xs`   | 4px   | Tags, chips, small badges                                     |
| `radius-sm`   | 8px   | Buttons, inputs, filter pills                                 |
| `radius-md`   | 12px  | Small/medium cards, tiles                                     |
| `radius-lg`   | 20px  | Large cards, artist profile panels                            |
| `radius-xl`   | 28px  | Modals, hero panels, feature cards                            |
| `radius-full` | 999px | Avatars, ember dots, pill badges                              |

### 8.3 Shadows

| Token             | Spec                                                   | Use                                                                    |
| ----------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| `shadow-soft`     | `0 1px 2px rgba(0,0,0,.06), 0 1px 3px rgba(0,0,0,.08)` | Resting cards, default tile state                                      |
| `shadow-medium`   | `0 4px 12px rgba(0,0,0,.12)`                           | Hovered cards, open dropdowns                                          |
| `shadow-large`    | `0 12px 32px rgba(0,0,0,.18)`                          | Modals, popovers, the certificate panel                                |
| `shadow-floating` | `0 24px 64px rgba(0,0,0,.28)`                          | Hero elements, story reels, anything meant to feel lifted off the page |
| `shadow-glass`    | soft shadow + 1px inset highlight + backdrop blur      | Nav bar once solid on scroll, filter bar, any translucent overlay      |

---

## 9. Typography System

| Role                  | Family                                           | Notes                                                                                                                                                                            |
| --------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Display / editorial   | **Fraunces** (variable)                          | Warm, slightly hand-cut serif — headlines, the Nameplate, gallery-label captions. Falls back to `Georgia, serif`.                                                                |
| UI / body             | **General Sans**                                 | Clean geometric sans for navigation, buttons, forms, body copy. Falls back to `system-ui`.                                                                                       |
| Indic script fallback | **Noto Sans [Devanagari / Bengali / Tamil / …]** | Paired with the sans stack for the multilingual welcome line and any non-Latin content — most editorial serifs have weak Indic support, so scripts never route through Fraunces. |

**Why this pairing fits artists:** Fraunces carries warmth and a handmade quality that reads as a gallery placard, not a corporate wordmark — it does the emotional work. General Sans stays out of the way for anything functional, so the interface never competes with the art or the artist's name for attention.

### Type Scale (base 16px, ~1.25 modular ratio)

| Token       | Size / Line-height | Letter-spacing | Typical use                                      |
| ----------- | ------------------ | -------------- | ------------------------------------------------ |
| `caption`   | 12 / 16            | +0.04em        | Metadata, timestamps, gallery-label fine print   |
| `label`     | 13 / 18            | +0.06em        | Filter tags, form labels, uppercase micro-labels |
| `small`     | 14 / 20            | 0              | Secondary UI text                                |
| `body`      | 16 / 26            | 0              | Default body copy                                |
| `body-lg`   | 18 / 28            | 0              | Vision page reading column                       |
| `lead`      | 20 / 32            | -0.005em       | Intro paragraphs, artist statements              |
| `h4`        | 24 / 32            | -0.01em        | Card titles, sub-section headers                 |
| `h3`        | 32 / 40            | -0.01em        | Section headers                                  |
| `h2`        | 40 / 52            | -0.015em       | Page-level headers                               |
| `h1`        | 56 / 64            | -0.02em        | Major page titles (Vision, Founding Artists)     |
| `display-s` | 72 / 80            | -0.02em        | Home hero secondary line                         |
| `display-l` | 96 / 104           | -0.02em        | Home hero headline                               |

Rule: display sizes carry slightly negative tracking for confidence at scale; labels and captions carry slight positive tracking, deliberately echoing engraved gallery-label type.

---

## 10. Color System

Dark-first (matching the brand-native `#06070A`), with a light "paper" mode for reading-heavy pages (Vision) and printable certificates.

| Role                       | Token                 | Hex                     | Notes                                                                                   |
| -------------------------- | --------------------- | ----------------------- | --------------------------------------------------------------------------------------- |
| Primary background (dark)  | `wall-black`          | `#06070A`               | Default canvas                                                                          |
| Elevated surface (dark)    | `wall-charcoal`       | `#121317`               | Cards, panels                                                                           |
| Primary background (light) | `wall-paper`          | `#F5EFE4`               | Vision page, printable certificate                                                      |
| Elevated surface (light)   | `wall-paper-elevated` | `#FBF8F2`               | Cards on paper mode                                                                     |
| Primary accent             | `ember-amber`         | `#E8A33D`               | CTAs, the seed/ember, certification seal — earned, not decorative                       |
| Accent highlight           | `ember-glow`          | `#F4C87A`               | Hover/glow state of amber                                                               |
| Secondary accent           | `lab-blue`            | `#3E6CC4`               | Verified/technical moments only — certificate metadata, links                           |
| Tertiary accent            | `terracotta`          | `#B5573B`               | Festival takeovers, regional tags                                                       |
| Text on dark (primary)     | `ink`                 | `#E9E7E1`               |                                                                                         |
| Text on dark (secondary)   | `ink-muted`           | `#9B9890`               |                                                                                         |
| Text on light (primary)    | `charcoal-text`       | `#1B1A17`               |                                                                                         |
| Text on light (secondary)  | `charcoal-muted`      | `#6B675F`               |                                                                                         |
| Border (dark)              | `border-dark`         | `rgba(233,231,225,.12)` |                                                                                         |
| Border (light)             | `border-light`        | `rgba(27,26,23,.12)`    |                                                                                         |
| Success                    | `success`             | `#4F9D6E`               | Muted sage — confirmations, successful joins                                            |
| Warning                    | `warning`             | `#C97B2E`               | Deliberately distinct from brand amber to avoid confusing "certified" with "caution"    |
| Error                      | `error`               | `#C4483A`               | Terracotta-adjacent red, stays within the earthy palette rather than a jarring pure red |
| Neutral scale              | `neutral-50…900`      | warm-tinted greys       | UI chrome, dividers, skeleton loaders                                                   |

**Color psychology:** near-black-and-amber reads as gallery-at-dusk, not fintech-dark-mode — the darkness is a canvas waiting to be lit, echoing the Diwali narrative directly. Amber is deliberately rationed: full saturation only for CTAs, the wax seal, and milestone moments, so it retains meaning every time it appears. Blue is confined to "verified/technical" contexts so it reads as credibility, not corporate branding. Terracotta grounds the palette in Indian craft materials (terracotta pottery, henna, earth) rather than a generic "warm accent."

**Contrast:** `ember-amber` on `wall-black` passes AA for large text and iconography only — body copy always uses `ink`/`ink-muted`, reserving amber for headlines and marks. All text/background pairs are checked against WCAG AA at minimum; the Vision page (long-form reading) is held to AAA where feasible.

---

## 11. Spacing System

| Token      | Value | Typical use                                      |
| ---------- | ----- | ------------------------------------------------ |
| `space-1`  | 4px   | Icon-to-label gaps, fine adjustments             |
| `space-2`  | 8px   | Tight internal padding (chips, tags)             |
| `space-3`  | 12px  | Form field internal padding                      |
| `space-4`  | 16px  | Standard internal card padding, mobile margins   |
| `space-6`  | 24px  | Component-to-component spacing                   |
| `space-8`  | 32px  | Section internal spacing                         |
| `space-12` | 48px  | Card-grid gutters, tablet margins                |
| `space-16` | 64px  | Section-to-section spacing, desktop margins      |
| `space-24` | 96px  | Major page-section breaks, wide-viewport margins |

**Why these values:** an 8px base unit (with a 4px half-step for fine-grained cases) keeps every measurement predictable and additive, but the scale deliberately widens faster at the top end (48 → 64 → 96) because the brand's core visual argument is _generous negative space_ — crowding is the fastest way to make a gallery feel like a marketplace, so the largest tokens are used liberally between major sections.

---

## 12. Motion System

| Category               | Rule                                                                                                                                              | Why                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Page transitions**   | Shared-element where possible (tile → detail); otherwise a brief held-breath pause (150–200ms) before cross-fade — never a hard cut.              | Mimics stepping back to view a painting rather than flipping a page.                                                      |
| **Scroll animations**  | Fade-up reveals (staggered by ≤90ms per item), scroll-linked hero assembly, parallax limited to background layers only.                           | Scroll is choreography, not a scrollbar — but never applied to foreground reading content, which stays still and legible. |
| **Hover animations**   | Lift + soft shadow increase + slight tilt for cards; underline draw or fill for text links; glow for primary CTAs.                                | Signals interactivity through light and depth, echoing how a spotlight would catch a raised surface.                      |
| **Click feedback**     | Brief scale-down (97–98%) on press, spring back on release.                                                                                       | Physical, tactile confirmation without a jarring bounce.                                                                  |
| **Loading animations** | Easel/canvas-shaped skeletons that fill with color; never a generic spinner.                                                                      | Keeps even "nothing yet" moments inside the art metaphor.                                                                 |
| **Mouse movement**     | Cursor-as-spotlight on discovery surfaces; magnetic pull on primary buttons within a small radius.                                                | Reinforces "the space is responding to you," core to the presence-over-performance principle.                             |
| **Physics**            | Organic, slightly overshooting settle (spring-like) for entrances; linear motion is never used anywhere in the system.                            | A hand placing a canvas on a wall doesn't move at a constant velocity — neither should the UI.                            |
| **Parallax**           | Background layers only, 2–3 depth planes maximum, always disables under reduced motion.                                                           | Adds real depth without becoming a gimmick or a legibility risk.                                                          |
| **Depth**              | Achieved primarily through shadow tokens (Section 8.3) and subtle scale, not heavy 3D transforms, except in the dedicated exhibition walkthrough. | Keeps the system light-weight and performant on mid-range Android devices.                                                |
| **3D**                 | Reserved for the Walk the Room exhibition walkthrough only, isolated to its own route.                                                            | 3D is expensive and narratively earned only in that one context — never used decoratively elsewhere.                      |
| **Particles**          | Reserved for the Certification Ceremony's ember-flare moment only.                                                                                | Particle effects are rationed exactly like amber — one meaningful use, not a general-purpose flourish.                    |
| **Reveal animations**  | Content fades/slides in on first scroll into view only, never re-triggers on every scroll pass.                                                   | Prevents the page from feeling twitchy or attention-grabbing on re-scroll.                                                |
| **Text animations**    | Letter/line stagger reserved for hero headlines and the multilingual welcome line only.                                                           | Used exactly twice in the whole system, so it stays a signature moment, not a tic.                                        |

**Global durations & easing:** see Section 17 (Motion Tokens).

---

## 13. Interaction System

A representative sample of the system's key interactions — the full micro-interaction catalogue is in Section 14.

| Interaction                     | Trigger                                              | Animation                                                          | Duration                            | Purpose                                             | Emotional Impact | Accessibility Fallback                                                               | Performance Note                                                |
| ------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------- | --------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Cursor Spotlight                | Mouse move over Wall/hero                            | Radial warm glow follows cursor, brightens tiles beneath           | continuous                          | Make the space feel responsive to presence          | Wonder, intimacy | Disabled entirely on touch devices; no functional dependency                         | GPU-composited layer only, capped update rate                   |
| Tile Shared-Element Grow        | Click on artwork tile                                | Tile scales/repositions into the detail page's hero image position | 350–450ms                           | Preserve spatial continuity                         | Continuity, calm | Falls back to a standard cross-fade if `prefers-reduced-motion`                      | Uses transform/opacity only, never layout-triggering properties |
| Wax Seal Stamp                  | First view of certificate section                    | Seal animates a press-down/settle motion                           | 500–600ms                           | Make certification feel physical, not technical     | Trust, relief    | Static "Certified" seal graphic under reduced motion                                 | One-time per session, not re-triggered on scroll                |
| Ember Ignite (Founding Artists) | Successful roster join                               | Ember flares from unlit to lit, settles into place on the roster   | 600ms                               | Turn a form submission into a ceremony              | Pride, belonging | Text confirmation ("You're #142 on the Wall") always present alongside the animation | Paired optional sound is opt-in only                            |
| Signature Draw                  | Onboarding, signature step                           | Ink follows the pointer/finger stroke in real time                 | continuous, then 300ms "dry" settle | Make the artist's own mark feel captured, not typed | Ownership, pride | Typed-name fallback offered for users who can't complete a freehand gesture          | Vector stroke data, not raster, for crisp reuse at any size     |
| Filter Bar Update               | Selecting a filter                                   | Grid cross-fades to new result set in place                        | 250ms                               | Keep browsing state continuous                      | Calm, control    | Fully operable via keyboard/select elements                                          | Debounced to avoid re-render thrash on rapid changes            |
| Milestone Toast                 | Passive browsing threshold (e.g. 50 artworks viewed) | Small toast slides up from bottom, auto-dismisses                  | 4s visible + 200ms transitions      | Acknowledge genuine engagement                      | Recognition      | Screen-reader announced via polite live region                                       | Client-side counter only, no server round-trip                  |
| Multilingual Welcome Cross-fade | Home page load                                       | Welcome line cycles through scripts, settles on browser language   | 400ms per cross-fade step           | Signal belonging instantly                          | Belonging        | Static single-language text if reduced motion is set                                 | Preloaded font subsets to avoid flash-of-unstyled-text          |

---

## 14. 75+ Micro Interactions

Grouped by category. Duration values are defaults — see Section 17 for the full token scale they draw from.

### Cursor & Pointer

| #   | Name                 | Trigger                                        | Animation                                 | Duration   | Emotion   |
| --- | -------------------- | ---------------------------------------------- | ----------------------------------------- | ---------- | --------- |
| 1   | Spotlight Cursor     | Mouse move on Wall/hero                        | Warm radial glow follows cursor           | continuous | Wonder    |
| 2   | Magnetic Button Pull | Cursor nears primary CTA                       | Button shifts slightly toward cursor      | 150ms      | Delight   |
| 3   | Cursor-to-Brush      | Cursor enters artwork zoom viewer              | Cursor icon morphs to a small brush glyph | 100ms      | Immersion |
| 4   | Cursor-to-Hand       | Cursor enters draggable region (map, carousel) | Cursor morphs to an open-hand glyph       | 100ms      | Clarity   |
| 5   | Ink Trail Fade       | Fast cursor movement over hero                 | Faint ink trail follows, fades out        | 400ms      | Wonder    |

### Buttons

| #   | Name                     | Trigger                                       | Animation                                                  | Duration | Emotion     |
| --- | ------------------------ | --------------------------------------------- | ---------------------------------------------------------- | -------- | ----------- |
| 6   | Primary Glow             | Hover on primary CTA                          | Amber glow intensifies                                     | 150ms    | Invitation  |
| 7   | Press Depress            | Click/tap on any button                       | Scale to 97%, spring back                                  | 120ms    | Tactility   |
| 8   | Secondary Underline Draw | Hover on secondary/text button                | Underline draws left-to-right                              | 200ms    | Clarity     |
| 9   | Ghost Fill-In            | Hover on ghost/outline button                 | Background fills from center outward                       | 200ms    | Delight     |
| 10  | Disabled Dim             | Button becomes unavailable                    | Opacity steps down, cursor becomes not-allowed             | 100ms    | Clarity     |
| 11  | Icon Rotate              | Hover on icon-only button (e.g. filter reset) | Icon rotates 15°                                           | 150ms    | Playfulness |
| 12  | Loading Morph            | Form submit                                   | Button label cross-fades to a small spinner-in-brand-style | 200ms    | Reassurance |
| 13  | Success Checkmark Morph  | Action completes                              | Spinner morphs into a checkmark                            | 250ms    | Relief      |

### Cards

| #   | Name                          | Trigger                                | Animation                                         | Duration     | Emotion      |
| --- | ----------------------------- | -------------------------------------- | ------------------------------------------------- | ------------ | ------------ |
| 14  | Tile Lift                     | Hover on artwork/artist card           | Card lifts, shadow deepens                        | 200ms        | Delight      |
| 15  | Tilt Toward Cursor            | Hover on tile, cursor position tracked | 3D tilt up to 5°                                  | continuous   | Immersion    |
| 16  | Artist Card Border Glow       | Hover on artist card                   | Thin amber border fades in                        | 150ms        | Warmth       |
| 17  | Image Zoom-on-Hover           | Hover on card thumbnail                | Image scales 1.03x within fixed frame             | 300ms        | Delight      |
| 18  | Shadow Deepen                 | Hover on any elevated card             | Shadow token steps from soft to medium            | 150ms        | Depth cue    |
| 19  | Content Stagger-In            | Card enters viewport                   | Image, then title, then meta fade in sequentially | 90ms stagger | Calm reveal  |
| 20  | Skeleton-to-Content Crossfade | Data finishes loading                  | Skeleton cross-fades to real content              | 250ms        | Reassurance  |
| 21  | Selected State Pulse          | Card selected (e.g. in a picker)       | Single soft pulse of the border                   | 300ms        | Confirmation |

### Navigation

| #   | Name                        | Trigger                             | Animation                                        | Duration      | Emotion     |
| --- | --------------------------- | ----------------------------------- | ------------------------------------------------ | ------------- | ----------- |
| 22  | Nav Transparent-to-Solid    | Scroll past hero                    | Background fades from transparent to glass-solid | 200ms         | Clarity     |
| 23  | Active Item Underline Slide | Navigating between sections         | Underline slides to new active item              | 200ms         | Orientation |
| 24  | Mobile Menu Slide-In        | Tap menu icon                       | Full-screen menu slides in from right            | 300ms         | Focus       |
| 25  | Hamburger-to-X Morph        | Tap menu icon                       | Icon lines morph into an X                       | 200ms         | Clarity     |
| 26  | Dropdown Reveal             | Hover/tap on nav item with children | Panel drops with fade + slight scale             | 200ms         | Clarity     |
| 27  | Breadcrumb Fade Trail       | Navigating deeper into a section    | Each breadcrumb segment fades in                 | 100ms stagger | Orientation |
| 28  | Back Slide                  | Tap back/close                      | Content slides out in reverse of its entrance    | 250ms         | Continuity  |

### Scroll

| #   | Name                      | Trigger                                                        | Animation                                       | Duration      | Emotion      |
| --- | ------------------------- | -------------------------------------------------------------- | ----------------------------------------------- | ------------- | ------------ |
| 29  | Parallax Layer Drift      | Scroll on hero                                                 | Background layers move at different speeds      | continuous    | Depth        |
| 30  | Section Fade-Up           | Section enters viewport                                        | Fade + 12px upward translate                    | 400ms         | Calm reveal  |
| 31  | Sticky Section Pin        | Scroll through a multi-step sequence (certification explainer) | Section pins briefly while sub-content advances | scroll-linked | Focus        |
| 32  | Progress Bar Fill         | Scroll through long-form page (Vision)                         | Thin top progress bar fills                     | continuous    | Orientation  |
| 33  | Hero Assembly             | Scroll past hero                                               | Logo/brushstrokes assemble into place           | 900–1400ms    | Wonder       |
| 34  | Horizontal Strip Momentum | Drag/scroll a horizontal strip                                 | Natural momentum + soft snap to nearest tile    | physics-based | Delight      |
| 35  | Count-Up Numbers          | Stat enters viewport (roster count, etc.)                      | Number counts up from 0                         | 800ms         | Anticipation |

### Text

| #   | Name                     | Trigger                                     | Animation                                    | Duration    | Emotion   |
| --- | ------------------------ | ------------------------------------------- | -------------------------------------------- | ----------- | --------- |
| 36  | Headline Letter Stagger  | Hero loads                                  | Letters fade/rise in sequence                | 400ms total | Wonder    |
| 37  | Multilingual Cross-fade  | Home load                                   | Welcome line cycles scripts                  | 400ms/step  | Belonging |
| 38  | Typewriter Prompt Reveal | Onboarding question appears                 | Text reveals character by character          | 600ms       | Intimacy  |
| 39  | Highlight Underline Draw | Key phrase in Vision copy scrolls into view | Amber underline draws beneath it             | 300ms       | Emphasis  |
| 40  | Link Color Bleed         | Hover on inline text link                   | Color bleeds from underline upward into text | 200ms       | Delight   |
| 41  | Quote Mark Fade-In       | Recognition card enters view                | Large quote glyph fades in behind text       | 300ms       | Warmth    |

### Forms & Inputs

| #   | Name               | Trigger                             | Animation                                      | Duration   | Emotion        |
| --- | ------------------ | ----------------------------------- | ---------------------------------------------- | ---------- | -------------- |
| 42  | Focus Glow Ring    | Input focused                       | Soft amber ring fades in around field          | 150ms      | Clarity        |
| 43  | Label Float-Up     | Input focused or filled             | Placeholder label shrinks and floats above     | 150ms      | Clarity        |
| 44  | Error Shake        | Invalid submission                  | Field shakes briefly, border turns error color | 300ms      | Alert (gentle) |
| 45  | Success Checkmark  | Field validates                     | Small checkmark fades in at field edge         | 150ms      | Reassurance    |
| 46  | Textarea Auto-Grow | Typing exceeds current height       | Textarea height animates to fit                | continuous | Comfort        |
| 47  | Toggle Slide       | Tap a toggle (e.g. sound mute)      | Knob slides, track color cross-fades           | 150ms      | Clarity        |
| 48  | Select Open/Close  | Tap a dropdown select               | Panel expands/collapses with fade              | 200ms      | Clarity        |
| 49  | File Drag-Hover    | Dragging a file over an upload zone | Border pulses, zone lightens                   | continuous | Invitation     |

### Certification

| #   | Name                   | Trigger                            | Animation                                                     | Duration   | Emotion       |
| --- | ---------------------- | ---------------------------------- | ------------------------------------------------------------- | ---------- | ------------- |
| 50  | Wax Seal Stamp         | Certificate section first viewed   | Seal presses down and settles                                 | 500–600ms  | Trust         |
| 51  | Seal Shimmer Cool-Down | Immediately after stamp            | Faint shimmer passes once across the seal                     | 400ms      | Satisfaction  |
| 52  | Certificate Unfurl     | Tapping "View certificate"         | Panel unfurls like unrolling a document                       | 400ms      | Ceremony      |
| 53  | Provenance Node Pulse  | Timeline scrolls into view         | Each node pulses once as it's reached                         | 200ms/node | Understanding |
| 54  | QR Generate            | Requesting a printable certificate | QR resolves in from a scatter of dots                         | 500ms      | Delight       |
| 55  | Ignite Sound Pairing   | Certification ceremony completes   | Single ember-catch sound plays (opt-in) with the visual flare | 300ms      | Pride         |

### Signature

| #   | Name                           | Trigger                        | Animation                                        | Duration   | Emotion    |
| --- | ------------------------------ | ------------------------------ | ------------------------------------------------ | ---------- | ---------- |
| 56  | Signature Ink-Follow           | Drawing during onboarding      | Ink stroke follows pointer/finger in real time   | continuous | Ownership  |
| 57  | Signature Dry-Set              | Stroke completed               | Ink "dries," slight sheen fades out              | 300ms      | Permanence |
| 58  | Signature Replay               | Hover/tap signature on profile | Stroke redraws itself once                       | 600ms      | Delight    |
| 59  | Signature Stamp-to-Certificate | Certificate generated          | Signature transposes onto the certificate design | 400ms      | Pride      |

### Founding & Community

| #   | Name                          | Trigger                                            | Animation                                 | Duration   | Emotion      |
| --- | ----------------------------- | -------------------------------------------------- | ----------------------------------------- | ---------- | ------------ |
| 60  | Roster Ember Ignite           | Successful join                                    | Ember flares from unlit to lit            | 600ms      | Pride        |
| 61  | Waiting Room Sequential Light | Page load, first-time only                         | A few embers light in sequence, staggered | 1.2s total | Anticipation |
| 62  | Welcome Toast                 | New member joins nearby cohort (opt-in visibility) | Small toast with a welcome note           | 4s visible | Belonging    |
| 63  | Wall Mark Unlock Flare        | Milestone earned                                   | Small flare behind the new mark icon      | 300ms      | Recognition  |
| 64  | Countdown Ember Pulse         | Every second, Home hero                            | Ember brightness pulses subtly            | 1s cycle   | Anticipation |
| 65  | Milestone Toast (browsing)    | Passive engagement threshold reached               | Toast slides up, auto-dismisses           | 4s visible | Recognition  |

### Modals & Overlays

| #   | Name                    | Trigger                  | Animation                               | Duration                | Emotion     |
| --- | ----------------------- | ------------------------ | --------------------------------------- | ----------------------- | ----------- |
| 66  | Modal Fade-Scale-In     | Modal opens              | Fades in while scaling from 96% to 100% | 200ms                   | Focus       |
| 67  | Backdrop Blur-In        | Modal opens              | Background blur increases               | 200ms                   | Focus       |
| 68  | Drawer Slide            | Mobile filter/menu opens | Panel slides in from edge               | 250ms                   | Clarity     |
| 69  | Toast Slide-and-Dismiss | Any toast notification   | Slides up, holds, slides down           | 4s + 200ms              | Reassurance |
| 70  | Tooltip Delayed Fade    | Hover held on an icon    | Tooltip fades in after a short delay    | 400ms delay, 150ms fade | Clarity     |
| 71  | Lightbox Zoom-Open      | Tap an image to enlarge  | Image scales up from its tile position  | 300ms                   | Continuity  |

### Loading & Empty States

| #   | Name                    | Trigger                        | Animation                                     | Duration    | Emotion     |
| --- | ----------------------- | ------------------------------ | --------------------------------------------- | ----------- | ----------- |
| 72  | Easel Skeleton Fill     | Content loading                | Easel-shaped skeleton fills with color        | continuous  | Reassurance |
| 73  | Canvas Page Loader      | Full page transition loading   | Canvas-outline loader fills in                | continuous  | Calm        |
| 74  | Empty Corner Shimmer    | Unfinished Wall corner in view | Gentle shimmer invites attention              | loop, 3s    | Invitation  |
| 75  | Blank Canvas 404 Prompt | 404 page reached               | Cursor invites a doodle before redirect       | interactive | Playfulness |
| 76  | Image Blur-Up           | Image lazy-loads               | Blurred placeholder sharpens into final image | 300ms       | Comfort     |

### Gallery / Wall-Specific

| #   | Name                   | Trigger                         | Animation                                             | Duration           | Emotion    |
| --- | ---------------------- | ------------------------------- | ----------------------------------------------------- | ------------------ | ---------- |
| 77  | Tile Grow-to-Detail    | Click artwork tile              | Tile grows into the detail hero position              | 350–450ms          | Continuity |
| 78  | Deep-Zoom Pinch/Scroll | Interacting with artwork viewer | Smooth continuous zoom into brushwork                 | continuous         | Awe        |
| 79  | Filter Tick-Select     | Selecting a filter option       | Small tick-mark animates in                           | 100ms              | Clarity    |
| 80  | Surprise-Me Shuffle    | Tapping "Surprise me"           | Grid briefly shuffles before settling on the new pick | 400ms              | Delight    |
| 81  | Bento Reflow           | Filter changes tile count       | Remaining tiles reflow smoothly to new positions      | 300ms              | Calm       |
| 82  | Time-of-Day Tint Shift | Ambient, based on local time    | Background warmth shifts gradually                    | very slow, minutes | Immersion  |

### Marketplace

| #   | Name                       | Trigger                      | Animation                                         | Duration | Emotion      |
| --- | -------------------------- | ---------------------------- | ------------------------------------------------- | -------- | ------------ |
| 83  | Save Heart Fill            | Tap save/heart icon          | Heart fills with a small pop                      | 200ms    | Delight      |
| 84  | Artist Note Video Play-In  | Checkout step reached        | Video panel slides/fades in before payment fields | 300ms    | Intimacy     |
| 85  | Price Transparency Fill    | Viewing the fair-price strip | Bar segments fill in sequence                     | 500ms    | Trust        |
| 86  | Purchase Confirmation Seal | Payment completes            | Small seal-stamp confirmation animation           | 400ms    | Satisfaction |

### Share

| #   | Name                         | Trigger                              | Animation                                  | Duration | Emotion      |
| --- | ---------------------------- | ------------------------------------ | ------------------------------------------ | -------- | ------------ |
| 87  | Framed Card Export Flip      | Generating a share card              | Card flips from plain to framed design     | 400ms    | Pride        |
| 88  | Founding Badge Card Generate | Requesting a shareable founding mark | Card assembles with the numbered ember     | 400ms    | Pride        |
| 89  | Countdown Widget Pulse       | Embedded widget viewed elsewhere     | Ember pulses identically to the site's own | 1s cycle | Anticipation |

### Mobile-Specific

| #   | Name                     | Trigger                               | Animation                                                     | Duration | Emotion     |
| --- | ------------------------ | ------------------------------------- | ------------------------------------------------------------- | -------- | ----------- |
| 90  | Tap Settle Spring        | Any tap on mobile                     | Tiny spring "settle" instead of flat state change             | 150ms    | Tactility   |
| 91  | Swipe Card Dismiss       | Swiping a card (e.g. onboarding step) | Card slides off with rotation                                 | 250ms    | Playfulness |
| 92  | Pull-to-Refresh Ink Drop | Pull-to-refresh on the Wall           | A small ink-drop animation plays instead of a generic spinner | 400ms    | Delight     |

**Total: 92 micro-interactions**, exceeding the 75 minimum while staying within the categories the system actually needs — nothing here is filler; every entry maps to a real moment in the page breakdowns above.

---

## 15. Responsive Design

Each breakpoint is treated as its own design problem, not a resize of the desktop layout.

- **Desktop (≥1024px):** full ceremonial layouts — cursor-spotlight, multi-column bento grid, horizontal provenance timeline, side-by-side artwork/metadata layout. Motion is at its fullest expression here.
- **Tablet (640–1023px):** bento grid reduces to fewer simultaneous tile sizes (large/medium only, no hero-scale tiles); filter bar remains persistent but condenses to icon+label chips; certificate layout shifts from side-by-side to stacked but keeps the horizontal timeline.
- **Mobile (<640px):** no cursor-dependent interactions (spotlight, tilt, magnetic buttons) — replaced by tap-driven equivalents (settle spring, swipe dismiss); bento grid becomes a deliberately alternating single-column rhythm, not a shrunk grid; provenance timeline becomes vertical; the Founding Artists ember field becomes a lower-density scrollable strip; navigation collapses to a full-screen slide-in menu.

Every reimagining above is a direct response to what's structurally different on that device (no cursor, less width, touch-driven gestures) — never a proportional scale-down of the same layout.

---

## 16. Accessibility Guidelines

- **Keyboard navigation:** full tab order follows visual/reading order on every page, including the bento grid (a known risk area for masonry-style layouts); all interactive elements reachable and operable without a mouse; visible focus outlines using a high-contrast ring, never suppressed.
- **Screen readers:** every artwork has artist-authored alt text (required at upload, not optional); decorative-only elements (drift field, particles) are marked presentational; live regions used sparingly and only for genuinely time-sensitive updates (milestone toasts, join confirmations).
- **Reduced motion:** every animation category in Section 12 has a defined static or simplified fallback under `prefers-reduced-motion` — parallax and drift become simple fades, tilt/spotlight effects disable entirely, particle and 3D moments reduce to a static graphic.
- **Contrast:** all text/background combinations meet WCAG AA at minimum; amber is never used for body text, only large type and iconography, per Section 10; the Vision page targets AAA given its reading-heavy purpose.
- **Focus states:** consistent visible focus ring (2px, offset, high-contrast) applied to every interactive element, including custom components like filter dials and the signature canvas.
- **Touch targets:** minimum 44×44px tap area on all interactive elements on mobile/tablet, regardless of visual size.
- **Responsive typography:** type scale steps down by one level at each breakpoint rather than fluidly shrinking, keeping line length and reading rhythm intentional rather than accidental at any width.

---

## 17. Design Tokens

### Typography Tokens

See Section 9 for the full scale (`caption` through `display-l`), plus font-family tokens `font-display` (Fraunces), `font-ui` (General Sans), `font-indic` (Noto Sans stack).

### Spacing Tokens

See Section 11 (`space-1` through `space-24`).

### Radius Tokens

See Section 8.2 (`radius-none` through `radius-full`).

### Color Tokens

See Section 10 for the full palette table.

### Shadow Tokens

See Section 8.3 (`shadow-soft` through `shadow-glass`).

### Motion Tokens

| Token               | Value                                            | Use                                                      |
| ------------------- | ------------------------------------------------ | -------------------------------------------------------- |
| `duration-instant`  | 100ms                                            | Icon rotates, tick marks                                 |
| `duration-fast`     | 150ms                                            | Button/hover states                                      |
| `duration-base`     | 200–250ms                                        | Standard component transitions                           |
| `duration-moderate` | 300–400ms                                        | Cards, modals, shared-element transitions                |
| `duration-slow`     | 500–600ms                                        | Certification, ceremonial moments                        |
| `duration-scene`    | 900–1600ms                                       | Hero assembly, multi-step scroll sequences               |
| `easing-standard`   | `cubic-bezier(0.22, 1, 0.36, 1)`                 | Default entrance easing — soft, organic overshoot-settle |
| `easing-exit`       | `cubic-bezier(0.4, 0, 1, 1)`                     | Exits, dismissals                                        |
| `easing-spring`     | mass 1 / stiffness 210 / damping 20 (conceptual) | Mobile taps, ember ignition, playful confirmations       |

### Z-Index Tokens

| Token        | Value | Use                                   |
| ------------ | ----- | ------------------------------------- |
| `z-base`     | 0     | Default page content                  |
| `z-elevated` | 10    | Cards, tiles                          |
| `z-sticky`   | 100   | Sticky nav bar                        |
| `z-dropdown` | 200   | Filter/select dropdowns               |
| `z-overlay`  | 300   | Modal/drawer backdrops                |
| `z-modal`    | 400   | Modals, drawers, certificate takeover |
| `z-toast`    | 500   | Toasts, milestone acknowledgments     |
| `z-tooltip`  | 600   | Tooltips                              |
| `z-cursor`   | 999   | Spotlight cursor layer                |

### Animation Tokens (named presets)

`anim-fade-up`, `anim-fade-scale`, `anim-stagger-children`, `anim-ember-ignite`, `anim-seal-stamp`, `anim-tile-grow`, `anim-signature-draw`, `anim-easel-skeleton` — each a bundled combination of a duration, easing, and property set from the tokens above, defined once and reused everywhere the corresponding micro-interaction (Section 14) occurs, so the same ceremony always feels identical across the site.

---

## 18. Component Library

For each component: purpose, anatomy, and states — described conceptually, not as code.

| Component                             | Purpose                              | Anatomy                                                         | States / Variants                                                             |
| ------------------------------------- | ------------------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Button**                            | Primary actions and navigation       | Label, optional icon, container                                 | Primary / Secondary / Ghost; default, hover, active, focus, disabled, loading |
| **Input**                             | Text entry                           | Label (floats on focus/fill), field, helper/error text          | Default, focus, filled, error, disabled                                       |
| **Artwork Card**                      | Represent one artwork in a grid      | Image (aspect-preserved), title, artist name, price (optional)  | S/M/L/Hero bento sizes; default, hover-lift, selected                         |
| **Artist Card**                       | Represent one artist in a strip/grid | Photo, name, medium/city                                        | Default, hover-glow                                                           |
| **Exhibition Card**                   | Represent one show                   | Cover image, title, location/date                               | Upcoming, live, archived                                                      |
| **Navigation Bar**                    | Primary wayfinding                   | Logo, nav items, CTA, utility corner                            | Transparent (top of Home), solid/glass (scrolled)                             |
| **Gallery Wall Grid**                 | Core discovery surface               | Bento-aware tile container, filter bar, discovery strip         | Default, filtered, empty (no-results)                                         |
| **Modal**                             | Focused single-task overlay          | Backdrop, panel, close affordance                               | Default, loading, error                                                       |
| **Drawer**                            | Mobile filter/menu panel             | Slide-in panel from edge                                        | Open, closed                                                                  |
| **Dialog**                            | Confirmation-style prompt            | Message, primary/secondary action                               | Default                                                                       |
| **Waitlist / Join Form**              | Founding Artists join flow           | Name, medium, email fields, submit                              | Default, validating, success (ember ignite)                                   |
| **Founder Badge (Wall Mark)**         | Earned recognition chip              | Icon, label                                                     | Founding member, Mentor, Referrer, Featured                                   |
| **Interactive Wall**                  | The Community Canvas (Phase 1 #31)   | Shared canvas surface, daily-contribution affordance            | Viewing, contributing, cooldown (already contributed today)                   |
| **Progress / Countdown (Ember)**      | Diwali countdown, milestone progress | Pulsing ember, numeric/label readout                            | Default, near-launch (intensified glow)                                       |
| **Provenance Timeline**               | Certificate authenticity trail       | Horizontal (desktop) / vertical (mobile) stepper, nodes, labels | Default, node-in-focus                                                        |
| **City Exhibition Map**               | Exhibition discovery                 | Stylized map, glowing pins                                      | Default, pin-hover, pin-active                                                |
| **Recognition Wall / Community Feed** | Pinned praise, notes                 | Card stack styled as sticky notes                               | Default, new-note-entrance                                                    |
| **Certificate Seal**                  | Certification visual centerpiece     | Animated wax-seal graphic, static fallback                      | Sealing (first view), sealed (resting)                                        |
| **Toast**                             | Transient feedback                   | Icon, message, auto-dismiss timer                               | Success, milestone, welcome                                                   |
| **Tooltip**                           | Contextual micro-help                | Label, pointer/arrow                                            | Default, delayed-in                                                           |
| **Filter Chip / Tag**                 | Facet selection                      | Label, selected indicator                                       | Default, selected, disabled                                                   |
| **Footer**                            | Secondary navigation and legal       | Link groups, social, legal                                      | Default only — deliberately static                                            |

---

## 19. Future Expansion Strategy

- **Circles** (Section 5.8) becomes a full experience once the founding cohort is large enough to populate cohorts authentically — mini-walls, Crit Circle, Mentor Marks all build on components already defined here (Card, Recognition Wall, Wall Mark).
- **Your Year on the Wall** and **live presence counters** activate once real usage data exists, reusing the Countdown/Progress and Toast components rather than introducing new ones.
- **Recap Reels** for exhibitions reuse the Story Reel pattern established by share cards, extended to video.
- **Seasonal re-skins** (festival takeovers) are designed as a token-swap exercise, not a redesign — the color and motion tokens in Sections 10 and 17 are structured so a festival palette can substitute the accent tokens without touching layout or components.
- **Design system governance:** as the component library grows post-launch, establish versioned tokens (already named for this in Section 17) and a lightweight review step before any new ceremony (sound, particle, or full-screen takeover) is added — the system's restraint is a design asset that erodes quickly without discipline.
- **Physical-world extension:** the same typography, seal, and signature language are built to extend to printed certificates, exhibition signage, and keepsake tickets — the design system was deliberately kept print-plausible (real serif, real ink-like motion metaphors) rather than screen-only, so ArtWall's physical presence at real exhibitions stays visually continuous with the digital one.
