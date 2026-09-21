import { readdirSync } from "node:fs";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { config, proxy } from "@/proxy";

/**
 * The session check that runs before any page is rendered.
 *
 * Supabase is mocked, so this proves the *app's* decisions — who is turned
 * away, and from where — not that a signature is really verified. That part
 * is `getClaims`, and taking it on trust is the deliberate limit of this file.
 */
let signedIn = false;

/**
 * Whether `getClaims` rotates the session while it is asked.
 *
 * Supabase refreshes an expiring token as a side effect of that call and hands
 * the new pair back through `setAll`, which is how the cookie half of this
 * file's job actually happens. The mock ignored `setAll` entirely, so nothing
 * here reached that path and a redirect could quietly drop the refresh.
 */
let rotatesSession = false;

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: { cookies: { setAll: (cookies: { name: string; value: string; options: object }[]) => void } },
  ) => ({
    auth: {
      getClaims: async () => {
        if (rotatesSession) {
          options.cookies.setAll([
            { name: "sb-access-token", value: "rotated", options: {} },
          ]);
        }
        return { data: signedIn ? { claims: { sub: "user-1" } } : null };
      },
    },
  }),
}));

const ORIGIN = "http://localhost:3000";
const ask = (path: string) => proxy(new NextRequest(new URL(path, ORIGIN)));
const locationOf = (response: Response) => response.headers.get("location");

/**
 * Where a redirect points, without its trailing slash. `trailingSlash: true`
 * means `nextUrl` renders the target as `/sign-in/`, and whether it carries
 * that slash is not what any of these tests are about.
 */
const redirectPath = (response: Response) => {
  const location = locationOf(response);
  if (!location) return null;
  const { pathname } = new URL(location, ORIGIN);
  return pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
};

/**
 * Every protected route, read off the filesystem rather than typed out.
 *
 * This is the point of the file. An eighth page added under `(workspace)`
 * tomorrow is covered by these tests the moment it exists — which is the
 * failure the layout's own comment warns about, a check that stops being
 * true because somebody added a page and nobody added a test.
 */
function routesUnder(dir: string, prefix = ""): string[] {
  const found: string[] = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (item.isDirectory()) {
      found.push(...routesUnder(join(dir, item.name), `${prefix}/${item.name}`));
    } else if (item.name === "page.tsx") {
      // `trailingSlash: true`, so the route the browser asks for ends in one.
      found.push(`${prefix}/`);
    }
  }
  return found;
}

const protectedPaths = routesUnder("src/app/(workspace)");

beforeEach(() => {
  signedIn = false;
  rotatesSession = false;
  // Without these the proxy lets everything through by design, so every
  // assertion below would pass for the wrong reason.
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
});

describe("the route table this file tests", () => {
  it("found the workspace pages, so the tests below are not vacuous", () => {
    expect(protectedPaths.length).toBeGreaterThanOrEqual(7);
    expect(protectedPaths).toContain("/vocabulary/");
    expect(protectedPaths).toContain("/settings/");
  });

  it("only runs at all when Supabase is configured", async () => {
    // The bail-out at the top of the proxy: a build with no credentials must
    // not bounce between two pages that both need a Supabase that is absent.
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const response = await ask("/vocabulary/");
    expect(response.status).toBe(200);
  });
});

/**
 * Refreshing the session cookies is the first of the two jobs this file's own
 * header names, and the only one with no visible symptom when it stops: the
 * reader is simply signed out an hour later, at a moment unconnected to
 * anything they did.
 *
 * A redirect is a fresh response and carries nothing the refresh wrote unless
 * it is copied across, so each of the three redirect paths needs its own
 * assertion. The `/` case covers a signed-in reader bounced off `/sign-in`.
 */
describe("a refreshed session survives the response it is refreshed on", () => {
  const rotated = (response: Response) =>
    (response.headers.get("set-cookie") ?? "").includes("sb-access-token=rotated");

  it("keeps the new cookies on a page it simply lets through", async () => {
    signedIn = true;
    rotatesSession = true;
    const response = await ask("/vocabulary/");
    expect(response.status).toBe(200);
    expect(rotated(response)).toBe(true);
  });

  it("keeps them on the redirect away from a path that moved", async () => {
    signedIn = true;
    rotatesSession = true;
    const response = await ask("/terms/");
    expect(redirectPath(response)).toBe("/vocabulary");
    expect(rotated(response)).toBe(true);
  });

  it("keeps them on the bounce to sign-in", async () => {
    rotatesSession = true;
    const response = await ask("/vocabulary/");
    expect(redirectPath(response)).toBe("/sign-in");
    expect(rotated(response)).toBe(true);
  });

  it("keeps them on the bounce away from sign-in", async () => {
    signedIn = true;
    rotatesSession = true;
    const response = await ask("/sign-in/");
    expect(redirectPath(response)).toBe("/");
    expect(rotated(response)).toBe(true);
  });
});

/**
 * `/terms` and `/term?id=…` were the glossary's addresses for most of this
 * app's life, and a `?id=` link is exactly the sort of thing that ends up in
 * a note outside the app. These redirects are all that keeps those working,
 * and nothing else in the app would fail if they stopped.
 */
describe("the paths these pages used to live at", () => {
  it("sends /terms to /vocabulary, signed in or not", async () => {
    for (const state of [false, true]) {
      signedIn = state;
      const response = await ask("/terms/");
      expect(response.status).toBe(307);
      expect(redirectPath(response)).toBe("/vocabulary");
    }
  });

  it("sends /term to /word and keeps the id, which is the whole point", async () => {
    signedIn = true;
    const response = await ask("/term/?id=abc123");
    expect(response.status).toBe(307);
    expect(redirectPath(response)).toBe("/word");
    expect(locationOf(response)).toContain("id=abc123");
  });

  it("leaves the pages that did not move alone", async () => {
    signedIn = true;
    for (const path of ["/vocabulary/", "/word/", "/phrases/", "/verbs/"]) {
      expect((await ask(path)).status).toBe(200);
    }
  });
});

describe("signed out", () => {
  for (const path of protectedPaths) {
    it(`redirects ${path} to /sign-in`, async () => {
      const response = await ask(path);
      expect(response.status).toBe(307);
      expect(redirectPath(response)).toBe("/sign-in");
    });
  }

  it("does not carry the query string into the redirect", async () => {
    // `/word/?id=…` names a row. The sign-in page has no use for it and the
    // referer would carry it onwards.
    const response = await ask("/word/?id=secret-word-id");
    expect(redirectPath(response)).toBe("/sign-in");
    expect(locationOf(response)).not.toContain("secret");
  });

  for (const path of [
    "/sign-in",
    "/sign-in/",
    "/sign-up/",
    "/auth/callback",
    "/auth/callback/",
  ]) {
    it(`lets ${path} through`, async () => {
      const response = await ask(path);
      expect(response.status).toBe(200);
    });
  }
});

describe("signed out — a public prefix is not a public page", () => {
  /**
   * `isPublic` compares whole segments. A plain `startsWith` would let every
   * one of these through, and each is a route somebody could plausibly add.
   */
  for (const path of [
    "/sign-in-secret/",
    "/sign-inx",
    "/authx/",
    "/authentication/",
    "/vocabulary/sign-in/",
    "/vocabulary//",
  ]) {
    it(`redirects ${path}`, async () => {
      signedIn = false;
      const response = await ask(path);
      expect(response.status).toBe(307);
      expect(redirectPath(response)).toBe("/sign-in");
    });
  }

  it("is case-sensitive, so /SIGN-IN/ is treated as protected", async () => {
    // Next's routing is not case-sensitive and this comparison is, so the
    // mismatch errs towards refusing. Pinned so it stays a decision.
    const response = await ask("/SIGN-IN/");
    expect(response.status).toBe(307);
  });

  it("normalises traversal before deciding", async () => {
    const response = await ask("/sign-in/../vocabulary/");
    expect(response.status).toBe(307);
    expect(redirectPath(response)).toBe("/sign-in");
  });

  it("does not accept a percent-encoded slash as a segment break", async () => {
    const response = await ask("/sign-in%2f..%2fvocabulary/");
    expect(response.status).toBe(307);
  });
});

describe("signed in", () => {
  beforeEach(() => {
    signedIn = true;
  });

  for (const path of protectedPaths) {
    it(`allows ${path}`, async () => {
      const response = await ask(path);
      expect(response.status).toBe(200);
      expect(locationOf(response)).toBeNull();
    });
  }

  for (const path of ["/sign-in/", "/sign-up/"]) {
    it(`sends ${path} to the workspace`, async () => {
      const response = await ask(path);
      expect(response.status).toBe(307);
      expect(redirectPath(response)).toBe("/");
    });
  }

  it("does NOT redirect /auth/callback, which would break every sign-in link", async () => {
    // It is public but not signed-out-only. Bouncing it would trap a reader
    // whose session exists but whose link has not been exchanged yet.
    const response = await ask("/auth/callback/");
    expect(response.status).toBe(200);
  });
});

describe("the matcher", () => {
  const matches = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);

  it("runs on pages, route handlers and anything else with an extension", () => {
    // The old pattern excluded every path ending in a static-looking
    // extension, at any depth — so "runs before every request" was not true.
    for (const path of ["/vocabulary/", "/", "/api/export.js", "/vocabulary/notes.txt"]) {
      expect(matches(path)).toBe(true);
    }
  });

  it("skips Next's own output and the named public files", () => {
    for (const path of [
      "/_next/static/chunk.js",
      "/_next/image",
      "/favicon.ico",
      "/captured-logo.png",
      "/captured-logo-bg.png",
    ]) {
      expect(matches(path)).toBe(false);
    }
  });
});
