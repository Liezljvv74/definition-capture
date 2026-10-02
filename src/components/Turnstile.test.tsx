import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

// The site key is read when the module loads, so each case sets it first and
// imports a fresh copy. That keeps these independent of the real environment.
async function render(siteKey: string) {
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", siteKey);
  vi.resetModules();
  const { Turnstile, turnstileEnabled } = await import("@/components/Turnstile");
  return { enabled: turnstileEnabled, html: renderToStaticMarkup(<Turnstile onToken={() => {}} />) };
}

afterEach(() => vi.unstubAllEnvs());

it("renders nothing and blocks nothing when no site key is configured", async () => {
  expect(await render("")).toEqual({ enabled: false, html: "" });
});

it("renders the widget's container when a site key is configured", async () => {
  const { enabled, html } = await render("1x00000000000000000000AA");
  expect(enabled).toBe(true);
  expect(html).toContain("<div");
});
