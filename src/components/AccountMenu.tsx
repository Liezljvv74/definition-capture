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
        className="hidden max-w-[16ch] truncate text-xs text-slate-500 sm:inline
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
    <NavMenu label="Settings" icon={<GearIcon />} align="right" active={onSettings}>
      {(close) =>
        SETTINGS_SECTIONS.map((section) => {
          const here = onSettings && current === section.key;
          return (
            <li key={section.key} role="none">
              <Link
                role="menuitem"
                href={`/settings/?section=${section.key}`}
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

/** Drawn rather than imported: the app carries no icon set for one glyph. */
function GearIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
    >
      <circle cx="8" cy="8" r="2.25" />
      <path
        d="M8 1.4v1.8M8 12.8v1.8M14.6 8h-1.8M3.2 8H1.4M12.67 3.33l-1.27 1.27M4.6
           11.4l-1.27 1.27M12.67 12.67 11.4 11.4M4.6 4.6 3.33 3.33"
      />
    </svg>
  );
}
