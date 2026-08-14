"use client";

import Image from "next/image";
import {
  ExternalLink,
  Globe2,
  MapPin,
  Save,
  Send,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  publishArtistProfile,
  saveArtistProfile,
  unpublishArtistProfile,
} from "@/app/actions/artist-profile";
import { ImageDrop } from "@/features/upload/image-drop";

type ArtistProfile = {
  handle: string;
  displayName: string;
  discipline: string | null;
  location: string | null;
  bio: string | null;
  website: string | null;
  instagram: string | null;
  avatarUrl: string | null;
  published: boolean;
};

export function ArtistProfileForm({
  profile,
  onboarding = false,
}: {
  profile: ArtistProfile;
  onboarding?: boolean;
}) {
  const router = useRouter();
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  async function save(formData: FormData) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await saveArtistProfile({
        displayName: formData.get("displayName"),
        handle: formData.get("handle"),
        discipline: formData.get("discipline"),
        location: formData.get("location"),
        bio: formData.get("bio"),
        website: formData.get("website"),
        instagram: formData.get("instagram"),
        avatarUrl,
      });
      setMessage(
        onboarding
          ? "Your profile is ready. Welcome to Studio."
          : "Profile saved."
      );
      if (onboarding) router.replace("/studio");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "We could not save your profile."
      );
    } finally {
      setSaving(false);
    }
  }

  async function changePublication(next: "publish" | "unpublish") {
    setPublishing(true);
    setError("");
    try {
      if (next === "publish") await publishArtistProfile();
      else await unpublishArtistProfile();
      setMessage(
        next === "publish"
          ? "Your profile is now live on ArtWall."
          : "Your profile is no longer public."
      );
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "We could not update publication."
      );
    } finally {
      setPublishing(false);
    }
  }

  return (
    <form action={save} className="flex flex-col gap-6">
      <section className="studio-card p-6 md:p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="studio-eyebrow">Public identity</p>
            <h2 className="text-studio-ink text-subsection mt-2">
              How visitors meet your practice
            </h2>
            <p className="text-studio-muted mt-2 max-w-2xl text-sm leading-6">
              Your contact email stays private. Only the details below are shown
              when you publish.
            </p>
          </div>
          {profile.published && (
            <Link
              href={`/artist/${profile.handle}`}
              target="_blank"
              className="text-studio-ink inline-flex items-center gap-2 text-sm font-medium underline underline-offset-4"
            >
              View public profile <ExternalLink className="size-4" />
            </Link>
          )}
        </div>

        <div className="mt-7 grid gap-5 md:grid-cols-2">
          <label className="text-studio-ink flex flex-col gap-2 text-sm font-medium">
            Artist name
            <input
              className="studio-input"
              name="displayName"
              defaultValue={profile.displayName}
              autoComplete="name"
              required
            />
          </label>
          <label className="text-studio-ink flex flex-col gap-2 text-sm font-medium">
            ArtWall handle
            <span className="border-studio-border bg-studio-bg focus-within:border-studio-accent flex items-center rounded-xl border">
              <span className="text-studio-muted pl-4 text-sm">
                artwall.in/artist/
              </span>
              <input
                className="text-studio-ink min-w-0 flex-1 bg-transparent px-1 py-[0.85rem] outline-none"
                name="handle"
                defaultValue={profile.handle}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                required
              />
            </span>
            <span className="text-studio-muted text-xs font-normal">
              Lowercase letters, numbers and hyphens only.
            </span>
          </label>
          <label className="text-studio-ink flex flex-col gap-2 text-sm font-medium">
            Practice / discipline
            <input
              className="studio-input"
              name="discipline"
              defaultValue={profile.discipline ?? ""}
              placeholder="Painter, photographer, ceramicist…"
              required
            />
          </label>
          <label className="text-studio-ink flex flex-col gap-2 text-sm font-medium">
            Based in
            <input
              className="studio-input"
              name="location"
              defaultValue={profile.location ?? ""}
              placeholder="Jaipur, Rajasthan"
              required
            />
          </label>
        </div>

        <label className="text-studio-ink mt-5 flex flex-col gap-2 text-sm font-medium">
          Artist statement
          <textarea
            className="studio-input min-h-40 resize-y"
            name="bio"
            defaultValue={profile.bio ?? ""}
            placeholder="Tell visitors about the materials, questions, and places that shape your work."
            required
          />
        </label>
      </section>

      <section className="studio-card p-6 md:p-8">
        <p className="studio-eyebrow">Portrait & links</p>
        <h2 className="text-studio-ink text-subsection mt-2">
          The details around the work
        </h2>
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,.8fr)]">
          <div className="grid gap-5">
            <label className="text-studio-ink flex flex-col gap-2 text-sm font-medium">
              <span className="inline-flex items-center gap-2">
                <Globe2 className="text-studio-accent size-4" />
                Website{" "}
                <span className="text-studio-muted font-normal">
                  (optional)
                </span>
              </span>
              <input
                className="studio-input"
                type="url"
                name="website"
                defaultValue={profile.website ?? ""}
                placeholder="https://your-site.com"
              />
            </label>
            <label className="text-studio-ink flex flex-col gap-2 text-sm font-medium">
              <span className="inline-flex items-center gap-2">
                <UserRound className="text-studio-accent size-4" />
                Instagram{" "}
                <span className="text-studio-muted font-normal">
                  (optional)
                </span>
              </span>
              <input
                className="studio-input"
                name="instagram"
                defaultValue={profile.instagram ?? ""}
                placeholder="yourhandle"
              />
            </label>
            <div className="border-studio-border bg-studio-bg text-studio-muted rounded-xl border border-dashed p-4 text-sm leading-6">
              <MapPin className="text-studio-accent mr-2 inline size-4" />
              Share only the city or region you want the public to see. Your
              address and account email are never displayed.
            </div>
          </div>
          <div className="border-studio-border rounded-xl border p-4">
            {avatarUrl && (
              <div className="mb-4 flex items-center gap-3">
                <div className="relative size-14 shrink-0 overflow-hidden rounded-full">
                  <Image
                    src={avatarUrl}
                    alt="Current artist portrait"
                    fill
                    className="object-cover"
                    sizes="56px"
                  />
                </div>
                <span className="text-studio-muted text-sm">
                  Replace your current portrait below.
                </span>
              </div>
            )}
            <ImageDrop
              kind="selfie"
              label="Artist portrait"
              hint="Optional. JPG, PNG, WebP or AVIF; up to 25 MB."
              onChange={(asset) => setAvatarUrl(asset?.url ?? "")}
            />
          </div>
        </div>
      </section>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-studio-accent text-sm">
          {message}
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button className="studio-button" disabled={saving || publishing}>
          {saving ? (
            "Saving…"
          ) : (
            <>
              <Save className="size-4" />
              {onboarding ? "Finish my profile" : "Save profile"}
            </>
          )}
        </button>
        {!onboarding &&
          (profile.published ? (
            <button
              type="button"
              className="border-studio-border text-studio-ink rounded-xl border px-4 py-3 text-sm font-semibold"
              disabled={saving || publishing}
              onClick={() => void changePublication("unpublish")}
            >
              {publishing ? "Updating…" : "Unpublish profile"}
            </button>
          ) : (
            <button
              type="button"
              className="border-studio-accent text-studio-accent rounded-xl border px-4 py-3 text-sm font-semibold"
              disabled={saving || publishing}
              onClick={() => void changePublication("publish")}
            >
              {publishing ? (
                "Publishing…"
              ) : (
                <>
                  <Send className="mr-2 inline size-4" />
                  Publish to ArtWall
                </>
              )}
            </button>
          ))}
      </div>
    </form>
  );
}
