"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { Modal } from "@/components/Modal";
import { createRule, findByTitle, titleProblem } from "@/lib/rules";
import { freeTitle, withSeeAlso, type TutorReply } from "@/lib/tutor";
import { useRules } from "@/lib/useRules";

/**
 * The answer's title and topic, editable, saved as a grammar rule with the
 * answer's blocks. `linkTo` names the rules already saved from this
 * conversation; the new rule ends with a line linking to them. The tutor's
 * related rules are offered as boxes to tick, none ticked, so saving without
 * touching them links the rule to nothing new; each one ticked joins the
 * same line.
 */
export function SaveAsRuleDialog({
  reply,
  linkTo,
  onSaved,
  onClose,
}: {
  reply: TutorReply;
  linkTo: string[];
  onSaved: (title: string) => void;
  onClose: () => void;
}) {
  const inputId = useId();
  // Untouched, the title is the answer's own or, when a rule already has it,
  // the first free numbered one; worked out on each render because the rules
  // may still be loading when the dialog opens.
  const [typed, setTyped] = useState<string | null>(null);
  const title = typed ?? freeTitle(reply.title, (candidate) => findByTitle(candidate) !== undefined);
  const [topic, setTopic] = useState(reply.topic);
  // The saved rule and what it was linked to, kept from the moment of saving:
  // `linkTo` grows to include the rule itself once the chat hears about it.
  const [saved, setSaved] = useState<{ id: string; links: string[] } | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  // Read through the hook so the store is loaded before the duplicate check relies on it.
  const { loaded } = useRules();
  // Only rules still saved, and not already on the line through `linkTo`.
  const related = reply.relatedRules.filter((name) => findByTitle(name) !== undefined && !linkTo.includes(name));

  const clash = findByTitle(title);
  const problem =
    clash ? `There is already a rule called “${clash.title}”.`
    : titleProblem(title) ?? (topic.trim() === "" ? "A rule needs a topic." : null);
  const ready = loaded && title.trim() !== "" && problem === null;

  return (
    <Modal title="Save as rule" onClose={onClose}>
      {saved ? (
        <div className="space-y-3">
          <p>
            {saved.links.length > 0 ? `Saved, linked to ${saved.links.map((t) => `“${t}”`).join(", ")}.` : "Saved."}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
            <Link href={`/rule/?id=${saved.id}`} className="btn btn-primary">Open rule</Link>
          </div>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready) return;
            const links = [...linkTo, ...related.filter((name) => ticked.includes(name))];
            const rule = createRule({ title, topic, blocks: withSeeAlso(reply.blocks, links) });
            setSaved({ id: rule.id, links });
            onSaved(rule.title);
          }}
        >
          <div>
            <label htmlFor={`${inputId}-title`} className="mb-1 block text-sm font-medium">Title</label>
            <input id={`${inputId}-title`} className="field" value={title} maxLength={200} autoFocus onChange={(event) => setTyped(event.target.value)} />
          </div>
          <div>
            <label htmlFor={`${inputId}-topic`} className="mb-1 block text-sm font-medium">Topic</label>
            <input id={`${inputId}-topic`} className="field" value={topic} maxLength={200} onChange={(event) => setTopic(event.target.value)} />
          </div>
          {related.length > 0 && (
            <fieldset>
              <legend className="mb-1 text-sm font-medium">Link to related rules</legend>
              <div className="space-y-1">
                {related.map((name) => (
                  <label key={name} className="flex items-center gap-2 text-sm [overflow-wrap:anywhere]">
                    <input
                      type="checkbox"
                      checked={ticked.includes(name)}
                      onChange={(event) =>
                        setTicked((all) => (event.target.checked ? [...all, name] : all.filter((t) => t !== name)))
                      }
                    />
                    {name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
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
