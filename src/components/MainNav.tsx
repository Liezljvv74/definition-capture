"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AccountMenu } from "@/components/AccountMenu";
import { asset } from "@/lib/assetPath";

/**
 * Each tab says for itself which paths light it up, rather than the nav
 * knowing every page. A detail page counts as its list: `/term?id=…` keeps
 * Terms lit, which is why these are prefixes and not equality — except Home,
 * which is only ever itself.
 */
const LINKS = [
  { href: "/", label: "Home", isActive: (path: string) => path === "/" },
  { href: "/terms", label: "Terms", isActive: (path: string) => path.startsWith("/term") },
  {
    href: "/phrases",
    label: "Phrases",
    isActive: (path: string) => path.startsWith("/phrase"),
  },
  { href: "/verbs", label: "Verbs", isActive: (path: string) => path.startsWith("/verbs") },
  {
    href: "/grammar",
    label: "Grammar",
    isActive: (path: string) => path.startsWith("/grammar"),
  },
] as const;

/** Thin app-wide bar so every page is one click from the others. */
export function MainNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      <ul className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4 sm:px-6">
        <li className="mr-2 shrink-0 sm:mr-3">
          <Link
            href="/"
            aria-label="Definition Capture — home"
            className="-ml-1 block rounded-md p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            {/* A plain <img>, not next/image: the app is a static export with no
                optimiser behind it, so there is nothing to optimise. Width and
                height are set to reserve the space before the file loads. */}
            <img
              src={asset("/captured-logo.png")}
              alt=""
              width={36}
              height={36}
              className="size-8 sm:size-9"
            />
          </Link>
        </li>
        {LINKS.map((link) => {
          const active = link.isActive(pathname);

          return (
            <li key={link.href} className="shrink-0">
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`-mb-px inline-block border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300"
                    : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-100"
                }`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
        <AccountMenu />
      </ul>
    </nav>
  );
}
