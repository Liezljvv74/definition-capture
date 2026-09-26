"use client";

import { useId, useState } from "react";

import { BlockEditor } from "@/components/grammar/BlockEditor";
import { TopicSelect } from "@/components/grammar/TopicSelect";
import { moveBlock, newExampleBlock, newTableBlock, newTextBlock } from "@/lib/blocks";
import { findByTitle } from "@/lib/rules";
import type { Block, Rule, RuleInput } from "@/lib/types";

/**
 * The whole rule in edit mode: title, topic and the stack of blocks. Nothing
 * is written until Save; Cancel throws the draft away, which is what lets
 * every block edit return a new block without touching the store.
 */
export function RuleEditor({
  rule,
  topics,
  onSave,
  onCancel,
}: {
  rule: Rule;
  /** The topics on the Settings list; a rule picks one, and new ones are made in Settings. */
  topics: readonly string[];
  onSave: (input: RuleInput) => void;
  onCancel: () => void;
}) {
  const inputId = useId();
  const [title, setTitle] = useState(rule.title);
  const [topic, setTopic] = useState(rule.topic);
  const [blocks, setBlocks] = useState<Block[]>(rule.blocks);
  /** The block being dragged, by index, while a drag is in progress. */
  const [dragging, setDragging] = useState<number | null>(null);

  const clash = findByTitle(title, rule.id);
  const problem =
    title.trim() === ""
      ? "A rule needs a title."
      : clash
        ? `There is already a rule called “${clash.title}”.`
        : topic.trim() === ""
          ? "A rule needs a topic."
          : null;

  const replace = (index: number, block: Block) =>
    setBlocks((current) => current.map((existing, at) => (at === index ? block : existing)));
  const add = (block: Block) => setBlocks((current) => [...current, block]);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (problem) return;
        onSave({ title: title.trim(), topic: topic.trim(), blocks });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_16rem]">
        <div>
          <label htmlFor={`${inputId}-title`} className="mb-1 block text-sm font-medium">
            Title
          </label>
          <input id={`${inputId}-title`} className="field" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div>
          <label htmlFor={`${inputId}-topic`} className="mb-1 block text-sm font-medium">
            Topic
          </label>
          <TopicSelect id={`${inputId}-topic`} topics={topics} value={topic} onChange={setTopic} />
        </div>
      </div>

      <div
        className="space-y-3"
        onDragOver={(event) => {
          if (dragging !== null) event.preventDefault();
        }}
      >
        {blocks.map((block, index) => (
          <div
            key={block.id}
            onDrop={(event) => {
              // A drag not started from this editor's own handles, such as a
              // reader dragging selected text into a textarea, must reach the
              // input the way it would anywhere else in the browser: calling
              // `preventDefault` unconditionally cancelled every native text
              // drop inside a block.
              if (dragging === null) return;
              event.preventDefault();
              setBlocks((current) => moveBlock(current, dragging, index));
              setDragging(null);
            }}
          >
            <BlockEditor
              block={block}
              index={index}
              count={blocks.length}
              onChange={(next) => replace(index, next)}
              onRemove={() => setBlocks((current) => current.filter((_, at) => at !== index))}
              onMove={(to) => setBlocks((current) => moveBlock(current, index, to))}
              onDragStart={() => setDragging(index)}
              // A drag that ends without landing on a block, dropped outside
              // the list or cancelled with Escape, never fires this section's
              // `onDrop`, and a stale `dragging` from it would make the next
              // unrelated text drag reorder blocks instead of doing nothing.
              onDragEnd={() => setDragging(null)}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary" onClick={() => add(newTextBlock())}>+ Text</button>
        <button type="button" className="btn btn-secondary" onClick={() => add(newTableBlock())}>+ Table</button>
        <button type="button" className="btn btn-secondary" onClick={() => add(newExampleBlock())}>+ Example</button>
      </div>

      {problem && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {problem}
        </p>
      )}

      <div className="flex gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
        <button type="submit" className="btn btn-primary" disabled={problem !== null}>
          Save
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
