"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { MENU_ITEM, MENU_ITEM_CURRENT, NavMenu } from "@/components/NavMenu";
import { SETTINGS_SECTIONS, readSectionKey } from "@/lib/settingsSections";
import { useSession } from "@/lib/useSession";
import { useSettings } from "@/lib/useSettings";

/**
 * Sits at the right-hand end of the main nav so it is always clear whose
 * words are on screen — with two accounts and one browser, that matters more
 * than the space it costs.
 *
 * Signing out lives in Settings rather than here. It is a rare, destructive-
 * feeling action, and one click from a nav bar is closer than it wants to be;
 * the gear is the way to it.
 *
 * Renders nothing while the session is still loading or when nobody is signed
 * in. The second case is close to unreachable: this sits in `MainNav`, which
 * the workspace layout mounts below its own session check, and `src/proxy.ts`
 * has already turned away a request with no session. What is left is the
 * first case, the hydration pass before the session hook has read anything,
 * which is a real state and the one the guard is actually for.
 */
export function AccountMenu() {
  const { user, loaded } = useSession();
  const { settings } = useSettings();
  if (!loaded || !user) return null;

  // The display name is what you chose to be called; the address stays in
  // the tooltip, since it is the thing that actually identifies the account.
  const label = settings.displayName || user.email;

  return (
    <li className="ml-auto flex shrink-0 items-center gap-1 py-1.5 pl-2">
      <span
        title={user.email}
        className="hidden max-w-[16ch] truncate text-sm font-medium text-slate-600 sm:inline
          dark:text-slate-400"
      >
        {label}
      </span>
      <SettingsMenu />
    </li>
  );
}

/**
 * The gear, which opens rather than navigates.
 *
 * Settings was one page of eight sections, which is a list to hunt through
 * rather than a page to read. It is three groups now, and the gear names them
 * for the same reason the Glossary tab opens a menu: it stands for more than
 * one destination, so going somewhere on click would mean quietly preferring
 * one of them.
 */
function SettingsMenu() {
  const pathname = usePathname();
  const current = readSectionKey(useSearchParams().get("section"));
  const onSettings = pathname.startsWith("/settings");

  return (
    <NavMenu
      label="Settings"
      icon={<GearIcon />}
      align="right"
      // Already inside the account's own list item, so this one is a plain
      // wrapper rather than a tab in its own right.
      element="div"
      active={onSettings}
    >
      {(close) =>
        SETTINGS_SECTIONS.map((section) => {
          const here = onSettings && current === section.key;
          return (
            <li key={section.key} role="none">
              <Link
                role="menuitem"
                href={`/settings?section=${section.key}`}
                aria-current={here ? "page" : undefined}
                // Closed here rather than by watching the path: a second click
                // on the group you are already in should still put it away.
                onClick={close}
                className={here ? MENU_ITEM_CURRENT : MENU_ITEM}
              >
                {section.label}
              </Link>
            </li>
          );
        })
      }
    </NavMenu>
  );
}

/**
 * Drawn rather than imported: the app carries no icon set for one glyph.
 *
 * A cog with its teeth joined into one outline. It used to be a circle with
 * eight separate strokes around it, which read as a sun rather than a gear.
 * The shape is Heroicons' outline cog (MIT).
 */
function GearIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
    >
      <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
      <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}
