import { foldName } from "@/lib/foldName";
import { reload as reloadPhrases } from "@/lib/phraseStorage";
import { readError } from "@/lib/remoteStore";
import { currentUserId } from "@/lib/session";
import {
  currentSettings,
  noteRenamed,
  saveSettings,
  storedNames,
  type Settings,
} from "@/lib/settings";
import { reload as reloadWords } from "@/lib/storage";
import { getSupabase } from "@/lib/supabaseClient";

/**
 * Renaming a name on one of the Settings lists.
 *
 * What a rename reaches depends on what the name is. A collection and a source
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
  "collections" | "sources" | "verbPersons" | "verbTenses" | "sortSkipWords"
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
  list: Exclude<RenamableList, "collections" | "sources">,
  from: string,
  to: string,
): Promise<string | null> {
  const name = to.trim();
  if (!name) return "A name cannot be empty.";
  saveSettings({ [list]: renamedIn(list, from, name) });
  return null;
}

/**
 * Renames in the database, then shows it on the list, then reads the lists of
 * words and phrases again, in that order and not at once.
 *
 * The rename is one row: every word and phrase points at the collection or
 * source by id, so they all follow. When the new name already exists the
 * database merges the two instead. The word and phrase lists are read last
 * because the names they show changed without passing through their stores.
 *
 * A name that is only one of the defaults an untouched account is shown has
 * no row to rename yet, so that case saves the list with the new name, which
 * creates the rows.
 *
 * Not optimistic, unlike the rest of Settings: nothing is shown as renamed
 * until the database has done it, because a rename that fails halfway would
 * otherwise leave the list saying one thing and every word another.
 *
 * Returns an error message, or null when it worked.
 */
async function renameThroughDatabase(
  list: "collections" | "sources",
  noun: string,
  from: string,
  to: string,
): Promise<string | null> {
  const name = to.trim();
  if (!name) return `A ${noun} needs a name.`;

  const supabase = getSupabase();
  if (!supabase || !currentUserId()) return "You are not signed in.";

  const stored = await storedNames(list);
  if (stored.error) return `Could not rename that ${noun}: ${readError(stored.error)}`;
  if (!stored.names.some((existing) => foldName(existing) === foldName(from))) {
    saveSettings({ [list]: renamedIn(list, from, name) });
    return null;
  }

  const { error } =
    list === "collections"
      ? await supabase.rpc("rename_tag", {
          tag_context: "collection",
          from_name: from,
          to_name: name,
        })
      : await supabase.rpc("rename_item_source", { from_name: from, to_name: name });
  if (error) return `Could not rename that ${noun}: ${readError(error)}`;

  noteRenamed(list, from, name);

  reloadWords();
  reloadPhrases();
  return null;
}

/**
 * A collection, on the list and on everything filed under it. The database
 * renames the tag, merging into another if the new name already has one; see
 * `rename_tag` in the `refactor_build_new_schema` migration.
 */
export function renameCollection(from: string, to: string): Promise<string | null> {
  return renameThroughDatabase("collections", "collection", from, to);
}

/**
 * A source, on the list and on every word and phrase that names it; see
 * `rename_item_source` in the same migration.
 */
export function renameSource(from: string, to: string): Promise<string | null> {
  return renameThroughDatabase("sources", "source", from, to);
}
