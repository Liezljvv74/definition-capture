import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AccountMenu } from "@/components/AccountMenu";

/**
 * The gear opens a menu, and a menu brings its own wrapper with it. That is
 * how this went wrong the first time: `NavMenu` wrapped itself in a list item
 * because every other menu in the bar is a tab, and the gear sits inside the
 * account's own list item, so the markup nested one `li` in another. A browser
 * silently rewrites that, which the server does not, and the mismatch surfaces
 * as a hydration error at the top of the page rather than as anything that
 * looks like a nav problem.
 *
 * Rendered to a string, the way `MainNav.test.tsx` is, so this needs no jsdom.
 * The menu is closed in that state, which does not matter: the nesting is in
 * the wrapper, and the wrapper is there whether the menu is open or not.
 */
vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams("section=glossary"),
}));
vi.mock("@/lib/useSession", () => ({
  useSession: () => ({ user: { email: "reader@example.com" }, loaded: true }),
}));
vi.mock("@/lib/useSettings", () => ({
  useSettings: () => ({ settings: { displayName: "Reader" }, loaded: true }),
}));

const markup = renderToStaticMarkup(<AccountMenu />);

describe("AccountMenu", () => {
  it("wraps the gear in something other than a list item", () => {
    // The menu's own items are list items too, and rightly so: they sit in
    // the menu's `ul`. What must not happen is one before that `ul` opens.
    const beforeTheMenu = markup.slice(0, markup.indexOf("<ul"));
    expect(beforeTheMenu).toContain('<div class="relative shrink-0">');
    expect(beforeTheMenu.match(/<li/g)).toHaveLength(1);
  });

  it("offers every settings group", () => {
    for (const section of ["profile", "glossary", "flashcards"]) {
      expect(markup).toContain(`href="/settings?section=${section}"`);
    }
  });

  it("marks the group being shown, and the gear while any of them is", () => {
    // Read as tags rather than as a pattern over the whole string: the order
    // attributes come out in is React's business, and a test that depends on
    // it fails for reasons that have nothing to do with the menu.
    const marked = (markup.match(/<a [^>]*>/g) ?? []).filter((tag) =>
      tag.includes('aria-current="page"'),
    );
    expect(marked).toHaveLength(1);
    expect(marked[0]).toContain("section=glossary");

    // The gear is lit too, the way a nav tab is lit when you are on the page
    // it stands for.
    expect(markup.match(/<button [^>]*>/)?.[0]).toContain('aria-current="page"');
  });
});
