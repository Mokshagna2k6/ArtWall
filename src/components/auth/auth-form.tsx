"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(formData: FormData) {
    setPending(true); setError("");
    const email = String(formData.get("email") ?? ""); const password = String(formData.get("password") ?? ""); const name = String(formData.get("name") ?? "");
    const result = mode === "sign-up" ? await authClient.signUp.email({ email, password, name }) : await authClient.signIn.email({ email, password });
    setPending(false);
    if (result.error) { setError(result.error.message ?? "Unable to continue"); return; }
    router.push("/studio"); router.refresh();
  }
  return <form action={submit} className="mx-auto flex w-full max-w-md flex-col gap-5 border border-studio-border bg-studio-surface p-7">
    {mode === "sign-up" && <label className="flex flex-col gap-2 text-sm">Name<input className="studio-input" name="name" required /></label>}
    <label className="flex flex-col gap-2 text-sm">Email<input className="studio-input" type="email" name="email" required /></label>
    <label className="flex flex-col gap-2 text-sm">Password<input className="studio-input" type="password" name="password" minLength={8} required /></label>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <button className="studio-button" disabled={pending}>{pending ? "Working…" : mode === "sign-up" ? "Create studio" : "Sign in"}</button>
  </form>;
}
