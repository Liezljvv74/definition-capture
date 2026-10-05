import type { Metadata } from "next";

import { ConversationChat } from "@/components/tutor/ConversationChat";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { allowance } from "@/lib/tutor";
import { loadConversation, loadTutorState } from "@/lib/tutorServer";

export const metadata: Metadata = { title: "Conversations" };

export default async function ConversationsPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const [{ plan, usedTotal, usedToday }, turns] = await Promise.all([loadTutorState(supabase), loadConversation(supabase)]);

  return <ConversationChat {...allowance({ plan, usedTotal, usedToday })} plan={plan} initialTurns={turns} />;
}
