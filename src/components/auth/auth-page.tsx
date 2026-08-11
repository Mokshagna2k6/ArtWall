import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";

type AuthMode = "sign-in" | "sign-up";

const copy = {
  "sign-in": {
    eyebrow: "ArtWall Studio",
    title: "Welcome back to the work.",
    description:
      "Return to the artworks, records and relationships that make up your practice.",
    formLabel: "Continue your practice",
    alternate: "New to ArtWall Studio?",
    alternateAction: "Create your studio",
  },
  "sign-up": {
    eyebrow: "ArtWall Studio",
    title: "Give your practice a considered home.",
    description:
      "Begin with your work, then carry it from the studio to the wall with its story intact.",
    formLabel: "Begin your studio",
    alternate: "Already have a studio?",
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
    <main className="bg-background min-h-screen px-5 pt-28 pb-16 sm:px-8 sm:pt-36 lg:px-16 lg:pb-24">
      <div className="mx-auto grid max-w-6xl items-start gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,0.72fr)] lg:gap-24">
        <section className="pt-2 lg:pt-10">
          <p className="studio-eyebrow">{content.eyebrow}</p>
          <h1 className="font-heading mt-4 max-w-xl text-4xl leading-[1.02] tracking-[-0.035em] text-balance sm:text-5xl lg:text-[3.6rem]">
            {content.title}
          </h1>
          <p className="text-muted-foreground mt-5 max-w-md text-base leading-7">
            {content.description}
          </p>

          <div className="border-border mt-10 max-w-lg border-t pt-5">
            <p className="text-ember text-caption tracking-[0.14em] uppercase">
              From studio to wall
            </p>
            <p className="font-heading text-h4 mt-3 max-w-md text-balance">
              The work stays connected to its story, wherever it goes next.
            </p>
            <Link
              href="/journey"
              className="text-foreground decoration-ember hover:text-ember mt-5 inline-flex text-sm underline underline-offset-4 transition-colors"
            >
              See the ArtWall journey
            </Link>
          </div>
        </section>

        <section className="w-full max-w-md lg:justify-self-end">
          <p className="text-muted-foreground text-caption mb-3 tracking-[0.14em] uppercase">
            {content.formLabel}
          </p>
          <AuthForm
            mode={mode}
            callbackUrl={returnTo}
            googleEnabled={googleEnabled}
          />
          <p className="text-muted-foreground mt-5 text-center text-sm">
            {content.alternate}{" "}
            <Link
              className="text-foreground decoration-ember hover:text-ember underline underline-offset-4 transition-colors"
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
