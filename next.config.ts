import type { NextConfig } from "next";

/**
 * Set by the GitHub Pages workflow only. Local `npm run dev` and `npm run build`
 * leave it unset, so the app keeps serving from the root on this machine.
 */
const isGitHubPages = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  // GitHub Pages serves plain files with no Node process behind them, so the
  // whole app is emitted as static HTML/CSS/JS into `out/`. Everything here is
  // client-side already — the glossary lives in localStorage — so nothing is
  // lost by dropping the server.
  output: "export",

  // A project site is served from https://<user>.github.io/<repo>/, not from the
  // domain root. Without this every stylesheet and script would 404 there.
  // Applied only for the Pages build so local URLs stay at `/`.
  basePath: isGitHubPages ? "/definition-capture" : "",

  // Next rewrites `<Link href>` for the basePath but not an image `src`, so the
  // same value is handed to the browser for `asset()` in src/lib/assetPath.ts
  // to prefix files served out of `public/`. Derived from the line above so the
  // two can never disagree.
  env: {
    NEXT_PUBLIC_BASE_PATH: isGitHubPages ? "/definition-capture" : "",
  },

  // Emit `phrases/index.html` rather than `phrases.html`, which is what a static
  // host resolves cleanly without any rewrite rules of its own.
  trailingSlash: true,

  // Lets a phone on the same router load the dev server at http://192.168.0.11:3001.
  // Without this, Next 16 blocks the HMR websocket and the error overlay, because
  // their Origin header is the LAN IP rather than localhost. Dev-only setting.
  // The address is DHCP-assigned, so re-check it if the router reassigns.
  allowedDevOrigins: ["192.168.0.11"],
};

export default nextConfig;
