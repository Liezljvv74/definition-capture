"use client";

import { InlineText, RichText } from "@/components/grammar/RichText";
import type { LinkIndex } from "@/components/RefText";
import { splitGaps } from "@/lib/blockText";
import type { Block, ExampleBlock, TableBlock } from "@/lib/types";

/** One block, as the reader sees it. */
export function BlockView({ block, linkIndex }: { block: Block; linkIndex: LinkIndex }) {
  switch (block.kind) {
    case "text":
      return <RichText text={block.text} linkIndex={linkIndex} />;
    case "table":
      return <TableView table={block} linkIndex={linkIndex} />;
    case "example":
      return <ExampleView example={block} />;
  }
}

const headerClass =
  "border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";
const cellClass =
  "border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:text-slate-200";

function TableView({ table, linkIndex }: { table: TableBlock; linkIndex: LinkIndex }) {
  return (
    // Its own scroll container, so a wide paradigm never widens the page.
    <div className="overflow-x-auto">
      <table className="border-collapse">
        <tbody>
          {table.cells.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => {
                const isHeader = (table.headerRow && r === 0) || (table.headerColumn && c === 0);
                const Cell = isHeader ? "th" : "td";
                return (
                  <Cell key={c} className={isHeader ? headerClass : cellClass} scope={isHeader ? (r === 0 ? "col" : "row") : undefined}>
                    <InlineText text={cell} linkIndex={linkIndex} />
                  </Cell>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Set apart from explanation: a left rule and a tint. The gaps are shown
 * underlined and without their braces; the braces are for the author and
 * for practice, not the reader.
 */
function ExampleView({ example }: { example: ExampleBlock }) {
  return (
    <figure className="rounded-r-lg border-l-4 border-emerald-400 bg-emerald-50/60 px-4 py-3 dark:border-emerald-500 dark:bg-emerald-500/10">
      <p className="text-slate-900 dark:text-slate-100">
        {splitGaps(example.sentence).map((part, index) =>
          part.gap ? (
            <span key={index} className="font-semibold underline decoration-emerald-500 underline-offset-4">
              {part.value}
            </span>
          ) : (
            <span key={index}>{part.value}</span>
          ),
        )}
      </p>
      {example.translation && (
        <figcaption className="mt-1 text-sm text-slate-600 dark:text-slate-300">{example.translation}</figcaption>
      )}
    </figure>
  );
}
