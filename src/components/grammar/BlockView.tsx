"use client";

import { InlineText, RichText } from "@/components/grammar/RichText";
import type { LinkIndex } from "@/lib/links";
import type { Block, ExampleBlock, TableBlock } from "@/lib/types";

/** One block, as the reader sees it. */
export function BlockView({ block, linkIndex }: { block: Block; linkIndex: LinkIndex }) {
  // `data-block` and each field's `data-field` name the text a selection was
  // made in; see `readSelection.ts`.
  return <div data-block={block.id}>{blockContent(block, linkIndex)}</div>;
}

function blockContent(block: Block, linkIndex: LinkIndex) {
  switch (block.kind) {
    case "text":
      return <RichText text={block.text} linkIndex={linkIndex} />;
    case "table":
      return <TableView table={block} linkIndex={linkIndex} />;
    case "example":
      return <ExampleView example={block} linkIndex={linkIndex} />;
  }
}

/**
 * A table stays inside the card and scrolls sideways only when it cannot
 * fit. It used to break out of a narrow card towards the window's edges; the
 * owner found that looked broken where the card edge showed through the
 * rows, and on 29 September chose a wider card that keeps its tables inside.
 */
export const tableScrollClass = "overflow-x-auto";

// `overflow-wrap: anywhere` lets a long unbroken word wrap inside its cell
// instead of forcing the whole table into a scroll.
const headerClass =
  "border border-ink-soft/40 bg-tile-sky px-1.5 py-1 align-top [overflow-wrap:anywhere] text-left text-xs font-semibold text-ink sm:px-2.5 sm:py-1.5 sm:text-sm";
const cellClass =
  "border border-ink-soft/40 px-1.5 py-1 align-top [overflow-wrap:anywhere] text-xs text-ink sm:px-2.5 sm:py-1.5 sm:text-sm";

function TableView({ table, linkIndex }: { table: TableBlock; linkIndex: LinkIndex }) {
  return (
    <div className={tableScrollClass}>
      {/* Full width, so long cells wrap inside the card before anything scrolls. */}
      <table className="w-full border-collapse">
        <tbody>
          {table.cells.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => {
                const inHeaderRow = table.headerRow && r === 0;
                const inHeaderColumn = table.headerColumn && c === 0;
                const isHeader = inHeaderRow || inHeaderColumn;
                const Cell = isHeader ? "th" : "td";
                // The corner cell, when both flags are on, labels neither an
                // axis on its own, so it gets no `scope`: a screen reader
                // would otherwise be told a cell that names both a row and a
                // column heads only one of them.
                const scope = inHeaderRow && !inHeaderColumn
                  ? "col"
                  : inHeaderColumn && !inHeaderRow
                    ? "row"
                    : undefined;
                return (
                  <Cell
                    key={c}
                    data-field={`cell:${r}:${c}`}
                    // A header may be in either language; a selection starting here is judged by its words.
                    data-speak-lang={isHeader ? "auto" : undefined}
                    className={isHeader ? headerClass : cellClass}
                    scope={scope}
                  >
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
 * Set apart from explanation: a left rule and a tint.
 */
function ExampleView({ example, linkIndex }: { example: ExampleBlock; linkIndex: LinkIndex }) {
  return (
    <figure className="rounded-r-lg border-l-4 border-emerald-400 bg-emerald-50/60 px-3 py-2 sm:px-4 sm:py-3 dark:border-emerald-500 dark:bg-emerald-500/10">
      <p data-field="sentence" className="text-ink">
        <InlineText text={example.sentence} linkIndex={linkIndex} mode="sentence" />
      </p>
      {example.translation && (
        <figcaption data-field="translation" data-speak-lang="native" className="mt-1 text-xs text-ink-soft sm:text-sm">
          <InlineText text={example.translation} linkIndex={linkIndex} mode="plain" />
        </figcaption>
      )}
    </figure>
  );
}
