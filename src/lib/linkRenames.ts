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
 */

import { planLinkRewrites, type LinkKind } from "@/lib/links";
import { getPhrases, updatePhrases } from "@/lib/phraseStorage";
import { getRules, updateRules } from "@/lib/rules";
import { getEntries, updateEntries } from "@/lib/storage";
import { getVerbTables, updateVerbTables } from "@/lib/verbTables";

export function rewriteLinks(kind: LinkKind, id: string, from: string, to: string): void {
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
