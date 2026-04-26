// RFC 9728 — OAuth 2.0 Protected Resource Metadata.
//
// MCP clients fetch this before calling /mcp to discover the authorization
// server they need to send the user to. The MCP server's 401 response carries
// `WWW-Authenticate: Bearer resource_metadata="<this-url>"` pointing here.
//
// Authorization Server: Supabase Auth at AUTH_BASE_URL (default
// https://auth.toughcustomer.ai). Supabase issues the tokens Claude carries.
// Salesforce is a downstream backend, not the AS — see userstories.md §2.1.
//
// CORS: browser-hosted MCP clients (claude.ai, chatgpt.com) need to fetch
// this cross-origin during OAuth discovery. Returns CORS headers on every
// response, including OPTIONS preflight.

import { corsHeaders, preflightResponse } from "@/lib/cors";

export const runtime = "nodejs";

function baseUrl(): string {
  if (process.env.MCP_PUBLIC_URL) return process.env.MCP_PUBLIC_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "http://localhost:3000";
}

function authBaseUrl(): string {
  return process.env.AUTH_BASE_URL ?? "https://auth.toughcustomer.ai";
}

/**
 * Supabase's OAuth Server issuer identifier includes the `/auth/v1` path:
 *   https://<project>.supabase.co/auth/v1
 *
 * Per RFC 8414 §3.1, when an issuer has a path component, the well-known
 * metadata URL is `<host>/.well-known/oauth-authorization-server<path>`,
 * NOT `<issuer>/.well-known/oauth-authorization-server`. So:
 *
 *   issuer    https://<project>.supabase.co/auth/v1
 *   metadata  https://<project>.supabase.co/.well-known/oauth-authorization-server/auth/v1
 *
 * If we list `authorization_servers: ["https://<project>.supabase.co"]`
 * (no path), strict clients build the wrong well-known URL and 404.
 * Including `/auth/v1` fixes that.
 */
function authIssuer(): string {
  return `${authBaseUrl()}/auth/v1`;
}

export async function GET(req: Request) {
  return Response.json(
    {
      resource: `${baseUrl()}/mcp`,
      authorization_servers: [authIssuer()],
      // Non-standard convenience hints. Strict RFC 9728 clients ignore these;
      // lenient ones (and our own test harness) use them to skip discovery.
      authorization_server_metadata: `${authBaseUrl()}/.well-known/oauth-authorization-server/auth/v1`,
      openid_configuration: `${authBaseUrl()}/auth/v1/.well-known/openid-configuration`,
      bearer_methods_supported: ["header"],
      resource_documentation: `${baseUrl()}/`,
      // Supabase OAuth Server (beta) supports only the standard OIDC scopes:
      // openid, profile, email, phone. Custom scopes (e.g. roleplay:create)
      // aren't yet supported by the AS. We enforce per-tool authorization in
      // our handlers based on the authenticated user's identity instead.
      scopes_supported: ["openid", "profile", "email"],
    },
    { headers: corsHeaders(req) },
  );
}

export async function OPTIONS(req: Request) {
  return preflightResponse(req);
}
