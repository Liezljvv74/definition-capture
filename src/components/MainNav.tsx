"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Glossary" },
  { href: "/phrases", label: "Phrases" },
] as const;

/** Thin app-wide bar so every page is one click from the others. */
export function MainNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      <ul className="mx-auto flex max-w-6xl gap-1 px-4 sm:px-6">
        {LINKS.map((link) => {
          // "/" only matches itself; a term page still counts as the glossary.
          const active =
            link.href === "/"
              ? pathname === "/" || pathname.startsWith("/terms")
              : pathname === link.href || pathname.startsWith(`${link.href}/`);

          return (
            <li key={link.href}>
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
      </ul>
    </nav>
  );
}
