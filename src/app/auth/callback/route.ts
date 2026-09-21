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
 *
 * What travels back is a code, never a sentence. The sign-in screen owns the
 * wording, in `src/lib/authLinkError.ts`, so that nothing a caller puts in the
 * URL can be rendered as this app's own message.
 */

import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";

/** `reason` is a code from the small set `authLinkError.ts` knows. */
function backToSignIn(origin: string, reason: string): NextResponse {
  return NextResponse.redirect(
    `${origin}/sign-in/?error_code=${encodeURIComponent(reason)}`,
  );
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  // Supabase reports a refused link in the query string rather than by failing
  // the redirect, so this arrives looking like an ordinary visit. Its own
  // `error_code` is passed along; its prose is not.
  const failed = searchParams.has("error") || searchParams.has("error_description");
  if (failed) {
    return backToSignIn(origin, searchParams.get("error_code") ?? "refused");
  }

  const code = searchParams.get("code");
  if (!code) return backToSignIn(origin, "incomplete");

  const supabase = await createSupabaseServerClient();
  if (!supabase) return backToSignIn(origin, "unconfigured");

  // The message is deliberately dropped rather than forwarded: it can carry
  // whatever the request provoked, and this screen says its own sentences.
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return backToSignIn(origin, "exchange_failed");

  return NextResponse.redirect(`${origin}/`);
}
