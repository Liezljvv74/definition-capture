import type { CSSProperties, ReactNode } from "react";

/*
 * The pieces the four list pages (Vocabulary, Phrases, Grammar and Verbs) had
 * each pasted for themselves. Each page still lays out its own filters and
 * rows; only what was the same character for character, apart from the noun,
 * lives here.
 */

/*
 * A row is one line of the paper's ruling, 32px. Text sits low in it, on the
 * line; checkboxes and buttons are centred. Nothing in a row may be taller,
 * or every row below it slips off its line.
 */
export const ROW_TEXT = "h-8 px-3 pt-1 pb-0 leading-7 align-top";
export const ROW_CONTROL = "h-8 px-2 py-0 align-middle";

/**
 * The page's title, with its section colour as a marker stroke, the count
 * under it, and the main column the list sits in. `wide` is for Phrases,
 * which is wider than the other pages (90rem, not 6xl) so its one-line
 * columns cut off as little as the window allows.
 */
export function ListShell({
  title,
  marker,
  subtitle,
  wide = false,
  children,
}: {
  title: string;
  /** The section colour class, such as `section-blue`. */
  marker: string;
  subtitle: string;
  wide?: boolean;
  children?: ReactNode;
}) {
  const width = wide ? "max-w-[90rem]" : "max-w-6xl";
  return (
    <>
      <header className={`notebook-page mx-auto w-full ${width} pt-6 sm:pt-8`}>
        <h1 className="hand-title text-2xl sm:text-3xl">
          <span className={`marker ${marker}`}>{title}</span>
        </h1>
        <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>
      </header>
      <main className={`notebook-page mx-auto w-full ${width} flex-1 py-6`}>{children}</main>
    </>
  );
}

/**
 * A column heading that sorts when it has `onSort`, and is plain text when it
 * does not. Only the column actually being sorted has a `direction`; the
 * others keep a faded arrow.
 */
export function SortHeader({
  label,
  className = "",
  direction,
  onSort,
  title,
}: {
  label: string;
  className?: string;
  direction: "asc" | "desc" | null;
  onSort?: () => void;
  /** What a click will do, where that is not obvious from the arrow. */
  title?: string;
}) {
  return (
    <th
      scope="col"
      className={`hand-title ${ROW_TEXT} ${className}`}
      aria-sort={direction === null ? "none" : direction === "asc" ? "ascending" : "descending"}
    >
      {onSort ? (
        <button
          type="button"
          onClick={onSort}
          title={title}
          className="inline-flex cursor-pointer items-center gap-1 hover:underline"
        >
          {label}
          <span aria-hidden="true" className={direction ? "" : "opacity-30"}>
            {direction === "asc" ? "▲" : "▼"}
          </span>
        </button>
      ) : (
        label
      )}
    </th>
  );
}

/** The collection dropdown, offered only once there is a collection to pick. */
export function CollectionFilter({
  id,
  collections,
  value,
  onChange,
}: {
  id: string;
  collections: string[];
  value: string;
  onChange: (name: string) => void;
}) {
  if (collections.length === 0) return null;
  // Width sits on the wrapper, not the select: `field` already sets w-full,
  // and two utilities of equal weight would be a coin toss.
  return (
    <div className="w-full sm:w-44">
      <label htmlFor={id} className="sr-only">
        Filter by collection
      </label>
      <select id={id} className="field" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All collections</option>
        {collections.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
}

/** The taped-on card a list shows before it has anything in it. */
export function EmptyState({
  doodle,
  tilt,
  icon,
  title,
  action,
  onAction,
  children,
}: {
  doodle: string;
  /** How far the card is turned, as the `--r` the `paste` utility reads. */
  tilt: string;
  icon: string;
  title: string;
  action: ReactNode;
  onAction: () => void;
  children: ReactNode;
}) {
  return (
    <div
      data-doodle={doodle}
      className="paste tape tape-centre mx-auto max-w-xl rounded-[6px_14px_8px_12px] border-[3px] border-ink bg-card p-8 text-center shadow-[4px_5px_0_var(--color-shadow)]"
      style={{ "--r": tilt } as CSSProperties}
    >
      <div aria-hidden="true" className="mb-3 text-4xl">
        {icon}
      </div>
      <h2 className="hand-title text-xl">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">{children}</p>
      <button type="button" className="btn btn-primary mt-5" onClick={onAction}>
        {action}
      </button>
    </div>
  );
}

/**
 * What a list shows when its filters leave nothing. "Filters" rather than
 * "search": the button clears the collection too, and filtering by collection
 * alone once produced copy about a search nobody had typed.
 */
export function NoMatches({ noun, hint, onClear }: { noun: string; hint: string; onClear: () => void }) {
  return (
    <div className="card p-8 text-center">
      <h2 className="hand-title text-lg">No {noun}s match those filters</h2>
      <p className="mt-1 text-sm text-ink-soft">{hint}</p>
      <button type="button" className="btn btn-secondary mt-4" onClick={onClear}>
        Clear filters
      </button>
    </div>
  );
}
