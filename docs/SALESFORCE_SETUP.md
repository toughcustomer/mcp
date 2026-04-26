# Salesforce Connected App setup

In Model B, Salesforce is a **downstream backend**, not the OAuth
Authorization Server for Claude. Its Connected App is used only by the
one-time account-link flow at `app.toughcustomer.ai/connect`. End users
authenticate to Tough Customer via Supabase Auth; Salesforce never sees
Claude.

This runbook covers the manual setup that must happen in your Salesforce
org before a deployment can serve real data. **No Apex deploy is required.**
The MCP server uses Salesforce REST GraphQL API exclusively.

## 1. Create the Connected App

Setup → App Manager → **New Connected App**.

Settings:

- **Connected App Name** — `Tough Customer MCP`
- **API (Enable OAuth Settings)** — checked
- **Callback URL** — `https://app.toughcustomer.ai/connect/callback`
  (and whatever preview URLs you use; SF accepts multiple, one per line)
- **OAuth Scopes** — add:
  - `Manage user data via APIs (api)`
  - `Perform requests at any time (refresh_token, offline_access)`
  - `Access the identity URL service (id, profile, email, address, phone)`
- **Require Secret for Web Server Flow** — your call. PKCE without secret is
  fine for our flow; if your security policy requires the secret, set
  `SF_CLIENT_SECRET` in Vercel as well.
- **Require Proof Key for Code Exchange (PKCE)** — checked.

After save, capture **Consumer Key** → `SF_CLIENT_ID` env var.

## 2. The custom objects already exist in the org

See `docs/SALESFORCE_OBJECTS.md` for the full schema. Summary of what the
MCP server reads/writes:

- Standard objects: `Opportunity`, `Contact`, `OpportunityContactRole` (no
  schema changes needed; uses `Account.Name`, `StageName`, `Amount`).
- `Scenario__c` — roleplay/coaching scripts, already populated by admins.
- `ScenarioAssignment__c` — created by `create_roleplay_session` to assign
  a scenario to the calling user.

There is **no** `Tough_Customer__c` flag on Opportunity, **no**
`Roleplay_Voice__c`, **no** `Roleplay_Scenario__c`, **no**
`Roleplay_Session__c`. Voices are hardcoded in `lib/voices.ts`. **No
Apex deploy, no test coverage chore, no SFDX project required.**

## 3. Vercel env vars

```
SF_LOGIN_URL=https://login.salesforce.com   # or your My Domain test URL
SF_CLIENT_ID=<consumer-key-from-step-1>
SF_CLIENT_SECRET=<optional>
SF_API_VERSION=v62.0
```

## 4. Smoke test

1. Sign into `app.toughcustomer.ai/connect` as a Supabase user.
2. Click "Connect Salesforce" → complete the SF login.
3. The page returns to `/connect?status=linked` showing your SF email + org.
4. In MCP Inspector against `mcp.toughcustomer.ai/mcp` with your Supabase
   JWT, call `list_opportunities`. You should see exactly the opportunities
   your SF profile + sharing rules allow — no more, no less. **Including
   FLS for admin profiles**, because GraphQL enforces it.
5. Click "Disconnect" on `/connect`. Confirm the next `list_opportunities`
   returns "Reconnect Salesforce".
