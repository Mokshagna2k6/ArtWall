import { getStudioArtistProfile } from "@/app/actions/artist-profile";
import { ArtistProfileForm } from "@/components/dashboard/artist-profile-form";
import { StudioPageHeader } from "@/components/dashboard/studio-shell";

export default async function StudioOnboardingPage() {
  const profile = await getStudioArtistProfile();
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <StudioPageHeader
        eyebrow="Welcome to ArtWall Studio"
        title="Give your practice a public home"
        description="These details create your private Studio identity now and your ArtWall profile when you choose to publish. You can change every public detail later."
      />
      <ArtistProfileForm profile={profile} onboarding />
    </div>
  );
}
