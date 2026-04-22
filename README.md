# Tough Customer MCP

Remote **MCP server** (Next.js on Vercel) that delivers an inline **roleplay configurator UI** into Claude. The UI is a simple demo of [toughcustomer.ai](https://www.toughcustomer.ai) — fill in a persona + scenario and get a shareable roleplay link.

> Backend is currently mocked. The `generateRoleplayLink` function in [`lib/roleplays.ts`](lib/roleplays.ts) is where you wire up the real Tough Customer API later.

## Endpoints

| Route | Purpose |
| --- | --- |
| `/mcp` | MCP streamable-HTTP endpoint (connect Claude here) |
| `/api/roleplays` | Internal JSON API used by the inline UI to create a link |
| `/` | Landing page |

## Tools exposed

- `toughcustomer_open_roleplay_app` — opens the inline configurator UI (optionally pre-filled).
- `toughcustomer_create_roleplay_link` — generates a roleplay link from structured args and renders the UI with the result.
- `toughcustomer_list_templates` — returns built-in persona/scenario presets.

Each tool returns a `text/html` resource at `ui://toughcustomer/roleplay.html`, so MCP clients that support inline UI resources (Claude, ChatGPT) render the form directly.

## Local development

```bash
npm install
npm run dev
# http://localhost:3000
# MCP endpoint: http://localhost:3000/mcp
```

Inspect with the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector
# Transport: Streamable HTTP
# URL: http://localhost:3000/mcp
```

## Deploy to Vercel

One-time setup:

```bash
# 1. Create GitHub repo
gh repo create mcp --public --source=. --remote=origin --push

# 2. Link + deploy on Vercel (prompts for org/project name)
npx vercel link
npx vercel --prod
```

Then add the production URL (`https://<project>.vercel.app/mcp`) to Claude as a remote MCP server.

## Wiring up the real backend later

Replace the body of `generateRoleplayLink` in `lib/roleplays.ts` with a `fetch` to the Tough Customer API. Add any needed env vars via `vercel env add`.
