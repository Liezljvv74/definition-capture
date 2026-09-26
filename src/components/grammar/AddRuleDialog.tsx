"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Modal } from "@/components/Modal";
import { TopicSelect } from "@/components/grammar/TopicSelect";
import { createRule, findByTitle } from "@/lib/rules";

/**
 * Only the title and the topic: a rule is written on its own page, where
 * there is room, so this makes the empty rule and goes there in Edit mode.
 */
export function AddRuleDialog({ topics, onClose }: { topics: readonly string[]; onClose: () => void }) {
  const router = useRouter();
  const inputId = useId();
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");

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
          onClose();
          router.push(`/rule?id=${rule.id}&edit=1`);
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
          <button type="submit" className="btn btn-primary" disabled={!ready}>Create and write it</button>
        </div>
      </form>
    </Modal>
  );
}
