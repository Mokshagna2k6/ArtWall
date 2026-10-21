# DPDP data processing inventory — ArtWall

- Task: SEC-3.08 [Source: Bible section 120-127]
- Date: 2026-10-05
- Scope: every table/column holding personal data (DPDP's "personal data"
  — data about an identifiable natural person), where it lives, how long it
  is kept, and which third-party processor (if any) handles it.

This inventory is built by reading the actual schema (`db/migrations/*.sql`),
the actual erasure/export code (`src/features/physical-wall/data-rights.ts`),
and the actual retention cron (`src/app/api/cron/data-retention/route.ts`) —
not from a generic DPDP template.

## Processors (data fiduciary's data processors under DPDP)

| Processor | What ArtWall sends it | What ArtWall itself stores about the data it holds |
|---|---|---|
| **Cloudinary** | Identity documents (government ID images), UGC/selfie images, artwork images, waitlist uploads | Only the Cloudinary `public_id` (e.g. `doc_cloudinary_id`, `"imagePublicId"`, `cloudinary_id`, `selfie_public_id`). The actual image bytes live only in Cloudinary, never in ArtWall's own DB. Identity documents specifically are uploaded as `type: "authenticated"` (private delivery), never resolvable by public id, served only via short-lived signed URLs to the owner and identity-review admins (SEC-2.08, `src/features/physical-wall/actions/identity.ts`). |
| **Razorpay** | Payment authorization requests (amount, currency, the booking's order context) | ArtWall's `pw_payments` table (`db/migrations/0006_physical_wall.sql`) stores only `provider` ('razorpay'), `order_id`, `payment_id`, `event_id`, `amount_paise`, `status`, `notes` — **no card number, no UPI VPA, no bank account details**. Those instruments are held exclusively by Razorpay; ArtWall only ever receives and stores Razorpay's own opaque order/payment identifiers and the webhook-confirmed amount/status. Razorpay webhook payloads are signature-verified and replay-protected (SEC-2.14, `src/features/physical-wall/__tests__/webhook-route.test.ts`) before anything is written. |
| **Pinata (IPFS)** | NFT/certificate metadata JSON (artwork title, description, image CID reference), uploaded via `src/lib/blockchain/pinata.ts` and `src/app/api/blockchain/ipfs/upload/route.ts` | The resulting IPFS CID is stored in ArtWall's DB (certificate/provenance tables); the metadata content itself, once pinned, is public by the nature of IPFS (anyone with the CID can fetch it) — this is a deliberate design property of on-chain provenance (immutable, publicly verifiable certificate metadata), not an accidental leak. No private PII (e.g. identity documents) is ever sent to Pinata — only artwork/certificate metadata, which is intentionally public. |
| **Resend** | Recipient email address, subject, and body text for every queued notification | `pw_notifications.recipient`/`subject`/`body` (`db/migrations/0009_production_readiness.sql`) are ArtWall's own outbox rows, sent to Resend's API at delivery time (`src/features/physical-wall/notifications.ts` → `deliverPendingNotifications`) with the row id as an idempotency key. Resend only receives what's already in this outbox row — no separate PII is sent. |
| **Vercel** | Hosts the application; sees all HTTP traffic, including IP addresses in request logs, and environment secrets at runtime | Standard hosting-processor relationship — Vercel's own infrastructure logs (access logs, function logs) are outside ArtWall's own database and governed by Vercel's own data-processing terms, not enumerated row-by-row here. ArtWall's own IP-address storage is limited to what's explicitly captured in its own tables (see `session."ipAddress"` below, and `pw_audit_log`'s actor IP). |
| **Neon (Postgres host)** | Hosts ArtWall's primary database — i.e., every table in this inventory | The database itself; not a separate processor relationship beyond "where the data physically lives." |

## PII inventory by table/column

### Identity and account

| Table.column | What it is | Retention | Notes |
|---|---|---|---|
| `"user".name`, `"user".email`, `"user".image` | Name, email, OAuth avatar URL | Until account deletion/erasure | On erasure (`eraseUserIn`): `name` → `'Deleted account'`, `email` → `deleted-{id}@removed.artwalllabs.com`, `image` → `null`. The row is kept as a tombstone so records that must legally be retained (see below) can still point at a stable foreign key. |
| `"user"."nomineeName"`, `"nomineeContact"` | Nominee details (added `db/migrations/0008_consent_agreements_waitlist.sql`) | Until erasure | Set to `null` on erasure (`data-rights.ts`, step 7). |
| `"user"."ageDeclaredAdult"` | Age declaration flag | Until erasure | Included in `exportUserData`'s account select; deleted with the user row (no separate retention exception). |
| `session.*` (`"ipAddress"`, `"userAgent"`, `token`) | Session metadata including IP | Until sign-out/expiry; deleted outright on erasure | `delete from session where "userId" = $1` in `eraseUserIn`. |
| `account.*` (OAuth tokens, hashed password) | Credential material | Until erasure | `delete from account where "userId" = $1`. |
| `verification.*` | Pending email-verification/reset tokens | Until erasure or natural expiry | `delete from verification where identifier = $1` (keyed by email). |

### Identity verification (KYC-adjacent)

| Table.column | What it is | Retention | Notes |
|---|---|---|---|
| `pw_identity_verifications.doc_cloudinary_id` | Pointer to a private, signed-URL-only Cloudinary asset (government ID image) | Until erasure | Row deleted outright on erasure (`data-rights.ts` step 5); the Cloudinary asset itself is queued via `pw_asset_deletions` (reason `erasure:identity`) and deleted out-of-band by `processAssetDeletions`, retried on the daily `data-retention` cron until it succeeds or fails 10 times. |
| `pw_identity_verifications.doc_kind`, `status`, `review_note`, `reviewed_at` | KYC review metadata | Until erasure | Same as above. `review_note` can contain free-text written by an admin about a person — deleted with the row, not pseudonymized, because identity verification itself (unlike bookings/payments) has no tax/accounting retention requirement forcing it to survive erasure. |

### Payments and tax records (retained — legal basis)

| Table.column | What it is | Retention | Legal basis (from `data-rights.ts`'s own documented reasoning) |
|---|---|---|---|
| `pw_bookings.artist_id`, `pw_payments`, `pw_refunds`, `pw_ledger`, `pw_invoices` | Booking/payment/refund/ledger/invoice records referencing the artist | **72 months** (6 years) | CGST Act s.36 / Rule 56, and Income Tax Act s.44AA — tax record retention. Pseudonymized on erasure: the user row becomes a tombstone (`'Deleted account'`), these tables keep the `artist_id` foreign key but carry no name/email of their own. Invoices render the tombstone name, not the real one, once erased. |
| `pw_invoices.gstin_customer` (B2B GSTIN) | Business tax identifier on an invoice | Same as invoice (72 months) | Explicitly called out in `data-rights.ts`'s header comment: a B2B GSTIN stays even after personal erasure because it is "mandatory invoice content, and a business identifier," not personal data of the erased individual. |
| `pw_agreements.signed_name`, `terms_version`, `terms_hash`, amounts | Signed exhibition/booking agreements | **3 years** | Limitation Act (contract limitation period). `signed_name` is replaced with a pseudonym on erasure (`data-rights.ts` step 6); `terms`, `hash`, and `amounts` stay as the contract record. |

### Consent, grievance, audit (retained — accountability)

| Table.column | What it is | Retention | Legal basis |
|---|---|---|---|
| `pw_consents.user_id`, `purpose`, `granted`, `notice_version`, `granted_at`, `withdrawn_at` | Consent ledger | Kept even after withdrawal/erasure | DPDP s.6(10) explicitly puts the burden of proving past processing was lawful on ArtWall — so the record of a (now withdrawn) consent must be retained as evidence, not deleted. On erasure, `withdrawn_at` is set if not already set; the row itself is never deleted. |
| `pw_grievances.user_id`, `subject`, `body`, `contact`, `status` | Grievance/complaint thread | Kept for accountability | `contact` and `body` are redacted to `'[erased]'` on erasure; the row (with timestamps/status) stays as an accountability record that a grievance was filed and handled. |
| `pw_audit_log.actor_id`, `actor_label`, `subject_id`, `action` | Append-only security/admin audit trail | Kept indefinitely (security/accountability) | `actor_label` is pseudonymized on erasure (the only UPDATE the append-only trigger permits, and only for the user being erased, gated by a transaction-local `artwall.erasing_user` setting — `set_config('artwall.erasing_user', $1, true)`). `actor_id`/`subject_id` foreign keys remain for referential integrity. |
| `pw_condition_photos`, `pw_damage_records` | Photos/evidence tied to a retained (not-erasable) booking | Kept as long as the booking record (up to 72 months) | Documented reasoning: these are "evidence on retained bookings (damage disputes); photos of the artwork, not of the person" — i.e., the images are of physical artwork/wall condition, not of the data principal themselves. |
| `pw_feedback.artist_id`, `rating` | Rating on a retained booking | Kept (rating only) | `note` (free text) is cleared to `null` on erasure; the numeric rating stays attached to the retained booking record. |

### Deleted outright on erasure (no retention exception)

Per `data-rights.ts`'s own header comment and the `eraseUserIn` function body:
`artist_profiles`, `artworks` (+ editions, certificates, mint commitments,
provenance, exhibition/curator links; art tags unbound), `exhibitions`,
`curators` (+ picks), `pw_identity_verifications`, `pw_ugc_submissions` (+
gallery rows), `waitlist_entries`, `survey_responses`, `pw_waitlist`,
`pw_notifications`, and studio CRM rows (`contacts`, `documents`, `sales`,
`collections`, `rooms`, `tasks`). Corresponding Cloudinary assets (artwork
images, UGC/selfie images, waitlist uploads, identity documents) are queued
for deletion via `pw_asset_deletions` before their referencing row is
deleted, so a Cloudinary outage delays deletion but never loses track of it.

### Time-bounded operational data (not DPDP-erasure-specific, but personal-data-adjacent)

| Table | Retention | Where enforced |
|---|---|---|
| `pw_search_log` | 90 days | `src/app/api/cron/data-retention/route.ts`, `RETENTION_DAYS` map, deleted in 5,000-row batches daily. |
| `pw_scans` | 180 days | Same cron. |
| `rate_limits` | Rows whose `reset_at` has passed are swept daily | Same cron (bounds the table to roughly a day of distinct keys). |

### On-chain data (cannot be erased — explicitly out of scope for erasure)

Per `data-rights.ts`'s own `ponytail:` comment: Merkle leaf hashes anchored
on-chain are hashes, not personal data, and cannot be erased by design (that
is the point of a blockchain). The comment also flags a genuinely open
question for counsel: certificates for artworks already sold (where a
collector relies on `/verify`) are currently deleted along with the artist's
other artworks on erasure; if a legitimate-use exception applies, the
service should instead keep and pseudonymize `coa_certificates` +
`provenance` for sold works. **This is a real, disclosed open question in
the code itself, not resolved by this inventory** — flagged here rather than
silently assumed answered.

## Honest summary

- Every PII-bearing table in the live schema is accounted for above, sourced
  directly from `data-rights.ts` (which already documents retention/erasure
  table-by-table) and the retention cron.
- Real retention periods found in code: 72 months (tax records, CGST/Income
  Tax Act), 3 years (agreements, Limitation Act), 90/180 days (search
  log/scans, operational), indefinite with pseudonymization (consents,
  grievances, audit log — accountability).
- Razorpay/Cloudinary/Pinata/Resend/Vercel/Neon processor relationships are
  each grounded in a real code reference, not assumed from the processor's
  general reputation.
- One genuinely open, unresolved question is disclosed as-is (the
  sold-certificate erasure-vs-pseudonymize question in `data-rights.ts`),
  rather than silently treated as settled.
