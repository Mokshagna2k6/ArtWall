# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: booking.spec.ts >> book a slot, agree, pay in Razorpay test mode, see it paid
- Location: e2e\booking.spec.ts:37:5

# Error details

```
Error: expect(locator).toBeDisabled() failed

Locator: getByRole('button', { name: 'Continue' })
Expected: disabled
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toBeDisabled" getByRole('button', { name: 'Continue' }) with timeout 20000ms
  - waiting for getByRole('button', { name: 'Continue' })

```

```yaml
- link "Skip to content":
  - /url: "#main"
- banner:
  - link "ArtWall, home":
    - /url: /
    - text: ArtWall
  - navigation "Primary":
    - list:
      - listitem:
        - link "Home":
          - /url: /
      - listitem:
        - button "The Wall"
      - listitem:
        - link "Services":
          - /url: /platform
      - listitem:
        - link "How It Works":
          - /url: /journey
      - listitem:
        - link "Community":
          - /url: /community
      - listitem:
        - button "About"
      - listitem:
        - button "More"
  - button
- main:
  - main:
    - paragraph: Ric Platter · 28-slot standard
    - heading "Take a place on the wall." [level=1]
    - paragraph: Choose your position, pick your dates, and we’ll hold the slots while you pay. Everything you see includes GST.
    - list "Progress":
      - listitem:
        - button "Slots (done)"
      - listitem:
        - button "Dates (done)"
      - listitem:
        - button "Artwork (done)"
      - listitem:
        - button "Add-ons (done)"
      - listitem:
        - button "Agreement (current step)"
    - heading "The exhibition agreement" [level=2]
    - paragraph: Generated from this booking. Read it — the version you tick is the version that governs, including the refund terms.
    - paragraph: ARTWALL LABS — EXHIBITION AGREEMENT
    - paragraph:
      - strong: 1. Slots.
      - text: A1 at Ric Platter, Jaipur, for 7 days from 2026-09-29.
    - paragraph:
      - strong: 2. Fee.
      - text: ₹7,268.80, inclusive of add-ons and 18% GST under GSTIN 08ABFCA1595D1ZR.
    - paragraph:
      - strong: 3. Copyright.
      - text: You retain every right in your work. ArtWall takes a limited licence to display and market it for the duration of this exhibition — never an assignment.
    - paragraph:
      - strong: 4. Sale and resale.
      - text: If the work sells through ArtWall, commission is 15%. On any future resale a 4% royalty flows to you and 1% to the platform.
    - paragraph:
      - strong: 5. Condition and liability.
      - text: Staff photograph the work on arrival and on removal. Insuring the physical piece remains yours.
    - paragraph:
      - strong: 6. Cancellation.
      - text: 50% of the fee is refunded on cancellation, whenever you cancel. One rule, applied the same way to everyone.
    - checkbox "I have read the agreement above and I sign it electronically."
    - text: I have read the agreement above and I sign it electronically.
    - button "Back"
    - button "Sign and hold · ₹7,268.80"
    - status
    - complementary:
      - paragraph: Your booking
      - term: Slots
      - definition: A1
      - term: Duration
      - definition: 7 days
      - term: Base
      - definition: ₹6,160
      - term: GST (18%)
      - definition: ₹1,108.80
      - term: Total
      - definition: ₹7,268.80
      - paragraph: Inclusive of GST. Nothing is charged until you pay, and your slots are held while you do.
- contentinfo:
  - text: ArtWall
  - paragraph: Reimagining and revolutionising India's art economy.
  - term: Email
  - definition:
    - link "artwalllabs@gmail.com":
      - /url: mailto:artwalllabs@gmail.com
  - term: Phone
  - definition:
    - link "+91 82093 95894":
      - /url: tel:+918209395894
  - navigation "Explore":
    - paragraph: Explore
    - list:
      - listitem:
        - link "Virtual Wall":
          - /url: /wall
      - listitem:
        - link "Physical Wall":
          - /url: /physical-wall
      - listitem:
        - link "Services":
          - /url: /platform
      - listitem:
        - link "How It Works":
          - /url: /journey
      - listitem:
        - link "Community":
          - /url: /community
      - listitem:
        - link "The Company":
          - /url: /about
      - listitem:
        - link "Team":
          - /url: /team
  - navigation "More":
    - paragraph: More
    - list:
      - listitem:
        - link "Artists":
          - /url: /artists
      - listitem:
        - link "Certification":
          - /url: /certificate
      - listitem:
        - link "The Survey":
          - /url: /survey
      - listitem:
        - link "Contact":
          - /url: /contact
  - navigation "Follow":
    - paragraph: Follow
    - list:
      - listitem:
        - link "Instagram":
          - /url: https://instagram.com/artwalllabs
      - listitem:
        - link "X":
          - /url: https://x.com/artwalllabs
      - listitem:
        - link "LinkedIn":
          - /url: https://linkedin.com/company/artwalllabs
      - listitem:
        - link "YouTube":
          - /url: https://youtube.com/@artwalllabs
      - listitem:
        - link "WhatsApp":
          - /url: https://wa.me/918209395894
  - text: DPIIT Recognised · Startup India, Govt. of India Designed & built in Rajasthan Built with
  - link "StackFox":
    - /url: https://stackfox.in
  - text: Wall live · Jaipur
  - paragraph: © 2026 Artwall Labs Pvt Ltd. All rights reserved.
- alert
```

```
error: pw_audit_log is append-only: DELETE is not allowed
```

# Test source

```ts
  1  | import { existsSync, readFileSync } from "node:fs";
  2  | import { parseEnv } from "node:util";
  3  | 
  4  | import pg from "pg";
  5  | 
  6  | /**
  7  |  * Direct database access for e2e setup/teardown only (never for assertions
  8  |  * the UI should be making). Reads DATABASE_URL from the environment, falling
  9  |  * back to .env for local runs.
  10 |  */
  11 | function databaseUrl(): string {
  12 |   if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  13 |   if (existsSync(".env")) {
  14 |     const env = parseEnv(readFileSync(".env", "utf8")) as Record<string, string>;
  15 |     if (env.DATABASE_URL) return env.DATABASE_URL;
  16 |   }
  17 |   throw new Error("DATABASE_URL is required for e2e tests");
  18 | }
  19 | 
  20 | let pool: pg.Pool | null = null;
  21 | 
  22 | export async function q<T = Record<string, unknown>>(
  23 |   text: string,
  24 |   params: unknown[] = []
  25 | ): Promise<T[]> {
  26 |   pool ??= new pg.Pool({ connectionString: databaseUrl(), max: 2 });
> 27 |   return (await pool.query(text, params)).rows as T[];
     |           ^ error: pw_audit_log is append-only: DELETE is not allowed
  28 | }
  29 | 
  30 | export async function closeDb() {
  31 |   await pool?.end();
  32 |   pool = null;
  33 | }
  34 | 
  35 | /**
  36 |  * Remove everything an e2e user created and hand their slots back to the
  37 |  * wall, so the shared test database is left as it was found.
  38 |  */
  39 | export async function purgeE2eUser(email: string) {
  40 |   const [user] = await q<{ id: string }>(`select id from "user" where email = $1`, [email]);
  41 |   if (!user) return;
  42 |   const bookings = `select id from pw_bookings where artist_id = $1`;
  43 |   await q(
  44 |     `update pw_slots set state = 'available', version = version + 1, updated_at = now()
  45 |      where id in (select slot_id from pw_booking_slots where booking_id in (${bookings}))
  46 |        and state in ('reserved', 'booked')`,
  47 |     [user.id]
  48 |   );
  49 |   for (const table of [
  50 |     "pw_invoices",
  51 |     "pw_ledger",
  52 |     "pw_refunds",
  53 |     "pw_payments",
  54 |     "pw_install_windows",
  55 |     "pw_booking_slots",
  56 |     "pw_agreements",
  57 |   ]) {
  58 |     await q(`delete from ${table} where booking_id in (${bookings})`, [user.id]);
  59 |   }
  60 |   await q(`delete from pw_audit_log where actor_id = $1 or subject_id in (${bookings})`, [user.id]);
  61 |   await q(`delete from pw_bookings where artist_id = $1`, [user.id]);
  62 |   await q(`delete from pw_notifications where user_id = $1`, [user.id]);
  63 |   await q(`delete from pw_consents where user_id = $1`, [user.id]);
  64 |   await q(`delete from artist_profiles where "userId" = $1`, [user.id]);
  65 |   await q(`delete from session where "userId" = $1`, [user.id]);
  66 |   await q(`delete from account where "userId" = $1`, [user.id]);
  67 |   await q(`delete from "user" where id = $1`, [user.id]);
  68 | }
  69 | 
```