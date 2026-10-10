import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";
import { SIGNUP_NOTICE } from "@/features/physical-wall/consent";

type AuthMode = "sign-in" | "sign-up";

const copy = {
  "sign-in": {
    eyebrow: "ArtWall",
    title: "Welcome back to the work.",
    description:
      "Sign in to hold your place on the wall, add work, and keep your record of it in one place.",
    formLabel: "Sign in",
    alternate: "New to ArtWall?",
    alternateAction: "Create an account",
  },
  "sign-up": {
    eyebrow: "ArtWall",
    title: "An account, so the work stays yours.",
    description:
      "A place on the wall is tied to a person, not an email address. Create an account and your work, your number and your record travel together.",
    formLabel: "Create your account",
    alternate: "Already have an account?",
    alternateAction: "Sign in",
  },
} as const;

function safeCallback(callbackUrl?: string) {
  return callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//")
    ? callbackUrl
    : undefined;
}

export function AuthPage({
  mode,
  callbackUrl,
  googleEnabled,
}: {
  mode: AuthMode;
  callbackUrl?: string;
  googleEnabled: boolean;
}) {
  const content = copy[mode];
  const alternatePath = mode === "sign-in" ? "/sign-up" : "/sign-in";
  const returnTo = safeCallback(callbackUrl);
  const alternateHref = returnTo
    ? `${alternatePath}?callbackUrl=${encodeURIComponent(returnTo)}`
    : alternatePath;

  return (
    <main className="bg-background min-h-screen px-5 pt-32 pb-16 sm:px-8 sm:pt-40 sm:pb-20 lg:px-16 lg:pt-48 lg:pb-24">
      <div className="max-w-page mx-auto grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,0.72fr)] lg:gap-24">
        <section className="pt-2 lg:pt-10">
          <p className="text-muted-foreground text-eyebrow">
            {content.eyebrow}
          </p>
          <h1 className="font-heading text-display mt-4 max-w-[18ch] text-balance">
            {content.title}
          </h1>
          <p className="text-muted-foreground mt-5 max-w-md text-base leading-7">
            {content.description}
          </p>

          <div className="border-border mt-10 max-w-lg border-t pt-5">
            <p className="text-muted-foreground text-eyebrow">Why an account</p>
            <p className="font-heading text-subsection mt-3 max-w-md text-balance">
              The work stays connected to its story, wherever it goes next.
            </p>

            {/* What actually happens next, in order. A sign-up that ends at
                "account created" leaves people wondering what they bought;
                this says what the account is for before they make one. */}
            {mode === "sign-up" && (
              <ol className="mt-6 flex max-w-md flex-col gap-4">
                {[
                  {
                    title: "Make an account",
                    body: "Name, email, password. Under a minute.",
                  },
                  {
                    title: "Choose what's public",
                    body: "Your profile and what you hear from us are separate questions, and both are yours to change later.",
                  },
                  {
                    title: "Take a place on the wall",
                    body: "Pick your position, your dates, and what you're hanging.",
                  },
                ].map((step, index) => (
                  <li key={step.title} className="flex gap-4">
                    <span
                      aria-hidden
                      className="border-border text-muted-foreground mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs"
                    >
                      {index + 1}
                    </span>
                    <span>
                      <span className="text-foreground block text-sm font-medium">
                        {step.title}
                      </span>
                      <span className="text-muted-foreground mt-0.5 block text-sm leading-6">
                        {step.body}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}

            <Link
              href="/journey"
              className="text-foreground hover:text-muted-foreground mt-6 inline-flex text-sm underline underline-offset-4 transition-colors"
            >
              See how it works
            </Link>
          </div>
        </section>

        <section className="w-full max-w-md lg:justify-self-end">
          <p className="text-muted-foreground text-eyebrow mb-3">
            {content.formLabel}
          </p>
          <AuthForm
            mode={mode}
            callbackUrl={returnTo}
            googleEnabled={googleEnabled}
            noticeSummary={SIGNUP_NOTICE}
          />
          <p className="text-muted-foreground mt-5 text-center text-sm">
            {content.alternate}{" "}
            <Link
              className="text-foreground hover:text-muted-foreground underline underline-offset-4 transition-colors"
              href={alternateHref}
            >
              {content.alternateAction}
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
