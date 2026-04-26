// /auth/signin — Supabase sign-in.
//
// GET   → renders an email magic-link form (preserves ?next=).
// POST  → if `email` form field present, sends a Supabase magic link;
//         otherwise falls back to Google OAuth (which requires the provider
//         to be enabled in Supabase Dashboard → Authentication → Sign In /
//         Providers).
//
// The magic-link path is the unblocker until Google OAuth is configured.
// Both paths flow through /auth/callback after Supabase finishes auth, and
// the `next` URL is preserved across the round trip.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseSSRClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

function appBaseUrl(): string {
  return (
    process.env.APP_BASE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000")
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlResponse(body: string, status = 200): NextResponse {
  return new NextResponse(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

const PAGE_STYLE = `
  body { font-family: system-ui, sans-serif; max-width: 480px; margin: 3rem auto; padding: 0 1rem; line-height: 1.5; }
  h1 { font-size: 1.4rem; margin-bottom: .25rem; }
  p { color: #444; }
  form { display: flex; flex-direction: column; gap: .75rem; margin-top: 1.5rem; }
  input[type=email] { padding: .6rem .75rem; font-size: 1rem; border: 1px solid #ccc; border-radius: 6px; }
  button { padding: .6rem 1rem; border: 1px solid #06f; background: #06f; color: white; border-radius: 6px; cursor: pointer; font-size: 1rem; }
  .alt { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #eee; }
  .muted { color: #666; font-size: .85rem; }
`;

function signinForm(next: string, message?: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Sign in — Tough Customer</title>
<style>${PAGE_STYLE}</style></head>
<body>
  <h1>Sign in to Tough Customer</h1>
  <p>Enter your email — we'll send you a one-time sign-in link.</p>
  ${message ? `<p style="color:#b00">${escapeHtml(message)}</p>` : ""}
  <form method="POST" action="/auth/signin">
    <input type="hidden" name="next" value="${escapeHtml(next)}">
    <input type="email" name="email" required placeholder="you@example.com" autofocus>
    <button type="submit">Send magic link</button>
  </form>
  <div class="alt">
    <form method="POST" action="/auth/signin?provider=google">
      <input type="hidden" name="next" value="${escapeHtml(next)}">
      <button type="submit" style="background:white;color:#333;border-color:#999">
        Sign in with Google
      </button>
    </form>
    <p class="muted">Google requires the provider to be enabled in Supabase Auth settings.</p>
  </div>
</body></html>`;
}

function magicLinkSentPage(email: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Check your email — Tough Customer</title>
<style>${PAGE_STYLE}</style></head>
<body>
  <h1>Check your email</h1>
  <p>We sent a sign-in link to <strong>${escapeHtml(email)}</strong>.</p>
  <p class="muted">Open the email and click the link. The link is single-use and expires in a few minutes. After clicking, you'll land back where you started.</p>
</body></html>`;
}

export async function GET(req: NextRequest) {
  const next = req.nextUrl.searchParams.get("next") || "/connect";
  return htmlResponse(signinForm(next));
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const email = formData.get("email");
  const formNext = formData.get("next");
  const queryNext = req.nextUrl.searchParams.get("next");
  const next =
    (typeof formNext === "string" && formNext) ||
    queryNext ||
    "/connect";

  const callbackUrl = new URL("/auth/callback", appBaseUrl());
  callbackUrl.searchParams.set("next", next);

  const supabase = await getSupabaseSSRClient();

  // Magic link path
  if (typeof email === "string" && email.length > 0) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl.toString() },
    });
    if (error) {
      return htmlResponse(
        signinForm(next, `Magic-link send failed: ${error.message}`),
        400,
      );
    }
    return htmlResponse(magicLinkSentPage(email));
  }

  // Fallback: Google OAuth (requires provider to be enabled in Supabase)
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl.toString() },
  });
  if (error || !data.url) {
    return htmlResponse(
      signinForm(
        next,
        `Google sign-in failed: ${error?.message ?? "unknown error"}. Try the magic link above.`,
      ),
      400,
    );
  }
  return NextResponse.redirect(data.url);
}
