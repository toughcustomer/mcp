// Mock roleplay-link generator. Swap this for a real Tough Customer API call later.

export interface RoleplayInput {
  persona: string;
  scenario: string;
  difficulty: "easy" | "medium" | "hard";
  objections?: string[];
}

export interface RoleplayLink {
  id: string;
  url: string;
  persona: string;
  scenario: string;
  difficulty: RoleplayInput["difficulty"];
  created_at: string;
}

export const TEMPLATES = [
  {
    slug: "skeptical-cfo",
    persona: "Skeptical CFO at a mid-market SaaS company",
    scenario: "Cold discovery call — evaluating spend on new AI tooling",
    difficulty: "hard" as const,
  },
  {
    slug: "price-sensitive-owner",
    persona: "Price-sensitive small business owner",
    scenario: "Follow-up demo — pricing pushback",
    difficulty: "medium" as const,
  },
  {
    slug: "champion-buyer",
    persona: "Friendly internal champion (Director of Sales Ops)",
    scenario: "Discovery call — helping you build the business case",
    difficulty: "easy" as const,
  },
];

export function generateRoleplayLink(input: RoleplayInput): RoleplayLink {
  const id =
    "rp_" +
    Math.random().toString(36).slice(2, 8) +
    Math.random().toString(36).slice(2, 8);
  const params = new URLSearchParams({
    persona: input.persona,
    scenario: input.scenario,
    difficulty: input.difficulty,
  });
  if (input.objections?.length) params.set("objections", input.objections.join("|"));
  return {
    id,
    url: `https://www.toughcustomer.ai/roleplay/${id}?${params.toString()}`,
    persona: input.persona,
    scenario: input.scenario,
    difficulty: input.difficulty,
    created_at: new Date().toISOString(),
  };
}
