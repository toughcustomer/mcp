import { NextResponse } from "next/server";
import { z } from "zod";
import { generateRoleplayLink } from "@/lib/roleplays";

export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const Body = z.object({
  persona: z.string().min(1).max(500),
  scenario: z.string().min(1).max(2000),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  objections: z.array(z.string().max(200)).max(20).optional(),
});

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400, headers: CORS_HEADERS },
    );
  }
  const link = generateRoleplayLink(parsed.data);
  return NextResponse.json(link, { headers: CORS_HEADERS });
}
