import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const claims = vi.fn();
vi.mock("@/lib/supabaseServer", () => ({
  createSupabaseServerClient: async () => ({ auth: { getClaims: async () => ({ data: claims() }) } }),
}));

import { POST } from "./route";

const post = (body: Record<string, unknown>) =>
  POST(
    new Request("http://x/api/feedback", {
      method: "POST",
      body: JSON.stringify({ name: "Ann Reader", email: "reader@example.com", ...body }),
    }),
  );

describe("POST /api/feedback", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    claims.mockReturnValue({ claims: { sub: "u1", email: "account@example.com" } });
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("FEEDBACK_TO", "owner@example.com");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    fetchMock.mockReset();
  });

  it("emails the owner, with the reader's address to reply to", async () => {
    const res = await post({ kind: "Error", details: " The list did not load. " });
    expect(res.status).toBe(200);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent).toMatchObject({ to: "owner@example.com", reply_to: "reader@example.com", subject: "Captured feedback: Error" });
    expect(sent.text).toContain("The list did not load.");
    expect(sent.text).toContain("Ann Reader <reader@example.com>");
    expect(sent.text).toContain("account@example.com");
  });

  it("refuses a signed-out caller without sending", async () => {
    claims.mockReturnValue(null);
    expect((await post({ kind: "Error", details: "x" })).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: "Spam", details: "x" }],
    [{ kind: "Suggestion", details: "   " }],
    [{ kind: "Suggestion", details: "x".repeat(5001) }],
    [{ kind: "Suggestion", details: "x", name: " " }],
    [{ kind: "Suggestion", details: "x", email: "not an address" }],
  ])("refuses a bad body %#", async (body) => {
    expect((await post(body)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a refused or unconfigured send as a failure", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 403 }));
    expect((await post({ kind: "Suggestion", details: "x" })).status).toBe(502);
    vi.stubEnv("RESEND_API_KEY", "");
    expect((await post({ kind: "Suggestion", details: "x" })).status).toBe(502);
  });
});
