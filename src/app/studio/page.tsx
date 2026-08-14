import { ArrowUpRight, Plus, Send, Sparkles } from "lucide-react";
import { redirect } from "next/navigation";

import { getStudioArtistProfile } from "@/app/actions/artist-profile";
import { getArtworks } from "@/app/actions/artworks";
import {
  StudioButton,
  StudioEmptyState,
  StudioMetric,
  StudioPageHeader,
} from "@/components/dashboard/studio-shell";

export default async function StudioOverviewPage() {
  const [profile, artworks] = await Promise.all([
    getStudioArtistProfile(),
    getArtworks(),
  ]);
  if (!profile.onboardingCompleted) redirect("/studio/onboarding");

  const available = artworks.filter(
    (artwork) => artwork.status === "available"
  ).length;
  const publicWorks = artworks.filter((artwork) => artwork.isPublic).length;
  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Your ArtWall Studio"
        title={`Welcome back, ${profile.displayName.split(" ")[0]}.`}
        description={
          profile.published
            ? "Your public profile is live. Keep building the catalogue behind it."
            : "Your profile is private until you decide it is ready for the ArtWall community."
        }
        action={
          profile.published ? (
            <StudioButton href={`/artist/${profile.handle}`}>
              View profile <ArrowUpRight data-icon="inline-end" />
            </StudioButton>
          ) : (
            <StudioButton href="/studio/settings">
              <Send data-icon="inline-start" />
              Publish profile
            </StudioButton>
          )
        }
      />
      <section
        aria-label="Studio summary"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StudioMetric
          label="Catalogue"
          value={`${artworks.length} ${artworks.length === 1 ? "work" : "works"}`}
          detail="Your living archive"
        />
        <StudioMetric
          label="Available"
          value={String(available)}
          detail="Works marked available"
        />
        <StudioMetric
          label="Public works"
          value={String(publicWorks)}
          detail="Ready for your profile"
        />
        <StudioMetric
          label="Profile"
          value={profile.published ? "Live" : "Private"}
          detail={
            profile.published ? "Visible on ArtWall" : "Only you can see it"
          }
        />
      </section>
      <section className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="studio-card p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="studio-eyebrow">Your archive</p>
              <h2 className="text-studio-ink text-subsection mt-2">
                {artworks.length
                  ? "Keep the record growing"
                  : "Make the first mark"}
              </h2>
            </div>
            <Sparkles className="text-studio-accent" aria-hidden />
          </div>
          {artworks.length === 0 ? (
            <StudioEmptyState
              title="No artworks yet"
              description="Add a work to begin building the living record of your practice: image, materials, dimensions, and story."
              action={
                <StudioButton href="/studio/artworks/new">
                  Add your first artwork <ArrowUpRight data-icon="inline-end" />
                </StudioButton>
              }
            />
          ) : (
            <div className="border-studio-border bg-studio-bg mt-6 flex items-center justify-between rounded-xl border p-5">
              <div>
                <p className="text-studio-ink font-medium">
                  Your catalogue has room to breathe.
                </p>
                <p className="text-studio-muted mt-1 text-sm">
                  Add the next work or refine how the public profile tells your
                  story.
                </p>
              </div>
              <StudioButton href="/studio/artworks/new">
                <Plus data-icon="inline-start" />
                Add work
              </StudioButton>
            </div>
          )}
        </div>
        <div className="studio-card p-6 md:p-8">
          <p className="studio-eyebrow">Public profile</p>
          <h2 className="text-studio-ink text-subsection mt-2">
            {profile.published ? "On the wall" : "Almost there"}
          </h2>
          <p className="text-studio-muted mt-3 text-sm leading-6">
            {profile.published
              ? `Visitors can find your practice at artwall.in/artist/${profile.handle}.`
              : "Complete the profile, choose the works to show, then publish only when it feels right."}
          </p>
          <div className="mt-6">
            <StudioButton href="/studio/settings">
              {profile.published ? "Edit public profile" : "Prepare profile"}{" "}
              <ArrowUpRight data-icon="inline-end" />
            </StudioButton>
          </div>
        </div>
      </section>
    </div>
  );
}
