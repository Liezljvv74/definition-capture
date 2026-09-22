import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/auth/reset/route";

/**
 * Where a reset link ends up, and what it says when it cannot.
 *
 * The whole value of this route over the ordinary callback is its
 * destination: it must leave the reader at the form for choosing a password
 * rather than on the home page, because getting there is what they clicked the
 * link for. That is one line, which is exactly the kind of line a later edit
 * flattens into "redirect to /" without anyone noticing, since both routes
 * otherwise do the same thing.
 *
 * Supabase is mocked, so this proves the app's decisions rather than that a
 * code was really exchanged, the same limit `proxy.test.ts` sets out.
 */
let exchangeFails = false;
let configured = true;

vi.mock("@/lib/supabaseServer", () => ({
  createSupabaseServerClient: async () =>
    configured
      ? {
          auth: {
            exchangeCodeForSession: async () => ({
              error: exchangeFails ? { message: "no" } : null,
            }),
          },
        }
      : null,
}));

const visit = (query: string) =>
  GET(new NextRequest(`http://localhost:3000/auth/reset${query}`));

const locationOf = async (query: string) => {
  const response = await visit(query);
  return response.headers.get("location") ?? "";
};

beforeEach(() => {
  exchangeFails = false;
  configured = true;
});

describe("the reset link's landing route", () => {
  it("sends a good link to the form for choosing a password", async () => {
    expect(await locationOf("?code=abc123")).toBe("http://localhost:3000/choose-password");
  });

  it("sends a refused link back to sign-in, carrying the code and not the prose", async () => {
    const location = await locationOf(
      "?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid",
    );
    expect(location).toContain("/sign-in/?error_code=otp_expired");
    // The sentence Supabase wrote is deliberately dropped: this app says its
    // own, so that nothing a caller puts in the URL is rendered as ours.
    expect(location).not.toContain("Email+link");
  });

  it("has an answer for a link with no code at all", async () => {
    expect(await locationOf("")).toContain("error_code=incomplete");
  });

  it("says so when the exchange itself fails", async () => {
    exchangeFails = true;
    expect(await locationOf("?code=abc123")).toContain("error_code=exchange_failed");
  });

  it("says so when the build has no credentials", async () => {
    configured = false;
    expect(await locationOf("?code=abc123")).toContain("error_code=unconfigured");
  });
});
