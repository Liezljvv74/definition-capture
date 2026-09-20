import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No `output: "export"` any more, and that is the whole point of this file's
  // history reversing.
  //
  // A static export is HTML on a dumb host with no process behind it, so the
  // only place a "are you signed in?" question could be asked was the browser
  // — and a check the browser makes is a check the browser can be told to
  // skip. The markup of every page was served to anyone who asked for it, and
  // row level security was the only thing actually keeping one account's terms
  // from another's.
  //
  // With a server back, `src/proxy.ts` verifies the session before a protected
  // page is rendered at all, and `src/app/(workspace)/layout.tsx` verifies it
  // again before the page's own code runs.
  //
  // The cost is GitHub Pages, which serves files and cannot run any of that.
  // `.github/workflows/deploy.yml` is disabled rather than deleted; hosting
  // moves to somewhere that runs Node.

  // Emit `phrases/` rather than `phrases.html`, keeping every URL the app has
  // ever had unchanged.
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
};

export default nextConfig;
