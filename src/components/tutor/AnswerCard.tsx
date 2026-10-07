"use client";

import Link from "next/link";
import type { CSSProperties } from "react";

import { BlockView } from "@/components/grammar/BlockView";
import { findByTitle } from "@/lib/rules";
import type { TutorExchange } from "@/lib/tutor";

/** The source's title, or its host when it has none. */
function sourceLabel(source: { url: string; title: string }): string {
  if (source.title.trim()) return source.title;
  try {
    return new URL(source.url).hostname;
  } catch {
    return source.url;
  }
}

/** A link to the saved rule an answer points to; nothing while the rules load or if it has since gone. */
function SavedRuleLink({ title }: { title: string }) {
  const rule = findByTitle(title);
  if (!rule) return null;
  return (
    <Link href={`/rule/?id=${rule.id}`} className="btn btn-secondary">
      Open “{rule.title}”
    </Link>
  );
}

/**
 * One exchange: the question, and the answer as rule blocks with its sources
 * and Save as rule. `ticked` is null for an answer that was not saved, which
 * has no id to merge by, and for an answer pointing to a saved rule.
 */
export function AnswerCard({
  exchange: { id, question, reply },
  index,
  ticked,
  tickDisabled = false,
  onTick,
  onSave,
}: {
  exchange: TutorExchange;
  index: number;
  ticked: boolean | null;
  /** True once the most a merge accepts are ticked, for the boxes still unticked. */
  tickDisabled?: boolean;
  onTick: (on: boolean) => void;
  onSave: () => void;
}) {
  return (
    <section id={id === null ? undefined : `e-${id}`} className="scroll-mt-24 space-y-2">
      <p
        className="paste ml-auto max-w-[85%] rounded-[3px_10px_4px_8px] border-[1.5px] border-ink bg-tile-sky px-3 py-2 text-sm whitespace-pre-wrap shadow-[2px_3px_0_var(--color-shadow)] [overflow-wrap:anywhere]"
        style={{ "--r": `${index % 2 ? -0.8 : 0.8}deg` } as CSSProperties}
      >
        {question}
      </p>
      <div className="card space-y-3 p-4 [overflow-wrap:anywhere]">
        <h2 className="hand-title text-lg">{reply.title}</h2>
        {reply.blocks.map((block) => (
          <BlockView key={block.id} block={block} linkIndex={new Map()} />
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t-[1.5px] border-dashed border-rule pt-2 text-xs">
          {reply.sources.length > 0 ? (
            <ul className="flex min-w-0 flex-wrap gap-x-3 gap-y-1">
              {reply.sources.map((source) => (
                <li key={source.url} className="min-w-0">
                  <a href={source.url} target="_blank" rel="noopener noreferrer" className="block max-w-[16rem] truncate underline">
                    {sourceLabel(source)}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-soft">Not checked against a reference</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {ticked !== null && (
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={ticked} disabled={tickDisabled} onChange={(event) => onTick(event.target.checked)} />
                Include in a rule
              </label>
            )}
            {reply.existingRule ? (
              // The rule is already saved, so the answer offers it rather than a second copy.
              <SavedRuleLink title={reply.existingRule} />
            ) : (
              <button type="button" className="btn btn-secondary" onClick={onSave}>
                Save as rule
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
