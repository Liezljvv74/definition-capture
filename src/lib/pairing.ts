/**
 * Signing in a second device from one that is already signed in.
 *
 * The signed-in device shows a code; the other device types it in and gets a
 * session of its own. No email is involved, which is the point: the built-in
 * sender allows only a handful an hour, and none of that applies here.
 *
 * The device that shows the code writes only a hash of it. Nothing in a
 * browser can read `device_pairings` back — there is no select policy — so
 * the code exists in exactly two places: the screen it is shown on, and the
 * head of whoever is typing it. Redeeming goes through the `pair` Edge
 * Function, which holds the service role and is the only thing that can read
 * the table or mint a login.
 *
 * No session token ever moves between the devices. The second device is
 * issued its own, which can be signed out on its own.
 */

import { authRedirectUrl, getSupabase } from "@/lib/supabaseClient";

/**
 * No I, L, O, 0, or 1: this gets read off one screen and typed into another,
 * and those are the characters that get read wrong. Ten of these is about 50
 * bits, which is far past guessing at one attempt per network round trip.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 10;

/** Matches the `expires_at` default on the table. */
export const PAIRING_MINUTES = 5;

export type PairingCode = {
  /** Grouped for reading aloud; the dashes are cosmetic. */
  display: string;
  /** When it stops working, for the countdown. */
  expiresAt: number;
};

/** Strips the cosmetic dashes and anything else a person may have typed. */
export function normalisePairingCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function randomCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  // Rejection-free and close enough to uniform: 256 is not a multiple of 31,
  // so the first few letters are very slightly likelier. At 50 bits the bias
  // costs a fraction of one bit, which does not matter here.
  return [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Mints a code on the signed-in device and stores its hash. The plain code is
 * returned once and never written down anywhere.
 */
export async function createPairingCode(): Promise<{
  code: PairingCode | null;
  error: string | null;
}> {
  const supabase = getSupabase();
  if (!supabase) return { code: null, error: "This build has no Supabase credentials." };

  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return { code: null, error: "You need to be signed in to pair a device." };

  const plain = randomCode();
  const { error } = await supabase
    .from("device_pairings")
    .insert({ code_hash: await sha256Hex(plain), user_id: userId });

  if (error) return { code: null, error: `The code could not be created: ${error.message}` };

  return {
    code: {
      display: `${plain.slice(0, 5)}-${plain.slice(5)}`,
      // Taken from the clock here rather than read back from the row: there is
      // no select policy, so the row cannot be read, which is the point.
      expiresAt: Date.now() + PAIRING_MINUTES * 60_000,
    },
    error: null,
  };
}

/**
 * Redeems a code on the device that has none. On success a session exists and
 * the session store's own listener takes it from there.
 */
export async function redeemPairingCode(code: string): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: "This build has no Supabase credentials." };

  const normalised = normalisePairingCode(code);
  if (normalised.length !== CODE_LENGTH) {
    return { error: `A pairing code is ${CODE_LENGTH} characters.` };
  }

  const { data, error } = await supabase.functions.invoke<{
    token_hash?: string;
    error?: string;
  }>("pair", { body: { code: normalised, redirect_to: authRedirectUrl() } });

  if (error) {
    // A non-2xx arrives as an error with the response still unread on it; the
    // function's own wording is better than "Edge Function returned 404".
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const body = (await context.json()) as { error?: string };
        if (body.error) return { error: body.error };
      } catch {
        // Fall through to the generic message below.
      }
    }
    return { error: "That code could not be checked. Try again." };
  }

  const tokenHash = data?.token_hash;
  if (!tokenHash) return { error: data?.error ?? "That code is not valid any more." };

  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (verifyError) return { error: `Signing in failed: ${verifyError.message}` };

  return { error: null };
}
