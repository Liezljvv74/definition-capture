"use client";

import { useState } from "react";

import { sendMagicLink } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { useSession } from "@/lib/useSession";

/**
 * Stands in front of the whole app: the glossary now lives in a per-reader
 * Supabase table, so there is nothing to show anyone who is not signed in.
 *
 * Sign-in is a one-time emailed link. Supabase creates the account on the
 * first link, so there is no separate sign-up step, no password to store, and
 * no reset flow to build.
 *
 * `children` is still rendered on the server and handed in here, so the pages
 * themselves did not have to become client components to sit behind this.
 */
export function SignInGate({ children }: { children: React.ReactNode }) {
  const { user, loaded } = useSession();

  // Waiting on Supabase to look for a saved session. Deliberately blank rather
  // than a spinner: on a normal reload this lasts a few frames, and a flicker
  // of "please sign in" for someone already signed in is worse than a pause.
  if (!loaded) return null;

  if (!user) return <SignInScreen />;

  return <>{children}</>;
}

function SignInScreen() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;

    setState("sending");
    setError(null);
    const { error: failure } = await sendMagicLink(email);
    if (failure) {
      setError(failure);
      setState("idle");
      return;
    }
    setState("sent");
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-12 sm:px-6">
      <div className="card p-6">
        <h1 className="text-xl font-semibold">Sign in to your glossary</h1>

        {!isSupabaseConfigured ? (
          // A build with no credentials would otherwise show a sign-in form
          // that silently never works. Say what is actually wrong instead.
          <p className="mt-3 text-sm text-red-700 dark:text-red-400">
            This copy of the app was built without Supabase credentials, so there is nothing
            to sign in to. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> and build again.
          </p>
        ) : state === "sent" ? (
          <div className="mt-3 space-y-3 text-sm">
            <p>
              A sign-in link is on its way to{" "}
              <strong className="font-semibold">{email.trim()}</strong>. Open it in this
              browser and you will land back here, signed in.
            </p>
            <p className="text-slate-600 dark:text-slate-400">
              The link works once and expires after an hour.
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setState("idle")}
            >
              Use a different address
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Your terms and phrases are private to your account. Enter your email and we
              will send a link that signs you in — no password to remember.
            </p>

            <div>
              <label htmlFor="signin-email" className="mb-1.5 block text-sm font-medium">
                Email address
              </label>
              <input
                id="signin-email"
                type="email"
                required
                autoComplete="email"
                className="field"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={state === "sending"}
            >
              {state === "sending" ? "Sending…" : "Email me a sign-in link"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
