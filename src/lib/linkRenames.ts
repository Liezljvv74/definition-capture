/**
 * After an item is renamed, every `[[Old name]]` that pointed at it is
 * rewritten to the new name, so the rename does not quietly turn incoming
 * links into dotted text (and, once the map exists, remove lines from it).
 *
 * Done in the browser through the stores rather than in a database function:
 * the link rules (`foldName`, the fixed order) live in TypeScript, and
 * repeating them in SQL would be two spellings of one rule.
 * ponytail: one write per list, not one transaction; if a write fails its
 * store reloads and those links stay on the old name (dotted), which renaming
 * back repairs. Move this into a database function if that ever matters.
 *
 * The stores import this module and it imports them. That cycle is safe
 * because nothing here runs while the modules load, only when a rename
 * happens.
 *
 * A list that has not finished loading yet, or whose first read failed, is
 * read here as empty: `getEntries()` and the rest hand back whatever is
 * cached, nothing more. Its links are not rewritten, and until it loads
 * they show dotted, the same as any other link to a name nothing resolves.
 *
 * This runs against `to`, the renamed item's new name, written optimistically
 * before its own save is known to have landed. If that save fails, the item
 * reloads back to `from`, but the rewrites already sent for `to` do not know
 * to undo themselves: every link this already reached now names something
 * nothing has, and stays dotted, until the item is renamed to `to` again and
 * the name exists for them to resolve against.
 */

import { planLinkRewrites, type LinkKind } from "@/lib/links";
import { getPhrases, updatePhrases } from "@/lib/phraseStorage";
import { getRules, updateRules } from "@/lib/rules";
import { getEntries, updateEntries } from "@/lib/storage";
import { getVerbTables, updateVerbTables } from "@/lib/verbTables";

/** `to` null: the item was deleted, and links to it lose their link (`planLinkRewrites`). */
export function rewriteLinks(kind: LinkKind, id: string, from: string, to: string | null): void {
  const plan = planLinkRewrites(
    { entries: getEntries(), phrases: getPhrases(), tables: getVerbTables(), rules: getRules() },
    kind,
    id,
    from,
    to,
  );
  if (plan.entries.length) updateEntries(plan.entries);
  if (plan.phrases.length) updatePhrases(plan.phrases);
  if (plan.tables.length) updateVerbTables(plan.tables);
  if (plan.rules.length) updateRules(plan.rules);
}
