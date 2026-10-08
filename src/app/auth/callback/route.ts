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

import type { NextRequest } from "next/server";

import { exchangeLink } from "@/lib/authLink";

export const GET = (request: NextRequest) => exchangeLink(request, "/home");
