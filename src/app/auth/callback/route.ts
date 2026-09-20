/**
 * Where a sign-in link lands.
 *
 * PKCE sends the reader back here with a `?code=`, which is worth nothing on
 * its own: completing it needs the `code_verifier` stored when the link was
 * asked for. That is exactly what the static export could not do, and why this
 * app used to run the weaker implicit flow, handing tokens over in a URL
 * fragment for the browser to sort out. With a server, the exchange happens
 * here and the session goes straight into cookies the server can read.
 *
 * Anything that goes wrong is reported on the sign-in screen rather than
 * dumped as an error page. A link that has expired or been used already is an
 * ordinary thing to happen, not a crash.
 */

import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";

function backToSignIn(origin: string, reason: string): NextResponse {
  return NextResponse.redirect(`${origin}/sign-in/?error=${encodeURIComponent(reason)}`);
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  // Supabase reports a refused link in the query string rather than by failing
  // the redirect, so this arrives looking like an ordinary visit.
  const failure = searchParams.get("error_description") ?? searchParams.get("error");
  if (failure) return backToSignIn(origin, failure);

  const code = searchParams.get("code");
  if (!code) {
    return backToSignIn(origin, "That sign-in link was incomplete. Ask for another one.");
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return backToSignIn(origin, "This build has no Supabase credentials.");
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return backToSignIn(origin, error.message);

  return NextResponse.redirect(`${origin}/`);
}
