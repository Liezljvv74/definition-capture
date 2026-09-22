"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { MIN_PASSWORD, setPassword } from "@/lib/session";

/**
 * Where a reset link ends up: choose a new password, having proved the mailbox.
 *
 * No current password is asked for, and that is the whole point of arriving
 * here rather than at Settings. Somebody following this link has just shown
 * they can read the account's email, which is the same proof the sign-in links
 * rest on, and asking them for the password they came here because they do not
 * know would be a circle.
 *
 * It lives inside the workspace group, so the proxy and the layout both insist
 * on a session before it renders. Following the link is what creates that
 * session, so anyone who reaches the form has one; anyone who types the
 * address in without one is sent to sign in, which is the right answer.
 *
 * `setPassword` ends every other session, which matters more here than in
 * Settings: a reset is what somebody does when they think an account has got
 * away from them.
 */
export default function ChoosePasswordPage() {
  const router = useRouter();
  const [password, setDraft] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
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
    const { error: failure } = await setPassword(password);
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }

    setDraft("");
    setConfirm("");
    setDone(true);
  }

  return (
    <>
      <header className="bg-card-blue">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <h1 className="text-xl font-semibold tracking-tight text-indigo-950 sm:text-2xl">
            Choose a password
          </h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8 sm:px-6">
        <div className="card p-5 sm:p-7">
          {done ? (
            <>
              <h2 className="text-lg font-semibold">That is your password now</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                You are signed in on this device. Anywhere else that was signed in has been
                signed out, which is the point of changing it.
              </p>
              <button
                type="button"
                className="btn btn-primary mt-5"
                onClick={() => {
                  // `refresh` as well as `replace`, so the server sees the
                  // session on the next request rather than the router serving
                  // a page it already has.
                  router.replace("/");
                  router.refresh();
                }}
              >
                Go to your words
              </button>
            </>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                You followed a reset link, so you are signed in already. Pick a password and
                you can sign in with it from now on.
              </p>

              <div>
                <label htmlFor="choose-password" className="mb-1.5 block text-sm font-medium">
                  New password
                </label>
                <input
                  id="choose-password"
                  type="password"
                  required
                  autoComplete="new-password"
                  className="field"
                  value={password}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setError(null);
                  }}
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  At least {MIN_PASSWORD} characters.
                </p>
              </div>

              <div>
                <label htmlFor="choose-confirm" className="mb-1.5 block text-sm font-medium">
                  Again, to be sure
                </label>
                <input
                  id="choose-confirm"
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
                {busy ? "Saving…" : "Save password"}
              </button>
            </form>
          )}
        </div>
      </main>
    </>
  );
}
