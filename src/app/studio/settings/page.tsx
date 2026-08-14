import { getStudioArtistProfile } from "@/app/actions/artist-profile";
import { ArtistProfileForm } from "@/components/dashboard/artist-profile-form";
import { StudioPageHeader } from "@/components/dashboard/studio-shell";

export default async function SettingsPage() {
  const profile = await getStudioArtistProfile();
  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Public profile"
        title="Your ArtWall profile"
        description="Edit the identity visitors see, then choose exactly when to make it public."
      />
      <ArtistProfileForm profile={profile} />
    </div>
  );
}
