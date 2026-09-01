import type { ModuleTag, Source } from "@/lib/constants";

export function ModuleBadge({ tag }: { tag: ModuleTag }) {
  const unsorted = tag === "Unsorted";
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
        unsorted
          ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
          : "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
      }`}
    >
      {tag}
    </span>
  );
}

export function SourceBadge({ source }: { source: Source }) {
  return (
    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      {source}
    </span>
  );
}

export function NeedsDefinitionBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">
      <span aria-hidden="true">!</span> Needs definition
    </span>
  );
}
