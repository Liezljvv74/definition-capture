import { readBlocks } from "@/lib/blocks";
import { readString, type Block } from "@/lib/types";

// Pure on purpose: the route and the page both import this, so it touches
// neither the database nor the browser.

export const FREE_TRIAL_MESSAGES = 5;
export const PAID_DAILY_MESSAGES = 30;
export const HISTORY_LIMIT = 10;
export const QUESTION_MAX = 1000;
export const DEFAULT_TUTOR_MODEL = "openai/gpt-5-mini";

/**
 * Where the tutor may search, by language code. Each domain answered a
 * request when checked; learnenglish.britishcouncil.org (403 to every
 * request) and bunka.go.jp (no answer) were dropped, not replaced by a guess.
 */
export const REFERENCE_DOMAINS: Record<string, string[]> = {
  en: ["dictionary.cambridge.org", "merriam-webster.com"],
  de: ["duden.de", "dwds.de"],
  fr: ["academie-francaise.fr", "larousse.fr"],
  es: ["rae.es", "fundeu.es"],
  it: ["accademiadellacrusca.it", "treccani.it"],
  pt: ["ciberduvidas.iscte-iul.pt", "priberam.org"],
  nl: ["taaladvies.net", "onzetaal.nl"],
  ru: ["gramota.ru"],
  ko: ["korean.go.kr"],
  zh: ["resources.allsetlearning.com"],
};

export type Plan = "free" | "paid";

export function allowance(input: { plan: Plan; usedTotal: number; usedToday: number }): {
  remaining: number;
  reason: "ok" | "trialUsed" | "dailyLimit";
} {
  const free = input.plan === "free";
  const remaining = Math.max(0, free ? FREE_TRIAL_MESSAGES - input.usedTotal : PAID_DAILY_MESSAGES - input.usedToday);
  if (remaining > 0) return { remaining, reason: "ok" };
  return { remaining: 0, reason: free ? "trialUsed" : "dailyLimit" };
}

export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export type TutorTurn = { role: "user" | "assistant"; content: string };

/**
 * The client's history is untrusted: a forged "system" turn would be an
 * instruction the model obeys. Only user and assistant turns with text
 * survive, each trimmed, the last few kept.
 */
export function readHistory(value: unknown): TutorTurn[] {
  if (!Array.isArray(value)) return [];
  const turns: TutorTurn[] = [];
  for (const raw of value) {
    const turn = raw as { role?: unknown; content?: unknown } | null;
    if ((turn?.role === "user" || turn?.role === "assistant") && typeof turn.content === "string") {
      turns.push({ role: turn.role, content: turn.content.slice(0, QUESTION_MAX * 4) });
    }
  }
  return turns.slice(-HISTORY_LIMIT);
}

export function tutorInstructions(input: { studied: string; answerIn: string; level: string; grounded: boolean }): string {
  const { studied, answerIn } = input;
  return [
    `You are a grammar tutor for ${studied}. Answer in ${answerIn}, pitched at the learner's level (${input.level || "B1"} on the CEFR scale).`,
    "Explain clearly. Give practical example sentences" +
      (studied === answerIn ? "." : `, each with a translation into ${answerIn}.`) +
      " Use tables where they help, such as for paradigms.",
    input.grounded
      ? "Base the explanation on the search results from the reference sites you are given."
      : "No reference search is available for this language, so say plainly where you are unsure.",
    `Answer only grammar and language-learning questions about ${studied}. Decline anything else in one polite sentence, still as a valid reply.`,
    "Reply as JSON with a short title, a topic, and blocks. A text block may use **bold** for emphasis; in a table cell or example sentence, wrap the part being taught in {curly braces}.",
  ].join("\n\n");
}

const str = { type: "string" };
export const REPLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "topic", "blocks"],
  properties: {
    title: str,
    topic: str,
    blocks: {
      type: "array",
      items: {
        anyOf: [
          {
            type: "object", additionalProperties: false, required: ["kind", "text"],
            properties: { kind: { type: "string", const: "text" }, text: str },
          },
          {
            type: "object", additionalProperties: false, required: ["kind", "headerRow", "headerColumn", "cells"],
            properties: {
              kind: { type: "string", const: "table" },
              headerRow: { type: "boolean" },
              headerColumn: { type: "boolean" },
              cells: { type: "array", items: { type: "array", items: str } },
            },
          },
          {
            type: "object", additionalProperties: false, required: ["kind", "sentence", "translation"],
            properties: { kind: { type: "string", const: "example" }, sentence: str, translation: str },
          },
        ],
      },
    },
  },
};

export function buildRequest(input: {
  model: string;
  instructions: string;
  history: TutorTurn[];
  question: string;
  domains: string[];
}): Record<string, unknown> {
  return {
    model: input.model,
    messages: [
      { role: "system", content: input.instructions },
      ...input.history,
      { role: "user", content: input.question },
    ],
    response_format: { type: "json_schema", json_schema: { name: "grammar_answer", strict: true, schema: REPLY_SCHEMA } },
    max_tokens: 2000,
    ...(input.domains.length > 0 && {
      tools: [{ type: "openrouter:web_search", parameters: { engine: "exa", allowed_domains: input.domains, max_results: 5 } }],
    }),
  };
}

export type TutorReply = { title: string; topic: string; blocks: Block[]; sources: { url: string; title: string }[] };

/** The model's reply is untrusted: it must parse, have the shape, and keep at least one block. */
export function readReply(json: unknown): TutorReply | null {
  const message = (json as { choices?: { message?: { content?: unknown; annotations?: unknown } }[] } | null)?.choices?.[0]?.message;
  if (typeof message?.content !== "string") return null;
  let parsed: { title?: unknown; topic?: unknown; blocks?: unknown };
  try {
    parsed = JSON.parse(message.content);
  } catch {
    return null;
  }
  if (typeof parsed?.title !== "string" || typeof parsed.topic !== "string") return null;
  const blocks = readBlocks(parsed.blocks);
  if (blocks.length === 0) return null;

  const sources = new Map<string, string>();
  for (const note of Array.isArray(message.annotations) ? message.annotations : []) {
    if (note?.type !== "url_citation") continue;
    const cite = note.url_citation ?? note;
    const url = readString(cite.url);
    try {
      if (!/^https?:$/.test(new URL(url).protocol)) continue;
    } catch {
      continue;
    }
    if (!sources.has(url)) sources.set(url, readString(cite.title));
  }
  return {
    title: parsed.title.slice(0, 120),
    topic: parsed.topic.slice(0, 120),
    blocks,
    sources: [...sources].map(([url, title]) => ({ url, title })),
  };
}
