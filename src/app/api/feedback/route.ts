/**
 * POST /api/feedback: a signed-in reader's suggestion or error report, emailed
 * to the owner through Resend. Signed-in only, like every other `/api/` path
 * (the proxy answers a signed-out call with a 401): sign-in is what keeps a
 * bot from filling the owner's inbox, and the Turnstile secret that could
 * check a signed-out sender lives only in the Supabase dashboard.
 *
 * The address it goes to is `FEEDBACK_TO`, not written here, so the owner's
 * address is not in a public repository for anyone to collect. Name and email
 * are optional (the owner's decision, 13 October 2026): the account's own
 * address and user id, from the verified token, go in every email anyway, so
 * the owner can always find the account in the Supabase dashboard. Reply goes
 * to the address given, else to the account's.
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const FEEDBACK_KINDS = ["Suggestion", "Error"] as const;
const FEEDBACK_MAX = 5000;
const NAME_MAX = 100;
/** Loose on purpose: it only has to be worth replying to, and Resend refuses what it cannot send to. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data } = (await supabase?.auth.getClaims()) ?? {};
  const userId = data?.claims?.sub;
  if (typeof userId !== "string") return fail(401, "signed_out");
  const account = typeof data?.claims?.email === "string" ? data.claims.email : undefined;

  let body: { kind?: unknown; name?: unknown; email?: unknown; details?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad_request");
  }
  const kind = FEEDBACK_KINDS.find((k) => k === body?.kind);
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const name = text(body?.name);
  const email = text(body?.email);
  const details = text(body?.details);
  if (!kind || !details || details.length > FEEDBACK_MAX) return fail(400, "bad_request");
  if (name.length > NAME_MAX || (email && (email.length > 254 || !EMAIL.test(email)))) return fail(400, "bad_request");
  const from = [name, email && `<${email}>`].filter(Boolean).join(" ") || "a reader who gave no name";

  const key = process.env.RESEND_API_KEY;
  const to = process.env.FEEDBACK_TO;
  if (!key || !to) {
    console.error("feedback: RESEND_API_KEY or FEEDBACK_TO is not configured");
    return fail(502, "send_failed");
  }

  // ponytail: no per-account rate limit; sign-in keeps bots out. Add one
  // (a row count per hour, like tutor_searches) if an account ever abuses it.
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      // Resend's shared sender works without a verified domain, but only
      // to the address the Resend account was opened with.
      from: process.env.FEEDBACK_FROM || "Captured feedback <onboarding@resend.dev>",
      to,
      reply_to: email || account,
      subject: `Captured feedback: ${kind}`,
      text: `${kind} from ${from}\nAccount: ${account ?? "no email on the account"} (user ${userId})\n\n${details}`,
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);

  if (!response?.ok) {
    console.error(`feedback: Resend refused the email (${response?.status ?? "no response"})`);
    return fail(502, "send_failed");
  }
  return NextResponse.json({ ok: true });
}
