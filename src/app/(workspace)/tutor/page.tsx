import type { Metadata } from "next";

import { TutorChat } from "@/components/tutor/TutorChat";
import { languageName } from "@/lib/languages";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { allowance } from "@/lib/tutor";
import { loadTutorState } from "@/lib/tutorServer";

export const metadata: Metadata = { title: "Tutor" };

/** A language as shown: the browser's name for the code, else the name typed in Settings, else nothing. */
function shown(code: string, other: string): string | null {
  return code ? languageName(code) : other.trim() || null;
}

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
