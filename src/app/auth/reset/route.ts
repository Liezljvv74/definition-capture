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

import type { NextRequest } from "next/server";

import { exchangeLink } from "@/lib/authLink";

export const GET = (request: NextRequest) => exchangeLink(request, "/choose-password");
