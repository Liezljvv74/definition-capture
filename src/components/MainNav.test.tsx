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
    // The grammar list and its page are gone. A tab left behind would still
    // look like a working link.
    expect(markup).not.toContain("Grammar");
    expect(markup).not.toContain("/grammar");
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
