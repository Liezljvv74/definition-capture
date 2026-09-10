"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { AccountMenu } from "@/components/AccountMenu";
import { asset } from "@/lib/assetPath";

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
  {
    href: "/grammar",
    label: "Grammar",
    isActive: (path: string) => path.startsWith("/grammar"),
  },
] as const;

/** Shared by the tabs and the dropdown's own trigger, so they sit level. */
const TAB_BASE = "-mb-px inline-block border-b-2 px-3 py-2.5 text-sm font-medium transition";
const TAB_ON = "border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300";
const TAB_OFF =
  "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-100";

/** Thin app-wide bar so every page is one click from the others. */
export function MainNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      {/* No `overflow-x-auto` here on purpose: it would clip the dropdown,
          because an overflow on one axis makes the other one scroll too. */}
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

        <GlossaryMenu pathname={pathname} />

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
        <AccountMenu />
      </ul>
    </nav>
  );
}

/**
 * The Glossary tab, which opens rather than navigates: it stands for two
 * pages, so going somewhere on click would mean quietly preferring one of
 * them. The menu makes the choice explicit and keeps the bar to one row.
 */
function GlossaryMenu({ pathname }: { pathname: string }) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLLIElement>(null);
  const active = inGlossary(pathname);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      // Back to the trigger, so Escape does not strand the keyboard at the
      // top of the document.
      container.current?.querySelector("button")?.focus();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <li ref={container} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-current={active ? "page" : undefined}
        onClick={() => setOpen((current) => !current)}
        className={`${TAB_BASE} ${active ? TAB_ON : TAB_OFF} inline-flex cursor-pointer items-center gap-1`}
      >
        Glossary
        <span aria-hidden="true" className={`text-[0.6rem] ${open ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>

      <ul
        id={menuId}
        role="menu"
        aria-label="Glossary"
        hidden={!open}
        className="card absolute top-full left-0 z-20 mt-1 min-w-40 p-1 shadow-lg"
      >
        {GLOSSARY_VIEWS.map((view) => {
          const current = pathname.startsWith(view.prefix);
          return (
            <li key={view.href} role="none">
              <Link
                role="menuitem"
                href={view.href}
                aria-current={current ? "page" : undefined}
                // Closed here rather than by watching the path: a second click
                // on the view you are already on should still put it away.
                onClick={() => setOpen(false)}
                className={`block rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  current
                    ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                }`}
              >
                {view.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </li>
  );
}
