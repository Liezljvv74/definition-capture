"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { Modal } from "@/components/Modal";
import { searchRules } from "@/lib/ruleSearch";
import { createRule, findByTitle, titleProblem } from "@/lib/rules";
import { freeTitle, withSeeAlso, type TutorReply } from "@/lib/tutor";
import type { Rule } from "@/lib/types";
import { useRules } from "@/lib/useRules";

/**
 * The answer's title and topic, editable, saved as a grammar rule with the
 * answer's blocks. It links, on one See also line, to every rule saved from
 * this conversation (`linkedRuleIds`, kept in the database, so a rule saved
 * weeks later still links to the earlier ones), to the tutor's related rules
 * the learner ticks, and to any other rule found with Link another rule.
 * Suggestions start unticked; a find is ticked when chosen.
 */
export function SaveAsRuleDialog({
  reply,
  linkedRuleIds,
  onSaved,
  onClose,
}: {
  reply: TutorReply;
  linkedRuleIds: string[];
  onSaved: (rule: Rule) => void;
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
  // `linkedRuleIds` grows to include the rule itself once the chat hears about it.
  const [saved, setSaved] = useState<{ id: string; links: string[] } | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  // Read through the hook so the store is loaded before the duplicate check relies on it.
  const { rules, loaded } = useRules();
  // Titles as they are now, so a rule renamed since it was saved links by its new name; a deleted one drops out.
  const linkTo = linkedRuleIds.flatMap((id) => rules.find((rule) => rule.id === id)?.title ?? []);
  const [found, setFound] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  // Only rules still saved, not already on the line, each once.
  const related = [...new Set([...reply.relatedRules, ...found])].filter((name) => findByTitle(name) !== undefined && !linkTo.includes(name));
  const matches = search.trim() ? searchRules(rules, search, title).filter((m) => !linkTo.includes(m.title) && !related.includes(m.title)) : [];

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
            onSaved(rule);
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
          {linkTo.length + related.length > 0 && (
            <fieldset>
              <legend className="mb-1 text-sm font-medium">Link to related rules</legend>
              <div className="space-y-1">
                {/* Always linked, so shown ticked and fixed: the learner sees what the line will hold. */}
                {linkTo.map((name) => (
                  <label key={name} className="flex items-center gap-2 text-sm [overflow-wrap:anywhere]">
                    <input type="checkbox" checked disabled />
                    {name}
                  </label>
                ))}
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
          <div>
            <label htmlFor={`${inputId}-find`} className="mb-1 block text-sm font-medium">Link another rule</label>
            <input
              id={`${inputId}-find`}
              className="field"
              value={search}
              maxLength={100}
              onChange={(event) => setSearch(event.target.value)}
            />
            {matches.length > 0 && (
              <ul className="mt-1 space-y-1">
                {matches.map((match) => (
                  <li key={match.title}>
                    <button
                      type="button"
                      className="w-full text-left text-sm underline-offset-2 hover:underline [overflow-wrap:anywhere]"
                      onClick={() => {
                        setFound((all) => [...all, match.title]);
                        setTicked((all) => [...all, match.title]);
                        setSearch("");
                      }}
                    >
                      {match.title}
                      <span className="block text-xs text-ink-soft">{match.snippet}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
