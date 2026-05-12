# Architecture

How the Tough Customer MCP server is put together: which vendor owns which
job, how the parts compose, and where to look when something breaks.

**Sibling docs:**
- `README.md` — elevator overview, quick start
- `userstories.md` — feature spec
- `docs/SALESFORCE_SETUP.md` — SF Connected App runbook
- `docs/SALESFORCE_OBJECTS.md` — SF schema (read by `lib/tc-salesforce.ts`)
- `docs/CUSTOM_DOMAIN.md` — Supabase Auth custom-domain runbook
- `docs/VAULT_V2.md` — encryption-graduation plan
- `tests/oauth-flow.sh` — end-to-end OAuth handshake trace

---

## 1 — What this app actually is

A remote **MCP (Model Context Protocol) server** that lets an AI client
(Claude, ChatGPT, MCP Inspector, …) read a salesperson's Salesforce
opportunities and launch a Tough Customer roleplay session against any of
them — without ever giving the AI client a Salesforce credential.

There are two distinct user populations:

| Population | What they see |
|---|---|
| **End users** (salespeople) | A login page (`/auth/signin`), a one-time SF link page (`/connect`), and an OAuth consent page (`/oauth/consent`). They never touch the JSON-RPC surface directly — the AI client does. |
| **AI clients** | The MCP endpoint at `POST /mcp` plus standard OAuth discovery at `/.well-known/oauth-protected-resource`. |

The whole thing is one Next.js project deployed on Vercel.

---

## 2 — Stack inventory

| Layer | Vendor / library | Role |
|---|---|---|
| Hosting + edge | **Vercel** (Fluid Compute) | Runs the Next.js project. Every route is a Vercel Function. |
| Application framework | **Next.js 15** (App Router) | HTTP routing, server components, route handlers. Node 24 runtime. |
| AI protocol | **`mcp-handler` 1.x** + `@modelcontextprotocol/sdk` 1.x | Implements the Streamable HTTP MCP transport, tool/resource/prompt registration, JSON-RPC. |
| Authorization Server | **Supabase Auth** (OAuth 2.1 Server, public beta) | Issues JWTs to AI clients via PKCE + DCR. Hosts the consent flow we render. |
| Identity store + DB | **Supabase Postgres** | `auth.users` + our `identity_links` vault + `mcp_audit_log`. Row-level security enforced. |
| Schema access | **`@supabase/supabase-js`** (service role) + **`@supabase/ssr`** (user-session cookies) | DB calls + cookie-aware auth helpers. |
| JWT validation | **`jose`** | JWKS-based verification of incoming Supabase JWTs. |
| Backend system of record | **Salesforce** (tc5 dev org) — REST **GraphQL API** | Source of truth for opportunities, contacts, scenarios, products. NO Apex, NO REST `/query`. |
| Schema validation | **`zod`** | Tool input schemas on the MCP surface. |

---

## 3 — High-level shape

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  AI client (Claude / ChatGPT / MCP Inspector — browser or Anthropic infra)  │
└─────────────────────────────────────────────────────────────────────────────┘
        │   ① /mcp (POST tools/call)   ② OAuth dance (one-time)
        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Vercel Function — Next.js App Router                                        │
│                                                                              │
│   app/[transport]/route.ts        ← /mcp — protected resource                │
│       │ withAuthGate              ← presence-check 401 + WWW-Authenticate    │
│       │ runMcpTool(toolName)      ← audit + identity wrapper                 │
│       │   ↓                                                                  │
│       │   getCallerIdentity()     ← jose.jwtVerify against JWKS              │
│       │   getSfAuth()             ← mint SF access token from vaulted refresh│
│       │   → tool body (calls lib/tc-salesforce.ts)                           │
│                                                                              │
│   app/.well-known/                ← RFC 9728 protected-resource metadata    │
│   app/auth/signin /callback /signout   ← user login (password / magic / Google)│
│   app/connect/  page + start /callback /disconnect ← one-time SF account-link │
│   app/oauth/    consent + decision    ← Supabase OAuth Server consent UI     │
└─────────────────────────────────────────────────────────────────────────────┘
        │                              │                              │
        │  per-request                 │  long-lived session          │  rare
        ▼                              ▼                              ▼
┌──────────────────────┐    ┌──────────────────────┐    ┌────────────────────────┐
│  Salesforce REST     │    │  Supabase            │    │  Supabase Postgres     │
│  GraphQL API         │    │  Auth (OAuth Server) │    │  ─ identity_links      │
│  ─ Opportunity       │    │  ─ JWKS              │    │  ─ mcp_audit_log       │
│  ─ Scenario__c       │    │  ─ /authorize        │    │  ─ auth.users          │
│  ─ OCRs / OLI / ...  │    │  ─ /token            │    │  (service-role only)   │
└──────────────────────┘    └──────────────────────┘    └────────────────────────┘
```

The whole system is **stateless per request** at the application layer. State
lives in: Supabase Postgres (identity vault + audit log), Supabase Auth
(user accounts + OAuth client registry), and Salesforce (the actual deal
data). Vercel Functions hold zero session state across requests.

---

## 4 — The two OAuth flows

This server participates in two **separate** OAuth dances:

### A. AI client ↔ MCP server (Supabase as Authorization Server)

This is how Claude gets a token to call `/mcp`.

```
Claude                    /mcp                    Supabase Auth (OAuth Server)
  │                        │                                  │
  │  POST /mcp (no auth)   │                                  │
  ├───────────────────────▶│                                  │
  │   401 + WWW-Authenticate│                                  │
  │◀───────────────────────┤                                  │
  │                        │                                  │
  │  GET /.well-known/oauth-protected-resource                │
  ├───────────────────────▶│                                  │
  │   { authorization_servers: [...] }                        │
  │◀───────────────────────┤                                  │
  │                                                           │
  │  GET /.well-known/oauth-authorization-server/auth/v1      │
  ├──────────────────────────────────────────────────────────▶│
  │   { authorize/token/jwks/registration_endpoint }          │
  │◀──────────────────────────────────────────────────────────┤
  │                                                           │
  │  POST /auth/v1/oauth/clients/register   (DCR, RFC 7591)   │
  ├──────────────────────────────────────────────────────────▶│
  │   { client_id }                                           │
  │◀──────────────────────────────────────────────────────────┤
  │                                                           │
  │  /authorize?client_id=...&code_challenge=...   (PKCE)     │
  ├──────────────────────────────────────────────────────────▶│  ┐
  │                                                           │  │ user
  │  ←─── browser redirected to /oauth/consent  ──────────────┤  │ in
  │                                                           │  │ browser
  │  ──→ /oauth/decision POST → approveAuthorization() ──→    │  │
  │                                                           │  │
  │   302 → claude.ai/...callback?code=XYZ                    │  ┘
  │◀──────────────────────────────────────────────────────────┤
  │                                                           │
  │  POST /token  grant_type=authorization_code               │
  ├──────────────────────────────────────────────────────────▶│
  │   { access_token (Supabase JWT) }                         │
  │◀──────────────────────────────────────────────────────────┤
  │                        │                                  │
  │  POST /mcp + Bearer    │                                  │
  ├───────────────────────▶│  ✓ jose validates against JWKS   │
  │   tool result          │                                  │
  │◀───────────────────────┤                                  │
```

Owned files: `app/.well-known/oauth-protected-resource/route.ts`,
`app/oauth/consent/page.tsx`, `app/oauth/decision/route.ts`,
`lib/sf-auth.ts` (validates the JWT inbound).

### B. End user ↔ Salesforce (per-user account link, one-time)

This is how the salesperson gives our server permission to read their SF
data. Done once per user, in a normal browser, on `/connect`.

```
Browser                  /connect/start         Salesforce Connected App
  │   click "Connect SF"  │                                  │
  ├──────────────────────▶│                                  │
  │   302 → SF /authorize │                                  │
  │◀──────────────────────┤                                  │
  │  /authorize (PKCE, redirect to /connect/callback)        │
  ├──────────────────────────────────────────────────────────▶│
  │                                                          │  user
  │                                                          │  signs in
  │   302 → /connect/callback?code=XYZ                       │  to SF
  │◀─────────────────────────────────────────────────────────┤
  │   /connect/callback                                      │
  ├─────────▶  exchange code for {access, refresh}           │
  │           → ENCRYPT refresh token, write identity_links  │
  │   302 → /connect?status=linked                           │
  │◀──────────                                               │
```

Owned files: `app/connect/start/route.ts`, `app/connect/callback/route.ts`,
`lib/identity-vault.ts` (encrypts + stores).

These two flows are **independent**. Claude's token doesn't grant any
Salesforce access on its own — it just identifies which Supabase user is
calling. The MCP server then looks up that user's vaulted SF refresh
token to actually fetch SF data. **No Salesforce credential ever leaves
the server.**

---

## 5 — Per-request lifecycle for `/mcp`

What happens when Claude calls a tool, e.g. `list_opportunities`:

1. `POST /mcp` arrives with `Authorization: Bearer <supabase JWT>`.
2. **`withAuthGate`** (`app/[transport]/route.ts`) checks for the header
   presence. If missing → return 401 + `WWW-Authenticate` (so the client
   knows to start the OAuth dance). CORS headers always applied.
3. `mcp-handler` parses the JSON-RPC `tools/call`, routes to our
   registered tool handler.
4. **`runMcpTool`** wraps every tool body. It:
   - calls `getCallerIdentity()` → `jose.jwtVerify(token, JWKS)` →
     `{ supabaseUserId, email }` (offline JWT verify, no callback to
     Supabase).
   - applies the `MCP_ALLOWED_DOMAINS` allow-list to the user's email.
   - calls `getSfAuth()` → looks up `identity_links` row → decrypts the
     SF refresh token → exchanges it at SF's `/services/oauth2/token`
     for a fresh access token (cached 50 min per user).
   - invokes the tool body with `auth = { instanceUrl, accessToken, ... }`.
5. The tool body (`lib/tc-salesforce.ts`) makes one SF GraphQL call to
   `${instanceUrl}/services/data/v62.0/graphql`. SF enforces FLS +
   sharing as the linked user.
6. The response shape is converted to plain JS objects and returned to
   `mcp-handler`, which serializes them as JSON-RPC.
7. `runMcpTool` writes one row to `mcp_audit_log` (fire-and-forget) with
   `{user_id, email, tool, success, latency_ms, redacted inputs}`.

**Latency budget** (warm function): JWKS validate <5ms, identity_links
read 30-80ms, SF token exchange 100-300ms (cache miss only, ~once/hour
per user), SF GraphQL 150-800ms.

---

## 6 — Vercel-specific decisions

| Decision | Why |
|---|---|
| **Fluid Compute, not Edge** | Need full Node.js for `node:crypto` (AES-GCM), `jose`, and `@supabase/supabase-js`. Edge runtime has compatibility gaps. Per `vercel:knowledge-update`, Fluid is the new default anyway. |
| **`runtime = "nodejs"` on every route handler** | Explicit guard against accidental Edge migration. |
| **No `vercel.json` / `vercel.ts`** | Framework defaults work fine; project is small enough that config-as-code isn't needed yet. If we add cron (e.g. token-cleanup), switch to `vercel.ts`. |
| **Env vars managed via `vercel env`** | All 7+3 (3 vars × 3 envs) live in Vercel. `vercel env pull .env.local` for local dev. No `.env` committed. |
| **Vercel Marketplace Supabase integration NOT used** | The user already has a Supabase Pro org — installing via Marketplace would duplicate the $25/mo. We created the project directly in the existing org and pasted keys into Vercel manually. `docs/SALESFORCE_SETUP.md` and `code-hero` skill have the rationale. |
| **Production alias `mcp-umber-three.vercel.app`** | The auto-assigned URL. Custom domain `mcp.toughcustomer.ai` is a Phase-0 follow-up (`docs/CUSTOM_DOMAIN.md`). |

---

## 7 — Next.js App Router structure

App Router routes broken out by audience:

```
app/
├── layout.tsx               public — root HTML shell
├── page.tsx                 public — landing (just marketing copy)
│
├── auth/                    end-user authentication (Supabase session)
│   ├── signin/route.ts        GET (HTML form) + POST (3 sign-in paths)
│   ├── callback/route.ts      exchangeCodeForSession for OAuth providers
│   └── signout/route.ts
│
├── connect/                 end-user — one-time SF account link
│   ├── page.tsx               server component, reads identity_links
│   ├── start/route.ts         POST → builds SF authorize URL, sets PKCE cookie
│   ├── callback/route.ts      SF redirect target, exchanges code, vault-writes
│   └── disconnect/route.ts    POST → deletes identity_links, revokes at SF
│
├── oauth/                   AI client — Supabase OAuth Server consent UI
│   ├── consent/page.tsx       reads authorization_id, renders Approve/Deny
│   └── decision/route.ts      POST → approveAuthorization/denyAuthorization
│
├── .well-known/
│   └── oauth-protected-resource/route.ts   RFC 9728 metadata
│
└── [transport]/route.ts     MCP endpoint at /mcp (catch-all for streamable HTTP)
```

### Server vs client components

The project is **100% server components** — there is no client-side
React. Every interaction is a form POST that returns server-rendered
HTML or a redirect. This keeps the bundle tiny (~50KB total) and means
authentication state is never reconciled across the network seam.

The only place this matters: `app/connect/page.tsx` is an `async`
server component that reads `identity_links` via the service-role
client (`getSupabaseServiceClient()`) — not exposed to the browser.

### `[transport]` catch-all

The MCP endpoint lives at `/mcp` but the route file is `[transport]/route.ts`.
This is `mcp-handler`'s convention — it lets the same handler answer at
`/mcp`, `/sse`, or whatever transport name a future MCP client wants.
The auth gate + CORS wrapper sit at the route level, so they apply
regardless of which transport name is used.

---

## 8 — Supabase: three jobs

Supabase plays three roles, often conflated:

### 8a — As **Postgres** (database)

`identity_links` and `mcp_audit_log` live here. Schema in
`supabase/migrations/`. RLS is **default-deny** on both — service role
only, no anon/authenticated access. The MCP server reads/writes via
`getSupabaseServiceClient()` (`lib/supabase-server.ts`).

Why service-role-only on `identity_links`: the encrypted refresh tokens
are useless without `VAULT_KEY_V1`, but even ciphertext should not be
exposed to the anon/authenticated roles in case of a future SQL injection
or RLS misconfiguration. Defense in depth.

### 8b — As **OAuth Client** (we are a Supabase Auth consumer)

This is the end-user signin at `/auth/signin`. The user signs in to
Supabase via email+password, magic link, or Google OAuth. Supabase
issues a session cookie that our app's `getSupabaseSSRClient()` reads
on subsequent requests. This is standard `@supabase/ssr` usage.

This session is **only** used by:
- `/connect/*` (to know which Supabase user is linking SF)
- `/oauth/consent` (to know which user is approving an OAuth grant)

It is **not** the JWT Claude carries — see 8c.

### 8c — As **OAuth Authorization Server** (Supabase Auth as IdP for AI clients)

Configured in Supabase Dashboard → Authentication → OAuth Server. The
critical settings:

- **Site URL** = `https://mcp-umber-three.vercel.app` — where Supabase
  redirects users for the consent page. Our app handles `/oauth/consent`
  at that host.
- **Authorization Path** = `/oauth/consent` — appended to Site URL.
- **Allow Dynamic OAuth Apps** = on (so Claude can self-register via DCR
  per RFC 7591).
- **JWT Signing Keys** must be asymmetric (RS256 or ES256). The MCP
  server validates JWTs offline via JWKS using `jose`; legacy HS256
  projects return an empty JWKS and validation fails.

The Supabase OAuth Server issues JWTs that Claude carries. Issuer is
`https://<project>.supabase.co/auth/v1` (with the `/auth/v1` path — see
RFC 8414 §3.1 note in `app/.well-known/oauth-protected-resource/route.ts`).

---

## 9 — The identity vault

`lib/identity-vault.ts` is the **single trust boundary** for per-user
Salesforce refresh tokens. Nothing else in the codebase ever holds a
plaintext refresh token outside the duration of a single request.

### Encryption (v1)

- **AES-256-GCM**, key `VAULT_KEY_V1` (32 bytes, base64 in env var).
- Per-row IV (12 bytes random); auth tag (16 bytes).
- Stored layout in `bytea` column: `[iv][tag][ciphertext]`, written as
  PostgreSQL hex format `\x<hex>`.
- Backward-compat decoder (`decodeBytea`) also handles legacy
  JSON-Buffer-wrapped rows from a buggy earlier version of `saveIdentityLink`.

### Why v1 is acceptable now

Internal/staff testing only. The wrapping key is in env vars, which sit
in Vercel's encrypted env store but are visible to anyone with project
admin access.

### Why v1 must graduate

Before any external customer onboards real Salesforce data. The graduation
target and migration shape are in `docs/VAULT_V2.md`. The `kid` column
in `identity_links` discriminates encrypted-with-which-key, so the
graduation is a one-file change in `lib/identity-vault.ts` + a one-shot
re-encrypt job.

### Why bytea hex not Postgres-native BYTEA marshalling

Earlier supabase-js silently JSON-serialized `Buffer` instances via
`Buffer.toJSON()`, storing the literal `{"type":"Buffer","data":[…]}`
string as bytes. Hex-encoding explicitly avoids that — there's a writeup
in the commit log and the legacy decoder.

---

## 10 — Salesforce integration

### Why GraphQL, not Apex

The earlier prototype used Apex REST with SOQL `WITH USER_MODE` for the
"FLS for admins" guarantee. We replaced it with **SF REST GraphQL API**
because:

- GraphQL enforces FLS + sharing for **all** profiles, admins included
  — same guarantee Apex `WITH USER_MODE` gives, at the API layer
- No Apex deploy, no 75% test coverage requirement
- No SFDX project the customer admin needs to manage
- Pure TypeScript, no second toolchain

### Why GraphQL not REST `/query`

REST SOQL `/query` enforces FLS only for non-admins. An admin user
calling our MCP server via REST would see fields the org has hidden.
GraphQL closes that gap.

### File ownership

- `lib/sf-graphql.ts` — generic GraphQL POST helper, error mapping
- `lib/tc-salesforce.ts` — every query + mutation we send, one function
  per MCP tool
- `lib/sf-auth.ts` — mints SF access tokens via refresh-token grant
- `docs/SALESFORCE_OBJECTS.md` — current schema reference (source of
  truth for what we query)
- `docs/SALESFORCE_SETUP.md` — Connected App setup runbook

### Schema constraints worth knowing

- `orderBy` on `OpportunityContactRole` is **not** accepted in the shape
  that works on `Opportunity`. We sort primary-first in JS instead.
- `ScenarioAssignment__c` mutations are **not** supported via GraphQL
  in this org — `ScenarioAssignment__c_CreateInput` type isn't on the
  schema. The Learning LWC owns assignment creation client-side.
- `MainCompetitors__c` is a real custom field on the standard
  `Opportunity` and is **not** in `package.xml`; the metadata isn't
  source-tracked but the field exists. See note in `docs/SALESFORCE_OBJECTS.md`.

---

## 11 — MCP tool surface

Registered in `app/[transport]/route.ts` via `server.registerTool(...)`:

| Tool | Reads SF? | Writes SF? | Notes |
|---|---|---|---|
| `list_opportunities` | ✓ Opportunity (50 most recent) | — | No `Tough_Customer__c` filter — all opps the user can see |
| `list_voices` | — | — | Hardcoded in `lib/voices.ts` (31 Gemini Live voices) |
| `list_scenarios` | ✓ Scenario__c | — | Returns Name + Description |
| `get_opportunity_contacts` | ✓ OpportunityContactRole | — | Sorted primary-first in JS |
| `create_roleplay_session` | ✓ (lookups for context, all optional) | — | Returns launch URL `/lightning/n/Learning?c__opp=<id>`. The LWC owns assignment-write. |
| `get_coach_context` | ✓ Scenario, Opp, OCRs, OLI (one round trip) | — | Returns the merged "buyer instructions" string. Pure port of legacy `oppGraph.js`. |

Plus one prompt:

- `setup_sales_roleplay` — guidance for the AI client on how to walk a
  user through the fast-path flow (just pick an opp) with optional
  customization (contact / scenario / voice).

All tool handlers are wrapped with `runMcpTool` which provides:
- identity resolution (so audit has a real `user_id` even on
  auth-related failures)
- audit-row write per call (success + failure)
- error normalization (`isError: true` + a clean text message)

---

## 12 — CORS

Browser-hosted MCP clients (claude.ai, chatgpt.com) need CORS to read
our 401 response cross-origin, otherwise they bail out with
`start_error` before the OAuth handshake can begin.

`lib/cors.ts` keeps a small allow-list of origins (overridable via
`MCP_CORS_ALLOWED_ORIGINS`) and exposes `WWW-Authenticate` so the
client can read the OAuth challenge from a CORS response. Applied in:

- `app/[transport]/route.ts` — wraps every response from `/mcp` and
  shortcuts OPTIONS preflight to 204 + headers
- `app/.well-known/oauth-protected-resource/route.ts` — exposes the
  metadata cross-origin

Server-to-server clients (Anthropic infra, MCP Inspector when not
running in a browser) don't need CORS but inheriting it doesn't hurt.

---

## 13 — File / module layout

```
mcpapp/
├── architect.md                    ← this file
├── README.md                       ← elevator + quick start
├── userstories.md                  ← features spec, with status keys
├── docs/                           ← runbooks, schema, graduation plans
├── tests/oauth-flow.sh             ← end-to-end OAuth handshake trace
├── supabase/migrations/            ← versioned SQL (RLS, vault, audit_log)
├── lib/
│   ├── audit.ts                    fire-and-forget log writer
│   ├── coach-instructions.ts       pure-TS port of oppGraph builder
│   ├── cors.ts                     CORS allow-list + helpers
│   ├── domain-allowlist.ts         email-domain gate (MCP_ALLOWED_DOMAINS)
│   ├── identity-vault.ts           AES-GCM encryption + identity_links CRUD
│   ├── log-redactor.ts             credential-stripping log helper
│   ├── sf-auth.ts                  caller-identity (JWKS) + SF token minting
│   ├── sf-graphql.ts               thin SF GraphQL POST client
│   ├── supabase-server.ts          getSupabaseSSRClient + getSupabaseServiceClient
│   ├── tc-salesforce.ts            one fn per MCP tool, against SF GraphQL
│   ├── tc-service.ts               types + mock/live dispatcher
│   └── voices.ts                   Gemini Live voice catalog (hardcoded)
└── app/   (routes — see §7)
```

---

## 14 — Environment variables

| Name | Where set | Purpose |
|---|---|---|
| `TC_MODE` | Vercel (live=prod/preview, mock=dev) | Whether tool handlers hit real SF or in-memory mock data |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel (all) | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel (all) | Anon key (browser-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (all, server-only) | Service-role key for vault + audit writes |
| `VAULT_KEY_V1` | Vercel (all, distinct per env) | 32-byte base64 AES-GCM wrapping key for `identity_links.refresh_token_enc` |
| `SF_LOGIN_URL` | Vercel (all) | `https://login.salesforce.com` (or `test.` for sandbox) |
| `SF_CLIENT_ID` | Vercel (all) | Connected App Consumer Key |
| `SF_CLIENT_SECRET` | Vercel (all) | Connected App Consumer Secret |
| `SF_API_VERSION` | Vercel (all) | e.g. `v62.0` |
| `AUTH_BASE_URL` | Vercel (all) | Supabase Auth host. `https://<project>.supabase.co` until custom domain ships. |
| `MCP_PUBLIC_URL` | Vercel (prod) | This server's public URL (used in 401 metadata link). Falls back to `VERCEL_PROJECT_PRODUCTION_URL` if unset. |
| `APP_BASE_URL` | Vercel (prod) | UI host for `/connect`. Same value as MCP_PUBLIC_URL until UI splits to a separate domain. |
| `MCP_ALLOWED_DOMAINS` | Vercel (optional) | Comma-separated email-domain allow-list for caller identity (e.g. `toughcustomer.ai`) |
| `MCP_CORS_ALLOWED_ORIGINS` | Vercel (optional) | Comma-separated CORS origin allow-list override |

---

## 15 — Operations

### Deploys

Push to `main` on GitHub → Vercel auto-deploys to production. No CI step
required; Vercel runs `npm run build` itself. Build takes ~25-30s.

For preview deploys: open a PR. Each push to a branch creates a preview
URL.

### Migrations

`supabase db push` applies versioned SQL in `supabase/migrations/`. The
CLI uses an IPv4 pooler connection; if it falls through to IPv6 and your
network drops it, re-run `supabase link --project-ref <ref> --password <pw>`
to negotiate a fresh IPv4 endpoint.

### Secrets

- `~/.tc-supabase-db-pw.txt` — DB password (chmod 600)
- `~/.tc-sf-app.txt` — SF Connected App `KEY` + `SECRET` (chmod 600)
- `~/.tc-test-user.txt` — test user creds (chmod 600)

None of these are in the repo. Each was generated locally + saved to a
file with restricted permissions so it doesn't appear in command history
or agent transcripts.

### Monitoring

- `vercel logs <deploy-url>` — streams server logs from a specific deploy
- `vercel inspect <deploy-url> --logs` — single-shot view
- `mcp_audit_log` — every tool call lands here; query via Supabase SQL
  editor or `curl` with the service-role key
- `tests/oauth-flow.sh` — run anytime to confirm steps 1-4 of the OAuth
  handshake still work

---

## 16 — Security posture

| Concern | Mitigation |
|---|---|
| SF tokens flowing through Claude/Anthropic | Eliminated. Claude only ever holds a Supabase-issued JWT scoped to this server. SF tokens are minted server-side per request and discarded. |
| Vaulted refresh tokens at rest | AES-GCM with per-row IV; wrapping key not in DB; RLS service-role-only. V2 graduation plan documented. |
| RLS bypass via SQL injection | Default-deny RLS on `identity_links` and `mcp_audit_log` — no anon/authenticated SELECT/INSERT/UPDATE/DELETE. Belt-and-braces explicit revokes in the migration. |
| Provider-error leakage | All sign-in error text is generic ("email or password didn't match", "Google sign-in is currently unavailable"). No raw Supabase/Salesforce error strings ever surface to end users. Implementation-detail strings (file paths, service names, env vars) scrubbed from `/`, `/connect`, `/auth/signin`. |
| Account-existence enumeration | Same generic error for "wrong email" and "wrong password". |
| Credential exfiltration via logs | `lib/log-redactor.ts` strips `refresh_token`, `access_token`, `Authorization`, `cookie`, etc. Audit `inputs_summary` records only field presence + lengths, never values. |
| CSRF on `/oauth/decision`, `/connect/disconnect` | Form-POST only. Same-origin only via Supabase session cookie. `SameSite=Lax` on the auth cookies blocks cross-site form submissions. |
| Open OAuth redirect on `/connect` | Salesforce-side: callback URL is whitelisted in the Connected App. Our side: we never read `redirect_to` from a query param; the SF redirect URI is hard-coded to `/connect/callback`. |
| PKCE replay | Per-request `code_verifier`; cookie scoped to `/connect`; short TTL; signed via Next.js cookies. |
| Cross-browser PKCE for magic links | Documented limitation; the email+password and Google sign-in paths don't have this constraint. Magic-link users see a "click from the same browser" hint on the confirmation page. |

---

## 17 — Known limitations + graduation paths

| Topic | Status | Tracked in |
|---|---|---|
| Vault encryption is env-var-keyed | acceptable for internal; graduate before external customer | `docs/VAULT_V2.md` |
| Supabase OAuth Server is in beta | acceptable; production-stable for our scale | — |
| Custom domains not yet active | `mcp.toughcustomer.ai` / `auth.toughcustomer.ai` / `app.toughcustomer.ai` are stub plans | `docs/CUSTOM_DOMAIN.md`, userstories §1.5 |
| No assignment writes from MCP | Learning LWC owns the `ScenarioAssignment__c` create | userstories §3.7 |
| LWC and MCP server have separate voice catalogs | Both hardcoded for now; not yet shared | `docs/SALESFORCE_OBJECTS.md` "LWC contract" note |
| MCP Inspector smoke test not auto-runnable in CI | `tests/oauth-flow.sh` exists but isn't wired into pre-deploy | userstories §1.4 |
| `MainCompetitors__c` is referenced but not in package.xml | source-tracking gap | `docs/SALESFORCE_OBJECTS.md` warning |

When in doubt, the test script in `tests/oauth-flow.sh` is the
canonical "does the auth surface work end-to-end" check; if it's green,
the architecture is wired correctly.
