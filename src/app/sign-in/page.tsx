"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { signInLinkError } from "@/lib/authLinkError";
import { sendMagicLink, signInWithPassword } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

/**
 * The sign-in page — the one route in the app a signed-out visitor may see.
 *
 * It used to be a component wrapped around the whole app, hiding the workspace
 * from the browser it had already been sent to. Now `src/proxy.ts` sends
 * anyone without a session here before a protected page is rendered, and sends
 * anyone with one back out again.
 */

/**
 * The two ways in, in the order they are worth trying.
 *
 * `password` is first and is the default because it sends no email, so it
 * works as many times a day as you like. The link route is there for an
 * account that has no password yet, which is every account that was created by
 * following a link in the first place.
 */
type Route = "password" | "email";

export default function SignInPage() {
  const [route, setRoute] = useState<Route>("password");
  // Seeded from the URL: arriving here from a link that failed should say so,
  // rather than looking like an ordinary first visit. It belongs to the visit
  // rather than to either form, so it sits above both.
  const [linkError, setLinkError] = useState<string | null>(() => signInLinkError());

  function go(next: Route): void {
    setLinkError(null);
    setRoute(next);
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-12 sm:px-6">
      <div className="card p-6">
        <h1 className="text-xl font-semibold">Sign in to your terms</h1>

        {!isSupabaseConfigured ? (
          // A build with no credentials would otherwise show a sign-in form
          // that silently never works. Say what is actually wrong instead.
          <p className="mt-3 text-sm text-red-700 dark:text-red-400">
            This copy of the app was built without Supabase credentials, so there is nothing
            to sign in to. Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> and build again.
          </p>
        ) : (
          <>
            {linkError && (
              <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">
                {linkError}
              </p>
            )}

            {route === "password" && <PasswordForm onUseEmail={() => go("email")} />}
            {route === "email" && <EmailLinkForm onUsePassword={() => go("password")} />}
          </>
        )}
      </div>
    </main>
  );
}

/* --------------------------------------------------------------- password */

/**
 * Supabase answers a wrong password and an account that has no password with
 * the same sentence, and on its own that sentence sends someone away looking
 * for a typo they did not make. Say what the other cause is and where the cure
 * lives.
 */
function explainSignInFailure(message: string): string {
  if (!/invalid login credentials/i.test(message)) return message;
  return (
    "That email and password did not match an account. An account that has only " +
    "ever been used through an emailed link has no password until one is set for " +
    "it. Sign in with a link below, then set a password under Settings."
  );
}

function PasswordForm({ onUseEmail }: { onUseEmail: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password || busy) return;

    setBusy(true);
    setError(null);
    const { error: failure } = await signInWithPassword(email, password);
    if (failure) {
      setError(explainSignInFailure(failure));
      setBusy(false);
      return;
    }

    // The session is in cookies now, so the server can see it on the next
    // request. `refresh` is what makes that request: without it the client
    // router could serve the sign-in page it already has, and the proxy would
    // never get the chance to notice that the visitor is signed in.
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Your terms and phrases are private to your account.
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

      <div>
        <label htmlFor="signin-password" className="mb-1.5 block text-sm font-medium">
          Password
        </label>
        <input
          id="signin-password"
          type="password"
          required
          autoComplete="current-password"
          className="field"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>

      <p className="space-x-3 text-center text-sm">
        <button type="button" onClick={onUseEmail} className="link-button">
          Email me a link instead
        </button>
        <span aria-hidden="true" className="text-slate-400">
          ·
        </span>
        <Link href="/sign-up" className="link-button">
          Create an account
        </Link>
      </p>
    </form>
  );
}

/* ------------------------------------------------------------- email link */

/**
 * Supabase will not send a second link to the same address inside a minute,
 * and refuses with a rate-limit error rather than quietly ignoring it. The
 * button waits that minute out instead of letting the reader spend a
 * request on a refusal.
 */
const RESEND_SECONDS = 60;

/** Supabase phrases both its limits the same way; the reader needs the why. */
function explainFailure(message: string): string {
  if (!/rate limit/i.test(message)) return message;
  return (
    "The email sender will not send another link to this address yet: one a " +
    "minute, and only a few an hour. Check your inbox first: a link sent " +
    "earlier may still be waiting, and it works for an hour. A password, set " +
    "under Settings once you are in, avoids this limit altogether."
  );
}

function EmailLinkForm({ onUsePassword }: { onUsePassword: () => void }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  /** Seconds until another link may be asked for. */
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((left) => left - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim() || cooldown > 0) return;

    setState("sending");
    setError(null);
    const { error: failure } = await sendMagicLink(email);
    if (failure) {
      setError(explainFailure(failure));
      setState("idle");
      // A refusal is still a request as far as the limit is concerned, so
      // hold the button either way rather than inviting another one.
      if (/rate limit/i.test(failure)) setCooldown(RESEND_SECONDS);
      return;
    }
    setCooldown(RESEND_SECONDS);
    setState("sent");
  }

  if (state === "sent") {
    return (
      <div className="mt-3 space-y-3 text-sm">
        <p>
          A sign-in link is on its way to{" "}
          <strong className="font-semibold">{email.trim()}</strong>. Open it on any device
          and you will land in your list, signed in.
        </p>
        <p className="text-slate-600 dark:text-slate-400">
          The link works once and expires after an hour. Only a few can be sent an hour, so
          give the first one a minute to arrive before asking for another, or set a
          password under Settings once you are in, and skip the email next time.
        </p>
        <button type="button" className="btn btn-secondary" onClick={() => setState("idle")}>
          Use a different address
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        For an account with no password yet. Enter your email and we will send a link that
        signs you in.
      </p>

      <div>
        <label htmlFor="link-email" className="mb-1.5 block text-sm font-medium">
          Email address
        </label>
        <input
          id="link-email"
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
        disabled={state === "sending" || cooldown > 0}
      >
        {state === "sending"
          ? "Sending…"
          : cooldown > 0
            ? `Another link in ${cooldown}s`
            : "Email me a sign-in link"}
      </button>

      <p className="text-center text-sm">
        <button type="button" onClick={onUsePassword} className="link-button">
          Use a password instead
        </button>
      </p>
    </form>
  );
}
