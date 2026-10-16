-- 0070: let an inquiry exist without an artwork, so an AI-assistant
-- escalation can land in the same inbox as an artwork inquiry.
--
-- CHANGES-PLAN §8.1 decided that an escalated assistant chat goes to the §8.5
-- inquiries inbox — one message system, one inbox — rather than a second
-- messaging feature. But 0069 made `artwork_id` NOT NULL, because every
-- inquiry at that point was about a specific work. An escalation usually is
-- not ("how does provenance work?", "my payout is wrong"), so the column has
-- to be nullable for that decision to be implementable at all.
--
-- Rather than overload the absence of artwork_id as the signal, `source` says
-- explicitly where the thread came from. The CHECK then enforces the real
-- invariant: an artwork inquiry MUST name an artwork, and an assistant
-- escalation must not (its context is the transcript, not a work).
--
-- Additive and backward-compatible: existing rows are all artwork inquiries
-- with an artwork_id, which is exactly what the default and the CHECK allow.

begin;

alter table inquiries alter column artwork_id drop not null;

alter table inquiries add column if not exists source text not null default 'artwork';

alter table inquiries drop constraint if exists inquiries_source_check;
alter table inquiries add constraint inquiries_source_check
  check (source in ('artwork', 'assistant'));

-- The invariant the nullable column would otherwise lose.
alter table inquiries drop constraint if exists inquiries_artwork_required_check;
alter table inquiries add constraint inquiries_artwork_required_check
  check (
    (source = 'artwork' and artwork_id is not null)
    or (source = 'assistant' and artwork_id is null)
  );

-- An escalation has no artwork to borrow a subject from, so the inbox reads
-- `subject` directly; it is already NOT NULL from 0069.

commit;
