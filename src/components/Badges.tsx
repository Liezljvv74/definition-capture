import type { Source } from "@/lib/constants";

export function SourceBadge({ source }: { source: Source }) {
  return (
    <span className="inline-flex items-center rounded-md border border-rule bg-card px-2 py-0.5 text-xs font-medium whitespace-nowrap text-ink-soft">
      {source}
    </span>
  );
}

/**
 * One of a word's groups. Given `onSelect` it becomes a button that filters
 * the list down to that collection, which is the quickest way in: you are
 * looking at the word already.
 */
export function CollectionBadge({
  name,
  onSelect,
}: {
  name: string;
  onSelect?: (name: string) => void;
}) {
  const base =
    "inline-flex items-center rounded-md border border-rule bg-tile-sky px-2 py-0.5 text-xs font-medium whitespace-nowrap text-ink";

  if (!onSelect) return <span className={base}>{name}</span>;

  return (
    <button
      type="button"
      onClick={() => onSelect(name)}
      title={`Show only ${name}`}
      className={`${base} cursor-pointer hover:border-ink`}
    >
      {name}
    </button>
  );
}

export function NeedsDefinitionBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-amber-400 bg-amber-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
      <span aria-hidden="true">!</span> Needs definition
    </span>
  );
}

/** A rule's topic. Given `onSelect` it filters the Grammar list to that topic. */
export function TopicBadge({ name, onSelect }: { name: string; onSelect?: (name: string) => void }) {
  const base =
    "inline-flex items-center rounded-md bg-olive-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-olive-700 dark:bg-olive-400/15 dark:text-olive-300";
  if (!onSelect) return <span className={base}>{name}</span>;
  return (
    <button
      type="button"
      onClick={() => onSelect(name)}
      title={`Show only ${name}`}
      className={`${base} cursor-pointer hover:bg-olive-200 dark:hover:bg-olive-400/25`}
    >
      {name}
    </button>
  );
}
