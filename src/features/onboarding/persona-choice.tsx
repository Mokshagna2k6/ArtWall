"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { destinationFor } from "@/app/welcome/page";
import { setOnboardingPersona, type OnboardingPersona } from "@/features/onboarding/actions";

const OPTIONS: { persona: OnboardingPersona; title: string; body: string }[] = [
  {
    persona: "artist",
    title: "I'm an artist",
    body: "I want to show and sell my work.",
  },
  {
    persona: "curator",
    title: "I'm a curator",
    body: "I want to curate collections of others' work.",
  },
  {
    persona: "buyer",
    title: "I'm here to browse and collect",
    body: "I'm a buyer.",
  },
];

export function PersonaChoice() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState<OnboardingPersona | null>(null);
  const [error, setError] = useState<string | null>(null);

  function choose(persona: OnboardingPersona) {
    if (pending) return;
    setChosen(persona);
    setError(null);
    start(async () => {
      const result = await setOnboardingPersona({ persona });
      if (!result.ok) {
        setError(result.error);
        setChosen(null);
        return;
      }
      router.replace(destinationFor(result.data));
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {OPTIONS.map((option) => (
        <button
          key={option.persona}
          type="button"
          onClick={() => choose(option.persona)}
          disabled={pending}
          className="border-border hover:border-foreground hover:bg-secondary flex flex-col gap-1 border bg-white p-5 text-left transition-[border-color,background-color] disabled:cursor-not-allowed disabled:opacity-55"
        >
          <span className="text-foreground text-sm font-medium">
            {pending && chosen === option.persona ? "One moment…" : option.title}
          </span>
          <span className="text-muted-foreground text-xs">{option.body}</span>
        </button>
      ))}
      {error && (
        <p role="alert" className="text-destructive text-sm leading-6">
          {error}
        </p>
      )}
    </div>
  );
}
