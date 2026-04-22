import { NextResponse } from "next/server";
import { z } from "zod";
import { generateRoleplayLink } from "@/lib/roleplays";

export const runtime = "nodejs";

const Body = z.object({
  persona: z.string().min(1).max(500),
  scenario: z.string().min(1).max(2000),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  objections: z.array(z.string().max(200)).max(20).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const link = generateRoleplayLink(parsed.data);
  return NextResponse.json(link);
}
