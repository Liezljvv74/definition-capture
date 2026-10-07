/**
 * The tutor's conversations as the browser changes them: renaming, deleting,
 * and recording the rules saved from one. Run under the signed-in session
 * with the publishable key, so row level security limits each call to the
 * account's own rows. Not built on `remoteStore`, which is for the four item
 * lists; the server reads conversations for the page (`tutorServer.ts`).
 */

import { settled } from "@/lib/rules";
import { getSupabase } from "@/lib/supabaseClient";
import { CONVERSATION_NAME_MAX } from "@/lib/tutor";

/** False when the name is blank or the write failed; the caller reloads the list. */
export async function renameConversation(id: string, name: string): Promise<boolean> {
  const clean = name.trim().slice(0, CONVERSATION_NAME_MAX).trim();
  const supabase = getSupabase();
  if (!clean || !supabase) return false;
  const { error } = await supabase.from("tutor_conversations").update({ name: clean }).eq("id", id);
  return !error;
}

/** Deletes the conversation; its exchanges and rule links go with it in the database. */
export async function deleteConversation(id: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { error } = await supabase.from("tutor_conversations").delete().eq("id", id);
  return !error;
}

/**
 * Records that a rule was saved from a conversation, so a rule saved from it
 * later, even weeks later, links to it. `createRule` saves optimistically, so
 * this waits for the rules' writes to finish first. If the rule's save
 * failed, the rule has no row and the database refuses the link (23503), so
 * nothing is recorded, as the spec wants; a link already there (23505) is
 * fine. Nothing here is worth an error on screen: the rule itself is what the
 * learner saved.
 */
export async function recordSavedRule(conversationId: string, itemId: string): Promise<void> {
  await settled();
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.from("tutor_conversation_rules").insert({ conversation_id: conversationId, item_id: itemId });
  if (error && error.code !== "23503" && error.code !== "23505") console.error("tutor: could not record the saved rule");
}
