export type ArchetypeId =
  "keeper" | "wanderer" | "alchemist" | "storyteller" | "quiet-eye" | "builder";

interface VisualDna {
  label: string;
  value: string;
}

interface ArtworkReference {
  artist: string;
  artwork: string;
  note: string;
}

export interface Archetype {
  id: ArchetypeId;
  name: string;
  line: string;
  body: string;
  visualInstinct: string;
  traits: readonly string[];
  visualDna: readonly VisualDna[];
  /** Invitations to look further, not claims of affiliation or recommendation. */
  artworks: readonly ArtworkReference[];
}

/**
 * Six visual instincts. Results describe an eye, not a diagnosis: they are a
 * doorway into artists and works a visitor may want to spend time with next.
 */
export const archetypes: Record<ArchetypeId, Archetype> = {
  keeper: {
    id: "keeper",
    name: "The Keeper",
    line: "You recognise the future in what has been carefully carried forward.",
    body: "Your eye notices lineage: a motif repeated by hand, a colour held across generations, the evidence of a maker who knew where they came from. You are drawn to work with memory in its grain, and to the quiet freedom that comes from treating inheritance as a living material.",
    visualInstinct:
      "You look for the hand behind the tradition — and the new mark it dares to make.",
    traits: ["Lineage-aware", "Tactile", "Ritual-minded", "Patient looking"],
    visualDna: [
      { label: "Memory", value: "Deeply rooted" },
      { label: "Material", value: "Handmade" },
      { label: "Composition", value: "Ornamental rhythm" },
    ],
    artworks: [
      {
        artist: "Jivya Soma Mashe",
        artwork: "Warli paintings",
        note: "Ritual, rhythm, living line",
      },
      {
        artist: "B. Prabha",
        artwork: "Woman with birds",
        note: "Grace carried through colour",
      },
      {
        artist: "Madhvi Parekh",
        artwork: "Narrative paintings",
        note: "Folklore made personal",
      },
    ],
  },
  wanderer: {
    id: "wanderer",
    name: "The Wanderer",
    line: "The world keeps giving you images before you have names for them.",
    body: "Place is your material: a particular weather, a face on a train, the colour of a wall at four in the afternoon. Your eye follows the living edge of things. You are drawn to work that still carries the time and air in which it was made.",
    visualInstinct:
      "You trust the encounter — the image that arrives before the explanation.",
    traits: ["Observant", "Place-led", "Open to accident", "Light-sensitive"],
    visualDna: [
      { label: "Memory", value: "In transit" },
      { label: "Material", value: "Immediate" },
      { label: "Composition", value: "Found in passing" },
    ],
    artworks: [
      {
        artist: "Raghubir Singh",
        artwork: "Bombay and Calcutta photographs",
        note: "Colour in motion",
      },
      {
        artist: "Atul Dodiya",
        artwork: "Mumbai watercolours",
        note: "A city held lightly",
      },
      {
        artist: "Amitava Das",
        artwork: "Travel sketchbooks",
        note: "The lived-in view",
      },
    ],
  },
  alchemist: {
    id: "alchemist",
    name: "The Alchemist",
    line: "For you, matter is never only matter — it is a way of thinking.",
    body: "You follow a surface until it tells you what it can become. Pigment, metal, fibre, ash, paper: the material is not a vehicle for the idea but an equal author of it. Your eye stays with the evidence of process, where transformation is still visible.",
    visualInstinct:
      "You look for the moment a material begins to speak in its own voice.",
    traits: ["Process-led", "Sensory", "Experimental", "Craft-attentive"],
    visualDna: [
      { label: "Memory", value: "Embedded in matter" },
      { label: "Material", value: "Transformative" },
      { label: "Composition", value: "Layered" },
    ],
    artworks: [
      {
        artist: "Mrinalini Mukherjee",
        artwork: "Fibre sculptures",
        note: "Rope becoming presence",
      },
      {
        artist: "Sheela Gowda",
        artwork: "Material installations",
        note: "Labour made visible",
      },
      {
        artist: "N. S. Harsha",
        artwork: "Pigment and surface works",
        note: "Matter as meditation",
      },
    ],
  },
  storyteller: {
    id: "storyteller",
    name: "The Storyteller",
    line: "You find the whole human story inside a held gesture.",
    body: "You are drawn to images with a before and an after: a figure waiting, a room that knows something, a detail that invites the viewer to finish the scene. Your eye reads art as a generous exchange between the maker, the subject and the person who stays long enough to look.",
    visualInstinct:
      "You notice what an image is about to say, then make room for it to say less.",
    traits: ["Narrative-led", "Human", "Emotionally precise", "Gesture-aware"],
    visualDna: [
      { label: "Memory", value: "Story-shaped" },
      { label: "Material", value: "Expressive" },
      { label: "Composition", value: "Cinematic" },
    ],
    artworks: [
      {
        artist: "Amrita Sher-Gil",
        artwork: "Three Girls",
        note: "A pause full of interior life",
      },
      {
        artist: "Arpita Singh",
        artwork: "Figurative paintings",
        note: "Tenderness with a sharp edge",
      },
      {
        artist: "Sudhir Patwardhan",
        artwork: "Urban figures",
        note: "The drama of ordinary life",
      },
    ],
  },
  "quiet-eye": {
    id: "quiet-eye",
    name: "The Quiet Eye",
    line: "You know that the most lasting images often arrive without insisting.",
    body: "Restraint is what pulls you close: one tone, one gesture, a great deal of held space. You are drawn to work that asks for a little patience, then gives more back on a second look. Your eye knows the difference between emptiness and room to breathe.",
    visualInstinct: "You let silence do some of the looking.",
    traits: ["Contemplative", "Edit-minded", "Space-aware", "Slow to settle"],
    visualDna: [
      { label: "Memory", value: "Quietly held" },
      { label: "Material", value: "Spare" },
      { label: "Composition", value: "Breathing room" },
    ],
    artworks: [
      {
        artist: "Nasreen Mohamedi",
        artwork: "Untitled drawings",
        note: "Precision without noise",
      },
      {
        artist: "Zarina",
        artwork: "Home Is a Foreign Place",
        note: "A spare map of belonging",
      },
      {
        artist: "V. S. Gaitonde",
        artwork: "Untitled abstractions",
        note: "A field to remain with",
      },
    ],
  },
  builder: {
    id: "builder",
    name: "The Builder",
    line: "You feel the architecture beneath an image before you name its subject.",
    body: "Structure gives you pleasure: a grid that holds, a proportion that settles, a repetition with one deliberate interruption. You are drawn to work whose bones reward long looking — where craft and instinct have reached an exact, generous agreement.",
    visualInstinct:
      "You see the decisions that let a work stand quietly on its own.",
    traits: ["Structural", "Exacting", "Pattern-aware", "Composition-led"],
    visualDna: [
      { label: "Memory", value: "Ordered" },
      { label: "Material", value: "Constructed" },
      { label: "Composition", value: "Measured rhythm" },
    ],
    artworks: [
      {
        artist: "S. H. Raza",
        artwork: "Bindu paintings",
        note: "A universe held by form",
      },
      {
        artist: "G. R. Santosh",
        artwork: "Tantric abstractions",
        note: "Geometry with charge",
      },
      {
        artist: "Biren De",
        artwork: "Light forms",
        note: "Structure becoming radiance",
      },
    ],
  },
};
