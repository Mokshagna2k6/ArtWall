# Virtual Wall — reference research (oncyber.io/crypto-trap-house)

Date of investigation: 2026-10-17. Author: implementation agent for the Virtual Wall feature.

This file records **only what was actually observed**, and states plainly what could not be
determined. Nothing here is inferred from how similar products usually work.

---

## 1. Did the reference load?

Partly. Two separate headless-browser renders returned **HTTP 200** with the real page
(`x-apify-unblocker-route: HIMALIA`, `x-matched-path: /en/[slug]`, canonical
`https://oncyber.io/crypto-trap-house`).

Plain fetches did **not** work:

- `WebFetch` → HTTP 429 (twice, hours apart).
- `curl` with a desktop Chrome UA → `HTTP/1.1 429 Too Many Requests`, with
  `X-Vercel-Mitigated: challenge` and an `X-Vercel-Challenge-Token` header.

So the 429 is **not rate limiting** — it is a Vercel bot challenge on a non-browser client.
Any future automated fetch of this URL needs a real browser engine.

## 2. What the successful render actually showed

The complete extracted DOM text of the loaded page is:

```
Meta Trap house + Open Details

Connect Account
```

That is all the HTML text content there is. Page metadata:

| Field | Value |
|---|---|
| `og:title` | "Meta Trap house " |
| `og:description` | "Immerse yourself in freezecorleone's Meta Trap house . Featuring NFTs from OpenSea Collections, CyberKongz VX, Heymes, Doodle Labs Gen Art and many more" |
| `og:image` | a Firebase Storage URL under the bucket **`cyber-art-prod.appspot.com`**, path `images/ySfg4vnifD7v3sC9xmre/hero` |
| `keywords` | a list of NFT collection / deployer names (CyberKongz VX, MutantApeYachtClub, RTFKTCloneXVial, mfers-deployer, …) |
| Hosting | `Server: Vercel`, `Cache-Control: private, no-cache, no-store, must-revalidate` |

### What this *does* establish (observed, not guessed)

1. **The experience is entirely canvas-rendered.** A fully-loaded render yields two strings of
   DOM text. The rooms, the art, the walls and the floors are therefore not DOM — they are drawn
   in a WebGL canvas. There is no HTML fallback view served at this URL.
2. **The HUD is minimal and is DOM, not canvas.** Exactly two overlay affordances exist above the
   canvas: a **space title** ("Meta Trap house") with an **"Open Details"** toggle, and a
   **"Connect Account"** button. So: title + expandable details panel + wallet/account action.
   Nothing else — no visible nav bar, no sidebar, no artwork list, no minimap in the DOM.
3. **Artwork content is per-space, server-driven, and asset-hosted off-platform.** The keyword
   list enumerates specific NFT collections for *this* space, and the hero image is a
   per-space Firebase Storage object keyed by an opaque space id (`ySfg4vnifD7v3sC9xmre`).
   The space is therefore a **data record** (id → metadata → asset list), not a hardcoded scene.
4. **Content is NFT/wallet-centric.** "Connect Account" plus collection keywords: the art shown
   is tied to on-chain assets and the viewer may connect an account.
5. **Routing is slug-based and locale-aware**: `/en/[slug]`, i.e. one route template serving
   many named spaces.

## 3. What could NOT be determined

I am stating these as unknown rather than filling them in.

- **Navigation model.** Whether the visitor moves with WASD + pointer-lock mouselook,
  click-to-move, orbit, or on rails — **not determined.** Controls live in the WebGL canvas
  and in bundled JS; the rendered DOM reveals none of it, and no keyboard hint overlay appeared
  in the loaded DOM.
- **Spatial structure.** Whether "crypto-trap-house" has multiple floors, stairs, corridors or
  discrete rooms, and how many — **not determined.** No scene graph was readable.
- **How artworks are mounted.** Framed vs flush, frame styles, per-artwork spotlights, wall
  materials — **not determined.** The og:image hero is a marketing render, not the live scene,
  and I did not treat it as evidence of geometry.
- **Click behaviour on an artwork.** Whether clicking opens an in-canvas info panel, a DOM modal,
  or links out to OpenSea — **not determined.** The only DOM affordance observed is the
  space-level "Open Details", which is not artwork-level.
- **The exact 3D tech.** That it is WebGL/canvas is established by the empty DOM. Whether the
  engine is **Three.js specifically**, Babylon, PlayCanvas or in-house, and whether it uses
  react-three-fiber — **not determined.** I did not read the JS bundles, so I will not claim
  Three.js for oncyber. (A web search surfaced a *different*, unrelated "3D art gallery demo"
  project built with Three.js + WASD; that is **not** evidence about oncyber and was discarded.)
- **Performance targets, mobile/touch controls, VR support, multiplayer avatars, audio** — all
  **not determined.**
- **oncyber's own help/docs pages** describing visitor controls: searched for and **not found**.
  Search results were off-topic (unrelated forum posts about the HTML `<details>` element).

## 4. Consequence for our design

The reference confirms a **shape** (canvas-only 3D space, slug-routed, per-space data-driven
asset list, deliberately minimal DOM HUD of title + details + account) but **does not** give us
its navigation scheme, room layout or artwork-click behaviour.

Per the brief, where the reference is silent we design **from the Bible**, not from assumption:

- **Bible §15 / FE-3.07–3.09**: 3D virtual exhibitions use **Three.js / react-three-fiber**; a
  published exhibition is viewable in 3D; there must be a **non-WebGL fallback: a 2D gallery
  list**. (FE-3.09 is already implemented in `exhibition-view-toggle.tsx`.)
- **Navigation**: first-person **WASD + pointer-lock mouselook**, because the reference did not
  settle it and the Bible's 3D requirement pairs with a 2D scrollable fallback for devices that
  cannot render 3D. The existing viewer's OrbitControls is kept as the non-pointer-lock path.
- **Structure**: data-driven off the existing WallOS tables
  (`organizations → venues → buildings → floors → rooms_zones → walls → slots`), per Bible
  §30–34 and Locked Rule 31 — **not** hardcoded geometry, which also matches the one thing the
  reference clearly does (space as a data record resolved by id).
- **HUD**: mirrors the one HUD pattern actually observed — a title plus an expandable details
  panel — rather than inventing chrome the reference does not have.
- **Artwork click**: an in-app details panel, since the reference's behaviour here is unknown and
  Bible §A13 (privacy masking) and §44 (no public demand scores) constrain what may be shown
  regardless.

### Rules that bind the virtual wall specifically

- **Rule 21/22 + Invariant 12**: a slot may exist with no artwork; slot QR identifies the
  **slot**, never the artwork. Resolution is always `slot → current exhibition → current artwork`.
- **Invariant 1**: one active exhibition per slot.
- **§44**: qualitative demand bands only on any public surface — never a score.
- **§A13**: never expose owner identity, price history or wallet on a public surface.
- **§18**: orthogonal state domains; no single `status` field.
