import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app needs a server, and every deployment decision follows from that.
  //
  // It used to be a static export on GitHub Pages: HTML on a host with no
  // process behind it, so the only place a "are you signed in?" question could
  // be asked was the browser — and a check the browser makes is a check the
  // browser can be told to skip. The markup of every page was served to anyone
  // who asked, and row level security was the only thing actually keeping one
  // account's terms from another's.
  //
  // That is over. `src/proxy.ts` verifies the session before a protected page
  // is rendered at all, and `src/app/(workspace)/layout.tsx` verifies it again
  // before the page's own code runs. Neither can run on a file host, so any
  // host for this app has to run Node.

  // Emit `phrases/` rather than `phrases.html`, keeping every URL the app has
  // ever had unchanged. `normalise` in `src/proxy.ts` matches public paths
  // with and without the trailing slash because of this.
  trailingSlash: true,

  // Lets a phone on the same router load the dev server at http://192.168.0.51:3000.
  // Without this, Next 16 blocks the HMR websocket and the error overlay, because
  // their Origin header is the LAN IP rather than localhost. Dev-only setting.
  //
  // The whole subnet rather than one address, because the router hands these
  // out by DHCP and has already moved this machine once — which silently broke
  // phone access until the number here was changed to match. A `*` stands for
  // one trailing segment, so this admits 192.168.0.x and nothing outside the
  // LAN. It applies to `next dev` only; a build ignores it entirely.
  allowedDevOrigins: ["192.168.0.*"],

  async headers() {
    const isDev = process.env.NODE_ENV === "development";
    // The one origin the app is allowed to talk to besides itself. Read from
    // the same variable the client is built with, so the policy cannot drift
    // from the project it is protecting.
    const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

    const csp = [
      "default-src 'self'",
      // `unsafe-inline` rather than a nonce, and this is the honest limit of
      // this policy. Nonces have to be minted per request, which means every
      // page carrying one must be server-rendered — and `/sign-in` and
      // `/sign-up` are deliberately static. A nonce in a build-time HTML file
      // is a nonce an attacker can read, and worse, a mismatched one would
      // block the sign-in page's own scripts and lock everyone out of the
      // app. Making those two routes dynamic would buy a strict policy; it is
      // a deliberate change, not a side effect of adding headers.
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      // Style attributes are used for the backdrop image in the root layout,
      // and injected CSS is a far smaller prize than injected script.
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      // The point of the whole policy. Even if a script does get injected and
      // reads the session cookie — which it can, because `@supabase/ssr`
      // writes it from JavaScript and it therefore cannot be HttpOnly — it
      // has nowhere to send it. In dev the HMR socket needs adding.
      `connect-src 'self' ${supabase}${isDev ? " ws: wss:" : ""}`.trim(),
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      // Nothing about this app makes sense in someone else's iframe, and
      // clickjacking a delete button is the reason to say so.
      "frame-ancestors 'none'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          // `frame-ancestors` covers this for modern browsers; kept for the
          // ones that only understand the older header.
          { key: "X-Frame-Options", value: "DENY" },
          // A term id in a URL should not travel to another site as a referer.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
