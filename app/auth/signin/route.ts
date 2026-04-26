// /auth/signin — Supabase sign-in.
//
// Three sign-in paths (handler picks based on the form fields submitted):
//
//   1. email + password   → signInWithPassword (no PKCE, no email round-trip;
//                            most reliable for testing).
//   2. email only         → signInWithOtp magic link (requires email click;
//                            fragile when the user clicks from another browser).
//   3. (no email)         → Google OAuth (requires provider enabled in
//                            Supabase Auth → Sign In / Providers).
//
// All redirects use HTTP 303 so browsers downgrade method to GET on the
// next hop (Supabase's /authorize requires GET; 307 would preserve POST
// and yield 405). The `next` URL is preserved end-to-end.

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
  form { display: flex; flex-direction: column; gap: .6rem; margin-top: 1rem; }
  input { padding: .55rem .75rem; font-size: 1rem; border: 1px solid #ccc; border-radius: 6px; }
  button { padding: .6rem 1rem; border: 1px solid #06f; background: #06f; color: white; border-radius: 6px; cursor: pointer; font-size: 1rem; }
  .alt { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #eee; }
  .muted { color: #666; font-size: .85rem; }
  .error { color: #b00; }
  fieldset { border: 1px solid #ddd; border-radius: 6px; padding: .75rem 1rem; }
  legend { padding: 0 .5rem; font-size: .9rem; color: #555; }
`;

function signinForm(next: string, message?: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Sign in — Tough Customer</title>
<style>${PAGE_STYLE}</style></head>
<body>
  <h1>Sign in to Tough Customer</h1>
  ${message ? `<p class="error">${escapeHtml(message)}</p>` : ""}

  <fieldset>
    <legend>Email + password</legend>
    <form method="POST" action="/auth/signin">
      <input type="hidden" name="next" value="${escapeHtml(next)}">
      <input type="email" name="email" required placeholder="you@example.com" autofocus>
      <input type="password" name="password" required placeholder="password" minlength="6">
      <button type="submit">Sign in</button>
    </form>
  </fieldset>

  <fieldset class="alt">
    <legend>Magic link</legend>
    <form method="POST" action="/auth/signin">
      <input type="hidden" name="next" value="${escapeHtml(next)}">
      <input type="email" name="email" required placeholder="you@example.com">
      <button type="submit" name="mode" value="magic" style="background:white;color:#06f">
        Send sign-in link
      </button>
    </form>
    <p class="muted">Click the link from the same browser you submitted from.</p>
  </fieldset>

  <fieldset class="alt">
    <legend>Google</legend>
    <form method="POST" action="/auth/signin">
      <input type="hidden" name="next" value="${escapeHtml(next)}">
      <button type="submit" name="mode" value="google" style="background:white;color:#333;border-color:#999">
        Sign in with Google
      </button>
    </form>
    <p class="muted">Requires the Google provider to be enabled in Supabase Auth settings.</p>
  </fieldset>
</body></html>`;
}

function magicLinkSentPage(email: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Check your email — Tough Customer</title>
<style>${PAGE_STYLE}</style></head>
<body>
  <h1>Check your email</h1>
  <p>We sent a sign-in link to <strong>${escapeHtml(email)}</strong>.</p>
  <p class="muted">Click the link from the same browser you used to submit this form. The link is single-use.</p>
</body></html>`;
}

export async function GET(req: NextRequest) {
  const next = req.nextUrl.searchParams.get("next") || "/connect";
  return htmlResponse(signinForm(next));
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const email = formData.get("email");
  const password = formData.get("password");
  const mode = formData.get("mode");
  const formNext = formData.get("next");
  const queryNext = req.nextUrl.searchParams.get("next");
  const next =
    (typeof formNext === "string" && formNext) ||
    queryNext ||
    "/connect";

  const callbackUrl = new URL("/auth/callback", appBaseUrl());
  callbackUrl.searchParams.set("next", next);

  const supabase = await getSupabaseSSRClient();

  // Path 1: email + password
  if (
    typeof email === "string" && email.length > 0 &&
    typeof password === "string" && password.length > 0
  ) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return htmlResponse(signinForm(next, `Sign-in failed: ${error.message}`), 400);
    }
    // Session cookies are now set. 303 forces GET on the next hop.
    return NextResponse.redirect(new URL(next, appBaseUrl()), 303);
  }

  // Path 2: magic link (email only, no password, OR explicit mode=magic)
  if (
    typeof email === "string" && email.length > 0 &&
    (mode === "magic" || !password)
  ) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl.toString() },
    });
    if (error) {
      return htmlResponse(signinForm(next, `Magic-link send failed: ${error.message}`), 400);
    }
    return htmlResponse(magicLinkSentPage(email));
  }

  // Path 3: Google OAuth
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl.toString() },
  });
  if (error || !data.url) {
    return htmlResponse(
      signinForm(next, `Google sign-in failed: ${error?.message ?? "unknown error"}`),
      400,
    );
  }
  return NextResponse.redirect(data.url, 303);
}
