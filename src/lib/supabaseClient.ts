/**
 * The browser's Supabase client.
 *
 * Built with `createBrowserClient` from `@supabase/ssr` rather than the plain
 * `createClient`, and the difference is where the session is kept. The plain
 * client stores it in `localStorage`, which no server can read — fine when the
 * app was a static export with no server to speak of, useless now that
 * `src/proxy.ts` has to decide whether a request may see a page. The SSR
 * client keeps the session in cookies instead, so the same session the browser
 * holds is the one the server is handed on every request.
 *
 * It also uses PKCE, which the static build could not. PKCE keeps a
 * `code_verifier` and needs it back to complete a sign-in link; there is now a
 * server route, `src/app/auth/callback/route.ts`, to do that exchange, so the
 * awkward implicit flow this app used to depend on is gone.
 *
 * The publishable key compiled in here is meant to be public, and row level
 * security is what protects the rows behind it.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

// `sb_publishable_...` is the current name for what used to be the anon key.
// The old name is still accepted so an existing key keeps working.
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when the build was given credentials — the sign-in screen checks this. */
export const isSupabaseConfigured = Boolean(url && publishableKey);

let client: SupabaseClient | null = null;

/**
 * Returns the shared client, or null when the app was built without
 * credentials. Callers treat null as "not configured" and say so on screen
 * rather than throwing, because a missing env var would otherwise surface as
 * an unexplained blank page.
 *
 * Built lazily: a Client Component is still rendered on the server first, and
 * there is no `document` there to read cookies from.
 */
export function getSupabase(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (!url || !publishableKey) return null;

  client ??= createBrowserClient(url, publishableKey);
  return client;
}

/**
 * Where a sign-in link should send the reader back to: the server route that
 * trades the link's `?code=` for a session and sets the cookies.
 *
 * Whatever this returns must also be listed under Authentication → URL
 * Configuration → Redirect URLs in the Supabase dashboard, or the link will
 * bounce to the site root instead.
 */
export function authRedirectUrl(): string {
  return `${window.location.origin}/auth/callback`;
}

/**
 * Where a password-reset link lands, which is deliberately not the same place.
 *
 * Both routes exchange a code for a session and both end up signed in, so the
 * difference is only what happens next: an ordinary link drops the reader on
 * the home page, and this one sends them to a form for choosing a new
 * password, because that is the thing they set out to do. The alternative was
 * a query parameter on the one callback, which would have to survive
 * Supabase's redirect allow list; a second registered URL is plainer and fails
 * in an obvious way rather than a subtle one.
 *
 * This URL has to be listed under Authentication, URL Configuration, Redirect
 * URLs in the Supabase dashboard, exactly as the callback is.
 */
export function passwordResetUrl(): string {
  return `${window.location.origin}/auth/reset`;
}
