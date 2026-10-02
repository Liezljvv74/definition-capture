"use client";

import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
      theme: "auto";
    },
  ) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Public by design, like the publishable key; the secret half lives only in the
 * Supabase dashboard. Empty means captcha is off here (local development
 * against the local Supabase copy, the end-to-end tests), and then the widget
 * renders nothing and no token ever exists.
 */
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

/** Forms disable their buttons on this, so they never wait for a widget that is not there. */
export const turnstileEnabled = SITE_KEY !== "";

// One script tag for the whole session, however many widgets come and go.
let loading: Promise<void> | null = null;
function load(): Promise<void> {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null; // so a later mount can try again
      reject(new Error("Turnstile failed to load"));
    };
    document.head.append(script);
  });
  return loading;
}

/**
 * Cloudflare Turnstile. Tokens are single use, so the parent changes `resetKey`
 * after every attempt, which gets a fresh challenge and reports null until it
 * is solved.
 */
export function Turnstile({
  onToken,
  resetKey = 0,
}: {
  onToken: (token: string | null) => void;
  resetKey?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);
  // Without a message, a blocked script or an extension leaves the buttons
  // disabled and the reader with no idea why.
  const [failed, setFailed] = useState(false);
  // The latest callback, so the widget is rendered once and never re-rendered
  // because the parent made a new function.
  const report = useRef(onToken);
  useEffect(() => {
    report.current = onToken;
  });

  useEffect(() => {
    if (!SITE_KEY) return;
    let gone = false;
    load()
      .then(() => {
        if (gone || !box.current || !window.turnstile) return;
        widget.current = window.turnstile.render(box.current, {
          sitekey: SITE_KEY,
          callback: (token) => {
            setFailed(false);
            report.current(token);
          },
          "expired-callback": () => report.current(null),
          "error-callback": () => {
            setFailed(true);
            report.current(null);
          },
          theme: "auto",
        });
      })
      .catch(() => {
        setFailed(true);
        report.current(null);
      });
    return () => {
      gone = true;
      // The token belongs to this widget; a stale one must not outlive it.
      report.current(null);
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (resetKey === 0 || !widget.current) return;
    window.turnstile?.reset(widget.current);
    report.current(null);
  }, [resetKey]);

  if (!SITE_KEY) return null;
  return (
    <>
      <div ref={box} className="flex justify-center" />
      {failed && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          The security check could not load. Check your connection or browser extensions and
          reload the page.
        </p>
      )}
    </>
  );
}
