import type { Source } from "@/lib/constants";

export function SourceBadge({ source }: { source: Source }) {
  return (
    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-slate-600 dark:bg-slate-800 dark:text-slate-300">
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
    "inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300";

  if (!onSelect) return <span className={base}>{name}</span>;

  return (
    <button
      type="button"
      onClick={() => onSelect(name)}
      title={`Show only ${name}`}
      className={`${base} cursor-pointer hover:bg-indigo-100 dark:hover:bg-indigo-500/25`}
    >
      {name}
    </button>
  );
}

export function NeedsDefinitionBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
      <span aria-hidden="true">!</span> Needs definition
    </span>
  );
}

/** A rule's topic. Given `onSelect` it filters the Grammar list to that topic. */
export function TopicBadge({ name, onSelect }: { name: string; onSelect?: (name: string) => void }) {
  const base =
    "inline-flex items-center rounded-md bg-rose-50 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-rose-700 dark:bg-rose-500/15 dark:text-rose-300";
  if (!onSelect) return <span className={base}>{name}</span>;
  return (
    <button
      type="button"
      onClick={() => onSelect(name)}
      title={`Show only ${name}`}
      className={`${base} cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-500/25`}
    >
      {name}
    </button>
  );
}
