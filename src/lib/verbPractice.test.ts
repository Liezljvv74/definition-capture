import { describe, expect, it } from "vitest";

import type { VerbTable } from "@/lib/types";
import {
  countedTenses, markForm, practiceVerb, sessionPlan, tenseCount, tenseMark, tenseRight,
  type TenseRecord,
} from "@/lib/verbPractice";

const table = (over: Partial<VerbTable> = {}): VerbTable => ({
  id: "v1",
  verb: "gehen",
  tenses: ["Präsens", "Perfekt", "Futur"],
  rows: [
    { person: "ich", conjugations: ["gehe", "bin gegangen", ""], notes: "" },
    { person: "du", conjugations: ["gehst", "", ""], notes: "" },
  ],
  ref: "",
  createdAt: "2026-10-01T00:00:00.000Z",
  ...over,
} as VerbTable);

const rec = (tense: string, streak: number, dueAt: string | null = null, itemId = "v1"): TenseRecord => ({
  itemId, tense, streak, timesSeen: streak === 0 ? 1 : streak, dueAt,
});

const now = new Date("2026-10-03T12:00:00.000Z");

describe("counted tenses", () => {
  it("counts only tenses with at least one form", () => {
    expect(countedTenses(table())).toEqual(["Präsens", "Perfekt"]);
  });

  it("never counts an unnamed tense, and counts a repeated name once", () => {
    const odd = table({
      tenses: ["", "Präsens", "Präsens"],
      rows: [{ person: "ich", conjugations: ["gehe", "gehe", "gehe"], notes: "" }],
    });
    expect(countedTenses(odd)).toEqual(["Präsens"]);
  });
});

describe("marks and states", () => {
  it("marks a tense by its record", () => {
    expect(tenseMark(undefined)).toBe("new");
    expect(tenseMark(rec("Präsens", 0))).toBe("missed");
    expect(tenseMark(rec("Präsens", 1))).toBe("learning");
    expect(tenseMark(rec("Präsens", 2))).toBe("learned");
  });
});

describe("what a verb asks", () => {
  it("asks the chosen counted tenses, with a gap for an empty form", () => {
    expect(practiceVerb(table(), ["Perfekt", "Präsens", "Futur"])).toEqual({
      itemId: "v1",
      verb: "gehen",
      tenses: ["Präsens", "Perfekt"],
      rows: [
        { person: "ich", cells: ["gehe", "bin gegangen"] },
        { person: "du", cells: ["gehst", null] },
      ],
    });
  });

  it("asks a repeated tense from its filled column, never an empty one", () => {
    const odd = table({
      tenses: ["Futur", "Futur"],
      rows: [{ person: "ich", conjugations: ["", "werde gehen"], notes: "" }],
    });
    expect(practiceVerb(odd, ["Futur"])?.rows[0].cells).toEqual(["werde gehen"]);
  });

  it("asks nothing when the verb has none of the tenses", () => {
    expect(practiceVerb(table(), ["Futur", "Imperfekt"])).toBeNull();
  });
});

describe("a session", () => {
  const tables = [table(), table({ id: "v2", verb: "haben", tenses: ["Präsens"], rows: [{ person: "ich", conjugations: ["habe"], notes: "" }] })];
  const due = "2026-10-02T00:00:00.000Z";
  const later = "2026-10-09T00:00:00.000Z";

  it("asks exactly the due tenses in a due session", () => {
    const records = [rec("Präsens", 2, later), rec("Perfekt", 0, due), rec("Präsens", 1, later, "v2")];
    const plan = sessionPlan(tables, records, { mode: "due", tenses: [], verbIds: [] }, now);
    expect(plan.map((v) => [v.verb, v.tenses])).toEqual([["gehen", ["Perfekt"]]]);
  });

  it("asks the tenses not yet tried in a new session", () => {
    const plan = sessionPlan(tables, [rec("Präsens", 1, later)], { mode: "new", tenses: [], verbIds: [] }, now);
    expect(plan.map((v) => [v.verb, v.tenses])).toEqual([["gehen", ["Perfekt"]], ["haben", ["Präsens"]]]);
  });

  it("asks the ticked tenses of every verb, or of the chosen ones", () => {
    const all = sessionPlan(tables, [], { mode: "all", tenses: ["Präsens"], verbIds: [] }, now);
    expect(all.map((v) => v.verb)).toEqual(["gehen", "haben"]);
    const chosen = sessionPlan(tables, [], { mode: "choose", tenses: ["Perfekt", "Präsens"], verbIds: ["v2"] }, now);
    expect(chosen.map((v) => [v.verb, v.tenses])).toEqual([["haben", ["Präsens"]]]);
  });
});

describe("marking", () => {
  it("ignores capitals and punctuation but not accents or one wrong letter", () => {
    expect(markForm(" Gehe. ", "gehe", ",/")).toBe(true);
    expect(markForm("gehts", "gehst", ",/")).toBe(false);
    expect(markForm("bin gegagen", "bin gegangen", ",/")).toBe(false);
    expect(markForm("ete", "été", ",/")).toBe(false);
    expect(markForm("", "gehe", ",/")).toBe(false);
  });

  it("treats a phone's curly apostrophe as the straight one", () => {
    expect(markForm("m’appelle", "m'appelle", ",/")).toBe(true);
    expect(markForm("m'appelle", "m’appelle", ",/")).toBe(true);
  });

  it("accepts any one alternative the separators offer", () => {
    expect(markForm("bist", "bist/seid", ",/")).toBe(true);
    expect(markForm("seid", "bist/seid", ",/")).toBe(true);
    expect(markForm("seid", "bist/seid", "")).toBe(false);
  });

  it("counts a tense right only when every asked box in it is right", () => {
    const verb = practiceVerb(table(), ["Präsens", "Perfekt"])!;
    const answers = { "0:0": "gehe", "1:0": "gehst", "0:1": "bin gegangen" };
    expect(tenseRight(verb, 0, answers, ",/")).toBe(true);
    expect(tenseRight(verb, 1, answers, ",/")).toBe(true);
    expect(tenseRight(verb, 0, { ...answers, "1:0": "gehts" }, ",/")).toBe(false);
  });
});

describe("tenseCount", () => {
  it("adds up the tenses a session asks", () => {
    const plan = [practiceVerb(table(), ["Präsens", "Perfekt"])!, practiceVerb(table(), ["Präsens"])!];
    expect(tenseCount(plan)).toBe(3);
    expect(tenseCount([])).toBe(0);
  });
});

