import type { Metadata } from "next";

import { SurveyForm } from "@/features/survey/survey-form";
import { countSurveyResponses } from "@/features/survey/store";
import { Container, Eyebrow } from "@/shared/editorial";

export const metadata: Metadata = {
  title: "The Survey",
  description:
    "Which of the twenty-four failures in India's art economy have you lived through? Two minutes, no account needed.",
  alternates: { canonical: "/survey" },
};

/**
 * The pain-point survey.
 *
 * Async Server Component: the response count is read live so the page can say
 * how many people have already answered, and the form is the only client
 * island. No account required - see the note in the action.
 */
export default async function SurveyPage() {
  const answered = await countSurveyResponses();

  return (
    <>
      <section className="pt-32 pb-16 sm:pt-40 sm:pb-20 lg:pt-48 lg:pb-24">
        <div className="max-w-text mx-auto px-5 sm:px-8 lg:px-16">
          <Eyebrow>The Survey</Eyebrow>
          <h1 className="font-heading text-display mt-8 max-w-[18ch] text-balance">
            Tell us what is actually broken.
          </h1>
          <p className="text-muted-foreground text-lead mt-6 max-w-2xl">
            We have written down twenty-four ways India&apos;s art economy fails
            the people inside it. We would rather hear which ones are real for
            you than guess. Two minutes, and you do not need an account.
          </p>
          {answered > 0 && (
            <p className="text-muted-foreground border-border mt-8 border-t pt-5 text-sm tabular-nums">
              {answered.toLocaleString("en-IN")}{" "}
              {answered === 1 ? "person has" : "people have"} answered so far.
            </p>
          )}
        </div>
      </section>

      <div className="border-border border-t py-20 sm:py-24 lg:py-32">
        <Container size="text">
          <SurveyForm />
        </Container>
      </div>
    </>
  );
}
