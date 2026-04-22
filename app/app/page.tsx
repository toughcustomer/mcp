import { renderRoleplayAppHtml } from "@/lib/ui";

export const dynamic = "force-dynamic";

function getApiBase(): string {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "";
}

export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const pick = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
  const difficulty = pick("difficulty");
  const html = renderRoleplayAppHtml({
    persona: pick("persona"),
    scenario: pick("scenario"),
    difficulty:
      difficulty === "easy" || difficulty === "medium" || difficulty === "hard"
        ? difficulty
        : undefined,
    apiBase: getApiBase(),
  });
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
