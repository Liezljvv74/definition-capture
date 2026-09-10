"use client";

import Link from "next/link";

import { signOut } from "@/lib/session";
import { useSession } from "@/lib/useSession";
import { useSettings } from "@/lib/useSettings";

/**
 * Sits at the right-hand end of the main nav so the signed-in address is
 * always visible — with two accounts and one browser, knowing whose terms
 * is on screen matters more than saving the space.
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
    <li className="ml-auto flex shrink-0 items-center gap-2 py-1.5 pl-2">
      <span
        title={user.email}
        className="hidden max-w-[16ch] truncate text-xs text-slate-500 sm:inline
          dark:text-slate-400"
      >
        {label}
      </span>
      {/* Settings lives here rather than beside Terms and Phrases: those two
          tabs are the lists, and a third would read as a third list. */}
      <Link
        href="/settings"
        className="cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-slate-600
          transition hover:bg-slate-100 hover:text-slate-900
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500
          dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      >
        Settings
      </Link>
      <button
        type="button"
        onClick={() => void signOut()}
        className="cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-slate-600
          transition hover:bg-slate-100 hover:text-slate-900
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500
          dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      >
        Sign out
      </button>
    </li>
  );
}
