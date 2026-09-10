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

function friendly(code: string, description: string): string {
  if (code === "otp_expired") {
    return "That sign-in link has expired. Links last an hour and work once — ask for a new one below.";
  }
  if (code === "access_denied") {
    return "That sign-in link has already been used. Ask for a new one below.";
  }
  // Supabase sends these with `+` for spaces, and they read as sentences.
  const readable = description.replace(/\+/g, " ").trim();
  if (readable) return `${readable.charAt(0).toUpperCase()}${readable.slice(1)}.`;
  return "That sign-in link could not be used. Ask for a new one below.";
}

function capture(): string | null {
  if (typeof window === "undefined") return null;

  // The fragment is where an implicit-flow redirect puts things; the query is
  // where some refusals land instead. Check both.
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const read = (key: string) => fragment.get(key) ?? query.get(key) ?? "";

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

  return friendly(code, description);
}

const captured = capture();

/** The message for the sign-in screen, or null if the visit was ordinary. */
export function signInLinkError(): string | null {
  return captured;
}
