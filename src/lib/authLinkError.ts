/**
 * Why a sign-in link did not sign you in.
 *
 * When a link is expired, already used, or otherwise refused, Supabase sends
 * the reader back to the app with `error`, `error_code`, and
 * `error_description` in the URL rather than a session. Without this the app
 * would notice only that nobody is signed in, show the sign-in form again,
 * and leave the obvious next move as "ask for another link" — which spends
 * another of the few emails an hour the built-in sender allows, on a problem
 * a sentence could have explained.
 *
 * Captured when this module is first imported, which is before anything has a
 * chance to construct the Supabase client and clear the URL, and removed from
 * the address bar straight away so a reload does not keep showing it.
 */

/**
 * Every sentence this screen can show, chosen by code.
 *
 * A closed table, and that is the point rather than tidiness. This used to
 * take whatever arrived in `error_description` or `error`, capitalise it and
 * render it as the app's own message in a red alert. React escapes the text,
 * so it was never a scripting hole, but anyone could send a link to
 * `/sign-in/?error=Your+account+is+locked,+call+…` and have this app say it in
 * its own voice, which is the more useful half of a phishing page and costs an
 * attacker nothing.
 *
 * The codes below come from two places that are both ours to trust: Supabase's
 * own `error_code`, and the short words `src/app/auth/callback/route.ts` sends
 * when it turns a reader away. Anything else gets the generic sentence, so an
 * unrecognised failure is still reported without being quoted.
 */
const MESSAGES = new Map<string, string>([
  [
    "otp_expired",
    "That sign-in link has expired. Links last an hour and work once. Ask for a new one below.",
  ],
  ["access_denied", "That sign-in link has already been used. Ask for a new one below."],
  ["incomplete", "That sign-in link was incomplete. Ask for a new one below."],
  [
    "exchange_failed",
    "That sign-in link could not be completed. Ask for a new one below, and open it in the browser that asked for it.",
  ],
  [
    "unconfigured",
    "This build has no Supabase credentials, so signing in cannot work yet.",
  ],
]);

const GENERIC = "That sign-in link could not be used. Ask for a new one below.";

/**
 * The sentence for a code, never the caller's own words.
 *
 * Exported for its test: what matters is that an unknown code produces the
 * generic sentence rather than anything the URL supplied.
 */
export function messageForCode(code: string): string {
  // A `Map`, not an object literal: the code comes out of a URL, and a plain
  // object answers `constructor` and `__proto__` with something inherited
  // rather than with `undefined`, so the fallback below would not have fired.
  return MESSAGES.get(code) ?? GENERIC;
}

function capture(): string | null {
  if (typeof window === "undefined") return null;

  // `src/app/auth/callback/route.ts` sends a refused link back here as
  // `?error=<sentence>`. The fragment is checked too, because a link refused
  // before it ever reaches the callback is answered by Supabase directly and
  // lands there instead.
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const read = (key: string) => fragment.get(key) ?? query.get(key) ?? "";

  // `error` and `error_description` are read to notice that something went
  // wrong, and for nothing else. Only the code chooses what is said.
  const error = read("error");
  const code = read("error_code");
  const description = read("error_description");
  if (!error && !code && !description) return null;

  // Take it out of the address bar: it has been read, and a reload should not
  // resurrect a complaint about a link that is no longer being used.
  for (const key of ["error", "error_code", "error_description"]) {
    fragment.delete(key);
    query.delete(key);
  }
  const url = new URL(window.location.href);
  url.search = query.toString();
  url.hash = fragment.toString();
  window.history.replaceState(window.history.state, "", url.toString());

  return messageForCode(code);
}

const captured = capture();

/** The message for the sign-in screen, or null if the visit was ordinary. */
export function signInLinkError(): string | null {
  return captured;
}
