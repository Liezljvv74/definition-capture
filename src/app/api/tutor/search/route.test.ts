import { beforeEach, describe, expect, it, vi } from "vitest";

const userId = vi.fn();
const searchExchanges = vi.fn();
const embedOrNull = vi.fn();
const reserveSearch = vi.fn();
vi.mock("@/lib/supabaseServer", () => ({
  createSupabaseServerClient: async () => ({}),
  serverUserId: () => userId(),
}));
vi.mock("@/lib/tutorServer", () => ({
  searchExchanges: (...a: unknown[]) => searchExchanges(...a),
  embedOrNull: (...a: unknown[]) => embedOrNull(...a),
  reserveSearch: (...a: unknown[]) => reserveSearch(...a),
}));

import { POST } from "./route";

const post = (body: unknown) => POST(new Request("http://x/api/tutor/search", { method: "POST", body: JSON.stringify(body) }));
const row = (id: number, conversationId: string) => ({
  id, conversationId, conversationName: `C${conversationId}`, kind: "answer", question: "q", answerText: "mit dem Dativ", signature: "",
  reply: { title: "t", topic: "", blocks: [], sources: [], existingRule: null, relatedRules: [] },
});

beforeEach(() => {
  vi.resetAllMocks();
  userId.mockResolvedValue("u1");
  reserveSearch.mockResolvedValue(true);
  embedOrNull.mockResolvedValue([0.1]);
  searchExchanges.mockResolvedValue([row(1, "a"), row(2, "b"), row(3, "a")]);
});

describe("POST /api/tutor/search", () => {
  it("401 when signed out", async () => {
    userId.mockResolvedValue(null);
    expect((await post({ query: "dativ" })).status).toBe(401);
  });

  it.each([[{ query: "a" }], [{ query: "x".repeat(201) }], [{}], [{ query: 3 }]])("400 for a bad query %#", async (body) => {
    expect((await post(body)).status).toBe(400);
    expect(searchExchanges).not.toHaveBeenCalled();
  });

  it("searches by keyword and meaning, one result per conversation", async () => {
    const body = await (await post({ query: "  dativ  " })).json();
    expect(searchExchanges).toHaveBeenCalledWith(expect.anything(), "dativ", [0.1], 30);
    expect(body.results.map((r: { conversationId: string }) => r.conversationId)).toEqual(["a", "b"]);
    expect(body.results[0]).toMatchObject({ name: "Ca", exchangeId: 1 });
  });

  it("429 over the hourly limit, without embedding or searching", async () => {
    reserveSearch.mockResolvedValue(false);
    const res = await post({ query: "dativ" });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "search_limit" });
    expect(embedOrNull).not.toHaveBeenCalled();
    expect(searchExchanges).not.toHaveBeenCalled();
  });

  it("falls back to keyword only when embedding fails", async () => {
    embedOrNull.mockResolvedValue(null);
    const res = await post({ query: "dativ" });
    expect(res.status).toBe(200);
    expect(searchExchanges).toHaveBeenCalledWith(expect.anything(), "dativ", null, 30);
  });

  it("502 when the search itself fails", async () => {
    searchExchanges.mockRejectedValue(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post({ query: "dativ" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "search_failed" });
  });
});
