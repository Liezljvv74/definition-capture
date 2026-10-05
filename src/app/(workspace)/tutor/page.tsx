import type { Metadata } from "next";

import { TutorChat } from "@/components/tutor/TutorChat";
import { shownLanguage as shown } from "@/lib/languages";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { allowance } from "@/lib/tutor";
import { loadTutorState } from "@/lib/tutorServer";

export const metadata: Metadata = { title: "Tutor" };

export default async function TutorPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { plan, usedTotal, usedToday, settings } = await loadTutorState(supabase);

  return (
    <TutorChat
      {...allowance({ plan, usedTotal, usedToday })}
      plan={plan}
      studiedName={shown(settings.language, settings.languageOther)}
      nativeName={shown(settings.nativeLanguage, settings.nativeLanguageOther)}
    />
  );
}
