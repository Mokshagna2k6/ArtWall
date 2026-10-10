# Buyer Checkout Plan (artwork purchase: Razorpay, escrow, payout, shipping)

Status: DESIGN ONLY. No app code, no SQL, no DB access. Migration numbers start at 0066 (0063-0065 reserved by other agents; repo tail at time of writing is 0056, so run `ls db/migrations | sort -V | tail -5` fresh before creating any file).
Note: `HANDOFF.md` referenced in CLAUDE.md does not exist in this worktree; status was taken from the code itself.

## 0. What exists today (investigated)

| Area | Reality | Path |
|---|---|---|
| Razorpay | Only used for **wall-space bookings** (`pw_bookings`). `createOrder`, `fetchPayment`, `fetchOrder`, `verifyPaymentSignature`, `createRefund`, `findRefund`, `verifyWebhookSignature`. Money is INR paise `integer`. | `src/features/physical-wall/razorpay.ts` |
| Webhook | `POST /api/physical-wall/razorpay/webhook`: raw-body HMAC, 5-min replay window (SEC-2.14), handles only `payment.captured`, idempotency via unique `pw_payments.event_id` + `payment_id` under booking row lock, delegates to `settleFromWebhook`. Reads `notes.bookingId`. Gated by `features.physicalWall`. | `src/app/api/physical-wall/razorpay/webhook/route.ts`, `src/features/physical-wall/settlement.ts` (deliberately not "use server") |
| Payment actions | `startPayment` (creates order + `pw_payments` row `created`), `verifyPayment`, `markBookingPaid` (offline). Artist-only; booking-specific. | `src/features/physical-wall/actions/payment.ts` |
| Refunds | Outbox pattern: `queueRefundIn(client, ...)` writes `pw_refunds` (pending/manual) inside the caller's tx, `processRefund` calls Razorpay, `/api/cron/refunds` (daily 01:15 per `vercel.json`) retries; alert after 3 failures, max 8 attempts. | `src/features/physical-wall/refunds.ts`, `src/app/api/cron/refunds/route.ts` |
| Notifications | Outbox table `pw_notifications` (unique partial `dedupe_key`, retry state 0052), `TEMPLATES` map, `notifyUser`, `alertAdmins`, cron `deliver-notifications`. | `src/features/physical-wall/notifications.ts` |
| Artworks | `artworks.pricePaise`, orthogonal statuses `lifecycle_status`, `commerce_status` (CHECK `unlisted/listed/sold/withdrawn`, 0047), `custody_status`; legacy `status`. `editions` (unique/limited, AP). `collections` is only an artist-owned folder (name/description, no commerce meaning). `sales` is the artist's CRM deal record, not a paid order. | `src/lib/db/schema.ts` (`artworks`, `collections`, `editions`, `sales`) |
| COA / chain | `coa_certificates` (draft/issued/revoked + mint states, `coa_level` 0-3), `provenance_events`, Merkle commit, mint-voucher/confirm routes under `/api/blockchain/certificates/[id]`, `addProvenanceEvent`. | `src/features/coa/actions.ts`, `src/app/api/blockchain/certificates` |
| Escrow | `escrow_holds` / `escrow_releases` exist (0049) but FK to **`pw_bookings`**, with a trigger capping total releases <= hold. No writer yet. | `db/migrations/0049_db3_escrow_admin_tags_shipments.sql` |
| Shipping | `shipments`, `shipment_events` (0049), Shiprocket client `getShippingRates` / `createShipment`. No UI/actions. | `src/features/logistics/shiprocket.ts` |
| Ledger | `pw_ledger` append-only (type `revenue`/`expense` only; categories validated in app code). | `docs/db/ledger.md`, `src/features/physical-wall/actions/ledger.ts` |
| Curators | `curators.commission_bps` default 1000, `curator_picks`. No money flow today. | schema `curators` |
| Payout gate | `artist_profiles.identity_verified` boolean. No bank / payout account storage anywhere. | schema `artistProfiles` |
| Admin | `src/app/admin/page.tsx`, `src/app/physical-wall/admin`; team roles via `hasAdminRole` / `requireAdminRole` / `requireAnyAdminRolePage` in `src/features/physical-wall/authorize.ts` (Finance role exists). | |

Conclusion: reuse the *patterns* (webhook idempotency, outbox refund/notification, a non-"use server" settle module, ledger) but do NOT overload `pw_bookings` / `pw_payments`: those are venue-rental revenue where ArtWall is the seller; buyer checkout is a marketplace where the artist is. New `order*` tables, with the Razorpay client and refund processor generalised.

## 1. Order model

All money `integer` paise (repo convention; ok to Rs 2.1 crore, see Q4). IDs `text` via `newId("ord")` etc. Timestamps `timestamptz`.

### 1.1 Tables

**`orders`** (one buyer checkout; one seller per order)
- `id`, `order_number text unique` (human, e.g. `AW-2026-000123`, pattern from `src/features/physical-wall/invoice-number.ts`)
- `buyer_id`, `buyer_email`, `buyer_phone`, `seller_id` (artist user id)
- `status` (state machine 1.2), `status_updated_at`, `requires_review boolean default false` (fraud gate)
- `subtotal_paise`, `shipping_paise`, `gst_paise`, `discount_paise`, `total_paise` (CHECK all >= 0 and total = sum)
- Snapshotted at creation: `commission_bps`, `platform_fee_paise`, `curator_id null`, `curator_commission_bps null`, `curator_fee_paise default 0`, `seller_net_paise`. CHECK `platform_fee + curator_fee + seller_net = subtotal` (shipping and GST are pass-through, see 2.3)
- `currency default 'INR'`, `shipping_address jsonb null` (null when all items digital), `billing_address jsonb`
- `refund_policy_version int` (snapshot, like `pw_bookings`)
- `placed_at, paid_at, accepted_at, shipped_at, delivered_at, completed_at, cancelled_at, cancel_reason`
- `idempotency_key text unique` (client-supplied; dedupes double submit), `created_at`, `updated_at`

**`order_items`**
- `id, order_id, artwork_id, edition_id null, seller_id`, `kind` (`physical|digital`, CHECK), `title_snapshot`, `image_snapshot`, `unit_price_paise`, `quantity int default 1` (CHECK = 1 for originals), `fulfilment_status` (`pending|shipped|delivered|na|returned`), `coa_certificate_id null`, `weight_g, length_cm, breadth_cm, height_cm null`.

**`order_events`** (append-only, bigint identity, like `exhibition_transitions`): `order_id, from_status, to_status, actor_id, note, at`. Written in the same tx as every transition.

**`order_payments`** (order analogue of `pw_payments`, kept separate because `pw_payments.booking_id` is NOT NULL)
- `id, order_id, provider default 'razorpay', provider_order_id, provider_payment_id` (unique where not null), `event_id` (unique where not null; the idempotency column), `amount_paise, method null`, `status` (`created|authorized|captured|failed|refunded|partially_refunded`), `captured_at, failure_code`, `raw jsonb` (redacted subset, never card data), `created_at`.

**`order_refunds`**: same shape as `pw_refunds` (`id, order_id, payment_id, amount_paise, status pending|processing|processed|failed|manual, provider_refund_id unique, attempts, last_error, reason, kind customer_cancel|dispute|fraud|goodwill, created_by, created_at, updated_at`). `pw_refunds.booking_id` is NOT NULL so it cannot be reused; generalise `processRefund` / `processOpenRefunds` to drain both tables from the one existing cron.

**`payouts`** (money owed/sent to artist or curator)
- `id, order_id, order_item_id null, payee_user_id, payee_kind` (`artist|curator`), `amount_paise`, `status` (`pending_release|releasable|processing|paid|failed|held|reversed`), `release_after timestamptz`, `escrow_hold_id`, `provider` (`razorpayx|route|manual`), `provider_payout_id unique null`, `utr null`, `attempts, last_error, paid_at, created_at, updated_at`. Unique `(order_id, payee_kind, payee_user_id)` blocks double payout.
- **`payee_accounts`** (none exists today): `user_id pk, razorpay_fund_account_id, account_last4, ifsc, status (unverified|verified|rejected), verified_at, created_at`. Store tokens/last4 only, never a full account number (Q8).

**`escrow_holds` / `escrow_releases`** (exist, 0049): migration adds `order_id text null references orders`, makes `booking_id` nullable, `CHECK ((booking_id is null) <> (order_id is null))`, adds `status` (`held|partially_released|released|frozen|refunded`), `release_after`, `frozen_reason`, `frozen_by`, `frozen_at`. `escrow_releases` gains `payout_id null`. The existing release-cap trigger stays valid.

**`shipments` / `shipment_events`** (exist): add `order_id null references orders`, `order_item_id`, `courier`, `awb`, `label_url`, `pickup_scheduled_at`, `shipped_at`, `delivered_at`, `pod_url`, `insured_value_paise`, `address_snapshot jsonb`. `booking_id` stays for venue logistics.

**`disputes`**: `id, order_id, order_item_id null, opened_by (buyer|artist|admin|razorpay), kind (not_received|not_as_described|damaged|authenticity|chargeback|other), status (open|awaiting_seller|awaiting_buyer|under_review|resolved_refund|resolved_partial|resolved_release|rejected|chargeback_lost|chargeback_won), razorpay_dispute_id unique null, amount_paise, evidence jsonb, resolution_note, resolved_by, opened_at, due_at, resolved_at`. Plus `dispute_messages(id, dispute_id, author_id, body, attachments jsonb, created_at)`.

**`fraud_signals`**: `id, order_id null, user_id null, signal` (`velocity_buyer|velocity_card|address_mismatch|high_value_new_buyer|ip_geo_mismatch|chargeback_history|amount_mismatch|manual`), `score int, status (open|cleared|confirmed), detail jsonb, created_at, reviewed_by, reviewed_at`.

**`order_tax_documents`** (only if Q5 says ArtWall invoices): `id, order_id, number unique, kind (tax_invoice|credit_note|commission_invoice), pdf_url, issued_at`.

No `carts` tables: originals are 1-of-1, so v1 is "Buy now" on one artwork (Q1).

### 1.2 Order state machine

```
 draft -place-> pending_payment -capture-> paid -seller accepts-> processing -ship-> shipped -deliver-> delivered -window ends-> completed
                    |  expiry / fail          |  seller declines or 48h timeout          |  lost / RTO        |  dispute
                    v                         v                                          v                    v
         expired / payment_failed        refund_pending -> refunded / cancelled     refund_pending        disputed -> completed | refund_pending
 digital items: paid -> delivered immediately (signed download + certificate), shorter window
```
Statuses: `draft, pending_payment, payment_failed, expired, paid, processing, shipped, delivered, completed, cancelled, refund_pending, refunded, partially_refunded, disputed`.
Implementation mirrors `src/features/physical-wall/state-machine.ts`: `ORDER_TRANSITIONS` record, `canTransition`, `requiresAdmin`, `assertTransition`, pure unit test. Every transition runs in `inTransaction`, takes `select ... for update` on the order row, and inserts an `order_events` row. `disputed` freezes the escrow hold (`status='frozen'`) and sets `payouts.status='held'`.

### 1.3 Reserving the artwork
On `placeOrder`, same tx: `update artworks set commerce_status='reserved' where id=$1 and commerce_status='listed'` (zero rows = lost the race, fail with a friendly message; this is the oversell guard). The 0047 CHECK allows only `unlisted/listed/sold/withdrawn`, so a migration adds `reserved`, and `src/features/artworks/state-machine.ts` gains `listed -> reserved -> sold | listed`. Expiry sweep returns unpaid reservations to `listed` after `checkout_hold_minutes`. On `paid` -> `sold`; editions update the `editions` row.

## 2. Payment flow

### 2.1 Order creation
`placeOrder` (buyer action): load artwork, require `listed`; price comes from the DB (never the client); compute shipping (Shiprocket `getShippingRates`), GST, fee split; in one tx insert orders + items + event, reserve the artwork, insert `order_payments(created)`; then call Razorpay. Generalise `createOrder(bookingId, amount)` in `razorpay.ts` to take a reference (`notes: { orderId }`, `receipt: order_number`). If Razorpay fails after commit, run the cancel path (releases reservation), same shape as `startPayment`. `orders.idempotency_key` returns the existing order on replay.

### 2.2 Capture and webhook
One webhook URL and secret (Razorpay allows one URL per secret). Extract the signature, replay-window and parsing code from the existing route into a shared `src/features/payments/webhook.ts` and dispatch on `notes.orderId` vs `notes.bookingId` (fallback: look up `provider_order_id` in `order_payments`, then `pw_payments`). Caveat: the existing route is gated by `features.physicalWall`; gate each target by its own flag (new `features.marketplaceCheckout` in `src/config/site.ts`). The existing booking behaviour must remain byte-identical and covered by its current tests.
Events handled: `payment.captured` (settle), `payment.failed` (mark failed, release reservation), `refund.processed` / `refund.failed` (reconcile `order_refunds`), dispute events (open `disputes`, freeze escrow), and `payout.*` if RazorpayX.
Idempotency: unique `order_payments.event_id` + unique `provider_payment_id`, both checked under a row lock on the order (the `settleFromWebhook` contract). Amount and currency are re-checked against `orders.total_paise` inside the lock; mismatch writes a `fraud_signals` row (`amount_mismatch`) and queues a refund instead of settling. A capture arriving for an `expired`/`cancelled` order also auto-refunds (never resurrect a released reservation).
New module `src/features/orders/settlement.ts` (NOT "use server", same reason as the existing one). Client fast path `verifyOrderPayment` mirrors `verifyPayment`; whichever of webhook/fast path comes second is a no-op.

### 2.3 Money split
Money collected = subtotal + shipping + GST. On `paid`, inside the settle tx:
1. `escrow_holds` row for `seller_net_paise + curator_fee_paise` (the amounts that will leave to third parties). Platform fee, GST and shipping stay with ArtWall; shipping is later spent on the courier (ledger expense).
2. `pw_ledger` rows (no schema change; categories are app-validated): revenue `commission` = `platform_fee_paise`; add categories `shipping_passthrough`, `payout`, `order_refund`. Refunds are compensating `expense` rows (ledger is append-only).
3. `payouts` rows: artist `seller_net_paise`; curator `curator_fee_paise` when `curator_id` set.
4. `release_after` is set at `delivered_at + return_window`.

**Curator extension point**: `orders.curator_id`, `curator_commission_bps` (snapshotted from `curators.commission_bps` at order time), `curator_fee_paise`, and a `payee_kind='curator'` payout row. Attribution: last-touch via `curator_picks`, captured as a `?ref=` token at `placeOrder`. Who bears the fee is a config decision (Q3); the CHECK only enforces the sum. v1 ships with `curator_id` always null but the columns/branches present and tested.

**Settings**: new single-row `marketplace_settings` (id pinned to 1, like `pw_settings`): `default_commission_bps, return_window_days, checkout_hold_minutes, seller_accept_hours, payout_min_paise, high_value_review_paise, max_order_paise`. Per-artist override: `artist_profiles.commission_bps_override null`.

**Payout rail** (Q8): Option A Razorpay Route (linked accounts, native `on_hold` transfers; heavy per-artist KYC). Option B RazorpayX payouts after our own release (we own escrow logic anyway). Option C manual Finance batches. Recommended: C in the first payout PR, B afterwards. Payout job (fold into one nightly `commerce-sweep` handler, see risk 11) selects `status='releasable' and release_after <= now()`, requires `identity_verified` and a verified `payee_accounts` row, creates the provider payout with idempotency key = `payouts.id`, and in one tx writes `escrow_releases` + ledger expense + `payouts.status`. Stale-`processing` recovery copies the `processOpenRefunds` approach.

### 2.4 Refunds
`queueOrderRefundIn(client, { orderId, paymentId?, amountPaise, reason, kind, actorId })` mirrors `queueRefundIn`: written inside the caller's tx before Razorpay is called, retried by the cron, `provider_refund_id` unique, `findRefund` reconciliation. Before release: refund shrinks/closes the hold and sets payouts `reversed`. Partial refunds supported. Commission on the refunded amount is reversed pro-rata in the ledger. After payout (`paid`): clawback (Q7) via a negative `payee` balance (`payouts` row kind `reversal` or a small `payee_balance_adjustments` table, decided in PR-4).

## 3. Fulfilment, shipping, physical vs digital

**Physical**: after `paid`, the artist has `seller_accept_hours` (default 48) to accept; otherwise auto-cancel + refund. The artist supplies dimensions/weight (persist on `artworks`: new nullable `weight_g, length_cm, breadth_cm, height_cm`) and a pickup address (new `artist_profiles.pickup_address jsonb`), then **Create shipment** calls `createShipment` (Shiprocket) and inserts `shipments` + first `shipment_events`. A Shiprocket status webhook (`POST /api/logistics/shiprocket/webhook`, shared-token header check) appends `shipment_events` and drives `shipped` / `delivered` / `rto`. Proof of delivery stored. Insured value = unit price. `artworks.custody_status` moves `with_artist -> in_transit -> with_buyer`. Manual fallback (courier name + AWB entered by the artist) so a Shiprocket outage never blocks fulfilment.

**Digital** (digital edition, downloadable file, tokenised certificate): `paid` -> auto `delivered` in the settle tx (or an immediate follow-up job): time-limited signed URL (helper in `src/lib/cloudinary-url.ts`), receipt email, shorter release window.

**COA / blockchain** (both kinds): on `delivered` (physical) or `paid` (digital) run a new `transferCertificate` in `src/features/coa/actions.ts`: (a) `addProvenanceEvent` type `sale`, (b) set a new `coa_certificates.holder_user_id` (today `user_id` is the issuer/artist), (c) if minted, enqueue an on-chain transfer via the existing mint-voucher/confirm flow (`src/app/api/blockchain/certificates/[id]`; the `reconcile-mints` cron already retries), (d) set `order_items.coa_certificate_id`. Chain failure must never block completion or payout; the buyer sees "certificate pending" until the retry succeeds.

## 4. Surfaces and server actions

Contract (from `src/features/physical-wall/actions/shared.ts`, scanned statically by `action-contracts.test.ts`): each action = `parseInput(zodSchema, raw)` -> `attempt(scope, fn)` -> `Result<T>`; reads through `readSafely`. Actions live in `src/features/orders/actions/*.ts` and that directory must be added to the scan. Auth: a new `requireBuyer()` (any signed-in non-visitor; no new role, since persona is orthogonal per CLAUDE.md), plus existing `requireRole("artist")`, `requireRole("admin")`, and `requireAdminRole("finance")`.

**Buyer**
- Pages: Buy button on `/artwork/[id]` (`src/app/artwork`), `/checkout/[artworkId]` (address, shipping quote, summary, pay button generalised from `src/features/physical-wall/components/razorpay-pay-button.tsx`), `/orders`, `/orders/[orderNumber]` (timeline from `order_events` + `shipment_events`, tracking, invoice, certificate, "Report a problem"), `/orders/[orderNumber]/dispute`.
- Actions: `quoteOrder`, `placeOrder`, `verifyOrderPayment`, `cancelOrder`, `confirmDelivery`, `openDispute`, `addDisputeMessage`, `getMyOrders`, `getOrder`.

**Artist** (`src/app/studio/orders`, `src/app/studio/payouts`, nav entry in `src/app/studio/layout.tsx`)
- Actions: `acceptOrder`, `declineOrder`, `createOrderShipment`, `markShipped` (manual fallback), `respondToDispute`, `savePayeeAccount`, `getMyPayouts`.
- Payout screen shows held / releasable / paid and the `identity_verified` + bank-account gates. A paid order mirrors into `sales` (status won) so the CRM pipeline stays right; `sales` is not the order table.

**Admin** (`src/app/admin/orders`, `/disputes`, `/payouts`, `/fraud`; Finance role via `requireAnyAdminRolePage`)
- Actions: `adminRefundOrder`, `adminReleaseEscrow`, `adminFreezeEscrow`, `adminResolveDispute`, `adminRetryPayout`, `adminClearFraudSignal`, `adminMarkOrderPaidOffline`. All write `recordAuditIn` (`src/features/physical-wall/audit.ts`).
- Fraud rules (cheap, in `placeOrder`/settle, using `src/lib/rate-limit.ts`): new buyer account plus order above `high_value_review_paise`; order velocity per user/IP; shipping state vs billing mismatch; prior chargebacks; amount mismatch. A signal above threshold sets `orders.requires_review=true`, which blocks seller accept and payout release until an admin clears it.

**Notifications**: new `TEMPLATES` kinds `order.placed|paid|accepted|shipped|delivered|refunded|dispute.opened|dispute.resolved|payout.paid|payout.failed`, queued inside the transition tx with `dedupeKey = "<kind>:<orderId>[:n]"`.

## 5. Contract for the Finance / Escrow / Fraud pages

The other agent should read only these names (final unless this doc is revised). Pages must tolerate empty or not-yet-migrated tables via `readSafely`.

| Page | Reads | Columns |
|---|---|---|
| Escrow | `escrow_holds` + `escrow_releases`, joined to `orders` | holds: `id, order_id, booking_id, amount_paise, status ('held','partially_released','released','frozen','refunded'), release_after, frozen_reason, frozen_by, frozen_at, reason, created_at`. releases: `id, escrow_hold_id, payout_id, ledger_id, amount_paise, released_to, released_at`. orders: `id, order_number, status, buyer_id, seller_id, total_paise, requires_review`. Held balance = hold amount minus released where status in (`held`,`partially_released`,`frozen`). Exactly one of `order_id` / `booking_id` is non-null, so list both. |
| Fraud | `fraud_signals`, `orders.requires_review`, `disputes` | signals: `id, order_id, user_id, signal, score, status ('open','cleared','confirmed'), detail, created_at, reviewed_by, reviewed_at`. disputes: `id, order_id, kind, status, amount_paise, opened_at, due_at` where `kind in ('chargeback','authenticity')` |
| Finance | `pw_ledger` (existing), `orders`, `payouts`, `order_refunds`, `order_payments` | GMV = `sum(orders.total_paise)` for status in paid..completed; platform revenue = ledger `type='revenue' and category='commission'`; payouts due = `payouts.status in ('pending_release','releasable')`, paid = `status='paid'` (`amount_paise, paid_at, utr`); refunds `order_refunds(amount_paise, status, kind)`; failures `order_payments.status='failed'`; stuck = refunds/payouts with `status='failed'` or `attempts >= 3` (matches `REFUND_ALERT_AFTER`) |

Existing booking-linked rows (`pw_payments`, `pw_refunds`, escrow with `booking_id`) stay valid and should be shown alongside.

## 6. Migration outline (files from 0066; do NOT create now)

Renumber after a fresh `ls`. Each verified on a disposable Postgres 17 (CLAUDE.md procedure) before Neon; each with a DB-integration test (`vitest.db.config.ts`). All additive, `begin/commit`, `if not exists`, FKs `on delete restrict`.
1. `0066_orders_core.sql`: `orders, order_items, order_events, order_payments, order_refunds, marketplace_settings` (seed row); widen `artworks_commerce_status_check` to include `reserved`; indexes `(buyer_id, created_at)`, `(seller_id, status)`, `(status)`; partial unique on `order_payments(provider_payment_id)` and `(event_id)`; CHECKs for status sets and money sums.
2. `0067_payouts_escrow_orders.sql`: `payee_accounts`, `payouts`; alter `escrow_holds` (order_id, nullable booking_id, XOR CHECK, status, release_after, frozen_*); `escrow_releases.payout_id`; keep the 0049 trigger.
3. `0068_shipments_orders.sql`: alter `shipments` / `shipment_events`; `artworks` dimensions; `artist_profiles.pickup_address`, `commission_bps_override`; `coa_certificates.holder_user_id`.
4. `0069_disputes_fraud.sql`: `disputes, dispute_messages, fraud_signals`; `order_tax_documents` if Q5.

## 7. Phased delivery (independent PRs; flag `features.marketplaceCheckout` stays off until PR-4)

1. **PR-1 Schema + domain core**: 0066 + 0067; `src/features/orders/{state-machine,money,commission}.ts` pure modules + unit tests; no UI. No behaviour change.
2. **PR-2 Payment path**: generalised Razorpay client, webhook dispatcher, `placeOrder` / `verifyOrderPayment`, settle, reservation + expiry sweep, `order_refunds` + generalised refund processor, ledger categories, buyer checkout + orders pages. Fulfilment manual by admin. Test-mode only.
3. **PR-3 Fulfilment**: artist inbox/accept/ship, Shiprocket create + webhook, 0068, digital delivery, notifications.
4. **PR-4 Escrow and payouts**: `payee_accounts`, release job, `payouts`, artist payouts page, admin payouts, Finance wiring. **Launch gate: money must be able to leave escrow before the flag goes on.**
5. **PR-5 Disputes and fraud**: 0069, dispute flows (buyer/artist/admin), Razorpay dispute webhooks, fraud rules + review gate, admin pages.
6. **PR-6 COA/provenance transfer + curator attribution**.

## 8. Test plan

- Unit: transition table (every pair; admin-only edges); money-split property test (sum invariant, bps edges 0 and 10000, rounding: fee rounds half-up, remainder to seller); snapshot immutability; pro-rata refund math.
- Contract: add `src/features/orders/actions` to `action-contracts.test.ts`.
- DB-integration: oversell race (two concurrent `placeOrder`, exactly one wins); webhook redelivery sequential and concurrent (one payment, one hold, one ledger row); amount mismatch; late capture on expired order auto-refunds; escrow release-cap trigger; XOR CHECK; double payout blocked; refund crash recovery (processing -> stale -> retried exactly once; reuse the existing refund tests as template); expiry sweep releases reservation.
- Webhook: bad signature, replay window, unknown event returns 200, out-of-order (`failed` after `captured`).
- Razorpay / Shiprocket / RazorpayX behind the existing function boundaries with fakes (existing tests already mock `razorpay.ts`).
- Manual, Razorpay test mode: physical happy path, digital, decline/timeout, RTO, dispute, chargeback.
- Gate per CLAUDE.md: `pnpm typecheck && pnpm lint && pnpm build` (build needs `DATABASE_URL`) plus migrations on disposable Postgres.

## 9. Risks

1. `integer` paise caps at ~Rs 2.1 crore (Q4).
2. Overselling a 1-of-1: conditional reservation + late-capture auto-refund.
3. Shared webhook between wall bookings and orders: regression risk to the working booking flow; keep its behaviour byte-identical with existing tests.
4. Holding third-party funds may need a nodal/escrow arrangement (RBI payment-aggregator rules, Razorpay Route) and GST/TCS (s.52 CGST) and TDS (s.194-O) handling: needs legal and finance sign-off before launch (Q5, Q8).
5. Chargeback after payout (Q7).
6. Authenticity disputes are subjective; need an admin arbitration process and SLA.
7. Courier loss/damage of high-value works; fake "delivered" marks; insurance cost.
8. `pw_ledger` is append-only: corrections are compensating rows only.
9. Production has real data: all migrations additive; the one relaxing change is `escrow_holds.booking_id` nullable.
10. Chain latency must never gate payout.
11. `vercel.json` already runs 7 crons; prefer extending `/api/cron/refunds` (or one `commerce-sweep`) for payouts/expiry/accept-timeout rather than adding more.

## 10. Open product questions (recommended default in bold)

1. **Q1 Purchasable unit**: single artwork "Buy now" (editions as one order each); no cart, no whole-collection purchase in v1.
2. **Q2 Multi-seller**: n/a under Q1; one seller per order.
3. **Q3 Commission**: 15% platform fee on artwork price; curator commission (their existing 10% `commission_bps`) paid from ArtWall's fee so the artist's net is unaffected. Needs founder confirmation.
4. **Q4 Max order value**: cap Rs 20,00,000 in v1, keep `integer`; larger sales via the offline/admin path.
5. **Q5 Invoicing / tax**: artist is the supplier, ArtWall collects TCS and issues a commission invoice. Needs CA confirmation before launch.
6. **Q6 Returns/refunds**: 7-day window after delivery; buyer pays return shipping; only not-as-described / damaged / authenticity; no change-of-mind returns for originals. Versioned in its own policy snapshot.
7. **Q7 Chargeback after payout**: platform absorbs up to a cap, then recovers from the artist's future payouts.
8. **Q8 Payout rail**: manual Finance-approved batches first (admin records UTR), RazorpayX automation later; gate on `identity_verified` + verified bank account.
9. **Q9 Shipping**: live Shiprocket rate paid by buyer; insurance mandatory above Rs 10,000; artist packs; India only.
10. **Q10 Escrow release**: 7 days after courier-confirmed delivery, or on buyer confirmation if earlier; digital 48h.
11. **Q11 Seller acceptance**: required, 48h SLA, then auto-cancel + refund.
12. **Q12 Buyer identity**: account required with verified email + phone; manual review above Rs 2,00,000.
13. **Q13 Digital goods**: physical only in PR-2/3; digital + certificate transfer in PR-3/6 behind the same flag.
14. **Q14 Coupons / buyer's premium**: none in v1 (`discount_paise` stays 0).
15. **Q15 Currency / geography**: INR, India only.
16. **Q16 Mirror into artist `sales` CRM**: yes (won); no change to `demand_aggregates`.
17. **Q17 Buyer cancellation**: free until the seller accepts; afterwards only via dispute.
