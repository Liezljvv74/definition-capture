import { describe, expect, it } from "vitest";

import {
  buildLinkIndex,
  linkedFrom,
  linkNames,
  linkTargets,
  linkWarning,
  planLinkRewrites,
  renameLinksIn,
} from "@/lib/links";
import type { Entry, Phrase, Rule, VerbTable } from "@/lib/types";

const word = (id: string, name: string, ref = ""): Entry => ({
  id, word: name, definition: "", ref, collections: [], source: "Manual",
  dateAdded: "2026-01-01T00:00:00.000Z", dateUpdated: null, needsDefinition: false,
});
const phrase = (id: string, name: string, ref = ""): Phrase => ({
  id, phrase: name, literalMeaning: "", usageExample: "", collections: [], source: "Manual",
  dateAdded: "2026-01-01T00:00:00.000Z", ref,
});
const table = (id: string, verb: string, ref = ""): VerbTable => ({
  id, verb, tenses: [""], rows: [], createdAt: "2026-01-01T00:00:00.000Z", ref,
});
const rule = (id: string, title: string, text = "", cells: string[][] = [[""]]): Rule => ({
  id, title, topic: "Cases", dateAdded: "2026-01-01T00:00:00.000Z", dateUpdated: null,
  blocks: [
    { id: `${id}-t`, kind: "text", text },
    { id: `${id}-g`, kind: "table", headerRow: false, headerColumn: false, cells },
  ],
});

describe("linkTargets and buildLinkIndex", () => {
  it("resolves a shared name to rule, then verb table, then word, then phrase", () => {
    const lists = [[word("w", "sein")], [phrase("p", "sein")], [table("t", "sein")], [rule("r", "sein")]] as const;
    let index = buildLinkIndex(linkTargets(...lists));
    expect(index.get("sein")).toBe("/rule?id=r");
    index = buildLinkIndex(linkTargets(lists[0], lists[1], lists[2], []));
    expect(index.get("sein")).toBe("/verbs?verb=sein");
    index = buildLinkIndex(linkTargets(lists[0], lists[1], [], []));
    expect(index.get("sein")).toBe("/word?id=w");
    index = buildLinkIndex(linkTargets([], lists[1], [], []));
    expect(index.get("sein")).toBe("/phrase?id=p");
  });

  it("encodes a verb in its link", () => {
    const index = buildLinkIndex(linkTargets([], [], [table("t", "sich freuen")], []));
    expect(index.get("sich freuen")).toBe("/verbs?verb=sich%20freuen");
  });
});

describe("linkNames", () => {
  it("reads closed links only, trimmed", () => {
    expect(linkNames("see [[ Dativ ]] and [[Akkusativ]]")).toEqual(["Dativ", "Akkusativ"]);
    expect(linkNames("[[open and [[a[b]] and [[ ]]")).toEqual([]);
  });
});

describe("renameLinksIn", () => {
  it("rewrites links to the old name, matched as names are, and nothing else", () => {
    expect(renameLinksIn("[[dativ]], [[Dativ-Regel]], [[DATIV]]", "Dativ", "Dativ (Fall)")).toBe(
      "[[Dativ (Fall)]], [[Dativ-Regel]], [[Dativ (Fall)]]",
    );
    expect(renameLinksIn("[[Dativ", "Dativ", "X")).toBe("[[Dativ");
  });
});

describe("planLinkRewrites", () => {
  const lists = {
    entries: [word("w1", "geben", "uses [[Dativ]]"), word("w2", "nehmen", "none")],
    phrases: [phrase("p1", "zum Beispiel", "[[Dativ]]")],
    tables: [table("t1", "helfen", "takes the [[Dativ]]")],
    rules: [rule("r1", "Dativ Fall"), rule("r2", "Präpositionen", "see [[Dativ]]", [["mit", "[[Dativ]]"]])],
  };

  it("rewrites every list's links to the renamed rule", () => {
    const plan = planLinkRewrites(lists, "rule", "r1", "Dativ", "Dativ Fall");
    expect(plan.entries.map((e) => e.ref)).toEqual(["uses [[Dativ Fall]]"]);
    expect(plan.phrases.map((p) => p.ref)).toEqual(["[[Dativ Fall]]"]);
    expect(plan.tables.map((t) => t.ref)).toEqual(["takes the [[Dativ Fall]]"]);
    expect(plan.rules).toHaveLength(1);
    const blocks = plan.rules[0].blocks;
    expect(blocks[0]).toMatchObject({ text: "see [[Dativ Fall]]" });
    expect(blocks[1]).toMatchObject({ cells: [["mit", "[[Dativ Fall]]"]] });
  });

  it("changes nothing for a rename of case or accents alone", () => {
    const plan = planLinkRewrites(lists, "rule", "r1", "Dativ", "dativ");
    expect([plan.entries, plan.phrases, plan.tables, plan.rules].flat()).toEqual([]);
  });

  it("leaves links alone when the old name belonged to a higher-precedence item", () => {
    const shared = { ...lists, tables: [table("t9", "Dativ")] };
    const plan = planLinkRewrites(shared, "word", "w-renamed", "Dativ", "Dative");
    expect([plan.entries, plan.phrases, plan.tables, plan.rules].flat()).toEqual([]);
  });
});

describe("linkedFrom and linkWarning", () => {
  const targets = linkTargets(
    [word("w1", "geben", "[[Dativ]]"), word("w2", "helfen", "[[Dativ]]")],
    [],
    [],
    [rule("r1", "Dativ", "see [[Akkusativ]]"), rule("r2", "Akkusativ", "vs [[Dativ]]")],
  );
  const index = buildLinkIndex(targets);
  const byId = (id: string) => targets.find((t) => t.id === id)!;

  it("lists the items whose text links to a target", () => {
    expect(linkedFrom(targets, index, "/rule?id=r1").map((t) => t.id)).toEqual(["r2", "w1", "w2"]);
  });

  it("counts surviving linkers by kind for the delete warning", () => {
    expect(linkWarning(targets, index, [byId("r1")])).toBe(
      "1 rule and 2 words link to Dativ. Their links will stop working.",
    );
  });

  it("ignores links between the items being deleted", () => {
    expect(linkWarning(targets, index, [byId("r1"), byId("r2")])).toBe(
      "2 words link to these rules. Their links will stop working.",
    );
    expect(linkWarning(targets, index, [byId("w1")])).toBeNull();
  });
});
