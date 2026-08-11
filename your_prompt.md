````markdown
# ARTWALL — COMPLETE FRONTEND UI/UX REDESIGN PROMPT

You are a **senior frontend engineer, UI/UX designer, product designer, and animation specialist**.

I want you to completely redesign the **frontend UI/UX of my existing ArtWall application**.

The most important requirement is:

> **Do NOT change, remove, break, or rewrite my existing functionality.**
>
> This task is primarily a **frontend/UI/UX redesign**. Preserve all existing business logic, backend functionality, database behavior, routes, server actions, authentication, API calls, uploads, and existing features unless a tiny frontend adjustment is required to support the new UI.

---

# 1. CURRENT PROBLEM

My current ArtWall UI has a darker, more cinematic/futuristic visual style.

I want to move the entire frontend toward a:

- Minimal
- Warm
- Off-white
- Editorial
- Premium
- Elegant
- Calm
- Professional
- Art-focused

visual direction.

Use **Artwork Archive** as a UX reference for the clean professional art-management feeling:

https://www.artworkarchive.com/

However:

- Do NOT clone Artwork Archive.
- Do NOT copy its source code.
- Do NOT copy its branding.
- Do NOT copy its exact layouts pixel-for-pixel.
- Do NOT copy proprietary assets.
- Do NOT make ArtWall look like a cheap clone.

Instead, understand the principles behind the design and create a better, original ArtWall experience.

---

# 2. MAIN DESIGN DIRECTION

The new ArtWall UI should feel like:

> **A contemporary art gallery + premium editorial website + professional art-management application.**

The visual language should be:

```text
Warm
Quiet
Minimal
Editorial
Image-first
Sophisticated
Human
Professional
````

Avoid:

```text
Dark futuristic UI
Excessive gradients
Bright neon colors
Heavy glassmorphism
Huge shadows
Overly rounded cards
Excessive borders
Generic SaaS dashboard design
Unnecessary animations
Visual clutter
```

---

# 3. COLOR SYSTEM

Create a proper ArtWall design system.

## Primary Background

Use a warm off-white / ivory background.

For example:

```text
#F7F5F0
#F4F1EA
#FAF9F6
```

Do not blindly use these exact values. Choose the final palette carefully.

## Surfaces

Use:

```text
White
Warm white
Very light beige
Soft warm gray
```

## Text

Use:

```text
Charcoal
Dark gray
Muted gray
Soft gray
```

Avoid pure black wherever possible.

## Accent

Use a subtle:

```text
Earthy olive
Muted gold
Warm brown
Terracotta
```

Use accent colors sparingly.

The artwork itself should provide most of the visual color.

---

# 4. TYPOGRAPHY

Typography should become a major part of the design.

Use a sophisticated combination of:

### Display font

Elegant serif/editorial typography for:

* Hero headings
* Artist names
* Artwork titles
* Exhibition titles
* Major section headings

### UI font

Clean modern sans-serif for:

* Navigation
* Buttons
* Forms
* Tables
* Metadata
* Labels
* Body text

Do not use futuristic typography.

Do not make everything bold.

Use font size, spacing, weight, and whitespace to create hierarchy.

---

# 5. SPACING

Increase whitespace throughout the application.

The UI should breathe.

Prefer:

```text
Whitespace
+
Typography
+
Thin separators
+
Strong image hierarchy
```

instead of:

```text
Card
Card
Card
Card
```

Do not put every piece of content inside a card.

Use cards only when they genuinely improve usability.

---

# 6. COMPLETE FRONTEND REDESIGN

Redesign all existing frontend pages where appropriate.

Audit every page first.

For each page determine:

```text
KEEP FUNCTIONALITY
        ↓
REDESIGN PRESENTATION
        ↓
IMPROVE UX
        ↓
IMPROVE RESPONSIVENESS
        ↓
IMPROVE ANIMATIONS
```

Do not change the underlying functionality unnecessarily.

---

# 7. EXISTING FEATURES MUST REMAIN

Preserve everything that currently works.

This includes, but is not limited to:

* Waitlist
* Founding artist registration
* Founder number system
* Artwork uploads
* Collaborative Wall
* Search
* Real-time activity
* Admin moderation
* Existing authentication
* Existing API calls
* Existing server actions
* Existing database interactions
* Cloudinary integration
* Existing experiential pages
* Existing public pages
* Existing forms
* Existing validation
* Existing security features

If you find an existing feature that looks visually outdated, **redesign its UI without removing its functionality**.

---

# 8. LANDING PAGE

Completely redesign the landing page visually.

The current landing page should transition from:

```text
Dark
Cinematic
Futuristic
High contrast
```

to:

```text
Warm
Editorial
Minimal
Premium
Artistic
```

Keep all existing content and functionality unless there is a clear UX improvement.

---

# 9. HERO SECTION

Create a calm, editorial hero.

Use:

* Warm off-white background
* Large elegant typography
* Strong artwork imagery
* Generous whitespace
* Minimal CTA
* Subtle supporting text

Avoid:

* Huge glowing text
* Dark backgrounds
* Heavy gradients
* Excessive decorations
* Excessive floating elements

The hero should immediately communicate:

> ArtWall is a serious platform for artists and their work.

---

# 10. NAVIGATION

Create a minimal navigation.

Example:

```text
ARTWALL

Artwork
Artists
Exhibitions
About

                         Search
                         Sign In
                         Join ArtWall
```

Use subtle typography.

Do not use oversized icons.

On scroll:

```text
Initial:
Transparent / warm background

Scrolled:
Soft ivory surface
+
subtle bottom border
+
slightly reduced height
```

Animate this smoothly.

---

# 11. MOBILE NAVIGATION

Create a beautiful mobile navigation.

Use:

* Minimal menu button
* Smooth drawer
* Clear hierarchy
* Large tap targets
* Simple typography
* Subtle animation

Do not create a complicated mobile menu.

---

# 12. ARTWORK-FIRST UI

Artwork should always remain the visual focus.

Artwork cards should be clean.

Example:

```text
┌─────────────────────────────┐
│                             │
│                             │
│         ARTWORK             │
│                             │
│                             │
└─────────────────────────────┘

Untitled No. 04
2026
Oil on canvas
```

Avoid:

* Thick borders
* Huge shadows
* Excessive badges
* Too many buttons

Use metadata carefully.

---

# 13. ARTWORK GRID

Create an elegant artwork grid.

Support:

* Responsive columns
* Different artwork aspect ratios
* Proper image cropping
* High-quality images
* Lazy loading
* Smooth loading
* Hover interactions

Consider an editorial/masonry-like layout where appropriate.

Do not force every artwork into identical cards if doing so hurts the artwork presentation.

---

# 14. ARTWORK HOVER ANIMATION

When the user hovers an artwork:

```text
Image
 ↓
Very subtle scale
 ↓
Metadata gently appears/moves
 ↓
Secondary action becomes visible
```

The animation should be:

```text
Fast enough to feel responsive
Slow enough to feel premium
```

Do not make artwork bounce, rotate, or move excessively.

---

# 15. ARTWORK DETAIL PAGE

Redesign the artwork detail page into an editorial layout.

Use:

```text
Large artwork
        +
Minimal information panel
```

Information:

```text
Artwork Title
Artist
Year
Medium
Dimensions
Price
Availability
```

Actions:

```text
Edit
Share
Add to Collection
Add to Exhibition
```

Then below:

```text
Description
Details
Provenance
Exhibitions
Location
Documents
Certificate
Activity
```

Use whitespace and thin separators.

---

# 16. DASHBOARD

If the current project already contains a dashboard, redesign it completely without changing its functionality.

The dashboard should feel like a calm professional workspace.

Example:

```text
Good morning

Tuesday, August 11

────────────────────────────────

128 artworks
6 exhibitions
₹8.4L sales

────────────────────────────────

Recent Activity

Upcoming

Tasks
```

Avoid giant colorful metric cards.

Use restrained typography and subtle surfaces.

---

# 17. SIDEBAR

Create a clean professional application sidebar.

Example:

```text
ARTWALL

Overview

WORK

Artwork
Collections
Exhibitions
Locations

BUSINESS

Contacts
Sales
Invoices

MANAGEMENT

Documents
Certificates
Private Rooms
Reports

TOOLS

Calendar
Tasks
Insights

────────────

My Profile
Settings
```

The exact structure should be based on the existing routes and functionality.

Do not create navigation items for features that do not exist.

---

# 18. FORMS

Redesign all forms.

Forms should be:

* Clean
* Short
* Easy to understand
* Well-spaced
* Accessible

Group fields logically.

Example:

```text
Basic Information

Artwork Details

Pricing

Classification

Images

Documents
```

Avoid showing huge forms with no structure.

Use progressive disclosure when appropriate.

---

# 19. BUTTONS

Buttons should be minimal.

Primary button:

```text
Dark charcoal / subtle accent
```

Secondary:

```text
Transparent
Thin border
```

Tertiary:

```text
Text-only
```

Avoid:

* Excessively rounded pill buttons
* Bright neon buttons
* Giant CTA buttons everywhere

---

# 20. TABLES

Redesign tables to look professional and minimal.

Use:

* Thin separators
* Good spacing
* Small metadata
* Clear typography
* Sticky headers when useful

Support existing:

* Search
* Sorting
* Filtering
* Pagination
* Selection
* Bulk actions

Do not change the functionality.

---

# 21. FILTERS

Make filters easy to understand.

Use:

* Filter button
* Dropdowns
* Select menus
* Search
* Clear filters
* Active filter indicators

Animate filter panels smoothly.

---

# 22. EMPTY STATES

Replace generic empty states.

Instead of:

```text
No data found.
```

Use:

```text
Your collection is empty.

Start by adding your first artwork.

+ Add Artwork
```

Empty states should guide the user toward the next action.

---

# 23. LOADING STATES

Create elegant loading states.

Use:

* Skeletons
* Image placeholders
* Progressive loading
* Subtle opacity transitions

Avoid:

```text
Loading...
```

everywhere.

---

# 24. ERROR STATES

Create clear error states.

Include:

* What happened
* What the user can do
* Retry action

Example:

```text
We couldn't load your artworks.

Please try again.

Retry
```

Do not expose technical errors directly to users.

---

# 25. USER ONBOARDING

This is extremely important.

Make the ArtWall onboarding experience **best-in-class and minimal**.

The onboarding should not feel like a boring registration form.

---

## STEP 1 — Welcome

```text
Welcome to ArtWall.

A better way to manage your art.

[Continue]
```

Minimal.

---

## STEP 2 — Account

Allow:

```text
Continue with Google

or

Continue with Email
```

Keep the page extremely clean.

---

## STEP 3 — About You

Ask only what is necessary.

Example:

```text
What best describes you?

Artist
Gallery
Collector
Curator
Art Professional
```

Use beautiful selection cards.

---

## STEP 4 — Artist Information

If the user is an artist:

```text
Your Name
Artist Handle
Location
Short Bio
```

Do not ask unnecessary information.

---

## STEP 5 — First Artwork

Immediately guide the artist to add their first artwork.

```text
Let's add your first artwork.

[Upload Artwork]
```

Make this experience extremely simple.

---

## STEP 6 — Artwork Details

Ask the most important fields first.

```text
Title
Year
Medium
Price
```

Allow:

```text
Skip for now
```

Advanced fields can be added later.

---

## STEP 7 — Completion

Show:

```text
You're ready.

Your ArtWall has been created.

[Go to ArtWall]
```

Use a subtle animation.

---

# 26. ONBOARDING PRINCIPLES

The onboarding should follow:

```text
Progressive disclosure
Minimal questions
Clear language
One decision at a time
Visible progress
Easy skipping
Beautiful visuals
Fast completion
```

Never overwhelm new users.

Do not ask for information that isn't immediately necessary.

---

# 27. ONBOARDING ANIMATIONS

Use subtle transitions between steps.

Example:

```text
Step 1
    ↓ fade + slide
Step 2
    ↓ fade + slide
Step 3
```

Use:

* Fade
* Slight vertical movement
* Image reveal
* Progress indicator

Avoid:

* Large rotations
* Bouncing
* Excessive scaling
* Long animations

The user should feel like the interface is flowing naturally.

---

# 28. PAGE TRANSITIONS

Add subtle page transitions.

Recommended:

```text
opacity: 0 → 1
transform: translateY(8px) → 0
```

Keep transitions short.

Do not make every route transition slow.

---

# 29. SCROLL ANIMATIONS

Use scroll animations selectively.

Good examples:

* Artwork image reveal
* Section fade
* Text reveal
* Image movement
* Parallax only where it improves the experience

Avoid animating every section.

---

# 30. PERFORMANCE

Animations must never hurt performance.

Follow:

* Prefer CSS transforms and opacity.
* Avoid animating layout-heavy properties.
* Avoid unnecessary JavaScript animation loops.
* Lazy-load images.
* Optimize images.
* Use GPU-friendly transforms where appropriate.
* Avoid excessive scroll listeners.
* Use IntersectionObserver where appropriate.
* Do not animate huge DOM trees.
* Keep animations lightweight.

Target smooth interaction around:

```text
60 FPS
```

where practical.

---

# 31. REDUCED MOTION

Respect:

```text
prefers-reduced-motion
```

Users who prefer reduced motion should receive simplified transitions.

Accessibility is mandatory.

---

# 32. RESPONSIVE DESIGN

The redesign must work beautifully on:

```text
Desktop
Laptop
Tablet
Mobile
```

Do not simply shrink the desktop layout.

Mobile should have its own interaction patterns.

---

# 33. ACCESSIBILITY

Ensure:

* Semantic HTML
* Keyboard navigation
* Visible focus states
* Accessible labels
* Proper contrast
* Accessible dialogs
* Accessible forms
* Screen reader support
* Reduced motion support

---

# 34. DESIGN SYSTEM

Create reusable design tokens for:

```text
Colors
Typography
Spacing
Radius
Shadows
Transitions
Borders
```

Create reusable components.

Examples:

```text
Button
Input
Select
Textarea
Dialog
Drawer
Dropdown
Tabs
Tooltip
Badge
Card
Table
Search
Filter
Breadcrumb
Toast
ArtworkCard
ArtworkGrid
ArtworkTable
EmptyState
LoadingState
ErrorState
```

Do not duplicate components across pages.

---

# 35. ANIMATION SYSTEM

Create a consistent animation system instead of manually creating random animations.

Define reusable animation patterns:

```text
fadeIn
fadeUp
fadeDown
scaleIn
imageReveal
pageEnter
modalEnter
drawerEnter
hoverImage
staggerChildren
```

Use them consistently.

Do not introduce animation libraries unless necessary.

If the project already uses an animation library, inspect it first and reuse it where appropriate.

---

# 36. EXISTING ANIMATIONS

Review every existing animation.

For each one decide:

```text
KEEP
IMPROVE
REPLACE
REMOVE
```

If an existing animation does not fit the new minimal/off-white visual language, replace it.

Do not keep animations simply because they already exist.

Animations must support the new design.

---

# 37. THE WALL

Preserve the existing Collaborative Wall functionality.

Redesign its visual presentation.

The Wall should feel like:

> A digital contemporary exhibition.

Use:

* Large artwork
* Editorial grid
* Asymmetric layout
* Artist information
* Artwork metadata
* Search
* Filters
* Subtle hover animations

Keep:

* Existing search
* Real-time activity
* Existing interactions
* Existing backend functionality

---

# 38. PUBLIC ARTIST PROFILE

Make public artist profiles feel like professional gallery profiles.

Example:

```text
ARTIST NAME

Artist statement...

[Featured Artwork]

Selected Works

Artwork    Artwork    Artwork

Exhibitions

About

Contact
```

Avoid generic social-media profile design.

---

# 39. PAGE CONSISTENCY

Every page should use the same visual language.

For example:

```text
Landing
   ↓
Artist Profile
   ↓
Dashboard
   ↓
Artwork
   ↓
Collections
   ↓
Exhibitions
```

All should feel like the same ArtWall product.

---

# 40. DO NOT CHANGE BUSINESS LOGIC

This is critical.

Do not change:

* Database logic
* API behavior
* Server actions
* Authentication logic
* Upload logic
* Validation logic
* Existing workflows

unless absolutely necessary.

If an existing component mixes UI and business logic:

1. Extract the business logic.
2. Preserve it.
3. Redesign only the presentation.

---

# 41. BEFORE CODING

First inspect:

```text
package.json
app/
pages/
components/
lib/
actions/
api/
database/
styles/
public/
configuration
```

Also inspect:

* Existing routes
* Existing layouts
* Existing design tokens
* Existing animation implementation
* Existing responsive behavior
* Existing reusable components

---

# 42. CREATE A UI AUDIT

Before making changes, create a table:

| Page     | Current UI     | Functionality | Keep | Redesign | New UX       |
| -------- | -------------- | ------------- | ---- | -------- | ------------ |
| Landing  | Dark/cinematic | Existing      | ✅    | ✅        | Editorial    |
| Wall     | Existing       | Existing      | ✅    | ✅        | Art-first    |
| Waitlist | Existing       | Existing      | ✅    | ✅        | Minimal      |
| Admin    | Existing       | Existing      | ✅    | ✅        | Professional |
| ...      | ...            | ...           | ...  | ...      | ...          |

Complete this for every route.

---

# 43. IMPLEMENTATION PROCESS

Follow this order:

```text
AUDIT
 ↓
DESIGN SYSTEM
 ↓
APPLICATION SHELL
 ↓
LANDING PAGE
 ↓
ONBOARDING
 ↓
ARTIST PROFILE
 ↓
WALL
 ↓
DASHBOARD
 ↓
ARTWORK UI
 ↓
OTHER EXISTING PAGES
 ↓
RESPONSIVE POLISH
 ↓
ANIMATION POLISH
 ↓
ACCESSIBILITY
 ↓
PERFORMANCE
 ↓
REGRESSION TESTING
```

---

# 44. DO NOT REBUILD EVERYTHING AT ONCE

Implement incrementally.

After every major section:

1. Run the application.
2. Check the page.
3. Check desktop.
4. Check mobile.
5. Check existing functionality.
6. Check animations.
7. Check console errors.
8. Fix regressions.

Then continue.

---

# 45. QUALITY CHECK

Before considering the redesign complete, verify:

```text
[ ] Existing features still work
[ ] Existing routes still work
[ ] Existing forms still work
[ ] Existing uploads still work
[ ] Existing authentication still works
[ ] Existing database interactions still work
[ ] Existing Wall functionality still works
[ ] Admin functionality still works
[ ] Waitlist still works
[ ] Founding artist flow still works
[ ] Desktop UI works
[ ] Mobile UI works
[ ] Animations are smooth
[ ] Animations are not excessive
[ ] Reduced motion works
[ ] No console errors
[ ] No TypeScript errors
[ ] No broken images
[ ] No layout shifts
[ ] No unnecessary loading
[ ] Accessibility is reasonable
[ ] UI is consistent
[ ] Onboarding is simple
```

---

# 46. FINAL DESIGN TEST

Before finishing, ask:

### Does it feel minimal?

### Does it feel premium?

### Does the artwork remain the visual focus?

### Is the interface calm?

### Is the navigation obvious?

### Can a new artist understand what to do immediately?

### Is onboarding fast?

### Are animations helping rather than distracting?

### Does mobile feel intentionally designed?

### Does the product feel like one coherent system?

If any answer is no, improve it.

---

# 47. FINAL PRODUCT DIRECTION

The final ArtWall should move from:

```text
Dark
Cinematic
Futuristic
High contrast
Startup-like
```

to:

```text
Warm off-white
Minimal
Editorial
Premium
Professional
Art-first
Calm
Human
```

The public ArtWall experience can retain some artistic/immersive character.

The authenticated product should feel like a **professional art-management workspace**.

The final experience should feel like:

```text
Contemporary Art Gallery
        +
Editorial Design
        +
Professional Art Archive
        +
Modern SaaS
```

---

# 48. FIRST TASK

## DO NOT CODE YET.

First inspect the entire repository and return:

### 1. Current frontend architecture

### 2. All existing routes/pages

### 3. All existing reusable components

### 4. Existing design system

### 5. Existing animations

### 6. Existing business logic that must be preserved

### 7. Existing responsive behavior

### 8. Complete UI audit

### 9. Proposed new ArtWall design system

### 10. Proposed navigation

### 11. Proposed landing page structure

### 12. Proposed onboarding flow

### 13. Proposed dashboard structure

### 14. Proposed artwork UI

### 15. Animation strategy

### 16. Migration strategy

### 17. Potential regression risks

Then wait for approval before making major changes.

---

# FINAL INSTRUCTION

**Redesign the entire ArtWall frontend, not just individual pages.**

Keep all existing functionality intact.

Make the UI:

> **Minimal + Warm Off-White + Editorial + Premium + Art-First + Professional**

Make onboarding:

> **Simple + Fast + Beautiful + Clear**

Make animations:

> **Smooth + Subtle + Performant + Purposeful**

And make sure the final application feels like a **real professional art platform**, not a generic template.

**Do not sacrifice functionality for visual design.**

**Do not sacrifice performance for animations.**

**Do not sacrifice usability for aesthetics.**

Build a UI where all three work together:

```text
              ARTWALL

       BEAUTIFUL
          +
       USABLE
          +
       FAST
```

```
```
