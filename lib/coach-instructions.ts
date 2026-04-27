// Pure-TS port of oppGraph.js `buildCustomInstructions`.
//
// Takes the structured coach inputs (scenario script, picked contact, opp
// products + competitor, free-text backstory, Big-5 personality dial) and
// returns the merged instruction string an LLM can use as its system
// prompt for the AI buyer in a Tough Customer roleplay.

export interface PersonalityTraits {
  /** 1–5; default 3 (medium). */
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}

export const DEFAULT_PERSONALITY: PersonalityTraits = {
  openness: 3,
  conscientiousness: 3,
  extraversion: 3,
  agreeableness: 3,
  neuroticism: 3,
};

const PERSONALITY_DESCRIPTIONS: Record<keyof PersonalityTraits, string> = {
  openness:
    "Reflects imagination, creativity, curiosity, and a preference for novelty and variety. Individuals high in openness tend to be intellectually curious and open to new experiences.",
  conscientiousness:
    "Denotes a tendency toward organization, dependability, and discipline. Highly conscientious people are often goal-oriented, mindful of details, and reliable.",
  extraversion:
    "Characterized by sociability, assertiveness, and enthusiasm. Extraverts are energized by social interactions and often seek out the company of others.",
  agreeableness:
    "Involves attributes such as trust, altruism, kindness, and affection. Those high in agreeableness are cooperative and compassionate toward others.",
  neuroticism:
    "Indicates emotional instability and a tendency to experience negative emotions like anxiety, anger, or depression. Individuals high in neuroticism may be more prone to stress and emotional reactivity.",
};

function traitLevel(value: number): string {
  if (value <= 1) return "Very Low";
  if (value === 2) return "Low";
  if (value === 3) return "Medium";
  if (value === 4) return "High";
  return "Very High";
}

export interface CoachContact {
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  department?: string;
  accountName?: string;
  mailingCity?: string;
  mailingState?: string;
  mailingCountry?: string;
  description?: string;
}

export interface CoachProduct {
  productName?: string;
  productDescription?: string;
  productFamily?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  serviceDate?: string;
}

export interface BuildCoachInstructionsInput {
  scenarioBody?: string;
  contact?: CoachContact;
  products?: CoachProduct[];
  mainCompetitors?: string;
  backstory?: string;
  personality?: PersonalityTraits;
}

/**
 * Returns the merged instruction string and the running deal-value total
 * (the LWC also dispatches this; useful for Claude's coaching summary).
 */
export function buildCoachInstructions(
  input: BuildCoachInstructionsInput,
): { instructions: string; totalDealValue: number } {
  const lines: string[] = [];

  if (input.scenarioBody) {
    lines.push(`Scenario Instructions: ${input.scenarioBody}\n`);
  }

  const c = input.contact;
  if (c?.name) {
    let line = `Your name is ${c.name}`;
    if (c.title) line += `, you are the ${c.title}`;
    line += ". ";

    const parts: string[] = [];
    if (c.email) parts.push(`Your email is ${c.email}.`);
    if (c.phone) parts.push(`Your phone number is ${c.phone}.`);
    if (c.department) parts.push(`You work in the ${c.department} department.`);
    if (c.accountName) parts.push(`You work at ${c.accountName}.`);
    if (c.mailingCity && c.mailingState) {
      let loc = `${c.mailingCity}, ${c.mailingState}`;
      if (c.mailingCountry) loc += `, ${c.mailingCountry}`;
      parts.push(`You are located in ${loc}.`);
    }
    if (c.description) parts.push(`Additional context about you: ${c.description}.`);

    lines.push(line + (parts.length > 0 ? parts.join(" ") : "") + "\n");
  }

  if (input.backstory) {
    lines.push(`Backstory: ${input.backstory}\n`);
  }

  let totalDealValue = 0;
  if (input.products && input.products.length > 0) {
    let block = "You are discussing buying the following Products:";
    for (const p of input.products) {
      block += `\n- ${p.productName}`;
      if (p.quantity != null && p.unitPrice != null) {
        block += ` (Quantity: ${p.quantity}, Unit Price: $${Number(p.unitPrice).toFixed(2)})`;
      }
      if (p.productDescription) block += `\n  Description: ${p.productDescription}`;
      if (p.productFamily) block += `\n  Product Family: ${p.productFamily}`;
      if (p.serviceDate) block += `\n  Service Date: ${p.serviceDate}`;
      if (p.totalPrice != null) totalDealValue += Number(p.totalPrice);
    }
    block += `\n\nTotal Deal Value: $${totalDealValue.toFixed(2)}.\n`;
    lines.push(block);
  }

  if (input.mainCompetitors) {
    lines.push(
      `The main competitor you are considering as an alternative is: ${input.mainCompetitors}.`,
    );
  }

  const personality = input.personality ?? DEFAULT_PERSONALITY;
  const profile = [
    "",
    "Personality Profile:",
    ...(Object.entries(personality) as Array<
      [keyof PersonalityTraits, number]
    >).map(
      ([trait, value]) =>
        `You are ${traitLevel(value)} in ${trait} on the big 5 personality model. This means you are someone who ${PERSONALITY_DESCRIPTIONS[trait]}`,
    ),
  ].join("\n");

  return {
    instructions: (lines.join("\n") + profile).trim(),
    totalDealValue,
  };
}
