/**
 * The server's Supabase client — the one the app is trusted on.
 *
 * Reads the session out of the request's cookies, which is what lets a Server
 * Component ask who is signed in before it renders anything. Never import this
 * from a Client Component: it reaches for `next/headers`, which only exists on
 * the server.
 *
 * Use `getClaims()` and not `getSession()` on anything that comes out of here.
 * `getSession` reads the cookie and believes it; a cookie is something the
 * caller sends, so believing it means rendering whatever page an attacker asks
 * for. `getClaims` verifies the token's signature — locally against the
 * project's public JWKS, since this project signs with an asymmetric key —
 * before it says who anybody is.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  if (!url || !publishableKey) return null;

  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // A Server Component cannot set cookies — the response headers have
          // already gone out by the time it renders. Ignoring it is correct
          // rather than lazy: the proxy in `src/proxy.ts` runs before every
          // request and refreshes the session cookies there, so anything
          // dropped here has already been written by the time it matters.
        }
      },
    },
  });
}

/**
 * The signed-in user's id, or null. The single question every protected page
 * needs answered, asked in the one way that cannot be forged.
 */
export async function serverUserId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return typeof sub === "string" ? sub : null;
}
