"use client";

import { Check, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { POST_AUTH_DESTINATION } from "@/config/site";
import { authClient } from "@/lib/auth-client";

type AuthMode = "sign-in" | "sign-up";
type PendingMethod = "email" | "google" | null;

/**
 * Where to land after authenticating.
 *
 * Only same-site paths are honoured: a callback beginning "//" is a
 * protocol-relative URL to another host, which is the classic open-redirect
 * shape, so it is rejected in favour of the default.
 */
function destinationFor(callbackUrl?: string) {
  return callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//")
    ? callbackUrl
    : POST_AUTH_DESTINATION;
}

/**
 * Turn an auth failure into something a person can act on.
 *
 * The library's own messages are written for developers ("Invalid email or
 * password", "USER_ALREADY_EXISTS"). Someone who has just mistyped their
 * password needs to know which of the two things to try again, and someone who
 * already has an account needs a link to sign in — not a restatement of the
 * error code. Anything unrecognised falls through to a plain sentence rather
 * than leaking the raw message.
 */
function humanError(
  code: string | undefined,
  message: string | undefined,
  mode: AuthMode
): { text: string; offerSignIn?: boolean; offerSignUp?: boolean } {
  const normalised = (code ?? message ?? "").toUpperCase();

  if (normalised.includes("USER_ALREADY_EXISTS") || normalised.includes("EXISTS")) {
    return {
      text: "There's already an account with that email.",
      offerSignIn: true,
    };
  }
  if (
    normalised.includes("INVALID_EMAIL_OR_PASSWORD") ||
    normalised.includes("INVALID_PASSWORD") ||
    normalised.includes("CREDENTIAL")
  ) {
    return {
      text: "That email and password don't match. Check both and try again.",
      offerSignUp: mode === "sign-in",
    };
  }
  if (normalised.includes("USER_NOT_FOUND") || normalised.includes("NOT_FOUND")) {
    return {
      text: "We don't have an account with that email.",
      offerSignUp: true,
    };
  }
  if (normalised.includes("PASSWORD_TOO_SHORT") || normalised.includes("SHORT")) {
    return { text: "That password is too short — use at least 8 characters." };
  }
  if (normalised.includes("RATE") || normalised.includes("TOO_MANY")) {
    return { text: "Too many attempts. Wait a minute and try again." };
  }

  return {
    text:
      mode === "sign-up"
        ? "We couldn't create the account. Please try again."
        : "We couldn't sign you in. Please try again.",
  };
}

/**
 * Honest password feedback.
 *
 * Length first, because it is the property that actually matters and the one
 * people underrate. This never blocks a submit beyond the 8-character floor —
 * a meter that refuses a passphrase because it lacks a symbol trains people to
 * write worse passwords, not better ones.
 */
function passwordAdvice(value: string): {
  score: 0 | 1 | 2 | 3;
  label: string;
  hint: string;
} {
  if (value.length === 0) {
    return { score: 0, label: "", hint: "At least 8 characters." };
  }
  if (value.length < 8) {
    return {
      score: 0,
      label: "Too short",
      hint: `${8 - value.length} more character${8 - value.length === 1 ? "" : "s"} to go.`,
    };
  }

  const variety =
    Number(/[a-z]/.test(value)) +
    Number(/[A-Z]/.test(value)) +
    Number(/\d/.test(value)) +
    Number(/[^A-Za-z0-9]/.test(value));

  if (value.length >= 16 || (value.length >= 12 && variety >= 3)) {
    return { score: 3, label: "Strong", hint: "That'll do nicely." };
  }
  if (value.length >= 12 || variety >= 3) {
    return { score: 2, label: "Good", hint: "Longer is better than fancier." };
  }
  return {
    score: 1,
    label: "Workable",
    hint: "A few more words would make this much harder to guess.",
  };
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4" focusable="false">
      <path
        fill="#4285F4"
        d="M21.35 12.27c0-.78-.07-1.53-.2-2.25H12v4.26h5.23a4.47 4.47 0 0 1-1.94 2.93v2.76h3.15c1.84-1.69 2.91-4.19 2.91-7.7Z"
      />
      <path
        fill="#34A853"
        d="M12 21.76c2.62 0 4.82-.87 6.43-2.36l-3.15-2.76c-.87.59-1.99.94-3.28.94-2.53 0-4.68-1.71-5.45-4.01H3.3v2.84A9.73 9.73 0 0 0 12 21.76Z"
      />
      <path
        fill="#FBBC05"
        d="M6.55 13.57A5.85 5.85 0 0 1 6.24 12c0-.54.1-1.06.31-1.57V7.59H3.3A9.73 9.73 0 0 0 2.27 12c0 1.57.38 3.06 1.03 4.41l3.25-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 6.42c1.42 0 2.69.49 3.69 1.44l2.77-2.77C16.81 3.55 14.62 2.24 12 2.24A9.73 9.73 0 0 0 3.3 7.59l3.25 2.84C7.32 8.13 9.47 6.42 12 6.42Z"
      />
    </svg>
  );
}

export function AuthForm({
  mode,
  callbackUrl,
  googleEnabled,
  noticeSummary,
}: {
  mode: AuthMode;
  callbackUrl?: string;
  googleEnabled: boolean;
  /** The DPDP notice, shown at the point of collection on sign-up. */
  noticeSummary: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<ReturnType<typeof humanError> | null>(null);
  const [pendingMethod, setPendingMethod] = useState<PendingMethod>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");

  const destination = destinationFor(callbackUrl);
  const isPending = pendingMethod !== null;
  const isSignUp = mode === "sign-up";
  const advice = passwordAdvice(password);

  const alternatePath = mode === "sign-in" ? "/sign-up" : "/sign-in";
  const alternateHref = callbackUrl
    ? `${alternatePath}?callbackUrl=${encodeURIComponent(callbackUrl)}`
    : alternatePath;

  async function submit(formData: FormData) {
    setPendingMethod("email");
    setError(null);

    try {
      const email = String(formData.get("email") ?? "");
      const pwd = String(formData.get("password") ?? "");
      const name = String(formData.get("name") ?? "");

      const result = isSignUp
        ? await authClient.signUp.email({ email, password: pwd, name })
        : await authClient.signIn.email({ email, password: pwd });

      if (result.error) {
        setError(
          humanError(
            (result.error as { code?: string }).code,
            result.error.message,
            mode
          )
        );
        return;
      }

      router.replace(destination);
      router.refresh();
    } catch {
      setError(humanError(undefined, undefined, mode));
    } finally {
      setPendingMethod(null);
    }
  }

  async function signInWithGoogle() {
    if (!googleEnabled || isPending) return;

    setPendingMethod("google");
    setError(null);

    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: destination,
      });

      if (result.error) {
        setError({
          text: "Google couldn't complete that. Try again, or use your email.",
        });
      }
    } catch {
      setError({
        text: "Google couldn't complete that. Try again, or use your email.",
      });
    } finally {
      setPendingMethod(null);
    }
  }

  return (
    <form
      action={submit}
      className="border-border flex w-full flex-col gap-4 border bg-white p-5 sm:p-6"
    >
      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={!googleEnabled || isPending}
        aria-describedby={!googleEnabled ? "google-unavailable" : undefined}
        className="border-border text-foreground hover:border-foreground hover:bg-secondary inline-flex h-12 items-center justify-center gap-3 border px-4 text-sm font-medium transition-[border-color,background-color] disabled:cursor-not-allowed disabled:opacity-55"
      >
        <GoogleMark />
        {pendingMethod === "google"
          ? "Taking you to Google…"
          : isSignUp
            ? "Sign up with Google"
            : "Continue with Google"}
      </button>
      {!googleEnabled && (
        <p
          id="google-unavailable"
          className="text-muted-foreground -mt-2 text-center text-xs"
        >
          Google sign-in is being connected for this environment.
        </p>
      )}

      <div className="flex items-center gap-3" aria-hidden>
        <span className="border-border h-px flex-1 border-t" />
        <span className="text-muted-foreground text-[0.68rem] tracking-[0.14em] uppercase">
          or use email
        </span>
        <span className="border-border h-px flex-1 border-t" />
      </div>

      {isSignUp && (
        <label className="text-foreground flex flex-col gap-2 text-sm">
          Your name
          <input
            className="border-input focus:border-foreground h-11 border bg-white px-3 text-base transition-colors outline-none"
            name="name"
            autoComplete="name"
            placeholder="How should we know you?"
            disabled={isPending}
            required
          />
        </label>
      )}

      <label className="text-foreground flex flex-col gap-2 text-sm">
        Email address
        <input
          className="border-input focus:border-foreground h-11 border bg-white px-3 text-base transition-colors outline-none"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          disabled={isPending}
          required
        />
      </label>

      <label className="text-foreground flex flex-col gap-2 text-sm">
        Password
        <span className="relative">
          <input
            className="border-input focus:border-foreground h-11 w-full border bg-white px-3 pr-12 text-base transition-colors outline-none"
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={isSignUp ? "At least 8 characters" : "Your password"}
            disabled={isPending}
            aria-describedby={isSignUp ? "password-advice" : undefined}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center"
          >
            {showPassword ? (
              <EyeOff className="size-4" aria-hidden />
            ) : (
              <Eye className="size-4" aria-hidden />
            )}
          </button>
        </span>
      </label>

      {isSignUp && (
        <div id="password-advice" aria-live="polite" className="-mt-2">
          <div className="flex gap-1" aria-hidden>
            {[1, 2, 3].map((step) => (
              <span
                key={step}
                className={`h-0.5 flex-1 transition-colors ${
                  advice.score >= step ? "bg-foreground" : "bg-border"
                }`}
              />
            ))}
          </div>
          <p className="text-muted-foreground mt-1.5 text-xs">
            {advice.label && (
              <span className="text-foreground font-medium">
                {advice.label}.{" "}
              </span>
            )}
            {advice.hint}
          </p>
        </div>
      )}

      {isSignUp && (
        // The notice sits above the button, at the point of collection, because
        // that is where the DPDP Act expects it — not behind a link in a footer.
        <div className="border-border bg-secondary/50 border p-4">
          <p className="text-foreground text-xs leading-5">{noticeSummary}</p>
          <p className="text-muted-foreground mt-2 text-xs leading-5">
            You&rsquo;ll choose what to publish and what to hear about on the
            next screen. Creating an account means you agree to us storing your
            name and email to run it.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="text-destructive text-sm leading-6">
          {error.text}{" "}
          {error.offerSignIn && (
            <Link
              href={alternateHref}
              className="text-foreground underline underline-offset-4"
            >
              Sign in instead
            </Link>
          )}
          {error.offerSignUp && (
            <Link
              href={alternateHref}
              className="text-foreground underline underline-offset-4"
            >
              Create one
            </Link>
          )}
        </p>
      )}

      <button
        className="bg-foreground mt-1 inline-flex h-12 items-center justify-center px-5 text-sm font-medium text-white transition-colors hover:bg-[#2b3245] disabled:opacity-60"
        disabled={isPending}
      >
        {pendingMethod === "email"
          ? "One moment…"
          : isSignUp
            ? "Create my account"
            : "Sign in"}
      </button>

      {isSignUp && (
        <ul className="text-muted-foreground mt-1 flex flex-col gap-1.5 text-xs">
          {[
            "Your contact details are never shown to buyers.",
            "You can delete your account and data at any time.",
          ].map((line) => (
            <li key={line} className="flex items-start gap-2">
              <Check className="text-foreground mt-0.5 size-3 shrink-0" aria-hidden />
              {line}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
