import { beforeEach, describe, expect, it, vi } from "vitest";

const userId = vi.fn();
const loadTutorState = vi.fn();
const countUsage = vi.fn();
const recordQuestion = vi.fn();
vi.mock("@/lib/supabaseServer", () => ({
  createSupabaseServerClient: async () => ({}),
  serverUserId: () => userId(),
}));
vi.mock("@/lib/tutorServer", async (orig) => ({
  ...(await orig<typeof import("@/lib/tutorServer")>()),
  countUsage: (...a: unknown[]) => countUsage(...a),
  loadTutorState: (...a: unknown[]) => loadTutorState(...a),
  recordQuestion: (...a: unknown[]) => recordQuestion(...a),
}));

import { POST } from "./route";

const fetchMock = vi.fn();
const settings = { language: "fr", languageOther: "", nativeLanguage: "de", nativeLanguageOther: "", level: "B1" };
const goodReply = { title: "T", topic: "x", blocks: [{ kind: "text", text: "hi" }], sources: [] };
const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

function post(body: unknown, raw = false) {
  return POST(new Request("http://x/api/tutor", { method: "POST", body: raw ? (body as string) : JSON.stringify(body) }));
}
const sent = () => JSON.parse(fetchMock.mock.calls[0][1].body);

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("OPENROUTER_API_KEY", "sk-test");
  vi.stubEnv("OPENROUTER_MODEL", "");
  userId.mockResolvedValue("u1");
  loadTutorState.mockResolvedValue({ plan: "free", usedTotal: 0, usedToday: 0, settings });
  countUsage.mockResolvedValue({ usedTotal: 1, usedToday: 1 });
  fetchMock.mockResolvedValue(ok(JSON.stringify(goodReply)));
});

describe("POST /api/tutor", () => {
  it("401 when signed out, without calling out", async () => {
    userId.mockResolvedValue(null);
    const res = await post({ question: "hi" });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "signed_out" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([["not json", true], [{ question: "  " }, false], [{ question: "a".repeat(1001) }, false], [{}, false]])(
    "400 for a bad body %#",
    async (body, raw) => {
      const res = await post(body, raw);
      expect(res.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("ignores a plan sent in the body", async () => {
    loadTutorState.mockResolvedValue({ plan: "free", usedTotal: 5, usedToday: 0, settings });
    const res = await post({ question: "hi", plan: "paid" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "trialUsed" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(recordQuestion).not.toHaveBeenCalled();
  });

  it("403 dailyLimit for paid at 30 today", async () => {
    loadTutorState.mockResolvedValue({ plan: "paid", usedTotal: 99, usedToday: 30, settings });
    const res = await post({ question: "hi" });
    expect(await res.json()).toEqual({ error: "dailyLimit" });
    expect(res.status).toBe(403);
  });

  it("answers a free account's fifth question and its sixth is refused", async () => {
    loadTutorState.mockResolvedValue({ plan: "free", usedTotal: 4, usedToday: 4, settings });
    countUsage.mockResolvedValue({ usedTotal: 5, usedToday: 5 });
    const res = await post({ question: "hi" });
    expect(res.status).toBe(200);
    expect((await res.json()).remaining).toBe(0);
  });

  it("refuses a lost race after reserving, without calling out", async () => {
    loadTutorState.mockResolvedValue({ plan: "free", usedTotal: 4, usedToday: 4, settings });
    countUsage.mockResolvedValue({ usedTotal: 6, usedToday: 6 });
    const res = await post({ question: "hi" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "trialUsed" });
    expect(recordQuestion).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("502 with no call out when the re-count fails", async () => {
    countUsage.mockRejectedValue(new Error("x"));
    expect((await post({ question: "hi" })).status).toBe(502);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reserves before it calls OpenRouter", async () => {
    const order: string[] = [];
    recordQuestion.mockImplementation(async () => void order.push("record"));
    fetchMock.mockImplementation(async () => (order.push("fetch"), ok(JSON.stringify(goodReply))));
    await post({ question: "hi" });
    expect(order).toEqual(["record", "fetch"]);
  });

  it("502 with no call out when the reservation cannot be inserted", async () => {
    recordQuestion.mockRejectedValue(new Error("x"));
    const res = await post({ question: "hi" });
    expect(res.status).toBe(502);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("502 with no reservation when the state cannot be read", async () => {
    loadTutorState.mockRejectedValue(new Error("x"));
    const res = await post({ question: "hi" });
    expect(res.status).toBe(502);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("403 noLanguage with no studied language", async () => {
    loadTutorState.mockResolvedValue({ plan: "free", usedTotal: 0, usedToday: 0, settings: { ...settings, language: "" } });
    const res = await post({ question: "hi" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "noLanguage" });
    expect(recordQuestion).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("succeeds, records once, and calls OpenRouter with the key and model", async () => {
    vi.stubEnv("OPENROUTER_MODEL", "some/model");
    const res = await post({ question: " Why? ", answerIn: "studied" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.remaining).toBe(4);
    expect(json.reply.title).toBe("T");
    expect(recordQuestion).toHaveBeenCalledTimes(1);
    expect(recordQuestion.mock.calls[0][1]).toBe("u1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer sk-test");
    expect(sent().model).toBe("some/model");
    expect(sent().tools).toBeDefined();
    expect(sent().messages.at(-1).content).toBe("Why?");
  });

  it.each([
    ["a 500", () => fetchMock.mockResolvedValue(new Response("no", { status: 500 }))],
    ["a 402", () => fetchMock.mockResolvedValue(new Response("no", { status: 402 }))],
    ["a thrown fetch", () => fetchMock.mockRejectedValue(new Error("boom"))],
    ["prose", () => fetchMock.mockResolvedValue(ok("Sure! Here you go."))],
  ])("502 and the reservation stands on %s", async (_n, arrange) => {
    arrange();
    const res = await post({ question: "hi" });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "tutor_failed" });
    expect(recordQuestion).toHaveBeenCalledTimes(1);
  });

  it("502 without a key, without calling out", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const res = await post({ question: "hi" });
    expect(res.status).toBe(502);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a typed studied language gets no search tool", async () => {
    loadTutorState.mockResolvedValue({
      plan: "free", usedTotal: 0, usedToday: 0, settings: { ...settings, language: "", languageOther: "Klingon" },
    });
    const res = await post({ question: "hi" });
    expect(res.status).toBe(200);
    expect(sent().tools).toBeUndefined();
    expect(sent().messages[0].content).toContain("Klingon");
  });

  it("answerIn native with none set falls back to the studied language", async () => {
    loadTutorState.mockResolvedValue({
      plan: "free", usedTotal: 0, usedToday: 0, settings: { ...settings, nativeLanguage: "", nativeLanguageOther: "" },
    });
    await post({ question: "hi", answerIn: "native" });
    expect(sent().messages[0].content).toContain("Answer in French");
  });

  it("answerIn native uses the native language when set", async () => {
    await post({ question: "hi", answerIn: "native" });
    expect(sent().messages[0].content).toContain("Answer in German");
  });
});
