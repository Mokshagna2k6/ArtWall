# Runbook: Supabase sign-in and database row locks (RLS)

**Who this is for:** anyone with access to the Supabase dashboard. You do not need to be
a programmer to do Parts 1 and 2. Part 3 is a plan that a developer runs.

**What this fixes.** Three real problems on the live site today:

| # | Problem | Who it hurts | Part |
|---|---------|--------------|------|
| A | "Sign in with Google" is switched off in Supabase, so the button fails | every new visitor | Part 1 |
| B | New sign-ups are asked to confirm their email, but no email ever gets sent | every new sign-up | Part 2 |
| C | 103 database tables have no row-level lock ("RLS") | nobody today, but it is a missing safety net | Part 3 |

Parts 1 and 2 are broken right now and should be fixed today. Part 3 is a safety net and
should be done slowly and carefully.

---

## STOP — read this before touching Part 3

> ### Turning on RLS without the right rules BLOCKS ALL ACCESS to that table.
>
> RLS ("Row Level Security") is a lock on a table. When you switch the lock on, Postgres
> **denies everything by default**. If there is no rule saying "this person may read this
> row", then nobody reads anything. There is no warning and no undo prompt. A table with
> the lock on and no rules behaves exactly like a table that was deleted.
>
> **Never click the "Enable RLS" toggle in the Supabase table editor.** Use the reviewed
> SQL in Part 3, which switches the lock on and adds the rules in the same transaction, so
> the two can never be out of step.

The good news, specific to this project:

- The website's own server does **not** talk to the database through Supabase's API. It
  connects straight to Postgres using `DATABASE_URL`. That connection is a database owner
  and **RLS does not apply to it at all**. (Verified: `packages/db/src/index.ts`, and
  `createAdminClient()` in `apps/web/src/lib/supabase/server.ts` has no call sites.)
- So the pages, the admin area, the cron jobs and the webhooks keep working unchanged.
- The only thing RLS changes is what someone holding the **anon key** (which is public, it
  ships in the browser) or a **signed-in user's token** can do if they talk to Supabase's
  API directly. Today, that is "read and change everything". That is what we are closing.

One more rule that is not negotiable:

> **No RLS policy may ever let a user change their own `role`, `onboardingPersona`, or any
> verification column.** Those columns decide who is an admin. A policy that lets a user
> write them is an instant "make myself an admin" button. Migration
> `packages/db/migrations/0074_supabase_auth.sql` already states this for the `user` table;
> every policy below keeps the same line.

---

# Part 1 — Turn on "Sign in with Google"

**Current state:** asking Supabase to start a Google sign-in returns
`{"code":400,"msg":"Unsupported provider: provider is not enabled"}`.
The Google Cloud side is already set up correctly. Only the Supabase side is missing.

**You will need:** the Google *Client ID* and *Client Secret* from Google Cloud Console
(Google Cloud Console → APIs & Services → Credentials → your OAuth 2.0 Client ID).

### Steps

1. Open <https://supabase.com/dashboard> and sign in.
2. Click the ArtWall project (reference `nibhjciuatdfljwicykm`).
3. In the left sidebar click **Authentication**.
4. Under Authentication, click **Sign In / Providers**.
5. You will see a list of providers. Find **Google** and click it to expand it.
6. Turn the **Enable Sign in with Google** switch ON.
7. A box called **Client IDs** appears. Paste the Client ID from Google Cloud. It ends in
   `.apps.googleusercontent.com`.
8. In **Client Secret (for OAuth)**, paste the Client Secret from Google Cloud.
9. Below those boxes is a read-only field called **Callback URL (for OAuth)**. It shows:

   ```
   https://nibhjciuatdfljwicykm.supabase.co/auth/v1/callback
   ```

   Click the copy icon next to it. **Do not type this yourself** — one wrong character and
   Google refuses the sign-in.
10. Click **Save**.

### Steps on the Google side (confirm only)

The Google side is reported as already correct. Confirm it in two minutes:

11. Open <https://console.cloud.google.com/apis/credentials>.
12. Click your OAuth 2.0 Client ID.
13. Under **Authorised redirect URIs** there must be exactly this one line:

    ```
    https://nibhjciuatdfljwicykm.supabase.co/auth/v1/callback
    ```

    This is the **only** callback URL Google needs. It is not your website's address.
    Google always hands the user back to Supabase, and Supabase hands them on to the site.
14. If it is missing, click **+ ADD URI**, paste it, and click **SAVE**. Google can take up
    to five minutes to apply a change here.

### Tell Supabase which site addresses are allowed

Supabase refuses to send a signed-in user to an address it does not recognise. If you skip
this, sign-in appears to work and then dumps the user on the wrong page.

15. In the Supabase sidebar click **Authentication**, then **URL Configuration**.
16. Set **Site URL** to the production address:

    ```
    https://www.artwalllabs.com
    ```

    (If the live domain is different, use the one that is actually live. This is the address
    users are returned to when nothing more specific applies.)
17. Under **Redirect URLs**, click **Add URL** once for each of these, so all four are
    listed:

    ```
    http://localhost:3000/**
    https://www.artwalllabs.com/**
    https://artwall-production.vercel.app/**
    https://www.artwalllabs.com/auth/callback
    http://localhost:3000/auth/callback
    ```

    The `/**` on the end means "and anything under this address". `localhost:3000` is a
    developer's own computer; it is needed so developers can test sign-in, and it is safe
    because nobody else's browser can reach another person's `localhost`.
18. If the project also uses Vercel preview deployments, add:

    ```
    https://*-artwall.vercel.app/**
    ```

19. Click **Save**.

### Check it worked

20. Open the live site in a **private/incognito** browser window.
21. Click "Continue with Google".
22. You should see Google's own account chooser, then land back on the site signed in.
23. If you instead see `Unsupported provider`, step 6 did not save — go back and check the
    switch is actually ON.
24. If you see `redirect_uri_mismatch`, the URL in step 13 does not match. Re-copy it.

---

# Part 2 — Fix email confirmation

**Current state:** Supabase is set to require every new user to click a confirmation link in
an email. But no email service (SMTP) is configured, so Supabase's built-in sender is used.
That sender is rate-limited to a handful of messages per hour and **is not allowed to send to
addresses outside the project team**. The practical result: a member of the public signs up,
no email arrives, and they can never sign in. The account exists but is frozen.

You have two options. **Pick one.**

### The tradeoff, plainly

| | Option A: set up SMTP | Option B: switch confirmation off |
|---|---|---|
| Time | 30–60 minutes, needs a sending account and DNS records | 2 minutes |
| Result | Users confirm their email, then sign in | Users sign in immediately after signing up |
| You know the email address is real | Yes | No |
| Someone can sign up with an address that is not theirs | No | Yes |
| Password reset emails work | Yes | **No — there is no way to send them** |
| Right answer for a live site | **Yes** | Only as a short-term unblock |

**Recommendation: do Option B now so sign-ups stop failing today, then do Option A this
week.** Option B leaves the site with no password-reset path at all, which is why it is not
a permanent answer. Note that Google sign-in (Part 1) is unaffected by either choice —
Google has already verified the address, so those users are confirmed automatically.

---

### Option A — Set up SMTP (the proper fix)

"SMTP" just means "an email-sending account". You need one from a provider. Resend,
SendGrid, Amazon SES, Postmark and Mailgun all work. The steps below are the same for all
of them; only where you find the password differs.

**A1. Get a sending account**

1. Create an account with the provider.
2. Add the domain `artwalllabs.com` and follow their instructions to add the DNS records they
   give you (usually three: SPF, DKIM, and sometimes a return-path record). DNS changes can
   take up to a few hours.
3. Wait until the provider's dashboard shows the domain as **Verified**. Do not continue
   before this — unverified domains land in spam.
4. Create an **API key** or **SMTP credential**. Copy it somewhere safe. Most providers show
   it only once.

**A2. Enter it in Supabase**

5. Supabase dashboard → the ArtWall project → **Project Settings** (gear icon, bottom of
   the sidebar).
6. Click **Authentication** in the settings list.
7. Scroll to **SMTP Settings**.
8. Turn **Enable Custom SMTP** ON.
9. Fill in the boxes. Using Resend as the example:

   | Box | What to put |
   |---|---|
   | Sender email | `noreply@artwalllabs.com` |
   | Sender name | `ArtWall` |
   | Host | `smtp.resend.com` |
   | Port number | `465` |
   | Username | `resend` |
   | Password | the API key from step 4 |

   For a different provider, the Host and Username come from that provider's "SMTP
   settings" page. The Password is always the API key or SMTP password they issued.
   Port `465` is the encrypted one; use it unless your provider says otherwise.

10. Click **Save**.

**A3. Test it before trusting it**

11. Open the live site in a private browser window.
12. Sign up with a real email address you can check, one that is **not** a team member's.
13. The confirmation email should arrive within a minute. If it does not, check your email
    provider's dashboard — it will show the message and why it was rejected.
14. Click the link. You should land back on the site, signed in.

If nothing arrives: Supabase dashboard → **Logs** → **Auth Logs** shows the attempt and the
SMTP error.

---

### Option B — Switch email confirmation off (the quick unblock)

15. Supabase dashboard → the ArtWall project → **Authentication** → **Sign In / Providers**.
16. At the top of the provider list, click **Email** to expand it.
17. Find **Confirm email** and turn it **OFF**.
18. Click **Save**.
19. Test: sign up in a private browser window with a new address. You should be signed in
    straight away, with no email step.

> **Write down that you did this.** With confirmation off there is no password reset, and
> nothing stops someone signing up as `someone.else@example.com`. Put a reminder in the
> team's tracker to come back and do Option A.

---

# Part 3 — Row Level Security for the remaining tables

## What this part is

A plan plus reviewable SQL. **Nothing here has been run against any database.** A developer
reads it, agrees with it, tests it on a throwaway database, then runs it one phase at a time.

This is deliberately **not** a migration file. Migrations run automatically; this needs a
human watching.

## The model, in one paragraph

Authorization is decided by the application code — `apps/web/src/features/physical-wall/
authorize.ts`, which denies by default. That stays the gate and is not changing. RLS is the
**backstop**: if someone ever reaches the database by a path that skips the application
(the public anon key, a stolen user token, a future Supabase API call), RLS is what stops
them reading another person's orders. This is exactly the reasoning already written into
`0074_supabase_auth.sql` for the `user` table; Part 3 extends it to the rest.

## The five classes of table

The 110 tables created by `packages/db/migrations/` fall into five groups. Each group gets
one policy shape.

| Class | Count | What it means | Policy shape |
|---|---|---|---|
| 1. Public catalog | 15 | Anyone may read this; it is already on the public website | `select` allowed to everyone, with a published/public filter. No write policy. |
| 2. Owner-scoped private | 38 | One user's own data — their cart, their orders, their bookings | `select` only where the row's user id equals the signed-in user. Writes left to the server. |
| 3. Append-only ledger | 15 | A permanent record: provenance, payments, audit logs | At most a narrow `select` for the row's own party. **No** `insert`/`update`/`delete` policy for anyone. |
| 4. Admin / internal only | 26 | Settings, policies, moderation queues, admin roles | **No policies at all.** RLS on, nothing allowed. Server-only. |
| 5. Service-role only | 15 | Machinery: rate limits, retention runs, counters, dead auth tables | **No policies at all.** RLS on, nothing allowed. |

Classes 4 and 5 are the easy, zero-risk ones: switch the lock on, add nothing, and the
table becomes invisible to the anon key while the server (which bypasses RLS) carries on
untouched.

### Class 1 — Public catalog (14)

`artworks`, `artist_profiles`, `exhibitions`, `exhibition_artworks`, `collections`,
`collection_artworks`, `curator_picks`, `curators`, `editions`, `venues`, `buildings`,
`floors`, `rooms`, `walls`, `pw_reactions`

### Class 2 — Owner-scoped private (37)

`user`*, `cart_items`, `orders`, `order_items`, `order_payments`, `order_refunds`,
`order_events`, `seller_orders`, `sales`, `shipments`, `shipment_events`, `payouts`,
`inquiries`, `inquiry_messages`, `contacts`, `documents`, `tasks`, `pw_bookings`,
`pw_booking_slots`, `pw_booking_addons`, `pw_payments`, `pw_refunds`, `pw_invoices`,
`pw_agreements`, `pw_consents`, `pw_grievances`, `pw_grievance_responses`,
`pw_identity_verifications`, `pw_feedback`, `pw_notifications`, `pw_checkins`,
`pw_visits`, `pw_visitors`, `pw_waitlist`, `pw_perk_redemptions`, `artwork_saves`,
`user_follows`, `artwork_likes`

`artwork_likes` is owner-scoped rather than public because the row names *who* liked an
artwork. The public like *count* lives in `pw_reactions`, which holds no user id and is
therefore class 1.

\* `user` already done in `0074`. It is listed for completeness only; do not touch it.

### Class 3 — Append-only ledger (15)

`provenance_events`, `pw_ledger`, `pw_ledger_locks`, `pw_audit_log`, `escrow_holds`,
`escrow_releases`, `merkle_roots`, `mint_commitments`, `coa_certificates`,
`artwork_ownership_history`, `artwork_price_history`, `exhibition_transitions`,
`policy_decisions`, `pw_damage_records`, `pw_condition_photos`

Rule 43 of the Bible says provenance is append-only. RLS enforces that at the database
level for the first time: with no `insert`/`update`/`delete` policy, no token-holder can
rewrite history even if the application is compromised.

### Class 4 — Admin / internal only (26)

`admin_roles`, `admin_role_assignments`, `venue_role_assignments`, `organizations`,
`marketplace_settings`, `commission_policies`, `commission_policy_versions`,
`pw_settings`, `pw_grid_config`, `pw_slot_types`, `pw_slots`, `pw_slot_occupancy`,
`pw_size_catalog`, `pw_addon_catalog`, `pw_refund_policy`, `pw_queue_overrides`,
`pw_install_windows`, `pw_ugc_submissions`, `pw_community_gallery`, `art_tags`,
`art_tag_scans`, `demand_signals`, `demand_aggregates`, `slots`, `rooms_zones`,
`virtual_wall_placements`

### Class 5 — Service-role only (15)

`rate_limits`, `pw_retention_runs`, `pw_data_rights_requests`, `pw_asset_deletions`,
`pw_invoice_counters`, `pw_qr_tokens`, `pw_scans`, `pw_search_log`, `survey_responses`,
`waitlist_entries`, `session`, `account`, `verification`, `artwork_comments`,
`artist_endorsements`

`session`, `account` and `verification` are the three empty better-auth tables that `0074`
deliberately kept. They hold nothing, but locking them costs nothing either.

> The counts above total 110, which is every table any migration creates. The reported
> "103 with RLS disabled" is smaller: `user` is already locked by `0074`, and the remaining
> difference is tables that exist in a migration but not in the live database, or were
> counted slightly differently. **Confirm the live figure with the query in "Before you
> start" below rather than trusting either number.** If the query returns a table this
> document does not classify, classify it before running anything.

---

## Before you start

Run this **read-only** query in the Supabase SQL Editor to see the real current state. It
changes nothing.

```sql
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as policy_count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relkind = 'r'
 order by c.relrowsecurity, c.relname;
```

Any row with `rls_enabled = true` and `policy_count = 0` is a table nobody can reach
through the API. For classes 4 and 5 that is the goal. For classes 1, 2 and 3 it is a bug.

---

## Phased rollout

Do **not** run all of this in one sitting. Four phases, each verified before the next.

### Phase 1 — personal and financial data (highest risk, do first)

These hold money, home addresses, phone numbers, identity documents and grievances. They
are the rows that would cause real harm if read, and they are all class 2 or 3 — so the
policies are simple and the blast radius is small.

**Phase 1 table list (19):**

```
orders                      order_items                 order_payments
order_refunds               order_events                seller_orders
sales                       payouts                     cart_items
shipments                   shipment_events             pw_payments
pw_refunds                  pw_invoices                 pw_bookings
pw_identity_verifications   pw_grievances               pw_consents
pw_agreements
```

### Phase 2 — ledgers and audit (class 3)

The remaining class 3 tables. Locking writes here turns Bible rule 43 from a convention
into a constraint.

### Phase 3 — admin, internal and service-role (classes 4 and 5)

The largest group but the lowest risk: lock on, no policies, done.

### Phase 4 — public catalog (class 1)

Left for last on purpose. These are the only tables where a wrong policy is visible to
visitors as a blank page. By phase 4 you will have run the verification routine three times
and will trust it.

### Verify after every phase

1. Re-run the state query above and confirm the phase's tables show `rls_enabled = true`
   with the expected `policy_count`.
2. Open the live site in a **private** window, signed out. Browse artworks, artists and
   exhibitions. Nothing should look different.
3. Sign in. Open the cart, the order history, the dashboard, the admin area. Nothing should
   look different.
4. If anything is blank or errors, run the rollback below for that phase and investigate
   before continuing.

### Rollback

Every statement is reversible. For one table:

```sql
alter table public.orders disable row level security;
```

The policies stay defined but become inert, so re-enabling later does not mean rewriting
them.

---

## The SQL

Each phase is one transaction. Run a phase, verify, then run the next.

### Shared helper: "is this row mine?"

Every owner-scoped policy compares the row's user id to the signed-in user. `auth.uid()`
returns a `uuid`; this project's id columns are `text` holding that same uuid as a string
(see `0074` section 1), so the cast is required and is the same one `0074` uses.

No helper function is added. A bare `auth.uid()::text = "userId"` is shorter, needs no
`security definer` function to audit, and lets Postgres use the ordinary index on the
column.

### Phase 1

```sql
-- Phase 1: personal and financial data.
--
-- RLS here is a BACKSTOP, not the gate. The gate is application code
-- (features/physical-wall/authorize.ts, default-deny), and it is unchanged.
-- The site's own database connection (DATABASE_URL, a table owner) bypasses
-- RLS entirely, so nothing server-rendered is affected. What changes is what
-- the public anon key and a signed-in user's token can reach through the
-- Supabase API: today, everything; after this, their own rows only.
--
-- Deliberately absent throughout: any insert/update/delete policy. Writes stay
-- server-side. In particular NO policy anywhere may touch "user".role,
-- "user"."onboardingPersona" or any verification column -- a self-service write
-- there is an instant privilege escalation. Same reasoning as 0074.

begin;

-- --- Marketplace orders ---------------------------------------------------
-- A buyer may read their own order and everything hanging off it. Sellers read
-- their own seller_orders row, which carries only their slice of the money.

alter table public.orders enable row level security;
create policy orders_select_own on public.orders
  for select using (auth.uid()::text = buyer_id);

alter table public.order_items enable row level security;
create policy order_items_select_own on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
       where o.id = order_items.order_id
         and o.buyer_id = auth.uid()::text
    )
  );

alter table public.order_payments enable row level security;
create policy order_payments_select_own on public.order_payments
  for select using (
    exists (
      select 1 from public.orders o
       where o.id = order_payments.order_id
         and o.buyer_id = auth.uid()::text
    )
  );

alter table public.order_refunds enable row level security;
create policy order_refunds_select_own on public.order_refunds
  for select using (
    exists (
      select 1 from public.orders o
       where o.id = order_refunds.order_id
         and o.buyer_id = auth.uid()::text
    )
  );

alter table public.order_events enable row level security;
create policy order_events_select_own on public.order_events
  for select using (
    exists (
      select 1 from public.orders o
       where o.id = order_events.order_id
         and o.buyer_id = auth.uid()::text
    )
  );

-- seller_orders carries platform_fee / curator_fee / seller_net. A buyer must
-- not read the platform's margin, so this is scoped to the seller alone and
-- NOT joined back to orders.buyer_id.
alter table public.seller_orders enable row level security;
create policy seller_orders_select_own on public.seller_orders
  for select using (auth.uid()::text = seller_id);

-- --- Cart ------------------------------------------------------------------
alter table public.cart_items enable row level security;
create policy cart_items_select_own on public.cart_items
  for select using (auth.uid()::text = user_id);

-- --- Shipping --------------------------------------------------------------
-- NOTE: `shipments` hangs off pw_bookings (booking_id), NOT off seller_orders.
-- It is the physical-wall courier record, not marketplace order shipping. So
-- the owner is the booking's artist.
alter table public.shipments enable row level security;
create policy shipments_select_own on public.shipments
  for select using (
    exists (
      select 1 from public.pw_bookings b
       where b.id = shipments.booking_id
         and b.artist_id = auth.uid()::text
    )
  );

alter table public.shipment_events enable row level security;
create policy shipment_events_select_own on public.shipment_events
  for select using (
    exists (
      select 1
        from public.shipments s
        join public.pw_bookings b on b.id = s.booking_id
       where s.id = shipment_events.shipment_id
         and b.artist_id = auth.uid()::text
    )
  );

-- --- Money out -------------------------------------------------------------
-- `sales` is the artist-facing CRM pipeline (lead -> won), owned by the artist
-- who created it. Its owner column is the quoted camelCase "userId", not a
-- seller id -- this one is easy to get wrong.
alter table public.sales enable row level security;
create policy sales_select_own on public.sales
  for select using (auth.uid()::text = "userId");

-- payouts' owner column is payee_user_id: the payout may go to a seller or to
-- a curator (payee_kind), so it is not named seller_id.
alter table public.payouts enable row level security;
create policy payouts_select_own on public.payouts
  for select using (auth.uid()::text = payee_user_id);

-- --- Physical wall bookings ------------------------------------------------
alter table public.pw_bookings enable row level security;
create policy pw_bookings_select_own on public.pw_bookings
  for select using (auth.uid()::text = artist_id);

alter table public.pw_payments enable row level security;
create policy pw_payments_select_own on public.pw_payments
  for select using (
    exists (
      select 1 from public.pw_bookings b
       where b.id = pw_payments.booking_id
         and b.artist_id = auth.uid()::text
    )
  );

alter table public.pw_refunds enable row level security;
create policy pw_refunds_select_own on public.pw_refunds
  for select using (
    exists (
      select 1 from public.pw_bookings b
       where b.id = pw_refunds.booking_id
         and b.artist_id = auth.uid()::text
    )
  );

alter table public.pw_invoices enable row level security;
create policy pw_invoices_select_own on public.pw_invoices
  for select using (
    exists (
      select 1 from public.pw_bookings b
       where b.id = pw_invoices.booking_id
         and b.artist_id = auth.uid()::text
    )
  );

-- pw_agreements carries artist_id directly, so no join is needed.
alter table public.pw_agreements enable row level security;
create policy pw_agreements_select_own on public.pw_agreements
  for select using (auth.uid()::text = artist_id);

-- --- Identity, consent, grievances ----------------------------------------
-- pw_identity_verifications holds KYC document references (anti-fraud layer L4,
-- Bible section 112). Read by its subject only; never listable.
alter table public.pw_identity_verifications enable row level security;
create policy pw_identity_verifications_select_own
  on public.pw_identity_verifications
  for select using (auth.uid()::text = user_id);

-- DPDP requires granular consent and that the data subject can see what they
-- consented to (Bible sections 120-121).
alter table public.pw_consents enable row level security;
create policy pw_consents_select_own on public.pw_consents
  for select using (auth.uid()::text = user_id);

alter table public.pw_grievances enable row level security;
create policy pw_grievances_select_own on public.pw_grievances
  for select using (auth.uid()::text = user_id);

commit;
```

> **Column names must be checked before running.** The policies above use the column names
> as they appear in `packages/db/src/schema.ts` today. Several tables mix snake_case and
> camelCase (for example `sales."sellerId"` is quoted camelCase while
> `orders.buyer_id` is not). A developer must confirm each one against the live database
> first; a wrong name makes the statement fail loudly at `create policy` time, which is the
> safe failure, but it wastes a deploy window. The query in "Before you start" can be
> adapted to list columns.

### Phases 2, 3 and 5 — the lock-only tables

Classes 4 and 5, and the write-side of class 3, need no policies at all. The pattern is one
line per table:

```sql
begin;

alter table public.pw_audit_log       enable row level security;
alter table public.pw_ledger          enable row level security;
alter table public.pw_ledger_locks    enable row level security;
alter table public.escrow_holds       enable row level security;
alter table public.escrow_releases    enable row level security;
alter table public.merkle_roots       enable row level security;
alter table public.mint_commitments   enable row level security;
alter table public.policy_decisions   enable row level security;
-- ... and so on for every class 3, 4 and 5 table listed above.

commit;
```

Two class 3 tables do want a narrow read policy, because the owner is shown them in the UI:

```sql
begin;

-- Provenance is public history for a public artwork (Bible rule 43 and
-- section 18). Readable, never writable: no insert/update/delete policy exists,
-- so append-only is now enforced by the database and not only by convention.
alter table public.provenance_events enable row level security;
create policy provenance_events_select_public on public.provenance_events
  for select using (
    exists (
      select 1 from public.artworks a
       where a.id = provenance_events.artwork_id
         and a."isPublic" = true
    )
  );

-- A certificate of authenticity belongs to its holder. coa_certificates carries
-- user_id directly, so this needs no join to artworks.
alter table public.coa_certificates enable row level security;
create policy coa_certificates_select_owner on public.coa_certificates
  for select using (auth.uid()::text = user_id);

commit;
```

### Phase 4 — the public catalog

```sql
begin;

-- Class 1: public catalog. Everyone may read, including signed-out visitors
-- (`to public` covers both anon and authenticated). The filter is what keeps
-- an unpublished draft out of a competitor's hands.
--
-- Still no write policy of any kind. An artist edits their own artwork through
-- the application, which runs as the database owner and is unaffected by this.

alter table public.artworks enable row level security;
create policy artworks_select_public on public.artworks
  for select to public using ("isPublic" = true);
-- An artist must still see their own drafts if they ever reach this table
-- through the API.
create policy artworks_select_own on public.artworks
  for select using (auth.uid()::text = "userId");

alter table public.artist_profiles enable row level security;
create policy artist_profiles_select_public on public.artist_profiles
  for select to public using (published = true);
create policy artist_profiles_select_own on public.artist_profiles
  for select using (auth.uid()::text = "userId");

-- exhibitions DOES have a draft state (status defaults to 'draft'), so an
-- unconditional policy here would publish every unfinished exhibition. The
-- owner keeps sight of their own drafts through the second policy.
alter table public.exhibitions enable row level security;
create policy exhibitions_select_published on public.exhibitions
  for select to public using (status = 'published');
create policy exhibitions_select_own on public.exhibitions
  for select using (auth.uid()::text = user_id);

alter table public.exhibition_artworks enable row level security;
create policy exhibition_artworks_select_public on public.exhibition_artworks
  for select to public using (
    exists (
      select 1 from public.exhibitions e
       where e.id = exhibition_artworks.exhibition_id
         and e.status = 'published'
    )
  );

-- collections defaults to visibility = 'private'. A buyer's private collection
-- is a list of art they are interested in -- personal data, not catalog. Only
-- the explicitly public ones are readable, plus the owner's own.
alter table public.collections enable row level security;
create policy collections_select_public on public.collections
  for select to public using (visibility = 'public');
create policy collections_select_own on public.collections
  for select using (auth.uid()::text = owner_id);

alter table public.collection_artworks enable row level security;
create policy collection_artworks_select_public on public.collection_artworks
  for select to public using (
    exists (
      select 1 from public.collections c
       where c.id = collection_artworks.collection_id
         and c.visibility = 'public'
    )
  );

-- curators.status defaults to 'pending'. A pending application is not a public
-- curator; exposing it would leak who applied and was turned down.
-- The live curator state is 'active' (not 'approved'); the CHECK constraint in
-- 0059 allows pending | active | rejected.
alter table public.curators enable row level security;
create policy curators_select_public on public.curators
  for select to public using (status = 'active');
create policy curators_select_own on public.curators
  for select using (auth.uid()::text = user_id);

alter table public.curator_picks enable row level security;
create policy curator_picks_select_public on public.curator_picks
  for select to public using (true);

-- editions.status defaults to 'draft'.
alter table public.editions enable row level security;
create policy editions_select_public on public.editions
  for select to public using (
    status <> 'draft'
    and exists (
      select 1 from public.artworks a
       where a.id = editions.artwork_id and a."isPublic" = true
    )
  );
create policy editions_select_own on public.editions
  for select using (auth.uid()::text = user_id);

-- Venue geography is already on the public site.
alter table public.venues    enable row level security;
create policy venues_select_public    on public.venues    for select to public using (true);
alter table public.buildings enable row level security;
create policy buildings_select_public on public.buildings for select to public using (true);
alter table public.floors    enable row level security;
create policy floors_select_public    on public.floors    for select to public using (true);
alter table public.rooms     enable row level security;
create policy rooms_select_public     on public.rooms     for select to public using (true);
alter table public.walls     enable row level security;
create policy walls_select_public     on public.walls     for select to public using (true);

commit;
```

> **Why so few of these are `using (true)`.** A first draft of this plan gave every class 1
> table an unconditional read policy, on the assumption that a "public catalog" table is
> public throughout. That was wrong for five of them: `exhibitions` and `editions` default
> to `status = 'draft'`, `collections` defaults to `visibility = 'private'`, `curators`
> defaults to `status = 'pending'`, and `artworks`/`artist_profiles` have explicit flags.
> An unconditional policy on those would have *published private data that is correctly
> hidden today* — the one way this exercise could make security worse rather than better.
>
> The remaining unconditional policies are `curator_picks` and the five venue-geography
> tables, which have no draft state. Confirm that is still true before running Phase 4.

---

## Open questions for the developer

1. **Column names.** Every column name above was checked against
   `packages/db/src/schema.ts`, and that check caught six real errors in the first draft
   (`payouts` has `payee_user_id` not `seller_id`; `sales` is keyed on quoted `"userId"`
   and is a CRM table, not a marketplace one; `shipments` hangs off `pw_bookings`, not
   `seller_orders`; `pw_agreements` and `coa_certificates` carry their owner directly and
   needed no join). Re-check against the **live** database anyway, since schema.ts is not
   the database. The convention genuinely varies per table: `artworks."isPublic"` is quoted
   camelCase while `provenance_events.artwork_id` in the same policy is snake_case.
2. **Status values.** The policies assume `exhibitions.status = 'published'` (verified in
   `features/exhibitions/actions.ts`), `collections.visibility = 'public'` and
   `curators.status = 'active'`. All three are confirmed against the code — `curators` by
   the CHECK constraint in `0059_curators_status_rejected.sql`, which allows
   `pending | active | rejected`. (An earlier draft of this document guessed `'approved'`
   there, which would have hidden every curator from the site.) `editions.status` is
   filtered as `<> 'draft'` rather than by an allow-list, because its full value set was
   not enumerated; an allow-list would be tighter.
3. **Admin read paths.** No policy here grants an admin anything. That is correct today,
   because the admin area runs server-side. If any admin screen is ever moved to a
   browser-side Supabase query, it will need its own policy checking
   `admin_role_assignments`, and that policy must be a `security definer` function to avoid
   recursing into `admin_role_assignments`'s own RLS.
4. **What has already been tested.** All of the SQL in this document was applied to a
   disposable `postgres:17` container with all 77 migrations applied, per `AGENTS.md`:

   - Every statement parsed and ran. **41 policies across 35 tables, zero errors** — which
     means every column name and every table name above exists.
   - `auth.uid()` does not exist on bare Postgres, so it was stubbed with a function
     reading a session setting. With that stub, behaviour was checked both ways:
     a signed-out `anon` role saw **1 of 2** artworks (the public one; the private draft
     was correctly hidden) and **0 of 1** orders, while the order's owner saw their own
     order. So the policies are enforcing, not merely valid.
   - The container was destroyed afterwards. **Nothing was run against any live database.**

   Still untested, and the reason a scratch Supabase project is worth 20 minutes before
   Phase 1: the real `auth.uid()`, the real `anon`/`authenticated` roles and their default
   grants, and whether any production row has a status value these policies do not expect.
