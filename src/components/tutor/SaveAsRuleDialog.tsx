"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { Modal } from "@/components/Modal";
import { createRule, findByTitle, titleProblem, updateRule } from "@/lib/rules";
import type { TutorReply } from "@/lib/tutor";
import { useRules } from "@/lib/useRules";

/** The answer's title and topic, editable, saved as a grammar rule with the answer's blocks. */
export function SaveAsRuleDialog({ reply, onClose }: { reply: TutorReply; onClose: () => void }) {
  const inputId = useId();
  const [title, setTitle] = useState(reply.title);
  const [topic, setTopic] = useState(reply.topic);
  const [savedId, setSavedId] = useState<string | null>(null);
  // Read through the hook so the store is loaded before the duplicate check relies on it.
  const { loaded } = useRules();

  const clash = findByTitle(title);
  const problem =
    clash ? `There is already a rule called “${clash.title}”.`
    : titleProblem(title) ?? (topic.trim() === "" ? "A rule needs a topic." : null);
  const ready = loaded && title.trim() !== "" && problem === null;

  return (
    <Modal title="Save as rule" onClose={onClose}>
      {savedId ? (
        <div className="space-y-3">
          <p>Saved.</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
            <Link href={`/rule/?id=${savedId}`} className="btn btn-primary">Open rule</Link>
          </div>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready) return;
            const rule = createRule({ title, topic });
            updateRule(rule.id, { title, topic, blocks: reply.blocks });
            setSavedId(rule.id);
          }}
        >
          <div>
            <label htmlFor={`${inputId}-title`} className="mb-1 block text-sm font-medium">Title</label>
            <input id={`${inputId}-title`} className="field" value={title} maxLength={200} autoFocus onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div>
            <label htmlFor={`${inputId}-topic`} className="mb-1 block text-sm font-medium">Topic</label>
            <input id={`${inputId}-topic`} className="field" value={topic} maxLength={200} onChange={(event) => setTopic(event.target.value)} />
          </div>
          {problem && title.trim() !== "" && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">{problem}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={!ready}>Save</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
