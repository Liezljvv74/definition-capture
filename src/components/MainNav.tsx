"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { AccountMenu } from "@/components/AccountMenu";
import { BackupMenu } from "@/components/BackupMenu";
import {
  MENU_ITEM,
  MENU_ITEM_CURRENT,
  NavMenu,
  TAB_BASE,
  TAB_OFF,
  TAB_ON,
} from "@/components/NavMenu";

/**
 * The two views behind the Glossary tab. They are one section with two
 * lists — separate stores, separate pages, separate URLs — and this is only
 * how you get between them.
 */
const GLOSSARY_VIEWS = [
  { href: "/terms", label: "Terms", prefix: "/term" },
  { href: "/phrases", label: "Phrases", prefix: "/phrase" },
] as const;

/** True anywhere in the section, including a single term or phrase page. */
function inGlossary(path: string): boolean {
  return GLOSSARY_VIEWS.some((view) => path.startsWith(view.prefix));
}

/**
 * Each tab says for itself which paths light it up, rather than the nav
 * knowing every page. A detail page counts as its list, which is why these
 * are prefixes and not equality.
 *
 * There is no Home tab: the logo to the left of these is the way home, and
 * two controls for one destination is one too many.
 */
const LINKS = [
  { href: "/verbs", label: "Verbs", isActive: (path: string) => path.startsWith("/verbs") },
] as const;

/**
 * Thin app-wide bar so every page is one click from the others.
 *
 * It lives in the workspace layout rather than the root one, so it exists
 * only behind the session check. Every destination in it is protected, and a
 * signed-out visitor used to be shown four tabs that all bounced straight
 * back to the sign-in page they were already on.
 */
export function MainNav() {
  const pathname = usePathname();
  const bar = useRef<HTMLElement>(null);

  /**
   * Publishes the bar's real height as `--nav-height`, for the filter rows
   * that stick directly underneath it.
   *
   * Measured rather than written down, because the height is not one number:
   * the logo steps up at the `sm` breakpoint, and a browser's own font size
   * moves it again. A hardcoded offset would be right at one width and leave
   * either a gap or an overlap at every other.
   */
  useEffect(() => {
    const element = bar.current;
    if (!element) return;

    const publish = () =>
      document.documentElement.style.setProperty(
        "--nav-height",
        `${element.offsetHeight}px`,
      );

    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      ref={bar}
      aria-label="Main"
      /*
       * Stuck to the top, so the tabs and the Backup menu stay reachable from
       * anywhere in a long list rather than only from the very top of it.
       *
       * `z-30` puts it over the page as it scrolls underneath, and sits
       * deliberately between the dropdowns it contains and the modal overlay
       * at `z-50`: a dialog must cover the nav, and the nav must cover the
       * list. The background colour is not decoration here either, since a
       * transparent bar would have rows sliding visibly through the tabs.
       */
      className="sticky top-0 z-30 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      {/* No `overflow-x-auto` here on purpose: it would clip the dropdowns,
          because an overflow on one axis makes the other one scroll too. */}
      <ul className="mx-auto flex max-w-6xl items-center gap-1 px-4 sm:px-6">
        <li className="mr-2 shrink-0 sm:mr-3">
          <Link
            href="/"
            aria-label="Definition Capture, home"
            className="-ml-1 block rounded-md p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            {/* Width and height reserve the space before the file loads, so
                the nav does not jump. `priority` because this is above the
                fold on every page and the lazy default would delay it. */}
            <Image
              src="/captured-logo.png"
              alt=""
              width={36}
              height={36}
              priority
              className="size-8 sm:size-9"
            />
          </Link>
        </li>

        {/*
         * The Glossary tab opens rather than navigates: it stands for two
         * pages, so going somewhere on click would mean quietly preferring
         * one of them.
         */}
        <NavMenu label="Glossary" active={inGlossary(pathname)}>
          {(close) =>
            GLOSSARY_VIEWS.map((view) => {
              const current = pathname.startsWith(view.prefix);
              return (
                <li key={view.href} role="none">
                  <Link
                    role="menuitem"
                    href={view.href}
                    aria-current={current ? "page" : undefined}
                    // Closed here rather than by watching the path: a second
                    // click on the view you are already on should still put
                    // it away.
                    onClick={close}
                    className={current ? MENU_ITEM_CURRENT : MENU_ITEM}
                  >
                    {view.label}
                  </Link>
                </li>
              );
            })
          }
        </NavMenu>

        {LINKS.map((link) => {
          const active = link.isActive(pathname);

          return (
            <li key={link.href} className="shrink-0">
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`${TAB_BASE} ${active ? TAB_ON : TAB_OFF}`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}

        {/*
         * Backup is a tab rather than a pair of buttons on the two list
         * pages. Exporting is about the account, not the page you happen to
         * be standing on, and repeating the controls per page meant Verbs
         * never got them at all.
         */}
        <BackupMenu />

        <AccountMenu />
      </ul>
    </nav>
  );
}
