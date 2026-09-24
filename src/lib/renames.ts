import { foldName } from "@/lib/foldName";
import { reload as reloadPhrases } from "@/lib/phraseStorage";
import { readError } from "@/lib/remoteStore";
import { currentUserId } from "@/lib/session";
import { currentSettings, saveSettings, type Settings } from "@/lib/settings";
import { reload as reloadWords } from "@/lib/storage";
import { getSupabase } from "@/lib/supabaseClient";

/**
 * Renaming a name on one of the Settings lists.
 *
 * What a rename reaches depends on what the name is. A category and a source
 * are carried by the words and phrases filed under them, so renaming only the
 * list would leave every one of those on the old name: those two go through
 * the database first. Verb persons and tenses shape the next conjugation
 * table and leave existing tables with what they were made with, the rule
 * Settings states for them, and the words to skip are only a list; those
 * three rename the list alone.
 */

/** The lists a rename can apply to. */
type RenamableList = keyof Pick<
  Settings,
  "categories" | "sources" | "verbPersons" | "verbTenses" | "sortSkipWords"
>;

/** The list with `from` replaced by `to`, matched the way every name is. */
function renamedIn(list: RenamableList, from: string, to: string): string[] {
  return currentSettings()[list].map((existing) =>
    foldName(existing) === foldName(from) ? to : existing,
  );
}

/**
 * Renames on the list alone. Optimistic like the rest of Settings, so it
 * resolves at once; a failed save shows in the banner the way any other does.
 */
export async function renameInList(
  list: Exclude<RenamableList, "categories" | "sources">,
  from: string,
  to: string,
): Promise<string | null> {
  const name = to.trim();
  if (!name) return "A name cannot be empty.";
  saveSettings({ [list]: renamedIn(list, from, name) });
  return null;
}

/**
 * Renames through the database, then the list, then the lists of words and
 * phrases read again, in that order and not at once.
 *
 * For a category, run together the list save could race the rename: it
 * creates a tag for the new name while the rename is turning the old tag into
 * one, and the unique index on names would refuse whichever came second.
 * Sources have no such index, but one order for both keeps them the same to
 * reason about. The word and phrase lists are read last because their rows
 * changed in the database without passing through their stores.
 *
 * Not optimistic, unlike the rest of Settings: nothing is shown as renamed
 * until the database has done it, because a rename that fails halfway would
 * otherwise leave the list saying one thing and every word another.
 *
 * Returns an error message, or null when it worked.
 */
async function renameThroughDatabase(
  list: "categories" | "sources",
  rpc: "rename_category" | "rename_source",
  noun: string,
  from: string,
  to: string,
): Promise<string | null> {
  const name = to.trim();
  if (!name) return `A ${noun} needs a name.`;

  const supabase = getSupabase();
  if (!supabase || !currentUserId()) return "You are not signed in.";

  const { error } = await supabase.rpc(rpc, { from_name: from, to_name: name });
  if (error) return `Could not rename that ${noun}: ${readError(error)}`;

  saveSettings({ [list]: renamedIn(list, from, name) });

  reloadWords();
  reloadPhrases();
  return null;
}

/**
 * A category, on the list and on everything filed under it. The database
 * renames the tag, merging into another if the new name already has one; see
 * the `rename_category` migration.
 */
export function renameCategory(from: string, to: string): Promise<string | null> {
  return renameThroughDatabase("categories", "rename_category", "category", from, to);
}

/**
 * A source, on the list and on every word and phrase that names it; see the
 * `rename_source` migration.
 */
export function renameSource(from: string, to: string): Promise<string | null> {
  return renameThroughDatabase("sources", "rename_source", "source", from, to);
}
