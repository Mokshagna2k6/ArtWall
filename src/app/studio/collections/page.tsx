import {
  ArrowUpRight,
  FolderKanban,
  MapPin,
  Plus,
  Sparkles,
} from "lucide-react";

import {
  StudioButton,
  StudioPageHeader,
} from "@/components/dashboard/studio-shell";

const modules = [
  {
    title: "Collections",
    description: "Group works into bodies, seasons, or stories.",
    icon: FolderKanban,
  },
  {
    title: "Exhibitions",
    description: "Keep upcoming shows, applications, and checklists together.",
    icon: Sparkles,
  },
  {
    title: "Locations",
    description: "Know where every work is, from the studio to the wall.",
    icon: MapPin,
  },
];

import { getCollections } from "@/app/actions/organization";

export default async function CollectionsPage() {
  const collections = await getCollections();
  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Organization"
        title="Collections & places"
        description="Give your catalogue structure without forcing your practice into a template."
        action={
          <StudioButton>
            <Plus data-icon="inline-start" />
            Create collection
          </StudioButton>
        }
      />
      {collections.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3">
          {collections.map((collection) => (
            <article
              key={collection.id}
              className="studio-card flex min-h-40 flex-col p-6"
            >
              <p className="studio-eyebrow">Collection</p>
              <h2 className="text-studio-ink text-card mt-auto">
                {collection.name}
              </h2>
              <p className="text-studio-muted mt-2 text-sm leading-6">
                {collection.description ?? "No description yet"}
              </p>
            </article>
          ))}
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {modules.map(({ title, description, icon: Icon }) => (
          <article
            key={title}
            className="studio-card flex min-h-56 flex-col p-6"
          >
            <Icon className="text-studio-accent" aria-hidden />
            <h2 className="text-studio-ink text-card mt-auto">{title}</h2>
            <p className="text-studio-muted mt-2 text-sm leading-6">
              {description}
            </p>
            <button className="text-studio-ink mt-5 flex items-center gap-2 text-sm font-medium">
              Open module <ArrowUpRight aria-hidden />
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
