"use client";

import { useId } from "react";

import { withCell, withColumn, withoutLastColumn, withoutLastRow, withRow } from "@/lib/blocks";
import type { Block, ExampleBlock, TableBlock, TextBlock } from "@/lib/types";

const KIND_LABEL: Record<Block["kind"], string> = { text: "Text", table: "Table", example: "Example" };

/**
 * One block with its own controls. Reordering is offered two ways: a drag
 * handle, and Move up and Move down, so it works from a keyboard and on a
 * phone, where dragging is unreliable.
 */
export function BlockEditor({
  block,
  index,
  count,
  onChange,
  onRemove,
  onMove,
  onDragStart,
}: {
  block: Block;
  index: number;
  count: number;
  onChange: (block: Block) => void;
  onRemove: () => void;
  onMove: (to: number) => void;
  onDragStart: () => void;
}) {
  const inputId = useId();
  const menuButton =
    "cursor-pointer rounded px-2 py-1 text-xs text-slate-600 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-700";

  return (
    <section className="card p-3 sm:p-4" aria-label={`${KIND_LABEL[block.kind]} block`}>
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <span
          draggable
          onDragStart={onDragStart}
          title="Drag to reorder"
          aria-hidden="true"
          className="cursor-grab select-none px-1 text-slate-400"
        >
          ⋮⋮
        </span>
        <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
          {KIND_LABEL[block.kind]}
        </span>
        <span className="ml-auto flex gap-1">
          <button type="button" className={menuButton} disabled={index === 0} onClick={() => onMove(index - 1)}>
            Move up
          </button>
          <button type="button" className={menuButton} disabled={index === count - 1} onClick={() => onMove(index + 1)}>
            Move down
          </button>
          <button type="button" className={menuButton} onClick={onRemove}>
            Remove
          </button>
        </span>
      </div>

      {block.kind === "text" && <TextFields block={block} onChange={onChange} inputId={inputId} />}
      {block.kind === "table" && <TableFields block={block} onChange={onChange} inputId={inputId} />}
      {block.kind === "example" && <ExampleFields block={block} onChange={onChange} inputId={inputId} />}
    </section>
  );
}

function TextFields({ block, onChange, inputId }: { block: TextBlock; onChange: (block: Block) => void; inputId: string }) {
  return (
    <>
      <label htmlFor={inputId} className="sr-only">
        Text
      </label>
      <textarea
        id={inputId}
        className="field min-h-28 font-mono text-sm"
        value={block.text}
        onChange={(event) => onChange({ ...block, text: event.target.value })}
        placeholder="Explain the rule. **bold**, *italic*, lines starting with - for bullets, [[Name]] to link."
      />
    </>
  );
}

function TableFields({ block, onChange, inputId }: { block: TableBlock; onChange: (block: Block) => void; inputId: string }) {
  const small = "btn btn-secondary px-2.5 py-1 text-xs";
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <tbody>
            {block.cells.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => {
                  const isHeader = (block.headerRow && r === 0) || (block.headerColumn && c === 0);
                  return (
                    <td key={c} className="border border-slate-200 p-0.5 dark:border-slate-700">
                      <label htmlFor={`${inputId}-${r}-${c}`} className="sr-only">
                        {`Row ${r + 1}, column ${c + 1}`}
                      </label>
                      <input
                        id={`${inputId}-${r}-${c}`}
                        className={`field min-w-24 py-1 ${isHeader ? "font-semibold" : ""}`}
                        value={cell}
                        onChange={(event) => onChange(withCell(block, r, c, event.target.value))}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={small} onClick={() => onChange(withRow(block))}>Add row</button>
        <button type="button" className={small} disabled={block.cells.length <= 1} onClick={() => onChange(withoutLastRow(block))}>Remove last row</button>
        <button type="button" className={small} onClick={() => onChange(withColumn(block))}>Add column</button>
        <button type="button" className={small} disabled={block.cells[0].length <= 1} onClick={() => onChange(withoutLastColumn(block))}>Remove last column</button>
        <label className="ml-2 inline-flex items-center gap-1.5 text-sm">
          <input type="checkbox" className="accent-indigo-600" checked={block.headerRow} onChange={(event) => onChange({ ...block, headerRow: event.target.checked })} />
          First row is a header
        </label>
        <label className="inline-flex items-center gap-1.5 text-sm">
          <input type="checkbox" className="accent-indigo-600" checked={block.headerColumn} onChange={(event) => onChange({ ...block, headerColumn: event.target.checked })} />
          First column is a header
        </label>
      </div>
    </div>
  );
}

function ExampleFields({ block, onChange, inputId }: { block: ExampleBlock; onChange: (block: Block) => void; inputId: string }) {
  return (
    <div className="space-y-2">
      <div>
        <label htmlFor={`${inputId}-sentence`} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
          Sentence. Put braces round the words the rule is about: Ich gebe {"{dem}"} Mann das Buch
        </label>
        <input id={`${inputId}-sentence`} className="field" value={block.sentence} onChange={(event) => onChange({ ...block, sentence: event.target.value })} />
      </div>
      <div>
        <label htmlFor={`${inputId}-translation`} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
          Translation
        </label>
        <input id={`${inputId}-translation`} className="field" value={block.translation} onChange={(event) => onChange({ ...block, translation: event.target.value })} />
      </div>
    </div>
  );
}
