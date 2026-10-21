# Archived plans

Implementation plans whose work has shipped. Kept for the rationale behind
decisions that are now in the code.

## `CHANGES-PLAN.md` — marketplace-first restructure

**Its own header says "planning only — nothing implemented yet." That is no
longer true** and was the single most misleading line in the repository when
this archive was created. Spot-checked 21 Oct 2026:

| Section | Where it landed |
| --- | --- |
| §5 admin routing (`/admin` → `/admin/tiles`) | [`apps/web/next.config.ts`](../../../apps/web/next.config.ts) `redirects()` |
| §8.1 AI assistant | [`apps/web/src/features/assistant/`](../../../apps/web/src/features/assistant/) |
| §8.5 Inquiries → Contacts | [`apps/web/src/features/inquiries/`](../../../apps/web/src/features/inquiries/) |
| §8.7 Artwork detail page | [`apps/web/src/app/artwork/[id]/`](../../../apps/web/src/app/artwork/) |

Its §0 and §8.0 ("What already exists — do not rebuild") remain a useful index
of pre-existing machinery, and §11 records how the Bible conflict was resolved
on 2026-10-15.

## `WORK_PLAN.md` — phased build plan, 2026-09-10

Status line reads "awaiting sign-off". Its value now is its Context section,
which is the earliest written statement that the README no longer described the
real project.

**It contains at least two decisions that were never implemented — do not build
from it:**

- It specifies **AWS SES** for email. The code uses **Resend**
  ([`apps/web/src/features/physical-wall/notifications.ts`](../../../apps/web/src/features/physical-wall/notifications.ts)).
  An SES migration was built, verified, then deliberately reverted. Trust the code.
- It specifies **Privy.io MPC wallets**. The code uses **wagmi + RainbowKit**
  wallet-connect. Privy was never implemented.

Both drift points are also flagged in [`HANDOFF.md`](../../../HANDOFF.md) §2–3.
