// Pure-TS port of oppGraph.js `buildCustomInstructions`.
//
// Takes the structured coach inputs (scenario script, picked contact, opp
// products + competitor, free-text backstory) and returns the merged
// instruction string an LLM can use as its system prompt for the AI buyer
// in a Tough Customer roleplay.

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
}

/**
 * Returns the merged instruction string and the running deal-value total
 * (the LWC also dispatches this; useful for a coaching summary).
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

  return {
    instructions: lines.join("\n").trim(),
    totalDealValue,
  };
}
