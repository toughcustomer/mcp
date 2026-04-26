// Hardcoded list of roleplay voices.
//
// Per docs/SALESFORCE_OBJECTS.md: voices are NOT a Salesforce custom object.
// They're the underlying realtime-API provider's catalog (OpenAI Realtime in
// the existing oppCoach LWC). When the provider updates, update this array.
//
// If a future requirement makes voices admin-curatable per org, the right
// home is a CMDT (Voice__mdt), not a regular custom object — voices are
// metadata, not data.

import type { Voice } from "./tc-service";

// OpenAI Realtime voice catalog. Order chosen to put the most distinctive
// voices first; the descriptions are conservative — voice character can vary
// with prompt and temperature.
export const VOICES: Voice[] = [
  { id: "alloy",   name: "Alloy",   gender: "neutral", description: "Balanced, even-keeled — good default." },
  { id: "ash",     name: "Ash",     gender: "male",    description: "Direct, confident, slightly gruff." },
  { id: "ballad",  name: "Ballad",  gender: "neutral", description: "Warm, storyteller cadence." },
  { id: "coral",   name: "Coral",   gender: "female",  description: "Bright, energetic." },
  { id: "echo",    name: "Echo",    gender: "male",    description: "Steady, measured — executive feel." },
  { id: "sage",    name: "Sage",    gender: "female",  description: "Calm, thoughtful — analytical evaluator." },
  { id: "shimmer", name: "Shimmer", gender: "female",  description: "Crisp, friendly." },
  { id: "verse",   name: "Verse",   gender: "neutral", description: "Melodic, expressive." },
];

export function findVoice(id: string): Voice | undefined {
  return VOICES.find((v) => v.id === id);
}
