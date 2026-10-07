/**
 * POST /api/tutor/search: the account's conversations matching a query, by
 * keyword and by meaning (search_tutor, under row level security). It spends
 * no message, but each search embeds its query with the shared OpenRouter
 * key, so an account may search 100 times an hour (the owner's decision,
 * 7 October 2026): heavy use by one account could otherwise get the key
 * limited and stop paid questions for everyone.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient, serverUserId } from "@/lib/supabaseServer";
import { SEARCH_MAX, SEARCH_MIN, searchResults } from "@/lib/tutor";
import { embedOrNull, reserveSearch, searchExchanges } from "@/lib/tutorServer";

export const runtime = "nodejs";

/** Rows asked for, enough to fill the list after grouping by conversation. */
const SEARCH_ROWS = 30;

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function POST(request: Request) {
  const userId = await serverUserId();
  const supabase = userId ? await createSupabaseServerClient() : null;
  if (!userId || !supabase) return fail(401, "signed_out");

  let body: { query?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad_request");
  }
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  if (query.length < SEARCH_MIN || query.length > SEARCH_MAX) return fail(400, "bad_request");

  try {
    if (!(await reserveSearch(supabase, userId))) return fail(429, "search_limit");
    // A failed embedding gives null, and the search is then by keyword only.
    const rows = await searchExchanges(supabase, query, await embedOrNull(query), SEARCH_ROWS);
    return NextResponse.json({
      results: searchResults(
        rows.map((r) => ({ exchangeId: r.id, conversationId: r.conversationId, name: r.conversationName, question: r.question, answerText: r.answerText })),
        query,
      ),
    });
  } catch {
    console.error("search: the search failed");
    return fail(502, "search_failed");
  }
}
