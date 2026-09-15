import { getStudioArtistProfile } from "@/app/actions/artist-profile";
import { ArtistProfileForm } from "@/components/dashboard/artist-profile-form";
import { StudioPageHeader } from "@/components/dashboard/studio-shell";

export default async function SettingsPage() {
  const profile = await getStudioArtistProfile();
  const wallet = (profile as { walletAddress?: string | null }).walletAddress;
  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Public profile"
        title="Your ArtWall profile"
        description="Edit the identity visitors see, then choose exactly when to make it public."
      />
      <ArtistProfileForm profile={profile} />

      <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold">Blockchain wallet</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Your on-chain wallet is created automatically when COA minting is
          configured. Used for royalty payments and provenance.
        </p>
        <div className="mt-4 rounded-lg bg-zinc-50 px-4 py-3 font-mono text-sm dark:bg-zinc-800">
          {wallet ? (
            <span title={wallet}>
              {wallet.slice(0, 6)}...{wallet.slice(-4)}
            </span>
          ) : (
            <span className="text-zinc-400">Not provisioned yet</span>
          )}
        </div>
      </section>
    </div>
  );
}
