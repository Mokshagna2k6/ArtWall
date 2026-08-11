"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

type AuthMode = "sign-in" | "sign-up";
type PendingMethod = "email" | "google" | null;

function destinationFor(callbackUrl?: string) {
  return callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//")
    ? callbackUrl
    : "/studio";
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
}: {
  mode: AuthMode;
  callbackUrl?: string;
  googleEnabled: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pendingMethod, setPendingMethod] = useState<PendingMethod>(null);
  const [showPassword, setShowPassword] = useState(false);
  const destination =
    mode === "sign-up" ? "/studio/onboarding" : destinationFor(callbackUrl);
  const isPending = pendingMethod !== null;

  async function submit(formData: FormData) {
    setPendingMethod("email");
    setError("");

    try {
      const email = String(formData.get("email") ?? "");
      const password = String(formData.get("password") ?? "");
      const name = String(formData.get("name") ?? "");
      const result =
        mode === "sign-up"
          ? await authClient.signUp.email({ email, password, name })
          : await authClient.signIn.email({ email, password });

      if (result.error) {
        setError(
          result.error.message ?? "We could not continue. Please try again."
        );
        return;
      }

      router.replace(destination);
      router.refresh();
    } catch {
      setError("We could not reach ArtWall Studio. Please try again.");
    } finally {
      setPendingMethod(null);
    }
  }

  async function signInWithGoogle() {
    if (!googleEnabled || isPending) return;

    setPendingMethod("google");
    setError("");

    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: destination,
      });

      if (result.error) {
        setError(
          result.error.message ?? "Google could not continue. Please try again."
        );
      }
    } catch {
      setError("Google could not continue. Please try again.");
    } finally {
      setPendingMethod(null);
    }
  }

  return (
    <form
      action={submit}
      className="border-studio-border bg-studio-surface shadow-soft flex w-full flex-col gap-4 border p-5 sm:p-6"
    >
      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={!googleEnabled || isPending}
        aria-describedby={!googleEnabled ? "google-unavailable" : undefined}
        className="border-studio-border text-studio-ink hover:border-studio-accent inline-flex h-12 items-center justify-center gap-3 border px-4 text-sm font-medium transition-[border-color,background-color] hover:bg-[#fbf3ea] disabled:cursor-not-allowed disabled:opacity-55"
      >
        <GoogleMark />
        {pendingMethod === "google"
          ? "Taking you to Google…"
          : "Continue with Google"}
      </button>
      {!googleEnabled && (
        <p
          id="google-unavailable"
          className="text-studio-muted -mt-2 text-center text-xs"
        >
          Google sign-in is being connected for this environment.
        </p>
      )}

      <div className="flex items-center gap-3" aria-hidden>
        <span className="border-studio-border h-px flex-1 border-t" />
        <span className="text-studio-muted text-[0.68rem] tracking-[0.14em] uppercase">
          or continue with email
        </span>
        <span className="border-studio-border h-px flex-1 border-t" />
      </div>

      {mode === "sign-up" && (
        <label className="text-studio-ink flex flex-col gap-2 text-sm">
          Your name
          <input
            className="studio-input"
            name="name"
            autoComplete="name"
            placeholder="How should we know you?"
            disabled={isPending}
            required
          />
        </label>
      )}
      <label className="text-studio-ink flex flex-col gap-2 text-sm">
        Email address
        <input
          className="studio-input"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          disabled={isPending}
          required
        />
      </label>
      <label className="text-studio-ink flex flex-col gap-2 text-sm">
        Password
        <span className="relative">
          <input
            className="studio-input w-full pr-12"
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete={
              mode === "sign-up" ? "new-password" : "current-password"
            }
            minLength={8}
            placeholder="At least 8 characters"
            disabled={isPending}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="text-studio-muted hover:text-studio-ink absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center"
          >
            {showPassword ? (
              <EyeOff className="size-4" aria-hidden />
            ) : (
              <Eye className="size-4" aria-hidden />
            )}
          </button>
        </span>
      </label>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <button className="studio-button mt-1 h-12" disabled={isPending}>
        {pendingMethod === "email"
          ? "Preparing your studio…"
          : mode === "sign-up"
            ? "Create your studio"
            : "Enter ArtWall Studio"}
      </button>
      <p className="text-studio-muted mt-1 text-center text-xs leading-5">
        Your work and account stay yours. ArtWall does not publish anything
        without your permission.
      </p>
    </form>
  );
}
