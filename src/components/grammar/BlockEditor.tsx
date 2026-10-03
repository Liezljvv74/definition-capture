"use client";

import { useId } from "react";

import { MarkedField } from "@/components/grammar/MarkedField";
import { TableEditor } from "@/components/grammar/TableEditor";
import type { Block, ExampleBlock, TextBlock } from "@/lib/types";

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
  onDragEnd,
}: {
  block: Block;
  index: number;
  count: number;
  onChange: (block: Block) => void;
  onRemove: () => void;
  onMove: (to: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const inputId = useId();
  const menuButton =
    "cursor-pointer rounded px-2 py-1 text-xs text-ink-soft transition hover:bg-tile-sky disabled:cursor-not-allowed disabled:opacity-30";

  return (
    <section className="card p-3 sm:p-4" aria-label={`${KIND_LABEL[block.kind]} block`}>
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <span
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          title="Drag to reorder"
          aria-hidden="true"
          className="cursor-grab select-none px-1 text-ink-soft"
        >
          ⋮⋮
        </span>
        <span className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
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
      {block.kind === "table" && <TableEditor block={block} onChange={onChange} inputId={inputId} />}
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
      {/* field-sizing: content grows the box with its text instead of scrolling it,
          since a scrollbar here that the highlight copy behind it lacks would shift
          where lines wrap between the two, throwing the tinting out of place. */}
      <MarkedField
        id={inputId}
        multiline
        className="field min-h-28 font-mono text-sm [field-sizing:content]"
        value={block.text}
        onChange={(text) => onChange({ ...block, text })}
        placeholder="Explain the rule. **bold**, *italic*, lines starting with - for bullets, [[Name]] to link."
      />
    </>
  );
}

function ExampleFields({ block, onChange, inputId }: { block: ExampleBlock; onChange: (block: Block) => void; inputId: string }) {
  return (
    <div className="space-y-2">
      <div>
        <label htmlFor={`${inputId}-sentence`} className="mb-1 block text-xs font-medium text-ink-soft">
          Sentence. Put braces round the words the rule is about: Ich gebe {"{dem}"} Mann das Buch
        </label>
        <MarkedField id={`${inputId}-sentence`} className="field" value={block.sentence} onChange={(sentence) => onChange({ ...block, sentence })} />
      </div>
      <div>
        <label htmlFor={`${inputId}-translation`} className="mb-1 block text-xs font-medium text-ink-soft">
          Translation
        </label>
        <MarkedField id={`${inputId}-translation`} className="field" value={block.translation} onChange={(translation) => onChange({ ...block, translation })} />
      </div>
    </div>
  );
}
