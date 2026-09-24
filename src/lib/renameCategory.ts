import { reload as reloadPhrases } from "@/lib/phraseStorage";
import { readError } from "@/lib/remoteStore";
import { currentUserId } from "@/lib/session";
import { currentSettings, saveSettings } from "@/lib/settings";
import { reload as reloadWords } from "@/lib/storage";
import { getSupabase } from "@/lib/supabaseClient";
import { foldName } from "@/lib/foldName";

/**
 * Renames a category on the Settings list and on everything filed under it.
 *
 * Three steps, in this order and not at once. The tag is renamed first, by
 * `rename_category` in the database, which is what carries every word and
 * phrase across (see that migration for why a rename is done on the tag).
 * Then the Settings list is saved with the new name. Run together, the two
 * could race: the list save creates a tag for the new name while the rename
 * is turning the old tag into one, and the unique index on names would refuse
 * whichever came second. One after the other they cannot, and if the new name
 * already has a tag the rename merges into it.
 *
 * Last, the word and phrase lists are read again. Their rows changed in the
 * database without passing through their stores, so the stores cannot know.
 *
 * Not optimistic, unlike the rest of Settings: nothing is shown as renamed
 * until the database has done it, because a rename that fails halfway would
 * otherwise leave the list saying one thing and every word another.
 *
 * Returns an error message, or null when it worked.
 */
export async function renameCategory(from: string, to: string): Promise<string | null> {
  const name = to.trim();
  if (!name) return "A category needs a name.";

  const supabase = getSupabase();
  if (!supabase || !currentUserId()) return "You are not signed in.";

  const { error } = await supabase.rpc("rename_category", {
    from_name: from,
    to_name: name,
  });
  if (error) return `Could not rename that category: ${readError(error)}`;

  const current = currentSettings().categories;
  const renamed = current.map((existing) =>
    foldName(existing) === foldName(from) ? name : existing,
  );
  saveSettings({ categories: renamed });

  reloadWords();
  reloadPhrases();
  return null;
}
