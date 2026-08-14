/** CSS-defined rooms keep the preview lightweight and keep the artwork central. */
export interface Room {
  id: string;
  label: string;
  eyebrow: string;
  caption: string;
  detail: string;
  wall: string;
  floor: string;
  light: string;
  accent: string;
  frame: "thin-dark" | "wide-light" | "none";
}

export const rooms: readonly Room[] = [
  {
    id: "gallery",
    label: "Gallery",
    eyebrow: "The white cube",
    caption: "A considered, day-lit gallery wall.",
    detail: "Clean light · quiet attention",
    wall: "linear-gradient(180deg, #ffffff 0%, #e6e6e6 100%)",
    floor: "linear-gradient(180deg, #d4d4d4 0%, #8a8a8a 100%)",
    light:
      "radial-gradient(58% 46% at 50% 6%, rgb(255 255 255 / 0.95), transparent 72%)",
    accent: "#0f0f0f",
    frame: "thin-dark",
  },
  {
    id: "museum",
    label: "Museum",
    eyebrow: "The long view",
    caption: "A deep museum hall with focused light.",
    detail: "Dramatic light · lasting presence",
    wall: "linear-gradient(180deg, #3d3d3d 0%, #0f0f0f 100%)",
    floor: "linear-gradient(180deg, #0f0f0f 0%, #0f0f0f 100%)",
    light:
      "radial-gradient(52% 42% at 50% 8%, rgb(255 231 187 / 0.4), transparent 74%)",
    accent: "#8a8a8a",
    frame: "wide-light",
  },
  {
    id: "hotel",
    label: "Virtual 3D room",
    eyebrow: "Coming soon",
    caption: "A first look at ArtWall's immersive virtual exhibition.",
    detail: "Walk-through preview · coming soon",
    wall: "linear-gradient(180deg, #f7f7f7 0%, #e6e6e6 100%)",
    floor: "linear-gradient(180deg, #8a8a8a 0%, #5a5a5a 100%)",
    light:
      "radial-gradient(58% 48% at 50% 8%, rgb(255 255 255 / 0.96), transparent 74%)",
    accent: "#0f0f0f",
    frame: "thin-dark",
  },
  {
    id: "cafe",
    label: "Café",
    eyebrow: "The everyday wall",
    caption: "An afternoon wall made for discovery.",
    detail: "Human scale · warm encounter",
    wall: "linear-gradient(180deg, #f0f0f0 0%, #8a8a8a 100%)",
    floor: "linear-gradient(180deg, #8a8a8a 0%, #3d3d3d 100%)",
    light:
      "radial-gradient(68% 56% at 32% 10%, rgb(255 242 214 / 0.7), transparent 72%)",
    accent: "#b23c3c",
    frame: "thin-dark",
  },
  {
    id: "home",
    label: "Home",
    eyebrow: "The intimate room",
    caption: "A quiet home, made personal by the work.",
    detail: "Soft morning · lived-in calm",
    wall: "linear-gradient(180deg, #f7f7f7 0%, #d4d4d4 100%)",
    floor: "linear-gradient(180deg, #d4d4d4 0%, #8a8a8a 100%)",
    light:
      "radial-gradient(60% 54% at 72% 7%, rgb(255 251 240 / 0.86), transparent 72%)",
    accent: "#0f0f0f",
    frame: "none",
  },
];
