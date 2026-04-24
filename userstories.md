# Tough Customer MCP — User Stories

Scope: the remote MCP server at `https://mcp-umber-three.vercel.app/mcp` that lets an LLM client (Claude Desktop, claude.ai, ChatGPT Apps, mcp-ui) configure and launch a Tough Customer roleplay session.

Three audiences:

- **Admin** — wires the server into an identity provider and deploys it.
- **Operator** — ongoing day-to-day maintenance of the server, data, and integrations.
- **End user** — a salesperson using Claude to spin up a roleplay.

Each story uses `As a <role>, I want <capability>, so that <outcome>.` Acceptance criteria are concrete and testable.

Status key: ✅ done · 🟡 partial · ⬜ todo

---

## 1. Setup & deployment

### 1.1 Fork and deploy
**As an** admin, **I want** to deploy my own copy of the MCP server, **so that** I control the data, logs, and identity boundary.

Acceptance:
- Clone `https://github.com/toughcustomerai/mcp`, run `npm install`, `npm run build` — no errors.
- `npx vercel --prod` produces a `*.vercel.app` URL that responds to `POST /mcp` with a JSON-RPC manifest.
- Landing page at `/` lists the registered resources, tools, and prompts.

Status: ✅

### 1.2 Configure backend
**As an** admin, **I want** a single file to swap the mock backend for real Tough Customer API calls, **so that** I don't have to touch the MCP protocol code.

Acceptance:
- All backend I/O lives in `lib/tc-service.ts`.
- Replacing the function bodies (not signatures) is sufficient to go live.
- Env vars (`TC_API_URL`, `TC_API_KEY`, etc.) are read via `process.env` inside the service layer only.

Status: ✅ (service layer in place; real API still to wire)

### 1.3 Connect to Claude Desktop / claude.ai
**As an** end user, **I want** to add the MCP server as a connector in Claude, **so that** I can use it from any chat.

Acceptance:
- Settings → Connectors → Add custom connector → paste URL → connector appears with the expected tools/resources/prompts.
- After a successful connect, `list_opportunities`, `list_voices`, `list_scenarios`, `get_opportunity_contacts`, `create_roleplay_session`, and the `setup_sales_roleplay` prompt are all visible.
- Server changes require a connector reinstall (uninstall → quit Claude → reinstall) to refresh the cached manifest.

Status: ✅

### 1.4 MCP Inspector smoke test
**As an** admin, **I want** to verify the server with MCP Inspector, **so that** I can debug without involving Claude.

Acceptance:
- `npx @modelcontextprotocol/inspector` → Streamable HTTP → server URL → successfully lists tools, resources, and prompts.
- Calling each tool with valid inputs returns structured content without errors.

Status: ⬜ (works, but not documented in README)

---

## 2. Authentication & authorization

### 2.1 Today's state (INSECURE — demo only)
**As an** admin, **I want** to understand the current trust model, **so that** I don't deploy it with real data.

Current reality:
- Every tool accepts a `userEmail` parameter.
- The server trusts whatever Claude sends.
- A user can type "my email is anyone@company.com" and spoof that identity.
- `TCUnauthorizedError` only checks email format, not ownership.

Acceptance:
- This section of the doc warns anyone reading it that param-based identity is trivially spoofable.
- No production data is connected until 2.2 ships.

Status: ✅ (documented; current code is exactly this)

### 2.2 OAuth 2.1 per MCP spec
**As an** admin, **I want** the MCP server to authenticate callers via OAuth 2.1 with PKCE, **so that** identity is proved by a verified JWT, not a self-claimed string.

Acceptance:
- Server exposes `/.well-known/oauth-protected-resource` (RFC 9728) pointing at the authorization server.
- Unauthenticated `POST /mcp` returns `401` with a `WWW-Authenticate: Bearer` header.
- Claude automatically opens a browser login on connect and stores the access token.
- Every subsequent MCP request carries `Authorization: Bearer <jwt>`.
- Middleware verifies signature, audience, expiry, and extracts `sub` + `email` claims before invoking any tool.
- The `userEmail` tool parameter is **removed** — identity comes only from the token.
- Dynamic Client Registration (RFC 7591) is enabled so MCP clients can self-register.

Status: ⬜

Implementation options (pick one):
- **WorkOS AuthKit for MCP** — managed, MCP-native, handles all three RFCs.
- **Clerk for MCP** — managed, one-click if already using Clerk.
- **Supabase Auth + custom `.well-known` endpoints** — DIY, aligns naturally with Supabase RLS.

### 2.3 Row-level security
**As an** admin, **I want** the database to enforce that users only see their own opportunities and contacts, **so that** a bug in application code cannot leak another user's data.

Acceptance:
- All Tough Customer tables have RLS policies keyed off `auth.uid()` or `auth.jwt() ->> 'email'`.
- Policies are tested: a logged-in user of company A cannot `SELECT` any row owned by company B, even with a direct SQL connection using their JWT.
- Service layer functions accept the verified email/sub as an argument and pass it to Supabase; no service-role key is used inside tool handlers.

Status: ⬜

### 2.4 Workspace / domain allow-listing
**As an** admin, **I want** to restrict the MCP server to specific email domains (e.g. `@toughcustomer.ai`), **so that** only my team can connect.

Acceptance:
- Env var `MCP_ALLOWED_DOMAINS="toughcustomer.ai,partner.com"`.
- Auth middleware rejects tokens whose `email_verified=true` domain is not in the list, with a `403` and a clear error.
- Unit test covers both accept and reject cases.

Status: ⬜

### 2.5 Audit log
**As an** admin, **I want** every tool call logged with verified user identity, tool name, inputs, and result, **so that** I have a real audit trail.

Acceptance:
- Each tool call writes a row to an append-only log (Supabase `mcp_audit_log` or equivalent) with: `user_id`, `email`, `tool`, `inputs` (redacted secrets), `success`, `latency_ms`, `timestamp`.
- Failed auth attempts are logged too (with the rejected email, if extractable).
- Log retention ≥ 90 days.

Status: ⬜

### 2.6 Token revocation
**As an** admin, **I want** to revoke a user's access immediately when they leave the company, **so that** stale tokens can't be used against the MCP server.

Acceptance:
- Revoking the user in the IdP causes the next MCP call (within one refresh-token lifetime) to fail with 401.
- Short access-token lifetimes (≤ 1 hour) are configured.

Status: ⬜

---

## 3. End-user stories (the salesperson in Claude)

### 3.1 Guided setup via prompt
**As a** salesperson, **I want** to click "Set Up a Sales Roleplay" in Claude's prompt menu, **so that** I'm walked through the whole flow without remembering tool names.

Acceptance:
- The `setup_sales_roleplay` prompt appears under the Tough Customer connector.
- After invoking it, Claude asks for my email (today) or uses the OAuth identity (post-2.2), then lists opportunities, then contacts, then voice + scenario, then offers backstory, then creates the session.
- Claude always refers to things by name, not ID.

Status: ✅

### 3.2 Ad-hoc discovery
**As a** salesperson, **I want** to say "list my Tough Customer opportunities" in a free-form chat, **so that** I don't have to use the prompt menu.

Acceptance:
- Claude calls `list_opportunities` without additional coaching.
- If it hesitates (answers from general knowledge), a nudge like "use the Tough Customer connector" is enough.

Status: ✅ (works, occasional coaching needed)

### 3.3 Pick a deal
**As a** salesperson, **I want** to see my opportunities with stage and deal size, **so that** I can pick which one to practice.

Acceptance:
- `list_opportunities` returns id, name, stage, amount for each.
- Claude renders a table or numbered list.
- User can reply with a number, a name, or "the GlobalTech one" and Claude resolves it to the ID internally.

Status: ✅

### 3.4 Pick a contact
**As a** salesperson, **I want** to see only the contacts on the deal I picked, **so that** I roleplay against the right buyer.

Acceptance:
- `get_opportunity_contacts` returns only contacts for that opportunity.
- Contacts include name and title.
- Invalid opportunityId returns a clean `TCNotFoundError`.

Status: ✅

### 3.5 Pick voice and scenario
**As a** salesperson, **I want** to see all available voices and scenarios in one step, **so that** picking is fast.

Acceptance:
- `list_voices` returns name, gender, description for each voice.
- `list_scenarios` returns name and description.
- Claude suggests a sensible default scenario based on the deal's stage (e.g. Negotiation → Pricing Negotiation).

Status: ✅

### 3.6 Add optional backstory
**As a** salesperson, **I want** to add free-text context ("Tom just lost his CISO headcount budget"), **so that** the AI buyer behaves realistically.

Acceptance:
- `create_roleplay_session` accepts an optional `backstory` field up to 4000 chars.
- Backstory appears in the returned deal-context summary.
- Omitting backstory produces a clean session with no placeholder text.

Status: ✅

### 3.7 Launch the session
**As a** salesperson, **I want** a shareable session URL I can click to start the roleplay, **so that** I can go straight from chat to practice.

Acceptance:
- `create_roleplay_session` returns a `https://www.toughcustomer.ai/session/sess_xxx` URL.
- Claude renders it as a clickable link in its response.
- The session response includes the full deal context so Claude can prep me before I click.

Status: ✅ (URL is currently mocked)

### 3.8 Pre-call coaching
**As a** salesperson, **I want** Claude to give me 3–5 bullet points of prep based on the deal context, **so that** I'm ready when the roleplay starts.

Acceptance:
- After `create_roleplay_session` returns, Claude summarizes the buyer, scenario, and any backstory.
- Coaching bullets are concrete ("expect pushback on 'why now'") not generic.

Status: ✅ (behavior of the current prompt)

### 3.9 Errors surface cleanly
**As a** salesperson, **I want** to see a readable error if something goes wrong, **so that** I know whether to retry, pick again, or ask my admin.

Acceptance:
- `TCNotFoundError`, `TCUnauthorizedError`, and generic errors all return `isError: true` with a single `text` message prefixed `Error:`.
- Claude shows the error to me and offers the next reasonable action (pick again, re-auth, etc.).

Status: ✅

### 3.10 Session continuity across chats
**As a** salesperson, **I want** Claude to remember who I am across chats (post-OAuth), **so that** I don't get asked for my email every conversation.

Acceptance (post-2.2):
- OAuth token is stored at connector level, not chat level.
- A new chat with Tough Customer tools enabled does not prompt for identity.
- Token refresh happens silently.

Status: ⬜

---

## 4. Operator stories

### 4.1 Add / remove opportunities without redeploy
**As an** operator, **I want** the opportunity list to come from a live source, **so that** I don't redeploy the MCP server every time sales data changes.

Acceptance:
- `listOpportunities()` fetches from the real Tough Customer API (or Supabase).
- Cache TTL is short (≤ 60s) or explicitly bypassed.

Status: ⬜

### 4.2 Manage voices and scenarios
**As an** operator, **I want** to add new voices and scenarios without a code deploy, **so that** I can iterate on the product offering.

Acceptance:
- Voices and scenarios live in a Tough Customer admin table, not a TypeScript constant.
- A new row appears in `list_voices` / `list_scenarios` within one cache TTL.

Status: ⬜

### 4.3 Observability
**As an** operator, **I want** tool-call latency and error-rate metrics, **so that** I can catch regressions.

Acceptance:
- p50/p95 latency and error rate per tool visible in Vercel analytics or an external APM.
- Alert fires if error rate > 5% over 5 minutes.

Status: ⬜

### 4.4 Rate limiting
**As an** operator, **I want** per-user rate limits on `create_roleplay_session`, **so that** a runaway agent can't spin up thousands of sessions.

Acceptance:
- ≤ N sessions per user per hour (config via env var).
- Over-limit returns `429` with a `Retry-After` hint.

Status: ⬜

---

## 5. Non-goals (explicitly out of scope)

- Inline UI widgets in Claude (ui:// rawHtml resources) — Claude Desktop and claude.ai don't render them yet.
- CRM integrations (HubSpot, Salesforce) — separate connector, not this one.
- Multi-tenant data in a single deployment — each tenant should fork-and-deploy for now.
- Streaming tool responses — current responses are small enough to return whole.

---

## 6. Roadmap (by priority)

1. **OAuth 2.1 (2.2)** — unblocks everything else.
2. **Real backend in `tc-service.ts` (1.2)** — behind the auth boundary.
3. **RLS (2.3) + domain allow-listing (2.4)** — make the data boundary enforceable.
4. **Audit log (2.5) + observability (4.3)** — production readiness.
5. **Live data sources (4.1, 4.2)** — operator ergonomics.
6. **Rate limiting (4.4)** — cost control.
