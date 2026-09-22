/**
 * Where a password-reset link lands.
 *
 * The same exchange as `/auth/callback`, for the same reason and with the same
 * care about what it says: a code comes back from Supabase, the session goes
 * into cookies the server can read, and anything that went wrong travels as a
 * code rather than as prose somebody else wrote.
 *
 * What differs is the destination. An ordinary sign-in link has done its job
 * once the reader is signed in, so it drops them on the home page. Somebody
 * following a reset link came to choose a new password, so this sends them to
 * the form for doing that, already signed in. Leaving them on the home page
 * would mean asking them to go and find Settings, having just clicked a link
 * that said it would let them set a password.
 *
 * A reset link is proof of the mailbox, not of the old password, which is why
 * the form it leads to does not ask for one. Settings does, because a session
 * is a weaker claim: it might be a screen somebody walked away from.
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

  // A refused link arrives looking like an ordinary visit, with the refusal in
  // the query string. Its code is passed along; its wording is not.
  const failed = searchParams.has("error") || searchParams.has("error_description");
  if (failed) {
    return backToSignIn(origin, searchParams.get("error_code") ?? "refused");
  }

  const code = searchParams.get("code");
  if (!code) return backToSignIn(origin, "incomplete");

  const supabase = await createSupabaseServerClient();
  if (!supabase) return backToSignIn(origin, "unconfigured");

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return backToSignIn(origin, "exchange_failed");

  return NextResponse.redirect(`${origin}/choose-password`);
}
