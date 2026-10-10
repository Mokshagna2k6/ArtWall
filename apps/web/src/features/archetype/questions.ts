import type { ArchetypeId } from "@/features/archetype/archetypes";

export interface Choice {
  text: string;
  archetype: ArchetypeId;
}

export interface Question {
  /** A quiet gallery label that makes each choice feel like a new way of looking. */
  chapter: string;
  moment: string;
  prompt: string;
  choices: readonly Choice[];
}

/**
 * Five small encounters rather than five personality questions. The language
 * gives a visitor room to remember before answering, which makes the journey
 * feel considered without adding form fields or cognitive load.
 */
export const questions: readonly Question[] = [
  {
    chapter: "Notice",
    moment: "Observation",
    prompt: "You walk into an old haveli. What finds you first?",
    choices: [
      {
        text: "The fading frescoes on the courtyard walls",
        archetype: "keeper",
      },
      {
        text: "A narrow staircase I cannot see the end of",
        archetype: "wanderer",
      },
      {
        text: "The smell of old oil lamps and sandalwood",
        archetype: "alchemist",
      },
      { text: "The silence between the rooms", archetype: "quiet-eye" },
    ],
  },
  {
    chapter: "Discover",
    moment: "Texture",
    prompt: "At a conservator's table, your hand pauses over,",
    choices: [
      {
        text: "A repeated hand-painted motif, still perfectly alive",
        archetype: "keeper",
      },
      {
        text: "A surface where pigment, fibre and time have met",
        archetype: "alchemist",
      },
      {
        text: "The measured edge where two materials meet",
        archetype: "builder",
      },
      {
        text: "A small mark that makes the whole image breathe",
        archetype: "quiet-eye",
      },
    ],
  },
  {
    chapter: "Artist",
    moment: "Space",
    prompt: "A gallery room is empty except for one work. You place it,",
    choices: [
      {
        text: "Where the changing daylight can keep finding it",
        archetype: "wanderer",
      },
      {
        text: "In the exact proportion the architecture asks for",
        archetype: "builder",
      },
      {
        text: "At the far end, so the room becomes part of the work",
        archetype: "quiet-eye",
      },
      {
        text: "Near the entrance, where its story can begin immediately",
        archetype: "storyteller",
      },
    ],
  },
  {
    chapter: "Artwork",
    moment: "Memory",
    prompt: "Which image would stay with you on the journey home?",
    choices: [
      {
        text: "A familiar ritual, seen with a new tenderness",
        archetype: "keeper",
      },
      {
        text: "A figure caught just before they turn to speak",
        archetype: "storyteller",
      },
      {
        text: "A place I have never been, but suddenly recognise",
        archetype: "wanderer",
      },
      {
        text: "A material transformed beyond what it first was",
        archetype: "alchemist",
      },
    ],
  },
  {
    chapter: "Wall",
    moment: "Light",
    prompt: "As evening light moves across a wall, you notice,",
    choices: [
      {
        text: "The composition holding steady beneath the shift",
        archetype: "builder",
      },
      {
        text: "A colour becoming a memory of another place",
        archetype: "storyteller",
      },
      {
        text: "The texture changing its voice with every minute",
        archetype: "alchemist",
      },
      {
        text: "The generous space around the work becoming visible",
        archetype: "quiet-eye",
      },
    ],
  },
];
