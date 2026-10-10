import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { team } from "@/config/content";
import { siteConfig } from "@/config/site";
import { Container, Eyebrow, Section } from "@/shared/editorial";

export const metadata: Metadata = {
  title: "Team",
  description:
    "The people building ArtWall: law and regulatory, AI and ML engineering, art community, and operations.",
  alternates: { canonical: "/team" },
};

/**
 * Team.
 *
 * The same roster the About page summarises, given the room to be read
 * properly: one person per row, portrait where we have one and initials where
 * we do not, so a missing photograph never leaves a hole in the grid.
 */
export default function TeamPage() {
  return (
    <>
      <section className="pt-32 pb-16 sm:pt-40 sm:pb-20 lg:pt-48 lg:pb-24">
        <div className="max-w-page mx-auto px-5 sm:px-8 lg:px-16">
          <Eyebrow>Team</Eyebrow>
          <h1 className="font-heading text-display mt-8 max-w-[18ch] text-balance">
            The people building ArtWall.
          </h1>
          <p className="text-muted-foreground text-lead mt-6 max-w-2xl">
            Indian law and regulatory practice, AI and ML engineering, art
            community building, and startup operations. Four people, one wall.
          </p>
        </div>
      </section>

      <Section id="people">
        <Eyebrow index="01">Who we are</Eyebrow>
        <ul className="border-border mt-12 border-t">
          {team.map((member) => (
            <li
              key={member.name}
              className="border-border grid gap-6 border-b py-10 lg:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-10"
            >
              {"photo" in member && member.photo ? (
                <Image
                  src={member.photo}
                  alt=""
                  width={128}
                  height={160}
                  className="border-border size-32 border object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  className="border-border text-muted-foreground flex size-32 items-center justify-center border text-lg font-medium"
                >
                  {member.initials}
                </span>
              )}
              <div>
                <h2 className="font-heading text-card">{member.name}</h2>
                <p className="text-muted-foreground text-eyebrow mt-1.5">
                  {member.role}
                </p>
              </div>
              <p className="text-muted-foreground leading-7">{member.bio}</p>
            </li>
          ))}
        </ul>
      </Section>

      <div className="border-border border-t">
        <Container>
          <div className="flex flex-col gap-6 py-16 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground max-w-xl text-sm leading-7">
              {siteConfig.legalName}. {siteConfig.credentials.recognition}.{" "}
              {siteConfig.credentials.origin}.
            </p>
            <Link
              href="/contact"
              className="bg-foreground inline-flex h-11 shrink-0 items-center px-5 text-sm font-medium text-white transition-colors hover:bg-[#2b3245]"
            >
              Contact the team
            </Link>
          </div>
        </Container>
      </div>
    </>
  );
}
