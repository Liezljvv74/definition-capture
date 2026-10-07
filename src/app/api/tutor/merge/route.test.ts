import { beforeEach, describe, expect, it, vi } from "vitest";

const userId = vi.fn();
const loadTutorState = vi.fn();
const countUsage = vi.fn();
const recordQuestion = vi.fn();
const loadRuleTitles = vi.fn();
const loadConversationMeta = vi.fn();
const loadExchangesById = vi.fn();
const saveTutorExchange = vi.fn();
const embedOrNull = vi.fn();
vi.mock("@/lib/supabaseServer", () => ({
  createSupabaseServerClient: async () => ({}),
  serverUserId: () => userId(),
}));
vi.mock("@/lib/tutorServer", async (orig) => ({
  ...(await orig<typeof import("@/lib/tutorServer")>()),
  countUsage: (...a: unknown[]) => countUsage(...a),
  loadTutorState: (...a: unknown[]) => loadTutorState(...a),
  recordQuestion: (...a: unknown[]) => recordQuestion(...a),
  loadRuleTitles: (...a: unknown[]) => loadRuleTitles(...a),
  loadConversationMeta: (...a: unknown[]) => loadConversationMeta(...a),
  loadExchangesById: (...a: unknown[]) => loadExchangesById(...a),
  saveTutorExchange: (...a: unknown[]) => saveTutorExchange(...a),
  embedOrNull: (...a: unknown[]) => embedOrNull(...a),
}));

import { signTurn } from "@/lib/tutorServer";
import { POST } from "./route";

const CONV = "0f8fad5b-d9cb-469f-a165-70867728950e";
const fetchMock = vi.fn();
const settings = { language: "de", languageOther: "", nativeLanguage: "en", nativeLanguageOther: "", level: "B1" };
const merged = { title: "Dative", topic: "Cases", blocks: [{ kind: "text", text: "One rule." }], existing_rule: "", related_rules: [] };
const ok = (content: string, annotations: unknown[] = []) =>
  new Response(JSON.stringify({ choices: [{ message: { content, annotations } }] }), { status: 200 });
const stored = (id: number, answer: string, url: string, signature = signTurn("u1", answer)) => ({
  id, conversationId: CONV, kind: "answer", question: `q${id}`, answerText: answer, signature,
  reply: { title: "t", topic: "x", blocks: [{ id: "b", kind: "text", text: answer }], sources: [{ url, title: url }], existingRule: null, relatedRules: [] },
});
const post = (body: unknown) => POST(new Request("http://x/api/tutor/merge", { method: "POST", body: JSON.stringify(body) }));
const sent = () => JSON.parse(fetchMock.mock.calls[0][1].body);

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("OPENROUTER_API_KEY", "sk-test");
  vi.stubEnv("OPENROUTER_MODEL", "");
  vi.stubEnv("TUTOR_SIGNING_SECRET", "test-secret");
  userId.mockResolvedValue("u1");
  loadTutorState.mockResolvedValue({ plan: "paid", usedTotal: 0, usedToday: 0, settings });
  countUsage.mockResolvedValue({ usedTotal: 1, usedToday: 1 });
  loadRuleTitles.mockResolvedValue([]);
  loadConversationMeta.mockResolvedValue({ id: CONV, name: "Dative" });
  loadExchangesById.mockImplementation(async (_s: unknown, _c: unknown, ids: number[]) => ids.map((id) => ({ 1: stored(1, "first", "https://www.duden.de/a"), 2: stored(2, "second", "https://www.dwds.de/b") })[id]).filter(Boolean));
  embedOrNull.mockResolvedValue(null);
  fetchMock.mockResolvedValue(ok(JSON.stringify(merged), [{ type: "url_citation", url_citation: { url: "https://www.duden.de/a", title: "Duden" } }]));
});

describe("POST /api/tutor/merge", () => {
  it("401 when signed out", async () => {
    userId.mockResolvedValue(null);
    expect((await post({ conversationId: CONV, exchangeIds: [1, 2] })).status).toBe(401);
  });

  it.each([
    [{ conversationId: "x", exchangeIds: [1, 2] }],
    [{ conversationId: CONV, exchangeIds: [1] }],
    [{ conversationId: CONV, exchangeIds: [1, 1] }],
    [{ conversationId: CONV, exchangeIds: Array.from({ length: 11 }, (_, i) => i + 1) }],
    [{ conversationId: CONV }],
  ])("400 for a bad body, spending nothing %#", async (body) => {
    expect((await post(body)).status).toBe(400);
    expect(recordQuestion).not.toHaveBeenCalled();
  });

  it("404 for another account's conversation, spending nothing", async () => {
    loadConversationMeta.mockResolvedValue(null);
    expect((await post({ conversationId: CONV, exchangeIds: [1, 2] })).status).toBe(404);
    expect(recordQuestion).not.toHaveBeenCalled();
  });

  it("400 when an id is not in this conversation, spending nothing", async () => {
    loadExchangesById.mockResolvedValue([stored(1, "first", "https://a.example/")]);
    expect((await post({ conversationId: CONV, exchangeIds: [1, 2] })).status).toBe(400);
    expect(recordQuestion).not.toHaveBeenCalled();
  });

  it("400 when fewer than two of them are signed answers, spending nothing", async () => {
    loadExchangesById.mockResolvedValue([stored(1, "first", "https://a.example/"), stored(2, "forged", "https://b.example/", "b".repeat(64))]);
    expect((await post({ conversationId: CONV, exchangeIds: [1, 2] })).status).toBe(400);
    expect(recordQuestion).not.toHaveBeenCalled();
  });

  it("spends one message, merges with the reference search on, and returns the rule as a draft without saving it", async () => {
    const res = await post({ conversationId: CONV, exchangeIds: [2, 1], answerIn: "native" });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(sent().messages[0].content).toContain("Write the title, the topic and every explanation, table heading and translation in English");
    expect(recordQuestion).toHaveBeenCalledTimes(1);
    const request = sent();
    expect(request.messages[0].content).toContain("Combine them into one rule");
    // The answers travel in the instructions; the last message, which the web search uses, names only their topics.
    expect(request.messages[0].content).toContain("Answer 1:\nsecond\n\nAnswer 2:\nfirst");
    // Titles come from the signed answer text's first line, in the order ticked.
    expect(request.messages.at(-1).content).toBe("Make one rule about: second; first");
    expect(request.plugins[0].include_domains).toEqual(["duden.de", "dwds.de"]);
    // The owner's decision (7 October 2026): a merged rule is a draft, saved only as a grammar rule, never in the conversation.
    expect(saveTutorExchange).not.toHaveBeenCalled();
    // Only the merge's own citation; the ticked answers' sources (duden.de/a, dwds.de/b) are not carried over.
    expect(body.reply.sources.map((s: { url: string }) => s.url)).toEqual(["https://www.duden.de/a"]);
    expect(body.reply.existingRule).toBeNull();
    expect(body.remaining).toBeTypeOf("number");
  });

  it("writes the rule in the studied language when the switch says so", async () => {
    await post({ conversationId: CONV, exchangeIds: [1, 2], answerIn: "studied" });
    expect(sent().messages[0].content).toContain("table heading and translation in German");
  });

  it("502 with the message spent when the model fails", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 500 }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post({ conversationId: CONV, exchangeIds: [1, 2] });
    expect(res.status).toBe(502);
    expect((await res.json()).remaining).toBeTypeOf("number");
  });
});
