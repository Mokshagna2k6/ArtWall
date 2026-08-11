import type { Metadata } from "next";

import { ArchetypeQuiz } from "@/features/archetype/archetype-quiz";
import { SectionHeading } from "@/shared/section-heading";

export const metadata: Metadata = {
  title: "Artist Archetype",
  description:
    "Five questions about what you notice, not what you think of yourself. Find the artist you already are.",
};

export default function ArchetypePage() {
  return (
    <section className="section-y max-w-wall mx-auto px-5 md:px-12 lg:px-16">
      <SectionHeading
        eyebrow="Archetype"
        title="Discover how your eye sees."
        description="Five quiet encounters with observation, texture, space, memory and light. There are no right answers, and nothing is saved."
      />

      <div className="mt-12 max-w-3xl">
        <ArchetypeQuiz />
      </div>
    </section>
  );
}
