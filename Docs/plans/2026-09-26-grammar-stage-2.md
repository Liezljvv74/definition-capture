# Grammar, stage 2: links. Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `[[Name]]` reaches rules and verb tables as well as words and phrases; verb tables get a notes field; renaming an item rewrites the links to it; deleting a linked rule warns first; every item page lists what links to it.

**Architecture:** One module, `src/lib/links.ts`, turns the four lists into a single ordered list of link targets (rule, verb table, word, phrase, highest precedence first). The link index, the suggestion box, "Linked from", the delete warning and rename rewriting all read that one list, so they cannot disagree about where a name points. No new link syntax and no migration: a verb table's notes are the `items.ref` column `save_items` already writes, and renames are rewritten in the browser through the existing stores.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript 5, Tailwind 4, Supabase through the existing stores, Vitest 3 in the node environment.

**Spec:** `Docs/grammar.md`, section "Links", as amended by the owner on 26 September (recorded in `HANDOFF.md`, and written into `grammar.md` by Task 6):

- A link to one verb table opens the Verbs page scrolled to that table and highlighted. No new page.
- Shared names use a fixed order, **rule, verb table, word, phrase**. The design's "link records which item was meant" is deferred until clashes actually happen.

## Global Constraints

- No em dashes (U+2014) and no en dashes (U+2013) anywhere: code, comments, copy, commit messages.
- Comments explain *why*, in full sentences, matching the density of the surrounding code.
- Interface copy is written for someone using the app, never describing or selling a feature.
- The word "category" is retired. A rule's grouping is a Topic; words and phrases have Collections.
- No migration in this stage. If one turns out to be needed, stop and ask: migrations are pushed to live before code, and only with the owner's fresh permission.
- Every page lives under `src/app/(workspace)/`. Read `node_modules/next/dist/docs/` before writing routing code; this Next.js differs from training data.
- `src/lib/remoteStore.ts` stays the only thing that talks to Supabase for list data. Writes go through each store's own functions.
- Enter-moves-down is app-wide (`src/lib/enterMovesDown.ts`); do not add per-field Enter handlers that duplicate it.
- Nothing is seeded; the feature ships empty.
- Check with `npx tsc --noEmit`, `npx eslint src/`, `npx vitest run`, and `npm run build` for Task 3 (routes touched). Commit after each task, push to `origin` only, never to the Turing College remotes. Commit messages end with the attribution line from the session's system reminder.
- After every commit, bring `HANDOFF.md` up to date (owner's standing instruction). It is not committed.

## Review Focus

1. **A rename that changes only case or accents** ("dativ" to "Dativ"). Expected: links are left as written, because they already resolve (names are matched with `foldName`). Test: Task 2 (`planLinkRewrites`).
2. **A renamed item whose old name is also a higher-precedence item's name** (a word "sein" renamed while a verb table "sein" exists). Expected: `[[sein]]` links are left alone, because they pointed at the verb table all along. Test: Task 2.
3. **A backup from before this stage**, whose verb tables have no `ref`. Expected: reads with empty notes; Replace and merge behave as before. Test: Task 1.
4. **Markup that is not a link**: `[[Name` never closed, `[[a[b]]`, `[[ ]]`. Expected: not rewritten, not counted, not listed. Test: Task 2.
5. **Deleting several rules that link to each other.** Expected: the warning counts only links from items that survive the delete. Test: Task 2 (`linkWarning`).

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/lib/types.ts` (modify) | `VerbTable.ref` |
| `src/lib/verbTables.ts` (modify) + `types.test.ts` or a new `verbTableRow.test.ts` | ref in row, payload, wire, parse, import merge; `saveVerbTable` takes the ref; `updateVerbTables` |
| `src/lib/links.ts` (new) + `links.test.ts` | link targets in precedence order, the index, link names in text, rename rewriting plan, linked-from, delete warning |
| `src/components/RefText.tsx` (modify) | loses `buildLinkIndex` and the `LinkIndex` type to `links.ts` |
| `src/lib/useLinkTargets.ts` (new) | the hook every page uses for targets and index |
| `src/lib/refSuggestions.ts`, `src/components/RefField.tsx` (modify) | suggestions over all four kinds |
| word, phrase, rule, vocabulary, phrases pages (modify) | use `useLinkTargets` |
| `src/components/VerbTableCard.tsx`, `src/app/(workspace)/verbs/page.tsx` (modify) | notes field; scroll to and highlight a linked table |
| `src/lib/linkRenames.ts` (new); `storage.ts`, `phraseStorage.ts`, `rules.ts` (modify) | apply the rewrite plan after a rename |
| `src/components/LinkedFrom.tsx` (new) | the "Linked from" list |
| `src/components/DeleteControls.tsx`, `src/app/(workspace)/grammar/page.tsx` (modify) | the delete warning |
| `Docs/grammar.md`, `Docs/schema.md` (modify) | record what was built and the amended decisions |

---

### Task 1: Verb tables carry notes (data only)

**Files:**
- Modify: `src/lib/types.ts` (the `VerbTable` type)
- Modify: `src/lib/verbTables.ts`
- Modify: `src/components/VerbTableCard.tsx` (only the `saveVerbTable` call, passing `table.ref` through unchanged; the field itself is Task 3)
- Test: `src/lib/verbTableRow.test.ts` (new)

**Interfaces:**
- Produces: `VerbTable.ref: string`; `saveVerbTable(id: string, tenses: string[], rows: VerbRow[], ref: string): void`; `export const updateVerbTables = store.updateMany;` from `verbTables.ts`; `WireVerbTable.ref: string`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/verbTableRow.test.ts
import { describe, expect, it } from "vitest";

import { parseVerbTable, toWireVerbTable } from "@/lib/verbTables";

describe("verb table notes", () => {
  it("reads a table from before notes existed as having none", () => {
    const table = parseVerbTable({ id: "t1", verb: "gehen", tenses: ["Present"], rows: [] });
    expect(table?.ref).toBe("");
  });

  it("carries notes through a backup round trip", () => {
    const table = parseVerbTable({ id: "t1", verb: "sein", tenses: [""], rows: [], ref: "see [[Dativ]]" });
    expect(table?.ref).toBe("see [[Dativ]]");
    expect(parseVerbTable(toWireVerbTable(table!))?.ref).toBe("see [[Dativ]]");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/lib/verbTableRow.test.ts`
Expected: FAIL, `ref` is undefined.

- [ ] **Step 3: Implement**

In `types.ts`, add to `VerbTable`, after `rows`:

```ts
  /** Free text that renders links, the same field words and phrases call Ref. */
  ref: string;
```

In `verbTables.ts`:
- `fromRow`: add `ref: readString(row.ref),`
- `toPayload`: add `ref: table.ref,`
- `createVerbTable`: add `ref: "",` to the new table.
- `saveVerbTable(id, tenses, rows, ref)`: `store.update({ ...existing, tenses, rows, ref: ref.trim() });` and extend its comment: the notes are saved with the rest of the card, by the same Save.
- `WireVerbTable`: add `ref: string;`; `toWireVerbTable`: `ref: table.ref,`
- `parseVerbTable`: `ref: readString(value.ref).trim(),` (absent in older files, which reads as empty).
- `importVerbTables` merge: add `ref: candidate.ref,`.
- Export `export const updateVerbTables = store.updateMany;` beside the other store exports, with a one-line comment that Task 4's rename rewrite uses it.

In `VerbTableCard.tsx`, change the save call to `saveVerbTable(table.id, tenses, rows, table.ref);`.

Fix every other place `tsc` reports a `VerbTable` literal missing `ref` (tests build tables by hand); add `ref: ""`.

- [ ] **Step 4: Run the checks**

Run: `npx tsc --noEmit && npx vitest run`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "Give verb tables a notes field in the store and backups"
```

---

### Task 2: The link model

**Files:**
- Create: `src/lib/links.ts`
- Test: `src/lib/links.test.ts`

**Interfaces:**
- Consumes: `VerbTable.ref` (Task 1); `Entry`, `Phrase`, `Rule`, `Block` from `types.ts`; `foldName`.
- Produces (exact names later tasks use):
  - `type LinkKind = "rule" | "verb_table" | "word" | "phrase"`
  - `LINK_ORDER: readonly LinkKind[]`, `KIND_LABEL: Record<LinkKind, string>`
  - `type LinkTarget = { kind: LinkKind; id: string; name: string; href: string; texts: string[] }`
  - `type LinkIndex = Map<string, string>` (folded name to href, the shape `RefText` and `RichText` already read)
  - `linkTargets(entries, phrases, tables, rules): LinkTarget[]`
  - `buildLinkIndex(targets): LinkIndex`
  - `linkNames(text): string[]`
  - `renameLinksIn(text, from, to): string`
  - `planLinkRewrites(lists, kind, id, from, to): { entries: Entry[]; phrases: Phrase[]; tables: VerbTable[]; rules: Rule[] }`
  - `linkedFrom(targets, index, href): LinkTarget[]`
  - `linkWarning(targets, index, doomed: LinkTarget[]): string | null`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/links.test.ts
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
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/lib/links.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/links.ts
/**
 * Where a `[[Name]]` points, decided once for the whole app.
 *
 * The four lists share one namespace, so a name can belong to more than one
 * of them ("sein" the verb table and "sein" the word). A fixed order settles
 * it: rule, then verb table, then word, then phrase. The design proposed
 * letting a link remember which item was meant; the owner chose the fixed
 * order until clashes actually happen, so a link is still plain `[[Name]]`.
 *
 * Everything that asks where a link goes (the rendered link, the suggestion
 * box, Linked from, the delete warning, rename rewriting) reads the one list
 * `linkTargets` builds, so they cannot disagree.
 */

import { foldName } from "@/lib/foldName";
import type { Block, Entry, Phrase, Rule, VerbTable } from "@/lib/types";

export type LinkKind = "rule" | "verb_table" | "word" | "phrase";

/** Highest precedence first. */
export const LINK_ORDER: readonly LinkKind[] = ["rule", "verb_table", "word", "phrase"];

export const KIND_LABEL: Record<LinkKind, string> = {
  rule: "Rule",
  verb_table: "Verb table",
  word: "Word",
  phrase: "Phrase",
};

const PLURAL: Record<LinkKind, [string, string]> = {
  rule: ["rule", "rules"],
  verb_table: ["verb table", "verb tables"],
  word: ["word", "words"],
  phrase: ["phrase", "phrases"],
};

export type LinkTarget = {
  kind: LinkKind;
  id: string;
  name: string;
  href: string;
  /** Every piece of text on the item that can hold a link. */
  texts: string[];
};

/** Folded name to href: the shape `RefText` and `RichText` read. */
export type LinkIndex = Map<string, string>;

/**
 * The same shape as `NAME_LINK` in `parseRef.ts` and `LINK` in
 * `blockText.ts`: never across a line, never holding a bracket. Kept in step
 * with those by the tests on all three.
 */
const LINK = /\[\[([^[\]\n]+)\]\]/g;

/** A rule's linkable text: text blocks and table cells. Examples render no links. */
function blockTexts(blocks: Block[]): string[] {
  return blocks.flatMap((block) =>
    block.kind === "text" ? [block.text] : block.kind === "table" ? block.cells.flat() : [],
  );
}

/** All four lists as targets, in precedence order. */
export function linkTargets(
  entries: readonly Entry[],
  phrases: readonly Phrase[],
  tables: readonly VerbTable[],
  rules: readonly Rule[],
): LinkTarget[] {
  return [
    ...rules.map((r) => ({ kind: "rule" as const, id: r.id, name: r.title, href: `/rule?id=${r.id}`, texts: blockTexts(r.blocks) })),
    ...tables.map((t) => ({ kind: "verb_table" as const, id: t.id, name: t.verb, href: `/verbs?verb=${encodeURIComponent(t.verb)}`, texts: [t.ref] })),
    ...entries.map((e) => ({ kind: "word" as const, id: e.id, name: e.word, href: `/word?id=${e.id}`, texts: [e.ref] })),
    ...phrases.map((p) => ({ kind: "phrase" as const, id: p.id, name: p.phrase, href: `/phrase?id=${p.id}`, texts: [p.ref] })),
  ];
}

/** Lowest precedence set first, because a later `set` wins a clash. */
export function buildLinkIndex(targets: readonly LinkTarget[]): LinkIndex {
  const index: LinkIndex = new Map();
  for (const target of [...targets].reverse()) index.set(foldName(target.name), target.href);
  return index;
}

export function linkNames(text: string): string[] {
  return [...text.matchAll(LINK)].map((match) => match[1].trim()).filter(Boolean);
}

export function renameLinksIn(text: string, from: string, to: string): string {
  const old = foldName(from);
  return text.replace(LINK, (whole, name: string) => (foldName(name.trim()) === old ? `[[${to}]]` : whole));
}

function renameInBlocks(blocks: Block[], from: string, to: string): Block[] {
  return blocks.map((block) =>
    block.kind === "text"
      ? { ...block, text: renameLinksIn(block.text, from, to) }
      : block.kind === "table"
        ? { ...block, cells: block.cells.map((row) => row.map((cell) => renameLinksIn(cell, from, to))) }
        : block,
  );
}

/**
 * The items whose links must change after the item `id` of `kind` was renamed
 * from `from` to `to`: only those that changed, ready for each store's
 * `updateMany`. Nothing when the names fold the same, since every link
 * already resolves, and nothing when a higher-precedence item of another kind
 * owns `from`, since those links pointed there all along.
 */
export function planLinkRewrites(
  lists: { entries: readonly Entry[]; phrases: readonly Phrase[]; tables: readonly VerbTable[]; rules: readonly Rule[] },
  kind: LinkKind,
  id: string,
  from: string,
  to: string,
) {
  const none = { entries: [] as Entry[], phrases: [] as Phrase[], tables: [] as VerbTable[], rules: [] as Rule[] };
  if (foldName(from) === foldName(to)) return none;
  const rank = LINK_ORDER.indexOf(kind);
  const outranked = linkTargets(lists.entries, lists.phrases, lists.tables, lists.rules).some(
    (t) => t.id !== id && foldName(t.name) === foldName(from) && LINK_ORDER.indexOf(t.kind) < rank,
  );
  if (outranked) return none;

  const changedRef = <T extends { ref: string }>(items: readonly T[]) =>
    items.flatMap((item) => {
      const ref = renameLinksIn(item.ref, from, to);
      return ref === item.ref ? [] : [{ ...item, ref }];
    });
  return {
    entries: changedRef(lists.entries),
    phrases: changedRef(lists.phrases),
    tables: changedRef(lists.tables),
    rules: lists.rules.flatMap((r) => {
      const blocks = renameInBlocks(r.blocks, from, to);
      return JSON.stringify(blocks) === JSON.stringify(r.blocks) ? [] : [{ ...r, blocks }];
    }),
  };
}

/** The items whose text holds a link that resolves to `href`, in precedence order. */
export function linkedFrom(targets: readonly LinkTarget[], index: LinkIndex, href: string): LinkTarget[] {
  return targets.filter(
    (t) => t.href !== href && t.texts.some((text) => linkNames(text).some((name) => index.get(foldName(name)) === href)),
  );
}

/**
 * "3 rules and 2 words link to Dativ. Their links will stop working.", or
 * null when nothing that survives the delete links to what is going.
 */
export function linkWarning(targets: readonly LinkTarget[], index: LinkIndex, doomed: readonly LinkTarget[]): string | null {
  const going = new Set(doomed.map((t) => t.id));
  const linkers = new Map<string, LinkTarget>();
  for (const target of doomed) {
    for (const linker of linkedFrom(targets, index, target.href)) {
      if (!going.has(linker.id)) linkers.set(linker.id, linker);
    }
  }
  if (linkers.size === 0) return null;

  const counts = LINK_ORDER.map((kind) => [kind, [...linkers.values()].filter((t) => t.kind === kind).length] as const)
    .filter(([, n]) => n > 0)
    .map(([kind, n]) => `${n} ${PLURAL[kind][n === 1 ? 0 : 1]}`);
  const list = counts.length === 1 ? counts[0] : `${counts.slice(0, -1).join(", ")} and ${counts[counts.length - 1]}`;
  const verb = linkers.size === 1 ? "links" : "link";
  const what = doomed.length === 1 ? doomed[0].name : `these ${PLURAL[doomed[0].kind][1]}`;
  return `${list} ${verb} to ${what}. Their links will stop working.`;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/links.test.ts`
Expected: PASS. Then break `LINK_ORDER` (swap rule and word) and confirm the first test fails; restore it.

- [ ] **Step 5: Commit**

```bash
git add src/lib/links.ts src/lib/links.test.ts
git commit -m "Add the link model: one ordered list of link targets"
```

---

### Task 3: Every page links to all four kinds; verb notes on screen

**Files:**
- Create: `src/lib/useLinkTargets.ts`
- Modify: `src/components/RefText.tsx` (delete `buildLinkIndex` and the `LinkIndex` type; import the type from `@/lib/links`)
- Modify: `src/components/grammar/RichText.tsx`, `BlockView.tsx` (import `LinkIndex` from `@/lib/links`)
- Modify: `src/app/(workspace)/{word,phrase,rule,vocabulary,phrases}/page.tsx`
- Modify: `src/lib/refSuggestions.ts`, `src/components/RefField.tsx`
- Modify: `src/components/VerbTableCard.tsx`, `src/app/(workspace)/verbs/page.tsx`
- Test: `src/lib/refSuggestions.test.ts` (new)

**Interfaces:**
- Consumes: everything Task 2 produces; `saveVerbTable(..., ref)` from Task 1.
- Produces: `useLinkTargets(): { targets: LinkTarget[]; linkIndex: LinkIndex }`; `suggestRefs(targets, query, exclude?, limit?)`; `RefSuggestion = { name: string; kind: LinkKind }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/refSuggestions.test.ts
import { describe, expect, it } from "vitest";

import { linkTargets } from "@/lib/links";
import { suggestRefs } from "@/lib/refSuggestions";
import type { Rule, VerbTable } from "@/lib/types";

const rule: Rule = { id: "r", title: "Dativ", topic: "Cases", blocks: [], dateAdded: "", dateUpdated: null };
const table: VerbTable = { id: "t", verb: "danken", tenses: [""], rows: [], createdAt: "", ref: "" };

describe("suggestRefs", () => {
  it("offers rules and verb tables, labelled by kind", () => {
    const targets = linkTargets([], [], [table], [rule]);
    expect(suggestRefs(targets, "da")).toEqual([
      { name: "danken", kind: "verb_table" },
      { name: "Dativ", kind: "rule" },
    ]);
  });

  it("offers a shared name once, as the kind the link will reach", () => {
    const targets = linkTargets([], [], [{ ...table, verb: "Dativ" }], [rule]);
    expect(suggestRefs(targets, "dat")).toEqual([{ name: "Dativ", kind: "rule" }]);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/lib/refSuggestions.test.ts`
Expected: FAIL, `suggestRefs` has the old signature.

- [ ] **Step 3: Implement**

`src/lib/useLinkTargets.ts`:

```ts
"use client";

import { useMemo } from "react";

import { buildLinkIndex, linkTargets } from "@/lib/links";
import { usePhrases } from "@/lib/usePhrases";
import { useRules } from "@/lib/useRules";
import { useVerbTables } from "@/lib/useVerbTables";
import { useWords } from "@/lib/useWords";

/**
 * All four lists as link targets, and the index a `[[Name]]` is looked up in.
 * Any page that renders links reads all four, since a link may point at any
 * of them; each list is small and fetched once per session.
 */
export function useLinkTargets() {
  const { entries } = useWords();
  const { phrases } = usePhrases();
  const { tables } = useVerbTables();
  const { rules } = useRules();
  return useMemo(() => {
    const targets = linkTargets(entries, phrases, tables, rules);
    return { targets, linkIndex: buildLinkIndex(targets) };
  }, [entries, phrases, tables, rules]);
}
```

Pages: in each of word, phrase, rule, vocabulary and phrases, replace
`const linkIndex = useMemo(() => buildLinkIndex(entries, phrases), [entries, phrases]);`
with `const { linkIndex } = useLinkTargets();`, fix imports (`LinkIndex` from `@/lib/links`), and drop `useWords`/`usePhrases`/`useMemo` where nothing else uses them. In the rule page delete the comment that says rules and verb tables become targets in stage 2.

`refSuggestions.ts`: `RefSuggestion` becomes `{ name: string; kind: LinkKind }`. `suggestRefs(targets: readonly LinkTarget[], query, exclude = [], limit = SUGGESTION_LIMIT)`; build `byName` by iterating `[...targets].reverse()` so the highest-precedence kind wins, exactly as `buildLinkIndex` does, and update the header comment and the "Words win a name clash" comment to name the fixed order.

`RefField.tsx`: replace `useWords`/`usePhrases` with `const { targets } = useLinkTargets();`, call `suggestRefs(targets, ...)`, label with `KIND_LABEL[suggestion.kind]`, and set the listbox `aria-label` to "Saved items".

`VerbTableCard.tsx`: add `const [ref, setRef] = useState(table.ref);`; below the conjugation table and above the Save and Cancel buttons, add

```tsx
<div className="mt-3">
  <label htmlFor={`${bodyId}-ref`} className="mb-1 block text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
    Notes
  </label>
  <RefField
    id={`${bodyId}-ref`}
    value={ref}
    exclude={[table.verb]}
    onChange={(next) => {
      onEdited();
      setRef(next);
    }}
    placeholder="Anything about this verb. [[Name]] links to a rule, word or phrase."
  />
  {table.ref && (
    <p className="mt-1.5 text-sm break-words text-slate-700 dark:text-slate-300">
      <RefText value={table.ref} linkIndex={linkIndex} />
    </p>
  )}
</div>
```

with `const { linkIndex } = useLinkTargets();`, and change the save call to `saveVerbTable(table.id, tenses, rows, ref);`. The rendered line shows the saved notes so their links can be followed; the field edits them.

Verbs page, scroll and highlight: a link arrives as `/verbs?verb=<name>`, which the page already opens (`targeted`). Pass `highlighted={table.id === targeted?.id && chosen === undefined}` to `VerbTableCard`. In the card, add a `highlighted: boolean` prop, a `useRef<HTMLElement>` on the `<section>`, and

```ts
// A link to this table lands here: bring it into view once, on arrival.
useEffect(() => {
  if (highlighted) sectionRef.current?.scrollIntoView({ block: "center" });
}, [highlighted]);
```

and add `ring-2 ring-amber-400` to the section's classes while `highlighted`. It stops being highlighted as soon as the reader opens or closes anything, because `chosen` is then set.

- [ ] **Step 4: Run the checks**

Run: `npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build`
Expected: all pass; the route table still shows the workspace pages as dynamic.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "Link to rules and verb tables everywhere, with verb table notes"
```

---

### Task 4: Renames rewrite links

**Files:**
- Create: `src/lib/linkRenames.ts`
- Modify: `src/lib/storage.ts` (`updateEntry`), `src/lib/phraseStorage.ts` (`updatePhrase`), `src/lib/rules.ts` (`updateRule`); each also exports its `updateMany`
- Test: `src/lib/linkRenames.test.ts` (new)

**Interfaces:**
- Consumes: `planLinkRewrites` (Task 2); `updateVerbTables` (Task 1).
- Produces: `rewriteLinks(kind: LinkKind, id: string, from: string, to: string): void`; store exports `updateEntries`, `updatePhrases`, `updateRules` (each `= store.updateMany`).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/linkRenames.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` factories are hoisted above this file's own declarations, so
// anything they read has to be hoisted with them.
const { words, updateEntries, updatePhrases, updateVerbTables, updateRules } = vi.hoisted(() => ({
  words: [{ id: "w1", word: "geben", ref: "uses [[Dativ]]" }],
  updateEntries: vi.fn(),
  updatePhrases: vi.fn(),
  updateVerbTables: vi.fn(),
  updateRules: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({ getEntries: () => words, updateEntries }));
vi.mock("@/lib/phraseStorage", () => ({ getPhrases: () => [], updatePhrases }));
vi.mock("@/lib/verbTables", () => ({ getVerbTables: () => [], updateVerbTables }));
vi.mock("@/lib/rules", () => ({
  getRules: () => [{ id: "r1", title: "Dativ Fall", blocks: [] }],
  updateRules,
}));

import { rewriteLinks } from "@/lib/linkRenames";

describe("rewriteLinks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends only the lists that changed to their stores", () => {
    rewriteLinks("rule", "r1", "Dativ", "Dativ Fall");
    expect(updateEntries).toHaveBeenCalledWith([{ id: "w1", word: "geben", ref: "uses [[Dativ Fall]]" }]);
    expect(updatePhrases).not.toHaveBeenCalled();
    expect(updateVerbTables).not.toHaveBeenCalled();
    expect(updateRules).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/lib/linkRenames.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/linkRenames.ts
/**
 * After an item is renamed, every `[[Old name]]` that pointed at it is
 * rewritten to the new name, so the rename does not quietly turn incoming
 * links into dotted text (and, once the map exists, remove lines from it).
 *
 * Done in the browser through the stores rather than in a database function:
 * the link rules (`foldName`, the fixed order) live in TypeScript, and
 * repeating them in SQL would be two spellings of one rule.
 * ponytail: one write per list, not one transaction; if a write fails its
 * store reloads and those links stay on the old name (dotted), which renaming
 * back repairs. Move this into a database function if that ever matters.
 *
 * The stores import this module and it imports them. That cycle is safe
 * because nothing here runs while the modules load, only when a rename
 * happens.
 */

import { planLinkRewrites, type LinkKind } from "@/lib/links";
import { getPhrases, updatePhrases } from "@/lib/phraseStorage";
import { getRules, updateRules } from "@/lib/rules";
import { getEntries, updateEntries } from "@/lib/storage";
import { getVerbTables, updateVerbTables } from "@/lib/verbTables";

export function rewriteLinks(kind: LinkKind, id: string, from: string, to: string): void {
  const plan = planLinkRewrites(
    { entries: getEntries(), phrases: getPhrases(), tables: getVerbTables(), rules: getRules() },
    kind,
    id,
    from,
    to,
  );
  if (plan.entries.length) updateEntries(plan.entries);
  if (plan.phrases.length) updatePhrases(plan.phrases);
  if (plan.tables.length) updateVerbTables(plan.tables);
  if (plan.rules.length) updateRules(plan.rules);
}
```

In `storage.ts`: `export const updateEntries = store.updateMany;` and in `updateEntry`, after `store.update(updated);`, add `rewriteLinks("word", id, existing.word, updated.word);`. Same in `phraseStorage.ts` (`updatePhrases`, `rewriteLinks("phrase", id, existing.phrase, updated.phrase)`) and `rules.ts` (`updateRules`, `rewriteLinks("rule", id, existing.title, updated.title)`). Verb tables cannot be renamed, so `verbTables.ts` gets no call.

A rename rewrites the linking item's `ref` or blocks, which the database counts as an edit of that item. That is correct: its text did change.

- [ ] **Step 4: Run the checks**

Run: `npx tsc --noEmit && npx eslint src/ && npx vitest run`
Expected: all pass. Delete the `rewriteLinks` call from `updateRule`, confirm nothing else fails (the call is only covered by the manual check below), restore it.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "Rewrite links when a word, phrase or rule is renamed"
```

---

### Task 5: Linked from, and the delete warning

**Files:**
- Create: `src/components/LinkedFrom.tsx`
- Modify: `src/app/(workspace)/word/page.tsx`, `phrase/page.tsx`, `rule/page.tsx`, `src/components/VerbTableCard.tsx`
- Modify: `src/components/DeleteControls.tsx` (`ConfirmDeleteDialog` gains `warning?: string | null`)
- Modify: `src/app/(workspace)/grammar/page.tsx`
- Test: `src/components/LinkedFrom.test.tsx` (new)

**Interfaces:**
- Consumes: `useLinkTargets`, `linkedFrom`, `linkWarning`, `KIND_LABEL`.
- Produces: `<LinkedFrom href={string} />`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/LinkedFrom.test.tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { buildLinkIndex, linkTargets } from "@/lib/links";

const targets = linkTargets(
  [{ id: "w1", word: "geben", definition: "", ref: "[[Dativ]]", collections: [], source: "Manual", dateAdded: "", dateUpdated: null, needsDefinition: false }],
  [],
  [],
  [{ id: "r1", title: "Dativ", topic: "Cases", blocks: [], dateAdded: "", dateUpdated: null }],
);
vi.mock("@/lib/useLinkTargets", () => ({
  useLinkTargets: () => ({ targets, linkIndex: buildLinkIndex(targets) }),
}));

import { LinkedFrom } from "@/components/LinkedFrom";

describe("LinkedFrom", () => {
  it("lists what links here, with its kind", () => {
    const html = renderToStaticMarkup(<LinkedFrom href="/rule?id=r1" />);
    expect(html).toContain('href="/word?id=w1"');
    expect(html).toContain("geben");
    expect(html).toContain("Word");
  });

  it("renders nothing when nothing links here", () => {
    expect(renderToStaticMarkup(<LinkedFrom href="/word?id=w1" />)).toBe("");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/components/LinkedFrom.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```tsx
// src/components/LinkedFrom.tsx
"use client";

import Link from "next/link";

import { KIND_LABEL, linkedFrom } from "@/lib/links";
import { useLinkTargets } from "@/lib/useLinkTargets";

/**
 * The items whose text links to this one. Worked out from text already
 * written, so there is nothing stored to keep in step; nothing is shown when
 * nothing links here.
 */
export function LinkedFrom({ href }: { href: string }) {
  const { targets, linkIndex } = useLinkTargets();
  const linkers = linkedFrom(targets, linkIndex, href);
  if (linkers.length === 0) return null;
  return (
    <section className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-800">
      <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">Linked from</h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {linkers.map((t) => (
          <li key={t.href}>
            <Link href={t.href} className="text-sm text-indigo-700 underline underline-offset-2 hover:text-indigo-500 dark:text-indigo-300">
              {t.name}
            </Link>{" "}
            <span className="text-xs text-slate-500 dark:text-slate-400">{KIND_LABEL[t.kind]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

Place it:
- word page: `<LinkedFrom href={`/word?id=${entry.id}`} />` after the `</dl>`.
- phrase page: `<LinkedFrom href={`/phrase?id=${phrase.id}`} />` after the last `Field`.
- rule page: `<LinkedFrom href={`/rule?id=${rule.id}`} />` after the dates `</dl>` in the reading view.
- verb card: `<LinkedFrom href={`/verbs?verb=${encodeURIComponent(table.verb)}`} />` inside the open body, after the notes.

Delete warning: in `ConfirmDeleteDialog`, add the optional `warning?: string | null` prop and render, after the first paragraph,
`{warning && <p className="mt-3 text-sm font-medium text-amber-700 dark:text-amber-400">{warning}</p>}`.
In the Grammar page, with `const { targets, linkIndex } = useLinkTargets();`, pass
`warning={linkWarning(targets, linkIndex, targets.filter((t) => t.kind === "rule" && pendingDelete.includes(t.id)))}`.
After the delete the links stay as written and show dotted; a new rule of the same name brings them back, as the design says. Words, phrases and verb tables keep their existing delete dialogs without a warning; the design asks for it on rules only.

- [ ] **Step 4: Run the checks**

Run: `npx tsc --noEmit && npx eslint src/ && npx vitest run`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "Show what links to each item, and warn before deleting a linked rule"
```

---

### Task 6: Record it

**Files:**
- Modify: `Docs/grammar.md`, `Docs/schema.md`

- [ ] **Step 1: Amend the design**

In `Docs/grammar.md`, "Links":
- Replace the "Shared names" bullet with: a shared name resolves by a fixed order, rule, verb table, word, phrase; the owner chose this on 26 September over recording which item a link meant, which is deferred until clashes actually happen.
- Add to "Rules and verb tables become link targets": a link to a verb table opens the Verbs page scrolled to that table and highlighted (`/verbs?verb=<name>`).
- Under "Renames update links": rewritten in the browser through the stores, one write per list (`src/lib/linkRenames.ts`); a rename that changes only case or accents rewrites nothing, and a name owned by a higher-precedence item is left alone.
- Change the status line near the top to "Stages 1 and 2 are built"; stages 3 to 5 remain.

In `Docs/schema.md`, where `items.ref` is described, add that verb tables now use it for their notes.

- [ ] **Step 2: Check for dashes**

Run: `python -c "import sys;[print(p, open(p,encoding='utf-8').read().count(chr(0x2014))+open(p,encoding='utf-8').read().count(chr(0x2013))) for p in ['Docs/grammar.md','Docs/schema.md','Docs/plans/2026-09-26-grammar-stage-2.md']]"`
Expected: `0` for each.

- [ ] **Step 3: Commit**

```bash
git add Docs
git commit -m "Record grammar stage 2 in the design and schema docs"
```

---

## Manual check (owner, on production after merge)

1. Write `[[<a rule title>]]` in a word's Ref: the suggestion box offers the rule, labelled Rule; the saved link opens the rule.
2. Write `[[<a verb>]]` in a rule's text block: the link opens Verbs with that table open, scrolled to and ringed.
3. Add notes to a verb table with a link, Save, reopen: the notes and link are there.
4. Rename the rule: the word's Ref now shows the new name as a working link.
5. The rule page lists the word under Linked from.
6. Delete the rule from the Grammar list: the dialog warns "1 word links to ...".
