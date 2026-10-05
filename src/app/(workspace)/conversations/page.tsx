import type { Metadata } from "next";

import { ConversationChat } from "@/components/tutor/ConversationChat";
import { shownLanguage } from "@/lib/languages";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { allowance } from "@/lib/tutor";
import { loadConversation, loadTutorState } from "@/lib/tutorServer";

export const metadata: Metadata = { title: "Conversations" };

export default async function ConversationsPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const [{ plan, usedTotal, usedToday, settings }, turns] = await Promise.all([loadTutorState(supabase), loadConversation(supabase)]);

  return (
    <ConversationChat
      {...allowance({ plan, usedTotal, usedToday })}
      plan={plan}
      // The signatures are for the server's check, not for showing.
      initialTurns={turns.map(({ role, content }) => ({ role, content }))}
      studiedName={shownLanguage(settings.language, settings.languageOther)}
    />
  );
}
