"use client";

import { useEffect, useState } from "react";

import { signInLinkError } from "@/lib/authLinkError";
import { redeemPairingCode } from "@/lib/pairing";
import { sendMagicLink } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { useSession } from "@/lib/useSession";

/**
 * Stands in front of the whole app: the term list now lives in a per-reader
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
    "The email sender will not send another link to this address yet — one a " +
    "minute, and only a few an hour. Check your inbox first: a link sent " +
    "earlier may still be waiting, and it works for an hour."
  );
}

function SignInScreen() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  /** Seconds until another link may be asked for. */
  const [cooldown, setCooldown] = useState(0);
  /** The email route, or a code from a device that is already signed in. */
  const [route, setRoute] = useState<"email" | "code">("email");
  // Seeded from the URL: arriving here from a link that failed should say
  // so, rather than looking like an ordinary first visit.
  const [error, setError] = useState<string | null>(() => signInLinkError());

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
        ) : route === "code" ? (
          <PairingCodeForm onUseEmail={() => setRoute("email")} />
        ) : state === "sent" ? (
          <div className="mt-3 space-y-3 text-sm">
            <p>
              A sign-in link is on its way to{" "}
              <strong className="font-semibold">{email.trim()}</strong>. Open it on any
              device and you will land in your list, signed in.
            </p>
            <p className="text-slate-600 dark:text-slate-400">
              The link works once and expires after an hour. Only a few can be sent an
              hour, so give the first one a minute to arrive before asking for another.
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
              disabled={state === "sending" || cooldown > 0}
            >
              {state === "sending"
                ? "Sending…"
                : cooldown > 0
                  ? `Another link in ${cooldown}s`
                  : "Email me a sign-in link"}
            </button>

            {/* The way round the sender’s limits, and quicker besides, for
                anyone holding a device that is already signed in. */}
            <p className="text-center text-sm">
              <button
                type="button"
                onClick={() => setRoute("code")}
                className="cursor-pointer text-indigo-700 underline underline-offset-2 dark:text-indigo-300"
              >
                I have a pairing code
              </button>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}

/**
 * Signs this device in from a code shown by one that already is. Nothing here
 * sends an email, so the sender's limits do not apply.
 */
function PairingCodeForm({ onUseEmail }: { onUseEmail: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!code.trim() || busy) return;

    setBusy(true);
    setError(null);
    const { error: failure } = await redeemPairingCode(code);
    // On success the session store notices and this whole screen goes away,
    // so there is nothing to do but report a failure.
    if (failure) {
      setError(failure);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        On a device that is already signed in, open Settings and choose
        <strong className="font-semibold"> Pair a device</strong>. Type the
        code it shows here.
      </p>

      <div>
        <label htmlFor="pairing-code" className="mb-1.5 block text-sm font-medium">
          Pairing code
        </label>
        <input
          id="pairing-code"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          className="field text-center font-mono text-lg tracking-[0.2em] uppercase"
          placeholder="ABCDE-FGHJK"
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        {busy ? "Signing in…" : "Sign in with this code"}
      </button>

      <p className="text-center text-sm">
        <button
          type="button"
          onClick={onUseEmail}
          className="cursor-pointer text-indigo-700 underline underline-offset-2 dark:text-indigo-300"
        >
          Email me a link instead
        </button>
      </p>
    </form>
  );
}
