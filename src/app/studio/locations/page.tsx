import {
  StudioNotAvailable,
  StudioPageHeader,
} from "@/components/dashboard/studio-shell";

export default function LocationsPage() {
  return (
    <div className="flex flex-col gap-8">
      <StudioPageHeader
        eyebrow="Operations"
        title="Locations"
        description="Know where every work is, whether it is in the studio, a gallery, or a collector's home."
      />
      <StudioNotAvailable what="Location tracking" />
    </div>
  );
}
