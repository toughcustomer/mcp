// Hardcoded list of roleplay voices.
//
// Per docs/SALESFORCE_OBJECTS.md: voices are NOT a Salesforce custom object.
// They're the underlying realtime-API provider's catalog. When the provider
// updates its catalog, update this array.
//
// This list is the **Gemini Live** voice catalog (used as the
// `prebuiltVoiceConfig.voiceName` value in the Live API session config).
// Voice names are PascalCase and case-sensitive — they're passed verbatim
// to the API. If a voice name is rejected, check the model card; newer
// 2.5+ models add voices that older models don't accept.
//
// If a future requirement makes voices admin-curatable per org, the right
// home is a CMDT (Voice__mdt), not a regular custom object — voices are
// metadata, not data.

import type { Voice } from "./tc-service";

// Female voices.
const FEMALE: Voice[] = [
  { id: "Zephyr",        name: "Zephyr",        gender: "female", description: "Energetic and bright" },
  { id: "Kore",          name: "Kore",          gender: "female", description: "Clear, firm, and direct" },
  { id: "Sulafat",       name: "Sulafat",       gender: "female", description: "Soft, warm, and gentle" },
  { id: "Vindemiatrix",  name: "Vindemiatrix",  gender: "female", description: "Calm, mid-range, and steady" },
  { id: "Aoede",         name: "Aoede",         gender: "female", description: "Warm, bright, and confident" },
  { id: "Leda",          name: "Leda",          gender: "female", description: "Composed and professional" },
  { id: "Callirrhoe",    name: "Callirrhoe",    gender: "female", description: "Poised, smooth, and clear" },
  { id: "Autonoe",       name: "Autonoe",       gender: "female", description: "Bright and expressive" },
  { id: "Despina",       name: "Despina",       gender: "female", description: "Smooth, warm, and measured" },
  { id: "Erinome",       name: "Erinome",       gender: "female", description: "Clear and balanced" },
  { id: "Algenib",       name: "Algenib",       gender: "female", description: "Warm, confident, and grounded" },
  { id: "Laomedeia",     name: "Laomedeia",     gender: "female", description: "Clear and conversational" },
  { id: "Achernar",      name: "Achernar",      gender: "female", description: "Soft and articulate" },
  { id: "Pulcherrima",   name: "Pulcherrima",   gender: "female", description: "Bright and energetic" },
  { id: "Achird",        name: "Achird",        gender: "female", description: "Youthful, mid-to-high pitched" },
  { id: "Umbriel",       name: "Umbriel",       gender: "female", description: "Calm, mature, and steady" },
];

// Male voices.
const MALE: Voice[] = [
  { id: "Puck",          name: "Puck",          gender: "male",   description: "Playful, light, and quick" },
  { id: "Charon",        name: "Charon",        gender: "male",   description: "Deep, resonant, and steady" },
  { id: "Fenrir",        name: "Fenrir",        gender: "male",   description: "Bold, commanding, and deep" },
  { id: "Orus",          name: "Orus",          gender: "male",   description: "Mature, composed, and smooth" },
  { id: "Enceladus",     name: "Enceladus",     gender: "male",   description: "Breathy and intimate" },
  { id: "Iapetus",       name: "Iapetus",       gender: "male",   description: "Friendly and mid-pitched" },
  { id: "Nova",          name: "Nova",          gender: "male",   description: "Calm and mid-range" },
  { id: "Algieba",       name: "Algieba",       gender: "male",   description: "Warm and authoritative" },
  { id: "Rasalgethi",    name: "Rasalgethi",    gender: "male",   description: "Conversational and approachable" },
  { id: "Alnilam",       name: "Alnilam",       gender: "male",   description: "Firm, clear, and deliberate" },
  { id: "Schedar",       name: "Schedar",       gender: "male",   description: "Friendly and mid-pitched" },
  { id: "Gacrux",        name: "Gacrux",        gender: "male",   description: "Smooth and confident" },
  { id: "Zubenelgenubi", name: "Zubenelgenubi", gender: "male",   description: "Deep and resonant" },
  { id: "Sadachbia",     name: "Sadachbia",     gender: "male",   description: "Deeper and measured" },
  { id: "Sadaltager",    name: "Sadaltager",    gender: "male",   description: "Friendly and enthusiastic" },
];

export const VOICES: Voice[] = [...FEMALE, ...MALE];

export function findVoice(id: string): Voice | undefined {
  // Voice IDs are case-sensitive at the Gemini Live API. Match exact only —
  // don't quietly normalize, so callers see a clean TCNotFoundError when a
  // bad name slips through (e.g. "charon" instead of "Charon").
  return VOICES.find((v) => v.id === id);
}
