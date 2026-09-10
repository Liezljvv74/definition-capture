/**
 * The one Supabase client the app uses.
 *
 * Everything here runs in the browser: the app is a static export (see
 * `next.config.ts`), so there is no server process and no server-side key. The
 * only credential in play is the publishable key, which is compiled into the
 * JavaScript bundle and readable by anyone who views source. That is what it is
 * designed for — the row level security policies in
 * `supabase/migrations/*_create_glossary.sql` are what actually keep one
 * account's terms away from another's.
 *
 * The client is built lazily rather than at module scope. `next build`
 * prerenders Client Components in Node, where `window` and `localStorage` do
 * not exist, so constructing it eagerly would break the build.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
 * rather than throwing, because a missing env var at build time would otherwise
 * surface as an unexplained blank page on the deployed site.
 */
export function getSupabase(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (!url || !publishableKey) return null;

  client ??= createClient(url, publishableKey, {
    auth: {
      // Keep the session across reloads and refresh it in the background.
      persistSession: true,
      autoRefreshToken: true,
      // The magic link lands back on the site with a `?code=` parameter; this
      // is what exchanges it for a session. There is no server to do it for us.
      detectSessionInUrl: true,
      flowType: "pkce",
    },
  });
  return client;
}

/**
 * Where a magic link should send the reader back to. Built from the live
 * location rather than a constant so the same code works on localhost:3001 and
 * under the `/definition-capture` base path on GitHub Pages.
 *
 * Whatever this returns must also be listed under Authentication → URL
 * Configuration → Redirect URLs in the Supabase dashboard, or the link will
 * bounce to the site root instead.
 */
export function authRedirectUrl(): string {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${window.location.origin}${basePath}/`;
}
