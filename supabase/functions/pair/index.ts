/**
 * Redeems a pairing code for a session, so a second device can be signed in
 * from one that already is — no email, and so no email rate limit.
 *
 * This runs with the service role, which is why it is a function and not
 * something the app could do by itself: it is the only thing allowed to read
 * `device_pairings`, and the only thing holding a key that can mint a login.
 *
 * What it deliberately does not do is move a session between devices. Handing
 * the second device the first one's access and refresh tokens would make any
 * copy of that row equivalent to the account. Instead Supabase issues the new
 * device a session of its own, which can be revoked on its own.
 *
 * JWT verification is off, because the whole point is that the caller has no
 * session yet. What stands in its place: a code with about 50 bits of entropy
 * that only exists on the first device's screen, stored here only as a
 * sha-256 hash, redeemable exactly once, and expiring in five minutes.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Where a minted link is allowed to send someone back to. */
const ALLOWED_ORIGINS = [
  "https://liezljvv74.github.io",
  "http://localhost:3001",
  "http://192.168.0.11:3001",
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

const admin = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") {
    return json({ error: "Use POST." }, 405, origin);
  }

  let code = "";
  let redirectTo = "";
  try {
    const body = await request.json();
    code = String(body?.code ?? "");
    redirectTo = String(body?.redirect_to ?? "");
  } catch {
    return json({ error: "Send a JSON body with a code." }, 400, origin);
  }

  // Typed by a person, so accept the shape they see on the other screen.
  const normalised = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalised.length < 8) {
    return json({ error: "That code is not complete." }, 400, origin);
  }

  const now = new Date().toISOString();

  // Housekeeping first, so a code that has already lapsed cannot be claimed
  // even if the filter below were ever loosened.
  await admin(`/rest/v1/device_pairings?expires_at=lt.${now}`, { method: "DELETE" });

  // Claim and read in one statement: the `claimed_at=is.null` filter is what
  // makes a code single-use, because a second request finds nothing to update.
  const claim = await admin(
    `/rest/v1/device_pairings?code_hash=eq.${await sha256Hex(normalised)}` +
      `&claimed_at=is.null&expires_at=gt.${now}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ claimed_at: now }),
    },
  );

  if (!claim.ok) {
    return json({ error: "The pairing could not be checked. Try again." }, 500, origin);
  }

  const rows = (await claim.json()) as Array<{ user_id: string }>;
  const pairing = rows[0];
  if (!pairing) {
    // Unknown, already used, and expired are answered the same way on
    // purpose: a guess should learn nothing from the difference.
    return json(
      { error: "That code is not valid any more. Ask the other device for a new one." },
      404,
      origin,
    );
  }

  const userResponse = await admin(`/auth/v1/admin/users/${pairing.user_id}`);
  const user = (await userResponse.json()) as { email?: string };
  if (!userResponse.ok || !user.email) {
    return json({ error: "That account could not be found." }, 404, origin);
  }

  // Generates the token without sending anything: this is the whole reason
  // pairing sidesteps the email rate limit.
  const linkResponse = await admin("/auth/v1/admin/generate_link", {
    method: "POST",
    body: JSON.stringify({
      type: "magiclink",
      email: user.email,
      options: redirectTo ? { redirect_to: redirectTo } : {},
    }),
  });

  const link = (await linkResponse.json()) as {
    hashed_token?: string;
    action_link?: string;
    properties?: { hashed_token?: string; action_link?: string };
  };
  const tokenHash = link.hashed_token ?? link.properties?.hashed_token;
  const actionLink = link.action_link ?? link.properties?.action_link;

  if (!linkResponse.ok || (!tokenHash && !actionLink)) {
    return json({ error: "A session could not be issued. Try again." }, 500, origin);
  }

  // `token_hash` lets the caller finish in place with `verifyOtp`;
  // `action_link` is the fallback for a client that would rather navigate.
  return json({ token_hash: tokenHash, action_link: actionLink, email: user.email }, 200, origin);
});
