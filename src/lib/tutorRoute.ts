/**
 * The steps the tutor's three routes share: the session check, reading the
 * body, the configuration check, spending a message and asking the model.
 * Each returns either what the route goes on with or the response it must
 * send, so a route's own checks stay in the route and in the same order.
 *
 * Who is asking still comes from `serverUserId`, which verifies the token with
 * getClaims, and the key is still read in `tutorServer.ts` alone.
 */

// The same guard as tutorServer.ts: these steps run under the caller's session
// and reach the paid key, so no browser bundle may import them.
import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reserveMessage } from "@/lib/reserveMessage";
import { createSupabaseServerClient, serverUserId } from "@/lib/supabaseServer";
import { readReply, type Plan, type TutorReply } from "@/lib/tutor";
import { askOpenRouter, tutorConfigured } from "@/lib/tutorServer";

/** `remaining` is sent only by failures after the reservation, which spent a message the client should see gone. */
export const fail = (status: number, error: string, remaining?: number) =>
  NextResponse.json(remaining === undefined ? { error } : { error, remaining }, { status });

/** The signed-in caller and the request's JSON, or the 401 or 400 to send; the body's fields are checked by the route. */
export async function openRequest<B>(request: Request): Promise<Response | { userId: string; supabase: SupabaseClient; body: B }> {
  const userId = await serverUserId();
  const supabase = userId ? await createSupabaseServerClient() : null;
  if (!userId || !supabase) return fail(401, "signed_out");
  try {
    return { userId, supabase, body: await request.json() };
  } catch {
    return fail(400, "bad_request");
  }
}

/** The 502 to send when the key or the signing secret is missing, else null; `tag` starts the log line. */
export function unconfigured(tag: string): Response | null {
  if (tutorConfigured()) return null;
  console.error(`${tag}: OPENROUTER_API_KEY or TUTOR_SIGNING_SECRET is not configured`);
  return fail(502, "tutor_failed");
}

/** Spends one message and gives what is left, or the 502 or 403 to send; `log` is the line for a failed reservation. */
export async function reserve(supabase: SupabaseClient, userId: string, plan: Plan, log: string): Promise<Response | number> {
  let left, reason;
  try {
    ({ left, reason } = await reserveMessage(supabase, userId, plan));
  } catch {
    console.error(log);
    return fail(502, "tutor_failed");
  }
  return reason === "ok" ? left : fail(403, reason, left);
}

/** The model's reply to `body`, or the 502 to send, carrying `left` since the message is already spent. */
export async function ask(
  tag: string,
  left: number,
  body: Record<string, unknown>,
  timeoutMs: number,
  rules: string[],
  domains: string[],
): Promise<Response | TutorReply> {
  let reply;
  try {
    reply = readReply(await askOpenRouter(body, timeoutMs), rules, domains);
  } catch (error) {
    console.error(`${tag}: ${error instanceof Error ? error.message : "the OpenRouter call threw"}`);
    return fail(502, "tutor_failed", left);
  }
  if (!reply) {
    console.error(`${tag}: the reply was unreadable`);
    return fail(502, "tutor_failed", left);
  }
  return reply;
}
