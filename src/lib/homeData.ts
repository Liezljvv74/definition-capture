import {
  readRecent,
  readRemember,
  readSummary,
  type HomeSummary,
  type RecentItem,
  type RememberItem,
} from "@/lib/home";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

/**
 * Everything the dashboard shows, read on the server with the caller's
 * session, so row level security scopes every query exactly as it does in
 * the browser.
 *
 * Server-side rather than through the list stores: those download every word,
 * phrase and verb table to the browser, which is right for a list page and
 * wasteful for a page that shows counts and four titles. The summary, the
 * recent items and the display name go out together; the random item needs
 * the summary's pick, so it follows.
 */
export async function loadHome(): Promise<{
  name: string;
  summary: HomeSummary;
  recent: RecentItem[];
  remember: RememberItem | null;
}> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const [claims, summaryResult, recentResult, settingsResult] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.rpc("home_summary").maybeSingle(),
    supabase
      .from("items")
      .select("id, item_type, title, created_at, item_tags(position, context, tags(name))")
      .order("created_at", { ascending: false })
      .order("id")
      .limit(4),
    supabase.from("user_settings").select("display_name").maybeSingle(),
  ]);

  if (summaryResult.error) throw new Error(`Could not load your summary: ${summaryResult.error.message}`);
  if (recentResult.error) throw new Error(`Could not load your recent items: ${recentResult.error.message}`);

  const summary = readSummary(summaryResult.data);

  let remember: RememberItem | null = null;
  if (summary.rememberId) {
    const { data } = await supabase
      .from("items")
      .select("id, item_type, title, definition, literal_meaning, usage_example, tenses, verb_rows")
      .eq("id", summary.rememberId)
      .maybeSingle();
    // A failure here costs one optional card, not the page.
    remember = readRemember(data);
  }

  // The same fallback the account menu uses: a name if one is set, else the
  // email. A failed settings read falls back too rather than failing the page.
  const email = claims.data?.claims?.email;
  const displayName = settingsResult.data?.display_name;
  const name =
    (typeof displayName === "string" && displayName.trim()) ||
    (typeof email === "string" ? email : "");

  return {
    name,
    summary,
    recent: (recentResult.data ?? []).map((row) => readRecent(row as Record<string, unknown>)),
    remember,
  };
}
