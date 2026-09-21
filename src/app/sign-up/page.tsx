"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { MIN_PASSWORD, signUpWithPassword } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

/**
 * Making an account, for someone who does not have one.
 *
 * Until now the only way in was an account that already existed — created by
 * hand in the Supabase dashboard, or brought into being by the first sign-in
 * link sent to an address. Neither is something a visitor can do.
 *
 * Public, like `/sign-in`: `src/proxy.ts` lets both through without a session
 * and pushes anyone who already has one back to the workspace.
 */
export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set when the account was made but cannot be used until email is confirmed. */
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    if (password.length < MIN_PASSWORD) {
      setError(`A password needs at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }

    setBusy(true);
    setError(null);
    const { needsConfirmation, error: failure } = await signUpWithPassword(email, password);

    if (failure) {
      setError(failure);
      setBusy(false);
      return;
    }

    if (needsConfirmation) {
      setCheckEmail(true);
      setBusy(false);
      return;
    }

    // A session came back, so the account is usable now. Same as signing in:
    // `refresh` is what makes the server look again and notice the cookies.
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-12 sm:px-6">
      <div className="card p-6">
        <h1 className="text-xl font-semibold">Create an account</h1>

        {!isSupabaseConfigured ? (
          <p className="mt-3 text-sm text-red-700 dark:text-red-400">
            This copy of the app was built without Supabase credentials, so there is nothing
            to sign up to. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> and build again.
          </p>
        ) : checkEmail ? (
          // Carefully worded. Supabase answers an address that already has an
          // account exactly as it answers a new one, so that this form cannot
          // be used to find out who has an account here — which means this
          // screen must not claim an account was created.
          <div className="mt-3 space-y-3 text-sm">
            <p>
              Check <strong className="font-semibold">{email.trim()}</strong> for a message
              confirming the address. Open the link in it and you will land in your list,
              signed in.
            </p>
            <p className="text-slate-600 dark:text-slate-400">
              If an account already existed for that address, no new one was made and no
              message was sent. Sign in with it instead.
            </p>
            <Link href="/sign-in" className="btn btn-secondary">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Your terms and phrases will be private to this account. Nobody else signed in
              can see them.
            </p>

            <div>
              <label htmlFor="signup-email" className="mb-1.5 block text-sm font-medium">
                Email address
              </label>
              <input
                id="signup-email"
                type="email"
                required
                autoComplete="email"
                className="field"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            <div>
              <label htmlFor="signup-password" className="mb-1.5 block text-sm font-medium">
                Password
              </label>
              <input
                id="signup-password"
                type="password"
                required
                autoComplete="new-password"
                className="field"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError(null);
                }}
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                At least {MIN_PASSWORD} characters.
              </p>
            </div>

            <div>
              <label htmlFor="signup-confirm" className="mb-1.5 block text-sm font-medium">
                Again, to be sure
              </label>
              <input
                id="signup-confirm"
                type="password"
                required
                autoComplete="new-password"
                className="field"
                value={confirm}
                onChange={(event) => {
                  setConfirm(event.target.value);
                  setError(null);
                }}
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-400">
                {error}
              </p>
            )}

            <button type="submit" className="btn btn-primary w-full" disabled={busy}>
              {busy ? "Creating…" : "Create account"}
            </button>

            <p className="text-center text-sm">
              <Link href="/sign-in" className="link-button">
                I already have an account
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
