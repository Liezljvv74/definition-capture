/**
 * The exchange behind every emailed link, shared by `/auth/callback` and
 * `/auth/reset`, which differ only in where a signed-in reader goes next. Why
 * it works this way, and why failures travel as codes, is set out at the top of
 * `src/app/auth/callback/route.ts`.
 */

import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";

/** `reason` is a code from the small set `authLinkError.ts` knows. */
function backToSignIn(origin: string, reason: string): NextResponse {
  return NextResponse.redirect(
    `${origin}/sign-in/?error_code=${encodeURIComponent(reason)}`,
  );
}

/** Exchanges the link's code for a session, then sends the reader to `destination`, a path on this origin. */
export async function exchangeLink(request: NextRequest, destination: string): Promise<NextResponse> {
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

  return NextResponse.redirect(`${origin}${destination}`);
}
