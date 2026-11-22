import {
  FOUNDING_COHORT_SIZE,
  getNextFounderNumber,
} from "@/features/waitlist/roster";
import { WaitlistForm } from "@/features/waitlist/waitlist-form";
import type { SessionUser } from "@/lib/session";
import { Container, Eyebrow } from "@/shared/editorial";

const promises = [
  "A permanent, numbered place on the wall",
  "First access when we open, before the public",
  "A say in what we build. Founding artists are asked, not surveyed",
  "Free certification for your first works",
] as const;

/**
 * Joining, framed as taking a numbered place rather than submitting a form.
 *
 * Async Server Component: the next available number is read from the database
 * through a tag-invalidated cache, so it is genuinely live. The form itself is
 * the only client island on the page.
 *
 * The caller has already established the session, so `user` is not optional
 * here - the form prefills from the account rather than asking an artist to
 * retype what they just signed in with.
 */
export async function JoinSection({ user }: { user: SessionUser }) {
  const next = await getNextFounderNumber();
  const remaining = Math.max(0, FOUNDING_COHORT_SIZE - next + 1);

  return (
    <>
      <section className="pt-32 pb-16 sm:pt-40 sm:pb-20 lg:pt-48 lg:pb-24">
        <div className="max-w-page mx-auto px-5 sm:px-8 lg:px-16">
          <Eyebrow>Join the Wall</Eyebrow>
          <h1 className="font-heading text-display mt-8 max-w-[18ch] text-balance">
            Take your place on the wall.
          </h1>
          <p className="text-muted-foreground text-lead mt-6 max-w-2xl">
            Not a mailing list. A numbered place, kept in the order people
            arrived. Founding Membership is a separate, optional yes, tick the
            box below only if you want it.
          </p>
        </div>
      </section>

      <div className="border-border border-t py-20 sm:py-24 lg:py-32">
        <Container>
          <div className="grid gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24">
            <div>
              <div className="border-border border-t pt-6">
                <p className="text-muted-foreground text-eyebrow">Next place</p>
                <p className="font-heading text-display mt-3 tabular-nums">
                  #{next}
                </p>
                <p className="text-muted-foreground mt-3 text-sm">
                  {remaining} of {FOUNDING_COHORT_SIZE} founding places remain.
                </p>
              </div>

              <div className="border-border mt-10 border-t pt-6">
                <p className="text-muted-foreground text-eyebrow">
                  What Founding Membership carries
                </p>
                <ul className="mt-4">
                  {promises.map((promise) => (
                    <li
                      key={promise}
                      className="border-border text-muted-foreground border-b py-4 leading-7 last:border-b-0"
                    >
                      {promise}
                    </li>
                  ))}
                </ul>
              </div>

              <p className="text-muted-foreground mt-8 text-sm leading-7">
                Signed in as{" "}
                <span className="text-foreground">{user.email}</span>. Your
                place is held against this account.
              </p>
            </div>

            <div className="border-border border-t pt-8 lg:border-t-0 lg:pt-0">
              <WaitlistForm defaultName={user.name} accountEmail={user.email} />
            </div>
          </div>
        </Container>
      </div>
    </>
  );
}
