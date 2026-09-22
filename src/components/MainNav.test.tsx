import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { MainNav } from "@/components/MainNav";

/**
 * The nav is the one place that knows every destination in the app, so a
 * route that has been removed leaves its evidence here: a tab pointing at a
 * page that no longer exists takes the reader to a redirect rather than an
 * error, which is exactly the kind of breakage nobody reports.
 *
 * Rendered to a string, the way `RowEditButton.test.tsx` is, so this needs no
 * jsdom. Effects do not run in that mode, which suits it: the height the bar
 * publishes as `--nav-height` is a browser measurement and not what is under
 * test here.
 */
let pathname = "/vocabulary";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const html = (path: string) => {
  pathname = path;
  return renderToStaticMarkup(<MainNav />);
};

describe("MainNav", () => {
  it("offers Glossary and Verbs, and nothing that has been taken out", () => {
    const markup = html("/vocabulary");
    expect(markup).toContain("Glossary");
    expect(markup).toContain("Verbs");
    expect(markup).toContain('href="/verbs"');
  });

  it("links nowhere the app does not serve", () => {
    // The nav is the one place that knows every destination, so a tab left
    // behind after a page is removed still looks like a working link. Checking
    // the set rather than one old name keeps this useful whatever goes next.
    const served = ["/", "/vocabulary", "/phrases", "/verbs", "/flashcards", "/settings"];
    const hrefs = [...html("/vocabulary").matchAll(/href="([^"]*)"/g)].map((match) => match[1]);

    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect([href, served.includes(href.split("?")[0])]).toEqual([href, true]);
    }
  });

  it("lights the tab that owns the current path, detail pages included", () => {
    // A word or phrase page counts as its list, which is why the nav matches
    // on prefixes rather than on equality.
    expect(html("/word")).toContain('aria-current="page"');
    expect(html("/phrase")).toContain('aria-current="page"');
    expect(html("/verbs")).toContain('aria-current="page"');
  });

  it("leaves every tab unmarked on a page that belongs to none of them", () => {
    expect(html("/settings")).not.toContain('aria-current="page"');
  });
});
