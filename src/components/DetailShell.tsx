import Link from "next/link";
import { Suspense, type CSSProperties, type ReactNode } from "react";

import { formatDate, formatDateTime } from "@/lib/format";

/** The small capitals above each part of an item page's card. */
export const DETAIL_LABEL = "text-xs font-semibold tracking-wide text-ink-soft uppercase";

/**
 * The frame the word, phrase and rule pages share. `wide` is the rule page,
 * which is laid out a size wider than the other two, with a little more room
 * above its back link.
 */
function widths(wide?: boolean) {
  return wide ? "max-w-6xl" : "max-w-5xl";
}

/**
 * The boundary `useSearchParams` needs to suspend against during prerender.
 * Each page passes its own inner component, the one that reads the id, as
 * the child, so the hook stays inside the boundary.
 */
export function DetailSuspense({ wide, children }: { wide?: boolean; children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <main className={`notebook-page mx-auto w-full ${widths(wide)} flex-1 py-6`}>
          <div className="card h-56 animate-pulse" aria-hidden="true" />
        </main>
      }
    >
      {children}
    </Suspense>
  );
}

/**
 * The back link, then the item, a placeholder while the list loads, or the
 * page's own not-found card when the id matches nothing. `children` is the
 * item's card, or nothing when there is no item.
 */
export function DetailFrame({
  wide,
  backHref,
  backLabel,
  loaded,
  notFound,
  children,
}: {
  wide?: boolean;
  backHref: string;
  backLabel: string;
  loaded: boolean;
  notFound: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <header className={`notebook-page mx-auto w-full ${widths(wide)} pt-6${wide ? " sm:pt-8" : ""}`}>
        <Link href={backHref} className="text-sm font-medium text-link hover:underline">
          ← Back to {backLabel}
        </Link>
      </header>

      <main className={`notebook-page mx-auto w-full ${widths(wide)} flex-1 py-6`}>
        {!loaded ? <div className="card h-56 animate-pulse" aria-hidden="true" /> : (children ?? notFound)}
      </main>
    </>
  );
}

/**
 * The pasted, tilted card the word and phrase pages show for an id that
 * matches nothing. The rule page keeps its own plainer card, so this is not
 * forced on it. `tilt` alternates between the two so they do not look stamped.
 */
export function NotFoundCard({
  title,
  href,
  label,
  tilt,
  children,
}: {
  title: string;
  href: string;
  label: string;
  tilt: string;
  children: ReactNode;
}) {
  return (
    <div
      className="paste tape tape-centre mx-auto max-w-lg rounded-[10px_3px_12px_4px] border-2 border-ink bg-card p-8 text-center shadow-[3px_4px_0_var(--color-shadow)]"
      style={{ "--r": tilt } as CSSProperties}
    >
      <div aria-hidden="true" className="mb-3 text-4xl">
        🔍
      </div>
      <h1 className="hand-title text-xl">{title}</h1>
      <p className="mt-2 text-sm text-ink-soft">{children}</p>
      <Link href={href} className="btn btn-primary mt-5">
        Back to {label}
      </Link>
    </div>
  );
}

/** The day an item was added, with the time on hover, and when it was last edited if it has been. */
export function DateAdded({ added, updated }: { added: string; updated?: string | null }) {
  return (
    <>
      <span title={formatDateTime(added)}>{formatDate(added)}</span>
      {updated && (
        <span className="block text-xs text-ink-soft" title={formatDateTime(updated)}>
          Edited {formatDate(updated)}
        </span>
      )}
    </>
  );
}
