"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { asset } from "@/lib/assetPath";

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
      <ul className="mx-auto flex max-w-6xl items-center gap-1 px-4 sm:px-6">
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
          // A single term or phrase page counts as its list for highlighting.
          const active =
            link.href === "/"
              ? pathname === "/" || pathname.startsWith("/term")
              : pathname.startsWith("/phrase");

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
