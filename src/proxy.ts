/**
 * Runs on the server before any page is rendered, and decides who gets to see
 * one.
 *
 * This is the check the app used to be missing. As a static export there was
 * nowhere to ask the question except the browser, and `SignInGate` only ever
 * hid the workspace; the markup was served to anyone who asked. Here the
 * question is asked and answered before a page is rendered at all.
 *
 * Named `proxy.ts` rather than `middleware.ts` because Next 16 renamed the
 * convention; `middleware` still works but is deprecated. See
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`.
 *
 * It does two jobs at once, and both matter:
 *
 *  1. Refreshes the session cookies. Access tokens expire every hour, and a
 *     Server Component cannot write cookies, so if this did not run the
 *     session would quietly die an hour into the day.
 *  2. Sends anyone without a session to the landing page, `/`, whether they
 *     have an account or not (the owner asked for everybody to start there,
 *     3 October 2026), and anyone with one from `/`, `/sign-in` or `/sign-up`
 *     to `/home`.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Reachable without a session. Everything else is the workspace. */
const PUBLIC_PATHS = ["/sign-in", "/sign-up", "/auth"];

/** The two that make no sense to somebody who is already signed in. */
const SIGNED_OUT_ONLY = ["/sign-in", "/sign-up"];

/**
 * The paths these two pages used to live at.
 *
 * `/terms` and `/term?id=` were the glossary's addresses for most of this
 * app's life, and a `?id=` link is exactly the kind of thing that gets pasted
 * into a note outside the app. A `[[Name]]` reference inside the app needs no
 * help: it is resolved against the list as it renders, so it already points at
 * the new path. This is for everything that was written down elsewhere.
 *
 * The query string survives the redirect, which is the whole point for
 * `/term?id=…`.
 */
const MOVED: Record<string, string> = {
  "/terms": "/vocabulary",
  "/term": "/word",
  "/conversations": "/tutor",
};

/** `trailingSlash: true` means paths arrive as `/sign-in/`; compare without it. */
function normalise(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function isPublic(pathname: string): boolean {
  const path = normalise(pathname);
  // The landing page, matched exactly. It cannot go in PUBLIC_PATHS: those
  // are prefixes, and every path starts with `/`.
  if (path === "/") return true;
  return PUBLIC_PATHS.some((base) => path === base || path.startsWith(`${base}/`));
}

/**
 * A redirect that keeps whatever the session refresh just wrote.
 *
 * `setAll` below rebuilds `response` so the browser is told to keep the
 * rotated cookies, but a redirect is a different response and starts out with
 * none of them. Returning one directly threw the refresh away: a token that
 * happened to rotate on a request to a moved path, or to `/sign-in` while
 * already signed in, never reached the browser, and once the old refresh
 * token fell outside Supabase's reuse window the reader was signed out for no
 * reason they could see. That is the same failure the note above `getClaims`
 * warns about, arriving through a different door.
 */
function redirectKeeping(response: NextResponse, target: URL): NextResponse {
  const redirect = NextResponse.redirect(target);
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

/**
 * What a signed-out request to `/api/` gets instead of a redirect. A fetch
 * that follows a redirect lands on the sign-in page's HTML and fails to parse
 * it, so the caller cannot tell "signed out" from "broken"; a 401 with a body
 * it can read is the answer a script needs. Keeps the refreshed cookies for
 * the same reason `redirectKeeping` does.
 */
function unauthorisedKeeping(response: NextResponse): NextResponse {
  const denied = NextResponse.json({ error: "signed_out" }, { status: 401 });
  for (const cookie of response.cookies.getAll()) denied.cookies.set(cookie);
  return denied;
}

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // A build with no credentials has nothing to check against. Let the request
  // through so the sign-in screen can explain itself, rather than bouncing
  // between two pages that both need a Supabase that is not there.
  if (!url || !publishableKey) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Onto the request so anything rendered downstream in this same pass
        // sees the refreshed session, and onto a rebuilt response so the
        // browser is told to keep it.
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Nothing may go between creating the client and this call. `getClaims`
  // refreshes the session as a side effect, and any `await` slipped in ahead
  // of it can have the cookies written in the wrong order, which signs people
  // out at random and is thoroughly miserable to debug.
  //
  // `getClaims`, never `getSession`: a cookie is sent by the caller, so a
  // session read straight out of one is a claim, not a fact. This verifies the
  // token's signature before believing a word of it.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const { pathname } = request.nextUrl;

  // Ahead of the session check so the rule lives in one place and applies
  // whoever is asking. A signed-out reader still loses the `?id=` at the
  // sign-in bounce below, exactly as they did before the rename.
  const moved = MOVED[normalise(pathname)];
  if (moved) {
    const target = request.nextUrl.clone();
    target.pathname = moved;
    return redirectKeeping(response, target);
  }

  if (!signedIn && !isPublic(pathname)) {
    if (normalise(pathname).startsWith("/api/")) return unauthorisedKeeping(response);
    const target = request.nextUrl.clone();
    target.pathname = "/";
    target.search = "";
    return redirectKeeping(response, target);
  }

  // The landing page is for visitors; somebody signed in wants their
  // dashboard. Sign-in and sign-up make no sense to them either.
  const path = normalise(pathname);
  if (signedIn && (path === "/" || SIGNED_OUT_ONLY.includes(path))) {
    const target = request.nextUrl.clone();
    target.pathname = "/home";
    target.search = "";
    return redirectKeeping(response, target);
  }

  return response;
}

export const config = {
  // Everything except Next's own static output and the handful of files served
  // straight out of `public/`. Without the exclusions this would run on every
  // stylesheet and image, and the redirect above would keep the sign-in page
  // from loading its own CSS.
  //
  // The public files are named one by one. This used to end in a pattern that
  // excluded *any* path ending in `.png`, `.css`, `.js`, `.txt` and so on, at
  // any depth, which quietly meant "runs before every request" was not true.
  // Nothing protected happened to match, because `trailingSlash: true` ends
  // every page path with a slash, but the exclusion was a standing invitation:
  // one route handler or data URL ending in a listed extension and it would
  // have skipped the session check and the cookie refresh with it. An exact
  // list cannot widen by accident; a new file in `public/` either gets added
  // here or simply goes through the proxy, and going through it is harmless.
  //
  // The crawler files (robots.txt, sitemap.xml, llms.txt and the generated
  // opengraph image) are listed too, so a search engine or LLM can read them
  // without a session instead of being bounced to /sign-in.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|captured-logo\\.png|captured-logo-bg\\.png|robots\\.txt|sitemap\\.xml|llms\\.txt|opengraph-image).*)",
  ],
};
