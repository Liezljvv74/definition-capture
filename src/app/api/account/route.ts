/**
 * DELETE /api/account: deletes the signed-in account and everything it owns.
 *
 * Deleting a sign-in needs Supabase's admin API, so this is the one place the
 * app holds a secret key (`SUPABASE_SECRET_KEY`, server-only, Sensitive in
 * Vercel; the owner's decision, 13 October 2026, over a `security definer`
 * function writing into `auth.users`). Every owned table cascades from
 * `auth.users`, so removing the user removes the words, phrases, verb tables,
 * rules, flashcards, tutor conversations and settings with it.
 *
 * Who is deleted comes only from the verified token, never from the request.
 * The body must repeat the account's email address: the Settings dialog asks
 * the reader to type it, so a stray click cannot delete an account. DELETE is
 * not a method a cross-site form can send, so no other site can trigger this.
 */

import "server-only";

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function DELETE(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data } = (await supabase?.auth.getClaims()) ?? {};
  const userId = data?.claims?.sub;
  if (!supabase || typeof userId !== "string") return fail(401, "signed_out");
  const account = typeof data?.claims?.email === "string" ? data.claims.email : "";

  let body: { email?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad_request");
  }
  const typed = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!account || typed !== account.toLowerCase()) return fail(400, "email_mismatch");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    console.error("account: SUPABASE_SECRET_KEY is not configured");
    return fail(502, "delete_failed");
  }

  // An admin client holds no session of its own: nothing to persist or refresh.
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error(`account: Supabase refused the delete (${error.status ?? "no status"})`);
    return fail(502, "delete_failed");
  }

  // The token stays validly signed until it expires, so the cookies holding it
  // are cleared here rather than left for the proxy to believe.
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.json({ ok: true });
}
