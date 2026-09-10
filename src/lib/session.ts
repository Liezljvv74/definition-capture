/**
 * Who is signed in, as an external store.
 *
 * Shaped like `browserStore` on purpose: one module owns the state, components
 * read it through `useSyncExternalStore`, and nothing else calls
 * `supabase.auth` directly. `loaded` stays false until Supabase has finished
 * looking for a saved session, which is what stops the sign-in screen from
 * flashing in front of an already signed-in reader on every reload.
 */

import { authRedirectUrl, getSupabase } from "@/lib/supabaseClient";

/** Just the fields the UI shows; the access token is never handed out. */
export type SessionUser = { id: string; email: string };

export type SessionSnapshot = {
  user: SessionUser | null;
  loaded: boolean;
};

const signedOut: SessionSnapshot = { user: null, loaded: false };

let snapshot: SessionSnapshot = signedOut;
const listeners = new Set<() => void>();
let started = false;

function publish(next: SessionSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

/**
 * `useSyncExternalStore` compares snapshots by reference, so this returns the
 * same object until something actually changes. Building a fresh one on every
 * read would spin React in an infinite re-render.
 */
function toSnapshot(user: SessionUser | null): SessionSnapshot {
  if (snapshot.loaded && snapshot.user?.id === user?.id) return snapshot;
  return { user, loaded: true };
}

/**
 * Starts listening on first use. Kicked off from `getSnapshot` rather than at
 * module scope so it never runs during the prerender in `next build`.
 */
function start(): void {
  if (started) return;
  const supabase = getSupabase();
  if (!supabase) {
    // No credentials in the build. Report "loaded, nobody signed in" so the UI
    // can explain itself instead of spinning forever.
    started = true;
    publish({ user: null, loaded: true });
    return;
  }
  started = true;

  // Resolves the saved session, and — because `detectSessionInUrl` is on —
  // exchanges the `?code=` a magic link arrives with.
  void supabase.auth.getSession().then(({ data }) => {
    publish(toSnapshot(readUser(data.session)));
  });

  // Fires on sign-in, sign-out, and every token refresh, including ones caused
  // by another tab.
  supabase.auth.onAuthStateChange((_event, session) => {
    publish(toSnapshot(readUser(session)));
  });
}

type MaybeSession = { user?: { id?: string | null; email?: string | null } | null } | null;

function readUser(session: MaybeSession): SessionUser | null {
  const user = session?.user;
  if (!user?.id) return null;
  return { id: user.id, email: user.email ?? "" };
}

export function subscribe(listener: () => void): () => void {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): SessionSnapshot {
  start();
  return snapshot;
}

/** The server render and the hydration pass always see "still loading". */
export function getServerSnapshot(): SessionSnapshot {
  return signedOut;
}

/** The id of the signed-in user, for stamping onto rows. */
export function currentUserId(): string | null {
  return snapshot.user?.id ?? null;
}

/* ---------------------------------------------------------------- commands */

/**
 * Emails a one-time sign-in link. Supabase creates the account on the first
 * link, so this is both sign-up and sign-in — there is no separate register
 * step and no password to store.
 */
export async function sendMagicLink(email: string): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: "This build has no Supabase credentials." };

  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: authRedirectUrl() },
  });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  await getSupabase()?.auth.signOut();
}
