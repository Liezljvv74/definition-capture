"use client";

import Link from "next/link";

import { useSession } from "@/lib/useSession";
import { useSettings } from "@/lib/useSettings";

/**
 * Sits at the right-hand end of the main nav so it is always clear whose
 * terms are on screen — with two accounts and one browser, that matters more
 * than the space it costs.
 *
 * Signing out lives in Settings rather than here. It is a rare, destructive-
 * feeling action, and one click from a nav bar is closer than it wants to be;
 * the gear is the way to it.
 *
 * Renders nothing while the session is still loading or when nobody is signed
 * in; in the latter case `SignInGate` is showing the sign-in screen anyway.
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
      <Link
        href="/settings"
        aria-label="Settings"
        title="Settings"
        className="cursor-pointer rounded-md p-1.5 text-slate-500 transition
          hover:bg-slate-100 hover:text-slate-900
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500
          dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      >
        <GearIcon />
      </Link>
    </li>
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
