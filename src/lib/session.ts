/**
 * Who is signed in, as an external store.
 *
 * Shaped like `browserStore` on purpose: one module owns the state, components
 * read it through `useSyncExternalStore`, and nothing else calls
 * `supabase.auth` directly. `loaded` stays false until Supabase has finished
 * looking for a saved session, which is what stops the sign-in screen from
 * flashing in front of an already signed-in reader on every reload.
 */

import { authRedirectUrl, getSupabase, passwordResetUrl } from "@/lib/supabaseClient";

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
 * Supabase's own floor for a password. Checking it here rather than letting the
 * server say so saves a round trip and, more to the point, lets the form say it
 * before anyone has finished typing.
 */
export const MIN_PASSWORD = 6;

/**
 * Creates an account from an email and a password.
 *
 * Whether the new account can be used straight away is the project's decision,
 * not this app's: with email confirmation switched on Supabase withholds the
 * session until the address has been confirmed, and with it off the account is
 * usable immediately. `needsConfirmation` reports which happened, by looking at
 * whether a session came back, so the screen can say the right thing without
 * this app having to know how the dashboard is configured.
 *
 * Note that a refusal is not always reported. With confirmations on, signing up
 * with an address that already has an account returns success rather than
 * saying so — Supabase does that deliberately, so that a stranger cannot use
 * this form to discover who has an account here. The screen must therefore not
 * promise that a new account was made, only that a confirmation email is on its
 * way if one was needed.
 */
export async function signUpWithPassword(
  email: string,
  password: string,
): Promise<{ needsConfirmation: boolean; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) {
    return { needsConfirmation: false, error: "This build has no Supabase credentials." };
  }

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: authRedirectUrl() },
  });
  if (error) return { needsConfirmation: false, error: error.message };

  return { needsConfirmation: data.session === null, error: null };
}

/**
 * Signs in with a password.
 *
 * This is the route the sign-in screen offers first, because it is the only
 * one that sends no email and so cannot run into the sender's limits: the
 * built-in sender allows one link a minute and a few an hour, which is quickly
 * spent by signing in and out a few times while working on the app.
 *
 * Supabase does the checking; no password is ever stored, compared, or hashed
 * by this app.
 */
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: "This build has no Supabase credentials." };

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  return { error: error?.message ?? null };
}

/**
 * Changes the password of the signed-in account, having first proved that the
 * reader knows the current one.
 *
 * Supabase's `updateUser` does not ask for the old password: a session is
 * enough. That is the right rule for a reset, where the mailbox has just been
 * proved, and the wrong one for Settings, where the session may be a screen
 * somebody walked away from. So the current password is checked first, by
 * signing in with it. Supabase does the checking, as it does everywhere else
 * here; nothing in this app ever sees a stored password, and a wrong guess
 * costs the same as a wrong guess on the sign-in screen.
 *
 * An account made through an emailed link has no password to know, and cannot
 * use this. `sendPasswordReset` is the way in for that reader, which Settings
 * offers beside this form.
 */
export async function changePassword(
  email: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: "This build has no Supabase credentials." };

  const { error: wrong } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (wrong) return { error: "That is not your current password." };

  return setPassword(newPassword);
}

/**
 * Emails a link that signs the reader in and takes them straight to a form for
 * choosing a new password.
 *
 * The answer is the same whether or not the address has an account, and it is
 * the screen that says so rather than this function: telling somebody that an
 * address is unknown turns the form into a way of discovering who has an
 * account here, which is the same reason sign-up never confirms one either.
 */
export async function sendPasswordReset(email: string): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: "This build has no Supabase credentials." };

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: passwordResetUrl(),
  });
  return { error: error?.message ?? null };
}

/**
 * Gives the signed-in account a password, or replaces the one it has.
 *
 * An account that has only ever been used through an emailed link has no
 * password at all, and no way to be given one from the sign-in screen — the
 * request has to come from a session that already exists. So it lives in
 * Settings, and it is how an existing reader stops depending on the email
 * sender.
 */
export async function setPassword(password: string): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: "This build has no Supabase credentials." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  // Every other session is ended, and this one is kept.
  //
  // Changing a password is what you do when you think someone else may have
  // had your account, and leaving their session signed in would make the
  // change pointless — Supabase does not revoke anything on its own. `others`
  // rather than `global` so the person doing it is not signed out of the page
  // they are standing on.
  //
  // A failure here is deliberately not reported as a failure: the password did
  // change, and saying otherwise would invite someone to set it twice.
  await supabase.auth.signOut({ scope: "others" });
  return { error: null };
}

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
