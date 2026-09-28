"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Modal } from "@/components/Modal";
import { TopicSelect } from "@/components/grammar/TopicSelect";
import { createRule, findByTitle } from "@/lib/rules";
import type { Rule } from "@/lib/types";

/**
 * Only the title and the topic: a rule is written on its own page, where
 * there is room. From the Grammar page it makes the empty rule and opens it
 * in Edit mode; from a selection in the reading view it hands the new rule
 * back instead, and the reader stays on the page they were reading.
 */
export function AddRuleDialog({
  topics,
  initialTitle = "",
  initialTopic = "",
  onClose,
  onCreated,
}: {
  topics: readonly string[];
  initialTitle?: string;
  initialTopic?: string;
  onClose: () => void;
  /** Given the new rule instead of opening it, for a rule made from a selection, whose reader stays where they are. */
  onCreated?: (rule: Rule) => void;
}) {
  const router = useRouter();
  const inputId = useId();
  const [title, setTitle] = useState(initialTitle);
  const [topic, setTopic] = useState(initialTopic);

  const clash = findByTitle(title);
  const problem =
    clash ? `There is already a rule called “${clash.title}”.` : topic.trim() === "" ? "A rule needs a topic." : null;
  const ready = title.trim() !== "" && problem === null;

  return (
    <Modal title="New rule" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready) return;
          const rule = createRule({ title, topic });
          if (onCreated) onCreated(rule);
          else router.push(`/rule?id=${rule.id}&edit=1`);
          onClose();
        }}
      >
        <div>
          <label htmlFor={`${inputId}-title`} className="mb-1 block text-sm font-medium">Title</label>
          <input id={`${inputId}-title`} className="field" value={title} maxLength={200} autoFocus onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Dative" />
        </div>
        <div>
          <label htmlFor={`${inputId}-topic`} className="mb-1 block text-sm font-medium">Topic</label>
          <TopicSelect id={`${inputId}-topic`} topics={topics} value={topic} onChange={setTopic} />
        </div>
        {problem && title.trim() !== "" && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">{problem}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!ready}>{onCreated ? "Create" : "Create and write it"}</button>
        </div>
      </form>
    </Modal>
  );
}
