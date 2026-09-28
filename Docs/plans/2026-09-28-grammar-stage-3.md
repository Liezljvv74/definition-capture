# Grammar, stage 3: reading tools. Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every agent invokes the `ponytail:ponytail` skill first and works under it.

**Goal:** In a rule's reading view, selecting words offers Highlight (yellow, green, blue, purple), Remove highlight, Link to… and New rule from this; a selection across table cells highlights whole cells, so a row, a column or the whole table can be marked at once; Edit mode shows highlights tinted.

**Architecture:** Highlights are markup inside the stored text, `==y:words==`, read by the one parser in `src/lib/blockText.ts`, which now records where every token sits in its source. The reading view writes those positions onto the page as `data-at` attributes, so a selection maps back onto the stored text; every edit that follows (highlight, recolour, remove, link) is a pure string function in `src/lib/selectionEdits.ts`, saved through the existing `updateRule`. Links gain a label, `[[Dativ|dem]]`, so a link can keep the words it was made from. No migration, no new dependency.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript 5, Tailwind 4, Supabase through the existing stores, Vitest 3 in the node environment (components tested with `renderToStaticMarkup`, as `BlockView.test.tsx` is; no jsdom is installed and none is added).

**Spec:** `Docs/grammar.md`, section "Reading and editing", as amended by the owner on 28 September (written into `grammar.md` by Task 7):

- The highlight colours are **yellow, green, blue and purple**. Blue replaces the design's pink, since red, rose and pink are kept for warnings; purple is a fourth, added at the owner's request.
- **A selection can run across table cells.** It then covers the rectangle between the cell it starts in and the cell it ends in, whole cells only, so dragging down a column selects that column, along a row selects the row, and from the first cell to the last selects the table. The browser draws its own selection in reading order, row by row, which for a column would light up cells outside it; so the page draws an outline round the rectangle instead and hides the browser's selection colour meanwhile. Highlight colours every cell in the rectangle whole, and Remove highlight clears them; Link to… and New rule from this stay within one cell.
- In Edit mode a highlight shows as a **tint behind the text, with its markers in faint grey**. Invisible markers and a rich text editor were offered and turned down.
- **Link to…** keeps the selected words: selecting "dem" and linking it to the rule "Dativ" writes `[[Dativ|dem]]`. A link whose words are the name stays `[[Dativ]]`.
- **New rule from this** opens a small dialog with the title (the selected words) and a topic select, defaulting to this rule's topic.

Decided while planning, where the design is silent (report both to the owner):

- **Examples take highlights, not links.** Examples have never rendered links, and practice will read their words; Link to… and New rule from this are offered in text blocks and table cells only.
- **Outside a table, a selection stays within one field and one line.** A text block, an example's sentence and its translation are each one field. A selection across two blocks, from a table into anything else, or across a line break in a text block, offers nothing.

## Global Constraints

- No em dashes (U+2014) and no en dashes (U+2013) anywhere: code, comments, copy, commit messages.
- Comments explain *why*, in full sentences, matching the density of the surrounding code.
- Interface copy is written for someone using the app, never describing or selling a feature.
- No red, rose or pink in any new Grammar interface; highlights are yellow, green, blue and purple.
- The word "category" is retired. A rule's grouping is a Topic.
- No migration in this stage. If one turns out to be needed, stop and ask.
- Every page lives under `src/app/(workspace)/`. Read `node_modules/next/dist/docs/` before writing routing code.
- `src/lib/remoteStore.ts` stays the only thing that talks to Supabase for list data; rule writes go through `updateRule` and `createRule` in `src/lib/rules.ts`.
- Enter-moves-down is app-wide (`src/lib/enterMovesDown.ts`); do not add per-field Enter handlers.
- Nothing is seeded; the feature ships empty.
- No new dependency. `jsdom` is not installed; test components with `renderToStaticMarkup`.
- Check with `npx tsc --noEmit`, `npx eslint src/`, `npx vitest run`, and `npm run build` for Tasks 4, 5 and 6. Commit after each task on branch `grammar-stage-3`, made from `main` in place (the owner asked for the build to commit as it goes). Push to `origin` only, never to the Turing College remotes, and only when the owner says so. Commit messages end with the attribution line from the session's system reminder.
- After every commit, bring `HANDOFF.md` up to date (owner's standing instruction). It is not committed.

## Review Focus

1. **A selection that starts or ends inside bold, a link or a gap** ("tiv und die" across `**Dativ** und [[Fälle|die Fälle]]`). Expected: the highlight takes the whole of each, and never leaves half a marker in the text. Test: Task 3 (`addHighlight`).
2. **A selection that leaves its field.** Across cells of one table, including from or to an empty cell (a header corner is often empty), expected: the rectangle between the two corners, whole cells, with empty cells and cells whose text would break a marker left as they are. Across two blocks, from a table into text, across a line break, or of nothing but spaces, expected: no tool is offered and nothing is written. Test: Task 3 (`combinePoints`, `highlightCells`, `addHighlight` over a line break and over spaces only).
3. **Text that already holds `==`, `=` or brackets** (`2 == 2`, `x = y`, `[b]`). Expected: it renders as typed, and a highlight or link that would break its marker is refused. Test: Task 2 (parser leaves it as typed) and Task 3 (refusals).
4. **A labelled link whose target is renamed, or that points at a rule being deleted.** Expected: the rename keeps the label, `[[Dativ|dem]]` becomes `[[Dativ (Fall)|dem]]`; Linked from and the delete warning count it. Test: Task 1.
5. **The spreadsheet export and search text.** Expected: highlight markers and link labels never reach a cell; a labelled link exports its words. Test: Task 2 (`plainText`, `flattenBlocks`).

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/lib/links.ts` (modify) + `links.test.ts` | `linkParts`, the one reading of `Name|label`; names and renames respect labels |
| `src/lib/parseRef.ts`, `src/components/RefText.tsx` (modify) + tests | a Ref shows a link's label |
| `src/lib/blockText.ts` (modify) + `blockText.test.ts` | positions on every token, highlights, gaps as tokens, modes; `splitGaps` removed; `highlightRuns` for Edit mode |
| `src/lib/blocks.ts` (modify) + `blocks.test.ts` | the export flattens translations through `plainText` |
| `src/components/grammar/RichText.tsx`, `BlockView.tsx` (modify) + `BlockView.test.tsx` | render highlights, labels and gaps; `data-block`, `data-field`, `data-at` |
| `src/lib/selectionEdits.ts` (new) + test | fields, selection ends, highlight, recolour, remove, link; rectangles of table cells |
| `src/components/grammar/readSelection.ts` (new) | the browser's selection to a `Selected` |
| `src/components/grammar/SelectionToolbar.tsx` (new) + test | the buttons |
| `src/components/grammar/ReadingTools.tsx` (new) | selection state, saving, the two dialogs |
| `src/components/grammar/LinkToDialog.tsx` (new) | search every target |
| `src/components/grammar/AddRuleDialog.tsx` (modify) | prefilled title and topic, and a callback instead of navigating |
| `src/app/(workspace)/rule/page.tsx` (modify) | wraps the blocks in `ReadingTools` |
| `src/components/grammar/MarkedField.tsx` (new) + test, `BlockEditor.tsx` (modify) | the tinted layer in Edit mode |
| `Docs/grammar.md` (modify) | record what was built and the amended decisions |

---

### Task 1: Links with labels

**Files:**
- Modify: `src/lib/links.ts`, `src/lib/parseRef.ts`, `src/lib/blockText.ts` (link token only), `src/components/RefText.tsx`, `src/components/grammar/RichText.tsx` (link rendering only)
- Test: `src/lib/links.test.ts`, `src/lib/parseRef.test.ts`, `src/lib/blockText.test.ts`, `src/components/RefText.test.tsx` (new)

**Interfaces:**
- Produces: `linkParts(inner: string): { name: string; label: string }` from `links.ts`; `RefToken` `word` gains `label?: string`; `InlineToken` `link` gains `label?: string`. A label is present only when non-blank.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/links.test.ts` (it already has `word(id, name, ref)` and `rule(id, title, text?, cells?)` helpers; import `linkParts` alongside the existing imports):

```ts
describe("labelled links", () => {
  it("reads the name and the words shown for it", () => {
    expect(linkParts(" Dativ | dem ")).toEqual({ name: "Dativ", label: "dem" });
    expect(linkParts("Dativ")).toEqual({ name: "Dativ", label: "" });
    expect(linkParts("Dativ|")).toEqual({ name: "Dativ", label: "" });
    expect(linkParts("a|b|c")).toEqual({ name: "a", label: "b|c" });
  });

  it("finds the name, not the shown words, and nothing for a blank name", () => {
    expect(linkNames("Ich gebe [[Dativ|dem]] Mann, [[|leer]]")).toEqual(["Dativ"]);
  });

  it("keeps the shown words when the target is renamed", () => {
    expect(renameLinksIn("[[Dativ|dem]] and [[dativ]]", "Dativ", "Dativ (Fall)")).toBe(
      "[[Dativ (Fall)|dem]] and [[Dativ (Fall)]]",
    );
  });

  it("counts a labelled link in Linked from and the delete warning", () => {
    const targets = linkTargets([word("w1", "geben", "uses [[Dativ|dem]]")], [], [], [rule("r1", "Dativ")]);
    const index = buildLinkIndex(targets);
    expect(linkedFrom(targets, index, "/rule?id=r1").map((t) => t.id)).toEqual(["w1"]);
    expect(linkWarning(targets, index, targets.filter((t) => t.id === "r1"))).toBe(
      "1 word links to Dativ. Their links will stop working.",
    );
  });
});
```

Add to `src/lib/parseRef.test.ts`:

```ts
describe("parseRef, labelled links", () => {
  it("reads a labelled link as its target, shown by its label", () => {
    expect(parseRef("see [[Dativ|dem]]")).toEqual([
      { kind: "text", value: "see " },
      { kind: "word", name: "Dativ", label: "dem" },
    ]);
    expect(parseRef("[[|dem]]")).toEqual([{ kind: "text", value: "[[|dem]]" }]);
  });
});
```

Add to the `parseInline` describe in `src/lib/blockText.test.ts`:

```ts
  it("reads a labelled link", () => {
    expect(parseInline("gebe [[Dativ|dem]] Mann")).toEqual([
      { kind: "text", value: "gebe " },
      { kind: "link", name: "Dativ", label: "dem" },
      { kind: "text", value: " Mann" },
    ]);
    expect(plainText("gebe [[Dativ|dem]] Mann")).toBe("gebe dem Mann");
  });
```

Create `src/components/RefText.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RefText } from "@/components/RefText";

describe("RefText", () => {
  it("shows a labelled link by its label, pointing at its name", () => {
    const html = renderToStaticMarkup(
      <RefText value="see [[Dativ|dem]]" linkIndex={new Map([["dativ", "/rule?id=r1"]])} />,
    );
    expect(html).toContain('href="/rule?id=r1"');
    expect(html).toContain(">dem</a>");
    expect(html).not.toContain("Dativ");
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/lib/links.test.ts src/lib/parseRef.test.ts src/lib/blockText.test.ts src/components/RefText.test.tsx`
Expected: FAIL, `linkParts` is not exported and labels come out as part of the name.

- [ ] **Step 3: Implement**

In `src/lib/links.ts`, add after the `LINK` constant, and replace `linkNames` and `renameLinksIn`:

```ts
/**
 * The inside of a `[[…]]`: a name, or a name and the words shown for it,
 * `Dativ|dem`. Split at the first bar, so the shown words may hold one of
 * their own; blank shown words mean none, and the name is shown instead.
 * Every parser reads a link through this one function (`parseRef`,
 * `blockText`, and this module), so a label cannot mean one thing in a rule
 * and another in a Ref.
 */
export function linkParts(inner: string): { name: string; label: string } {
  const bar = inner.indexOf("|");
  if (bar === -1) return { name: inner.trim(), label: "" };
  return { name: inner.slice(0, bar).trim(), label: inner.slice(bar + 1).trim() };
}

export function linkNames(text: string): string[] {
  return [...text.matchAll(LINK)].map((match) => linkParts(match[1]).name).filter(Boolean);
}

/** Keeps a link's shown words: `[[Old|dem]]` becomes `[[New|dem]]`. */
export function renameLinksIn(text: string, from: string, to: string): string {
  const old = foldName(from);
  return text.replace(LINK, (whole, inner: string) => {
    const { name, label } = linkParts(inner);
    if (foldName(name) !== old) return whole;
    return label ? `[[${to}|${label}]]` : `[[${to}]]`;
  });
}
```

In `src/lib/parseRef.ts`: import `linkParts` from `@/lib/links`; give the `word` token `label?: string` with the comment `/** The words shown instead of the name, from \`[[Name|words]]\`. */`; and replace the `NAME_LINK_ONLY` branch body with:

```ts
      const { name, label } = linkParts(segment.slice(2, -2));
      if (name) tokens.push(label ? { kind: "word", name, label } : { kind: "word", name });
      else appendText(tokens, segment);
      continue;
```

Update the module comment's list with a line `[[Dativ|dem]]  → the same, shown as "dem"`.

In `src/components/RefText.tsx`, in the `word` case, show `{token.label || token.name}` in both the dotted span and the `Link`.

In `src/lib/blockText.ts`: import `linkParts` from `@/lib/links`; the link token becomes `{ kind: "link"; name: string; label?: string }`; the link branch in `parseInline` becomes:

```ts
      const { name, label } = linkParts(segment.slice(2, -2));
      if (!name) pushText(tokens, segment);
      else tokens.push(label ? { kind: "link", name, label } : { kind: "link", name });
      return;
```

and `plainText` maps a link to `token.label || token.name`. Add `[[Name|shown words]]` to the module comment's list.

In `src/components/grammar/RichText.tsx`, show `{token.label || token.name}` in both link branches.

- [ ] **Step 4: Run the checks**

Run: `npx tsc --noEmit && npx eslint src/ && npx vitest run`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "Let a link show words of its own, [[Name|words]]"
```

---

### Task 2: The parser knows where everything is, and reads highlights

**Files:**
- Modify: `src/lib/blockText.ts` (rewritten below), `src/lib/blocks.ts` (`flattenBlocks`), `src/components/grammar/RichText.tsx`, `src/components/grammar/BlockView.tsx`
- Test: `src/lib/blockText.test.ts`, `src/lib/blocks.test.ts`, `src/components/grammar/BlockView.test.tsx`

**Interfaces:**
- Consumes: `linkParts` (Task 1).
- Produces, from `blockText.ts`: `type HighlightColour = "yellow" | "green" | "blue" | "purple"`; `HIGHLIGHT_CODE: Record<HighlightColour, string>`; `HIGHLIGHT_COLOURS: HighlightColour[]` (in toolbar order); `type InlineMode = "rich" | "sentence" | "plain"`; `InlineToken` (every token has `from`, `to`; every token but `highlight` has `at`); `LeafToken`; `shownText(token: LeafToken): string`; `parseInline(text, mode = "rich", base = 0)`; `parseTextBlock(text)` with offsets from the start of the whole block; `plainText(text)`. `splitGaps` is deleted.
- Produces, from `RichText.tsx`: `HIGHLIGHT_CLASS: Record<HighlightColour, string>`; `InlineText` takes `mode?: InlineMode`.
- The page contract, for Task 4: each block is wrapped in an element with `data-block="<block id>"`; each field's element has `data-field` (`text`, `cell:<row>:<column>`, `sentence`, `translation`); every element that shows words has `data-at="<offset>"`, holds exactly one text node, and its first character is at that offset in the field's stored text.

- [ ] **Step 1: Update and write the tests**

In `src/lib/blockText.test.ts`:
- Change the import to `import { parseInline, parseTextBlock, plainText, shownText, type InlineToken, type LeafToken } from "@/lib/blockText";`.
- In the existing `parseInline` and `parseTextBlock` tests, change every `toEqual` on a token array to `toMatchObject`: tokens now carry positions, and these tests pin kinds and values.
- Delete the `splitGaps` describe; its cases move to "gaps in a sentence" below.
- Add:

```ts
/** Every leaf, including those inside highlights. */
function leaves(tokens: InlineToken[]): LeafToken[] {
  return tokens.flatMap((t) => (t.kind === "highlight" ? leaves(t.tokens) : [t]));
}

/**
 * The contract the selection toolbar stands on: a leaf's words sit in the
 * source exactly where `at` says, inside the span `from` and `to` give.
 */
function expectPositions(source: string, tokens: InlineToken[]) {
  for (const leaf of leaves(tokens)) {
    const words = shownText(leaf);
    expect(source.slice(leaf.at, leaf.at + words.length)).toBe(words);
    expect(source.slice(leaf.from, leaf.to)).toContain(words);
  }
}

describe("positions", () => {
  it("records where every token's words sit in the source", () => {
    const source = "Der **Dativ**, *wem*, [[ Cases ]] und [[Dativ| dem ]] ==g:hier **fett**==.";
    expectPositions(source, parseInline(source));
  });

  it("counts from the start of the whole block, past bullets and blank lines", () => {
    const source = "Erst.\n\n- **eins** und [[zwei]]\nDrei ==y:vier==";
    expectPositions(source, parseTextBlock(source).flatMap((line) => line.tokens));
  });

  it("records gaps in a sentence", () => {
    const source = "Ich gebe ==b:{dem} Mann== das Buch";
    expectPositions(source, parseInline(source, "sentence"));
  });
});

describe("highlights", () => {
  it("reads a highlight and the markup inside it", () => {
    expect(parseInline("a ==y:**b** c== d")).toMatchObject([
      { kind: "text", value: "a " },
      {
        kind: "highlight",
        colour: "yellow",
        from: 2,
        to: 15,
        tokens: [
          { kind: "bold", value: "b" },
          { kind: "text", value: " c" },
        ],
      },
      { kind: "text", value: " d" },
    ]);
  });

  it("reads every colour", () => {
    const colours = parseInline("==y:a== ==g:b== ==b:c== ==p:d==").flatMap((t) => (t.kind === "highlight" ? [t.colour] : []));
    expect(colours).toEqual(["yellow", "green", "blue", "purple"]);
  });

  it("leaves anything that is not a highlight as typed", () => {
    for (const text of ["a == b", "x==y", "==y:==", "==q:word==", "==y:open"]) {
      const tokens = parseInline(text);
      expect(tokens.some((t) => t.kind === "highlight")).toBe(false);
      expect(leaves(tokens).map(shownText).join("")).toBe(text);
    }
  });

  it("takes no links or bold in a translation, only highlights", () => {
    expect(parseInline("the ==g:**man**== [[x]]", "plain")).toMatchObject([
      { kind: "text", value: "the " },
      { kind: "highlight", tokens: [{ kind: "text", value: "**man**" }] },
      { kind: "text", value: " [[x]]" },
    ]);
  });
});

describe("gaps in a sentence", () => {
  it("marks the words in braces", () => {
    expect(parseInline("Ich gebe {dem} Mann {das} Buch", "sentence")).toMatchObject([
      { kind: "text", value: "Ich gebe " },
      { kind: "gap", value: "dem" },
      { kind: "text", value: " Mann " },
      { kind: "gap", value: "das" },
      { kind: "text", value: " Buch" },
    ]);
  });

  it("leaves an unclosed or empty brace as text, and reads no links or bold", () => {
    expect(parseInline("a {b", "sentence")).toMatchObject([{ kind: "text", value: "a {b" }]);
    expect(parseInline("a {} b", "sentence")).toMatchObject([{ kind: "text", value: "a {} b" }]);
    expect(parseInline("[[a]] **b**", "sentence")).toMatchObject([{ kind: "text", value: "[[a]] **b**" }]);
  });
});
```

and in the `plainText` describe:

```ts
  it("leaves out highlight markers", () => {
    expect(plainText("==y:**Dativ**== und ==b:{dem}==")).toBe("Dativ und dem");
  });
```

In `src/lib/blocks.test.ts`, add (import `flattenBlocks` if the file does not already):

```ts
describe("flattenBlocks, markup", () => {
  it("leaves highlight markers and link labels out of the spreadsheet", () => {
    const flat = flattenBlocks([
      { kind: "example", id: "e", sentence: "==y:{dem}== Mann", translation: "the ==g:man==" },
      { kind: "text", id: "t", text: "siehe [[Dativ|den Fall]]" },
    ]);
    expect(flat).toContain("dem Mann (the man)");
    expect(flat).toContain("siehe den Fall");
    expect(flat).not.toContain("==");
  });
});
```

In `src/components/grammar/BlockView.test.tsx`:
- In "renders text with bold, italic, bullets and a resolved link", the three exact-markup expectations become `'<strong data-at="2">Wem?</strong>'`, `'<em data-at="10">dem</em>'` and `'<li><span data-at="17">one</span></li>'`.
- Add:

```tsx
  it("draws highlights, with the markup inside them", () => {
    const markup = html({ kind: "text", id: "a", text: "==y:**Dativ**== und ==b:wem==" });
    expect(markup).toMatch(/<mark class="[^"]*bg-yellow-200[^"]*"><strong data-at="6">Dativ<\/strong><\/mark>/);
    expect(markup).toContain("bg-sky-200");
    expect(markup).not.toContain("==");
  });

  it("labels every block, field and run of words with where it came from", () => {
    const table = html({ kind: "table", id: "t", headerRow: false, headerColumn: false, cells: [["a", "b [[Cases|c]]"]] });
    expect(table).toContain('data-block="t"');
    expect(table).toContain('data-field="cell:0:1"');
    expect(table).toContain('data-at="10"');
    expect(table).toContain(">c</a>");

    const example = html({ kind: "example", id: "e", sentence: "Ich gebe ==g:{dem}== Mann", translation: "I give ==b:the== man" });
    expect(example).toContain('data-field="sentence"');
    expect(example).toContain('data-field="translation"');
    expect(example).toContain(">dem<");
    expect(example).not.toContain("{");
    expect(example).not.toContain("==");
  });
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/lib/blockText.test.ts src/lib/blocks.test.ts src/components/grammar/BlockView.test.tsx`
Expected: FAIL: no positions, no highlights, `shownText` not exported.

- [ ] **Step 3: Implement the parser**

Replace `src/lib/blockText.ts` with:

```ts
/**
 * The markup a rule's text accepts, and nothing more:
 *
 *   **bold**   *italic*   [[Name]] or [[Name|shown words]] links
 *   ==y:highlighted words==  (y yellow, g green, b blue, p purple)
 *   lines starting with "- " as bullets   {gap} in an example sentence
 *
 * Rendered by the app's own code rather than a markdown library, because this
 * set does not justify one. The one rule that matters is that anything the
 * parser does not recognise, including markup that is never closed, comes out
 * as the characters typed: a star left open must not swallow a paragraph.
 *
 * Every token records where it sits in the text it came from: `from` and `to`
 * span its markup, and a token that shows words records in `at` where those
 * words start. That is what lets a selection made on the rendered page be
 * mapped back onto the text to highlight or link it (`selectionEdits.ts`),
 * without the stored text carrying offsets that editing would make drift.
 */

import { linkParts } from "@/lib/links";

export type HighlightColour = "yellow" | "green" | "blue" | "purple";

/** The letter a colour is written as, `==y:…==`. One letter, since Edit mode shows it. */
export const HIGHLIGHT_CODE: Record<HighlightColour, string> = { yellow: "y", green: "g", blue: "b", purple: "p" };
const COLOUR_BY_CODE: Record<string, HighlightColour> = { y: "yellow", g: "green", b: "blue", p: "purple" };
/** Every colour, in the order the toolbar offers them. */
export const HIGHLIGHT_COLOURS = Object.keys(HIGHLIGHT_CODE) as HighlightColour[];

type Span = { from: number; to: number };

export type InlineToken =
  | ({ kind: "text"; value: string; at: number } & Span)
  | ({ kind: "bold"; value: string; at: number } & Span)
  | ({ kind: "italic"; value: string; at: number } & Span)
  /** A name, resolved against the link index when shown; see `RefText`. */
  | ({ kind: "link"; name: string; label?: string; at: number } & Span)
  /** A word practice will blank out, `{dem}`; only in an example sentence. */
  | ({ kind: "gap"; value: string; at: number } & Span)
  | ({ kind: "highlight"; colour: HighlightColour; tokens: InlineToken[] } & Span);

/** A token that shows words of its own, as opposed to a highlight around others. */
export type LeafToken = Exclude<InlineToken, { kind: "highlight" }>;

export type TextLine = { kind: "paragraph" | "bullet"; tokens: InlineToken[] };

/**
 * What a field accepts. `rich` is a text block or a table cell; `sentence` is
 * an example's sentence, which has gaps and, as before, no links or
 * emphasis; `plain` is its translation. All three take highlights.
 */
export type InlineMode = "rich" | "sentence" | "plain";

/**
 * The same shape as `NAME_LINK` in `parseRef.ts`: a link never spans a line
 * and never holds a bracket. Kept as its own copy because that module also
 * turns bare URLs into links, which a passage of grammar must not do to
 * every slash it contains.
 */
const LINK = /(\[\[[^[\]\n]+\]\])/;
/**
 * Bold before italic, so `**` is not read as an empty italic pair. An italic
 * run may not start or end with a space, so a lone star in "2 * 3 * 4" is
 * arithmetic rather than markup.
 */
const EMPHASIS = /(\*\*[^*\n]+\*\*|\*[^*\s\n](?:[^*\n]*[^*\s\n])?\*)/;
const GAP = /(\{[^{}\n]+\})/;
/**
 * `==y:words==`: never across a line, never empty, never nested, and closed
 * by the first `==` after it opens. Read before anything else, so a highlight
 * can hold bold, a link or a gap, which are read inside it.
 */
const HIGHLIGHT = /(==[ygbp]:(?:(?!==)[^\n])+==)/;

/** The words a leaf shows: a link's label if it has one, else its name. */
export function shownText(token: LeafToken): string {
  return token.kind === "link" ? token.label || token.name : token.value;
}

/**
 * `String.split` with a one-group pattern, each piece with where it starts.
 * The split alternates plain text and matches, so a piece at an odd index is
 * exactly what the pattern matched, and needs no second test.
 */
function pieces(text: string, pattern: RegExp, base: number): { value: string; at: number; match: boolean }[] {
  let at = base;
  return text.split(pattern).map((value, i) => {
    const piece = { value, at, match: i % 2 === 1 };
    at += value.length;
    return piece;
  });
}

function pushText(tokens: InlineToken[], value: string, at: number): void {
  if (!value) return;
  const last = tokens[tokens.length - 1];
  if (last && last.kind === "text" && last.to === at) {
    last.value += value;
    last.to += value.length;
  } else {
    tokens.push({ kind: "text", value, at, from: at, to: at + value.length });
  }
}

/** One line of a field, with `base` the offset of its first character in the whole field. */
export function parseInline(text: string, mode: InlineMode = "rich", base = 0): InlineToken[] {
  const tokens: InlineToken[] = [];
  for (const piece of pieces(text, HIGHLIGHT, base)) {
    if (!piece.value) continue;
    if (piece.match) {
      tokens.push({
        kind: "highlight",
        colour: COLOUR_BY_CODE[piece.value[2]],
        tokens: parseMarkup(piece.value.slice(4, -2), mode, piece.at + 4, []),
        from: piece.at,
        to: piece.at + piece.value.length,
      });
    } else {
      parseMarkup(piece.value, mode, piece.at, tokens);
    }
  }
  return tokens;
}

/** Everything but highlights, appended to `tokens`. */
function parseMarkup(text: string, mode: InlineMode, base: number, tokens: InlineToken[]): InlineToken[] {
  if (mode === "plain") {
    pushText(tokens, text, base);
    return tokens;
  }
  for (const piece of pieces(text, mode === "sentence" ? GAP : LINK, base)) {
    if (!piece.value) continue;
    const to = piece.at + piece.value.length;
    if (piece.match && mode === "sentence") {
      tokens.push({ kind: "gap", value: piece.value.slice(1, -1), at: piece.at + 1, from: piece.at, to });
    } else if (piece.match) {
      const inner = piece.value.slice(2, -2);
      const { name, label } = linkParts(inner);
      // The shown words start where the trimmed label or name does, which
      // `indexOf` finds: only spaces stand before them in their part.
      if (!name) pushText(tokens, piece.value, piece.at);
      else if (label) tokens.push({ kind: "link", name, label, at: piece.at + 2 + inner.indexOf(label, inner.indexOf("|") + 1), from: piece.at, to });
      else tokens.push({ kind: "link", name, at: piece.at + 2 + inner.indexOf(name), from: piece.at, to });
    } else if (mode === "sentence") {
      pushText(tokens, piece.value, piece.at);
    } else {
      for (const part of pieces(piece.value, EMPHASIS, piece.at)) {
        if (!part.value) continue;
        const end = part.at + part.value.length;
        if (!part.match) pushText(tokens, part.value, part.at);
        else if (part.value.startsWith("**")) tokens.push({ kind: "bold", value: part.value.slice(2, -2), at: part.at + 2, from: part.at, to: end });
        else tokens.push({ kind: "italic", value: part.value.slice(1, -1), at: part.at + 1, from: part.at, to: end });
      }
    }
  }
  return tokens;
}

/**
 * Lines become paragraphs, a line starting with "- " becomes a bullet, and
 * blank lines are dropped: each line is already its own block on screen, so
 * an empty one would only be a gap. Offsets count from the start of the
 * whole text, so a selection on any line maps onto the block's one string.
 */
export function parseTextBlock(text: string): TextLine[] {
  const lines: TextLine[] = [];
  let start = 0;
  for (const line of text.split("\n")) {
    if (line.trim() !== "") {
      lines.push(
        line.startsWith("- ")
          ? { kind: "bullet", tokens: parseInline(line.slice(2), "rich", start + 2) }
          : { kind: "paragraph", tokens: parseInline(line, "rich", start) },
      );
    }
    start += line.length + 1;
  }
  return lines;
}

function shown(tokens: InlineToken[]): string {
  return tokens.map((t) => (t.kind === "highlight" ? shown(t.tokens) : shownText(t))).join("");
}

/** The words without their markup, for a spreadsheet cell or a search. */
export function plainText(text: string): string {
  return text
    .split("\n")
    .map((line) => shown(parseInline(line)))
    .join("\n")
    .replace(/\{([^{}\n]+)\}/g, "$1");
}
```

In `src/lib/blocks.ts`, `flattenBlocks`' example case uses `plainText(block.translation)` in place of `block.translation` inside the brackets, so a highlighted translation exports its words.

- [ ] **Step 4: Implement the rendering**

In `src/components/grammar/RichText.tsx`:
- Import `parseInline, parseTextBlock, shownText, type HighlightColour, type InlineMode, type InlineToken, type TextLine`.
- Add, below `linkClass`:

```tsx
/**
 * Light enough to read dark text through in both themes. Blue rather than
 * the design's pink: red, rose and pink are kept for warnings. Purple
 * is the owner's fourth.
 */
export const HIGHLIGHT_CLASS: Record<HighlightColour, string> = {
  yellow: "bg-yellow-200 dark:bg-yellow-400/35",
  green: "bg-green-200 dark:bg-green-400/30",
  blue: "bg-sky-200 dark:bg-sky-400/30",
  purple: "bg-purple-200 dark:bg-purple-400/30",
};
```

- Replace `Inline` with:

```tsx
/**
 * Every element that shows words carries `data-at`, where those words start
 * in the stored text, and holds exactly one text node. The selection toolbar
 * reads it to map a selection back onto the text (`readSelection.ts`).
 */
function Inline({ tokens, linkIndex }: { tokens: InlineToken[]; linkIndex: LinkIndex }) {
  return (
    <>
      {tokens.map((token, index) => {
        switch (token.kind) {
          case "highlight":
            return (
              <mark key={index} className={`rounded-sm text-inherit ${HIGHLIGHT_CLASS[token.colour]}`}>
                <Inline tokens={token.tokens} linkIndex={linkIndex} />
              </mark>
            );
          case "text":
            return <span key={index} data-at={token.at}>{token.value}</span>;
          case "bold":
            return <strong key={index} data-at={token.at}>{token.value}</strong>;
          case "italic":
            return <em key={index} data-at={token.at}>{token.value}</em>;
          case "gap":
            // Underlined and without braces: the braces are for the author
            // and for practice, not the reader.
            return (
              <span key={index} data-at={token.at} className="font-semibold underline decoration-emerald-500 underline-offset-4">
                {token.value}
              </span>
            );
          case "link": {
            const href = linkIndex.get(foldName(token.name));
            const words = shownText(token);
            // Unresolved names read as dotted text, exactly as in a Ref, so
            // one look says the same thing everywhere.
            if (!href) {
              return (
                <span
                  key={index}
                  data-at={token.at}
                  title="Nothing with this name is saved yet"
                  className="text-slate-500 underline decoration-dotted underline-offset-2 dark:text-slate-400"
                >
                  {words}
                </span>
              );
            }
            return (
              <Link key={index} href={href} data-at={token.at} className={linkClass}>
                {words}
              </Link>
            );
          }
        }
      })}
    </>
  );
}
```

- `InlineText` takes `mode = "rich"` (`mode?: InlineMode`) and calls `parseInline(text, mode)`, memoised on `[text, mode]`.
- `RichText`'s root `div` gets `data-field="text"`.

In `src/components/grammar/BlockView.tsx`:
- `BlockView` wraps whatever it renders in `<div data-block={block.id}>…</div>`, with the comment: `// \`data-block\` and each field's \`data-field\` name the text a selection was made in; see \`readSelection.ts\`.`
- `TableView`'s `Cell` gets `data-field={\`cell:${r}:${c}\`}`.
- `ExampleView` takes `linkIndex` as well, drops `splitGaps` and renders:

```tsx
      <p data-field="sentence" className="text-slate-900 dark:text-slate-100">
        <InlineText text={example.sentence} linkIndex={linkIndex} mode="sentence" />
      </p>
      {example.translation && (
        <figcaption data-field="translation" className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          <InlineText text={example.translation} linkIndex={linkIndex} mode="plain" />
        </figcaption>
      )}
```

  Move its comment about gaps to the `gap` case in `RichText` (done above) and keep "Set apart from explanation: a left rule and a tint."

- [ ] **Step 5: Run the checks**

Run: `npx tsc --noEmit && npx eslint src/ && npx vitest run`
Expected: all pass. `grep -rn splitGaps src` finds nothing.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "Read highlights, and record where every piece of markup sits"
```

---

### Task 3: Edits to a selection, as plain functions

**Files:**
- Create: `src/lib/selectionEdits.ts`
- Test: `src/lib/selectionEdits.test.ts`

**Interfaces:**
- Consumes: `parseInline`, `parseTextBlock`, `HIGHLIGHT_CODE`, `HighlightColour`, `InlineMode`, `InlineToken` (Task 2); `withCell` from `src/lib/blocks.ts`.
- Produces: `type Field = string`; `type Selected = { blockId: string; field: Field; start: number; end: number }`; `type CellSelection = { blockId: string; top: number; left: number; bottom: number; right: number }`; `isCells(selection: Selected | CellSelection): selection is CellSelection`; `type SelectionPoint = { blockId: string; field: Field; offset: number | null }` (null when the point is in a field but not in its words, as in an empty cell); `type LinkRange = { start: number; end: number; words: string }`; `combinePoints(a, b): Selected | CellSelection | null`; `highlightCells(table: TableBlock, cells: CellSelection, colour): TableBlock | null`; `unhighlightCells(table: TableBlock, cells: CellSelection): TableBlock | null`; `fieldText(block, field): string | null`; `withFieldText(block, field, value): Block`; `addHighlight(text, field, selected, colour): string | null`; `removeHighlight(text, field, selected): string | null`; `linkRange(text, field, selected): LinkRange | null`; `applyLink(text, range, name): string`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/selectionEdits.test.ts
import { describe, expect, it } from "vitest";

import {
  addHighlight,
  applyLink,
  combinePoints,
  fieldText,
  highlightCells,
  linkRange,
  removeHighlight,
  unhighlightCells,
  withFieldText,
} from "@/lib/selectionEdits";
import type { Block, TableBlock } from "@/lib/types";

/** A selection of `words` in `text`, where they first occur. */
const pick = (text: string, words: string, field = "text") => {
  const start = text.indexOf(words);
  if (start === -1) throw new Error(`"${words}" is not in "${text}"`);
  return { blockId: "b", field, start, end: start + words.length };
};
const span = (start: number, end: number, field = "text") => ({ blockId: "b", field, start, end });

describe("combinePoints", () => {
  it("orders the two ends, whichever way the selection was dragged", () => {
    expect(combinePoints({ blockId: "b", field: "text", offset: 9 }, { blockId: "b", field: "text", offset: 3 })).toEqual(
      span(3, 9),
    );
  });

  it("refuses a selection across two blocks, out of a table, or with nothing in it", () => {
    const a = { blockId: "b", field: "cell:0:0", offset: 1 };
    expect(combinePoints(a, { ...a, blockId: "c" })).toBeNull();
    expect(combinePoints(a, { ...a, field: "text" })).toBeNull();
    expect(combinePoints({ ...a, field: "sentence" }, { ...a, field: "translation" })).toBeNull();
    expect(combinePoints(a, a)).toBeNull();
    expect(combinePoints(a, { ...a, offset: null })).toBeNull();
    expect(combinePoints(a, null)).toBeNull();
  });

  it("makes a selection across cells the rectangle between its corners, whichever way it was dragged", () => {
    const at = (field: string, offset: number | null = 0) => ({ blockId: "t", field, offset });
    expect(combinePoints(at("cell:0:1", 2), at("cell:2:1"))).toEqual({ blockId: "t", top: 0, left: 1, bottom: 2, right: 1 });
    expect(combinePoints(at("cell:2:2"), at("cell:0:0", null))).toEqual({ blockId: "t", top: 0, left: 0, bottom: 2, right: 2 });
  });
});

describe("highlighting cells", () => {
  const table: TableBlock = {
    kind: "table",
    id: "t",
    headerRow: true,
    headerColumn: false,
    cells: [
      ["", "m", "f"],
      ["Dat", "==y:dem== Mann", ""],
      ["Akk", "2 == 2", "die"],
    ],
  };
  const column = { blockId: "t", top: 0, left: 1, bottom: 2, right: 1 };

  it("highlights every cell in the rectangle whole, and leaves the rest alone", () => {
    expect(highlightCells(table, column, "purple")?.cells).toEqual([
      ["", "==p:m==", "f"],
      ["Dat", "==p:dem Mann==", ""],
      // Left as typed: wrapping it would close the marker at its own "==".
      ["Akk", "2 == 2", "die"],
    ]);
  });

  it("skips empty cells, and is null when nothing would change", () => {
    const corner = { blockId: "t", top: 0, left: 0, bottom: 0, right: 0 };
    expect(highlightCells(table, corner, "yellow")).toBeNull();
    const done = highlightCells(table, column, "green")!;
    expect(highlightCells(done, column, "green")).toBeNull();
  });

  it("clears every highlight in the rectangle, and is null when there is none", () => {
    const all = { blockId: "t", top: 0, left: 0, bottom: 2, right: 2 };
    expect(unhighlightCells(table, all)?.cells[1][1]).toBe("dem Mann");
    expect(unhighlightCells(table, { blockId: "t", top: 2, left: 0, bottom: 2, right: 2 })).toBeNull();
  });
});

describe("fields", () => {
  const table: Block = { kind: "table", id: "t", headerRow: false, headerColumn: false, cells: [["a", "b"], ["c", "d"]] };
  const example: Block = { kind: "example", id: "e", sentence: "s", translation: "t" };

  it("reads and writes each kind of field", () => {
    expect(fieldText(table, "cell:1:0")).toBe("c");
    expect(withFieldText(table, "cell:1:0", "x")).toMatchObject({ cells: [["a", "b"], ["x", "d"]] });
    expect(fieldText(example, "translation")).toBe("t");
    expect(withFieldText(example, "sentence", "x")).toMatchObject({ sentence: "x", translation: "t" });
    expect(fieldText({ kind: "text", id: "x", text: "hi" }, "text")).toBe("hi");
  });

  it("finds nothing for a field the block does not have", () => {
    expect(fieldText(table, "cell:5:0")).toBeNull();
    expect(fieldText(example, "text")).toBeNull();
  });
});

describe("addHighlight", () => {
  it("wraps the selected words", () => {
    const text = "Der Dativ antwortet auf wem.";
    expect(addHighlight(text, "text", pick(text, "antwortet"), "yellow")).toBe("Der Dativ ==y:antwortet== auf wem.");
  });

  it("leaves out the spaces a double click takes with a word", () => {
    const text = "auf wem und";
    expect(addHighlight(text, "text", pick(text, " wem "), "green")).toBe("auf ==g:wem== und");
  });

  it("takes the whole of bold, a link or a gap it starts or ends inside", () => {
    const text = "Der **Dativ** und [[Fälle|die Fälle]] hier";
    expect(addHighlight(text, "text", span(text.indexOf("tiv"), text.indexOf("die") + 3), "blue")).toBe(
      "Der ==b:**Dativ** und [[Fälle|die Fälle]]== hier",
    );
    const sentence = "Ich gebe {dem} Mann";
    expect(
      addHighlight(sentence, "sentence", span(sentence.indexOf("em"), sentence.indexOf("Mann") + 4, "sentence"), "yellow"),
    ).toBe("Ich gebe ==y:{dem} Mann==");
  });

  it("recolours a highlight the selection is inside", () => {
    const text = "a ==y:Dativ== b";
    expect(addHighlight(text, "text", pick(text, "ati"), "green")).toBe("a ==g:Dativ== b");
  });

  it("counts offsets across the lines of a text block", () => {
    const text = "Erst.\n- zwei **drei**";
    expect(addHighlight(text, "text", pick(text, "zwei"), "yellow")).toBe("Erst.\n- ==y:zwei== **drei**");
  });

  it("refuses what would break a marker, and a selection of only spaces", () => {
    expect(addHighlight("eins\nzwei", "text", span(1, 7), "yellow")).toBeNull();
    expect(addHighlight("==y:a== und ==g:b==", "text", span(4, 16), "blue")).toBeNull();
    const sums = "2 == 2 und x = y";
    expect(addHighlight(sums, "text", pick(sums, "2 == 2"), "yellow")).toBeNull();
    expect(addHighlight(sums, "text", pick(sums, "= y"), "yellow")).toBeNull();
    expect(addHighlight("a   b", "text", pick("a   b", "   "), "yellow")).toBeNull();
  });
});

describe("removeHighlight", () => {
  it("takes the markers off and keeps the words", () => {
    const text = "a ==g:**Dativ** hier== b";
    expect(removeHighlight(text, "text", pick(text, "hier"))).toBe("a **Dativ** hier b");
  });

  it("takes off every highlight the selection touches, and is null when there is none", () => {
    expect(removeHighlight("==y:a== und ==b:c==", "text", span(4, 17))).toBe("a und c");
    expect(removeHighlight("plain", "text", pick("plain", "lai"))).toBeNull();
  });
});

describe("links from a selection", () => {
  it("keeps the words as written, labelling the link when they are not the name", () => {
    const text = "Ich gebe dem Mann";
    expect(applyLink(text, linkRange(text, "text", pick(text, "dem"))!, "Dativ")).toBe("Ich gebe [[Dativ|dem]] Mann");
    const same = "siehe Dativ.";
    expect(applyLink(same, linkRange(same, "text", pick(same, "Dativ"))!, "Dativ")).toBe("siehe [[Dativ]].");
    const cased = "siehe dativ.";
    expect(applyLink(cased, linkRange(cased, "text", pick(cased, "dativ"))!, "Dativ")).toBe("siehe [[Dativ|dativ]].");
  });

  it("links inside a highlight, and in a table cell", () => {
    const text = "==y:gebe dem Mann==";
    expect(applyLink(text, linkRange(text, "text", pick(text, "dem"))!, "Dativ")).toBe("==y:gebe [[Dativ|dem]] Mann==");
    expect(linkRange("dem", "cell:1:2", pick("dem", "dem", "cell:1:2"))).toEqual({ start: 0, end: 3, words: "dem" });
  });

  it("refuses bold, links, brackets, examples and more than one line", () => {
    const text = "**dem** [[Fall]] a [b] c\nd";
    expect(linkRange(text, "text", pick(text, "dem"))).toBeNull();
    expect(linkRange(text, "text", pick(text, "Fall"))).toBeNull();
    expect(linkRange(text, "text", pick(text, "[b]"))).toBeNull();
    expect(linkRange(text, "text", pick(text, "c\nd"))).toBeNull();
    expect(linkRange("gebe dem", "sentence", pick("gebe dem", "dem", "sentence"))).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/lib/selectionEdits.test.ts`
Expected: FAIL, the module does not exist.

- [ ] **Step 3: Implement**

```ts
// src/lib/selectionEdits.ts
/**
 * What the reading view's selection tools do to a rule, as plain string
 * edits: highlight a selection, recolour or remove a highlight, turn a
 * selection into a link, and highlight or clear whole cells of a table. The page maps the reader's selection onto the
 * stored text (`readSelection.ts`); everything that decides what the text
 * becomes lives here, where it can be tested without a browser.
 *
 * One rule runs through all of it: an edit never cuts through markup. A
 * selection that starts or ends inside bold, a link or a gap grows to take
 * the whole of it, and one that cannot be made whole is refused rather than
 * leaving half a marker behind.
 */

import {
  HIGHLIGHT_CODE,
  parseInline,
  parseTextBlock,
  type HighlightColour,
  type InlineMode,
  type InlineToken,
} from "@/lib/blockText";
import { withCell } from "@/lib/blocks";
import type { Block, TableBlock } from "@/lib/types";

/** Which text in a block: `text`, `cell:<row>:<column>`, `sentence` or `translation`. */
export type Field = string;

/** A selection mapped onto one field's stored text, `start` before `end`. */
export type Selected = { blockId: string; field: Field; start: number; end: number };

/** A selection across cells of one table: the rectangle of whole cells between its corners. */
export type CellSelection = { blockId: string; top: number; left: number; bottom: number; right: number };

export const isCells = (selection: Selected | CellSelection): selection is CellSelection => "top" in selection;

/**
 * One end of a selection, as `readSelection` finds it on the page. The
 * offset is null when the end is in a field but not in its words: in an
 * empty cell, or on a cell's edge, which still names the cell.
 */
export type SelectionPoint = { blockId: string; field: Field; offset: number | null };

/** The words a link would be made of, and where they are. */
export type LinkRange = { start: number; end: number; words: string };

type Highlight = Extract<InlineToken, { kind: "highlight" }>;

function cellOf(field: Field): [number, number] | null {
  const match = /^cell:(\d+):(\d+)$/.exec(field);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

/**
 * Both ends in one field: the words between them. Ends in two cells of one
 * table: the rectangle between those cells, whichever corner the drag began
 * at, which is how a row, a column or the whole table is selected. Anything
 * else, nothing: an edit never spans two blocks or two fields of any other
 * kind.
 */
export function combinePoints(a: SelectionPoint | null, b: SelectionPoint | null): Selected | CellSelection | null {
  if (!a || !b || a.blockId !== b.blockId) return null;
  if (a.field === b.field) {
    if (a.offset === null || b.offset === null || a.offset === b.offset) return null;
    return { blockId: a.blockId, field: a.field, start: Math.min(a.offset, b.offset), end: Math.max(a.offset, b.offset) };
  }
  const from = cellOf(a.field);
  const to = cellOf(b.field);
  if (!from || !to) return null;
  return {
    blockId: a.blockId,
    top: Math.min(from[0], to[0]),
    left: Math.min(from[1], to[1]),
    bottom: Math.max(from[0], to[0]),
    right: Math.max(from[1], to[1]),
  };
}

export function fieldText(block: Block, field: Field): string | null {
  if (block.kind === "text") return field === "text" ? block.text : null;
  if (block.kind === "example") {
    return field === "sentence" ? block.sentence : field === "translation" ? block.translation : null;
  }
  if (!field.startsWith("cell:")) return null;
  const [, r, c] = field.split(":").map(Number);
  return block.cells[r]?.[c] ?? null;
}

export function withFieldText(block: Block, field: Field, value: string): Block {
  if (block.kind === "text") return { ...block, text: value };
  if (block.kind === "example") return field === "sentence" ? { ...block, sentence: value } : { ...block, translation: value };
  const [, r, c] = field.split(":").map(Number);
  return withCell(block, r, c, value);
}

function modeOf(field: Field): InlineMode {
  return field === "sentence" ? "sentence" : field === "translation" ? "plain" : "rich";
}

/** The field's top-level tokens, positioned in the whole field's text. */
function tokensOf(text: string, field: Field): InlineToken[] {
  return field === "text" ? parseTextBlock(text).flatMap((line) => line.tokens) : parseInline(text, modeOf(field));
}

/** Spaces at either end are not part of a selection; a double click often takes one. */
function trim(text: string, start: number, end: number): [number, number] {
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  return [start, end];
}

const overlaps = (token: { from: number; to: number }, start: number, end: number) => token.from < end && start < token.to;

function highlightsIn(tokens: InlineToken[], start: number, end: number): Highlight[] {
  return tokens.filter((t): t is Highlight => t.kind === "highlight" && overlaps(t, start, end));
}

/**
 * The text with the selection highlighted in `colour`, or null when that
 * cannot be done cleanly. A selection in one highlight recolours all of it.
 * One that touches bold, a link or a gap takes the whole of it. Refused: a
 * selection over more than one line or more than one highlight, and words
 * holding `==` or starting or ending with `=`, which would close the marker
 * in the wrong place.
 */
export function addHighlight(text: string, field: Field, selected: Selected, colour: HighlightColour): string | null {
  const tokens = tokensOf(text, field);
  let [start, end] = trim(text, selected.start, selected.end);
  if (start === end) return null;

  const touched = highlightsIn(tokens, start, end);
  if (touched.length > 1) return null;
  if (touched.length === 1) {
    const code = touched[0].from + 2;
    return text.slice(0, code) + HIGHLIGHT_CODE[colour] + text.slice(code + 1);
  }

  for (const token of tokens) {
    if (token.kind !== "text" && overlaps(token, start, end)) {
      start = Math.min(start, token.from);
      end = Math.max(end, token.to);
    }
  }
  const words = text.slice(start, end);
  if (words.includes("\n") || words.includes("==") || words.startsWith("=") || words.endsWith("=")) return null;
  return `${text.slice(0, start)}==${HIGHLIGHT_CODE[colour]}:${words}==${text.slice(end)}`;
}

/** The text with every highlight the selection touches taken off, or null when it touches none. */
export function removeHighlight(text: string, field: Field, selected: Selected): string | null {
  const touched = highlightsIn(tokensOf(text, field), selected.start, selected.end);
  if (touched.length === 0) return null;
  // Last first, so taking one off does not move the ones before it.
  let result = text;
  for (const { from, to } of [...touched].reverse()) {
    result = result.slice(0, from) + result.slice(from + 4, to - 2) + result.slice(to);
  }
  return result;
}

/**
 * The words a link would be made of, when the selection lies within plain
 * words of a text block or a table cell, or null. Not over bold, a link or a
 * line break, none of which a link can hold, and not holding a bracket,
 * which would end the link early. Inside a highlight is fine: the link then
 * sits inside it. Examples take no links.
 */
export function linkRange(text: string, field: Field, selected: Selected): LinkRange | null {
  if (modeOf(field) !== "rich") return null;
  const [start, end] = trim(text, selected.start, selected.end);
  if (start === end) return null;
  const leaves = tokensOf(text, field).flatMap((t) => (t.kind === "highlight" ? t.tokens : [t]));
  const home = leaves.find((t) => t.from <= start && end <= t.to);
  if (!home || home.kind !== "text") return null;
  const words = text.slice(start, end);
  return /[[\]]/.test(words) ? null : { start, end, words };
}

/**
 * The selection replaced by a link to `name`, keeping the words as the
 * reader wrote them: `[[name]]` when they are exactly the name, else
 * `[[name|words]]`. Exactly, not folded, since "dativ" linked to "Dativ"
 * would otherwise start showing a capital it was not written with.
 */
export function applyLink(text: string, range: LinkRange, name: string): string {
  const link = range.words === name ? `[[${name}]]` : `[[${name}|${range.words}]]`;
  return text.slice(0, range.start) + link + text.slice(range.end);
}

/** The whole of a cell's text, as a selection, for the edits above. */
const whole = (text: string): Selected => ({ blockId: "", field: "cell", start: 0, end: text.length });

/** The table with `edit` applied to every cell in the rectangle, or null when no cell changed. */
function editCells(table: TableBlock, cells: CellSelection, edit: (text: string) => string | null): TableBlock | null {
  let changed = false;
  const next = table.cells.map((row, r) =>
    row.map((text, c) => {
      if (r < cells.top || r > cells.bottom || c < cells.left || c > cells.right) return text;
      const edited = edit(text);
      if (edited === null || edited === text) return text;
      changed = true;
      return edited;
    }),
  );
  return changed ? { ...table, cells: next } : null;
}

/**
 * Every cell in the rectangle highlighted whole in `colour`, any highlight
 * already in it giving way to the one around all of it. A cell that is empty,
 * or whose words would break the marker, is left as it is rather than
 * refusing the whole selection over one cell.
 */
export function highlightCells(table: TableBlock, cells: CellSelection, colour: HighlightColour): TableBlock | null {
  return editCells(table, cells, (text) => {
    const bare = removeHighlight(text, "cell", whole(text)) ?? text;
    return addHighlight(bare, "cell", whole(bare), colour);
  });
}

/** Every highlight in the rectangle taken off, or null when there was none. */
export function unhighlightCells(table: TableBlock, cells: CellSelection): TableBlock | null {
  return editCells(table, cells, (text) => removeHighlight(text, "cell", whole(text)));
}
```

- [ ] **Step 4: Run the checks**

Run: `npx tsc --noEmit && npx eslint src/ && npx vitest run`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "Work out highlight and link edits for a selection in a rule"
```

---

### Task 4: Highlight from the reading view

**Files:**
- Create: `src/components/grammar/readSelection.ts`, `src/components/grammar/SelectionToolbar.tsx`, `src/components/grammar/ReadingTools.tsx`
- Modify: `src/app/(workspace)/rule/page.tsx`
- Test: `src/components/grammar/SelectionToolbar.test.tsx`

**Interfaces:**
- Consumes: the page contract and `HIGHLIGHT_CLASS` (Task 2); `combinePoints`, `isCells`, `fieldText`, `withFieldText`, `addHighlight`, `removeHighlight`, `highlightCells`, `unhighlightCells`, `Selected`, `CellSelection` (Task 3); `HIGHLIGHT_COLOURS` (Task 2); `updateRule` from `src/lib/rules.ts`.
- Produces: `readSelection(root: HTMLElement): { selected: Selected | CellSelection; rect: DOMRect } | null`; `SelectionToolbar` with props `{ top: number; left: number; onHighlight: ((colour: HighlightColour) => void) | null; onRemove: (() => void) | null; onLink: (() => void) | null; onNewRule: (() => void) | null }`; `ReadingTools({ rule: Rule; children: ReactNode })`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/grammar/SelectionToolbar.test.tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SelectionToolbar } from "@/components/grammar/SelectionToolbar";

describe("SelectionToolbar", () => {
  it("offers only what it is given", () => {
    const html = renderToStaticMarkup(
      <SelectionToolbar top={0} left={0} onHighlight={() => {}} onRemove={null} onLink={null} onNewRule={() => {}} />,
    );
    expect(html).toContain('aria-label="Highlight yellow"');
    expect(html).toContain('aria-label="Highlight green"');
    expect(html).toContain('aria-label="Highlight blue"');
    expect(html).toContain('aria-label="Highlight purple"');
    expect(html).not.toContain("Remove highlight");
    expect(html).not.toContain("Link to");
    expect(html).toContain("New rule from this");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/components/grammar/SelectionToolbar.test.tsx`
Expected: FAIL, the module does not exist.

- [ ] **Step 3: Implement**

```ts
// src/components/grammar/readSelection.ts
import { combinePoints, type CellSelection, type Selected, type SelectionPoint } from "@/lib/selectionEdits";

/**
 * The reader's selection in a rule's reading view, as offsets into one
 * field's stored text, or null. It reads the attributes `BlockView` and
 * `RichText` put on the page: `data-block`, `data-field`, and `data-at` on
 * every element that shows words, which holds one text node whose first
 * character sits at that offset. Nothing here decides what an edit does;
 * that is `selectionEdits.ts`.
 */
export function readSelection(root: HTMLElement): { selected: Selected | CellSelection; rect: DOMRect } | null {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const selected = combinePoints(
    pointAt(range.startContainer, range.startOffset, root, "start"),
    pointAt(range.endContainer, range.endOffset, root, "end"),
  );
  return selected ? { selected, rect: range.getBoundingClientRect() } : null;
}

/**
 * A selection can end on an element rather than in text, between two of its
 * children, as a triple click does. Such an end moves to the nearest text:
 * the start of the child after it, or the end of the child before it.
 */
function textPoint(node: Node, offset: number, side: "start" | "end"): [Text, number] | null {
  if (node.nodeType === Node.TEXT_NODE) return [node as Text, offset];
  const child = side === "start" ? node.childNodes[offset] : node.childNodes[offset - 1];
  if (!child) return null;
  if (child.nodeType === Node.TEXT_NODE) return [child as Text, side === "start" ? 0 : (child as Text).length];
  const walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT);
  if (side === "start") {
    const first = walker.nextNode() as Text | null;
    return first ? [first, 0] : null;
  }
  let last: Text | null = null;
  for (let next = walker.nextNode(); next; next = walker.nextNode()) last = next as Text;
  return last ? [last, last.length] : null;
}

/** The element an end sits in, or, when it sits between children, the child on its side. */
function elementAt(node: Node, offset: number, side: "start" | "end"): Element | null {
  if (node.nodeType === Node.TEXT_NODE) return node.parentElement;
  const child = node.childNodes[side === "start" ? offset : offset - 1];
  if (child instanceof Element) return child;
  return child ? child.parentElement : node instanceof Element ? node : null;
}

/**
 * The field an end is in, and where in its words. An end in an empty cell,
 * or on a cell's edge, has no words to be in, but still names its cell: a
 * selection from one cell to another needs only the cells, and a header
 * corner is often empty.
 */
function pointAt(node: Node, offset: number, root: HTMLElement, side: "start" | "end"): SelectionPoint | null {
  const field = elementAt(node, offset, side)?.closest<HTMLElement>("[data-field]");
  const block = field?.closest<HTMLElement>("[data-block]");
  if (!field || !block || !root.contains(block)) return null;
  const found = textPoint(node, offset, side);
  const leaf = found?.[0].parentElement?.closest<HTMLElement>("[data-at]");
  const inWords = found && leaf && field.contains(leaf);
  return {
    blockId: block.dataset.block ?? "",
    field: field.dataset.field ?? "",
    offset: inWords ? Number(leaf.dataset.at) + found[1] : null,
  };
}
```

```tsx
// src/components/grammar/SelectionToolbar.tsx
"use client";

import type { MouseEvent } from "react";

import { HIGHLIGHT_CLASS } from "@/components/grammar/RichText";
import { HIGHLIGHT_COLOURS, type HighlightColour } from "@/lib/blockText";

/**
 * The buttons below a selection in the reading view. Each is offered only
 * when it can act on this selection: the caller works that out and passes
 * null for the rest. A press must not take the selection away before the
 * click lands, so every button keeps the mouse down from moving focus.
 */
export function SelectionToolbar({
  top,
  left,
  onHighlight,
  onRemove,
  onLink,
  onNewRule,
}: {
  top: number;
  left: number;
  onHighlight: ((colour: HighlightColour) => void) | null;
  onRemove: (() => void) | null;
  onLink: (() => void) | null;
  onNewRule: (() => void) | null;
}) {
  const keep = (event: MouseEvent) => event.preventDefault();
  const button =
    "cursor-pointer rounded px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700";
  return (
    <div
      role="toolbar"
      aria-label="Selection"
      style={{ top, left }}
      className="absolute z-20 flex max-w-full flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-md dark:border-slate-700 dark:bg-slate-800"
    >
      {onHighlight &&
        HIGHLIGHT_COLOURS.map((colour) => (
          <button
            key={colour}
            type="button"
            onMouseDown={keep}
            onClick={() => onHighlight(colour)}
            aria-label={`Highlight ${colour}`}
            title={`Highlight ${colour}`}
            className={`size-6 cursor-pointer rounded-full border border-slate-300 dark:border-slate-600 ${HIGHLIGHT_CLASS[colour]}`}
          />
        ))}
      {onRemove && (
        <button type="button" onMouseDown={keep} onClick={onRemove} className={button}>
          Remove highlight
        </button>
      )}
      {onLink && (
        <button type="button" onMouseDown={keep} onClick={onLink} className={button}>
          Link to…
        </button>
      )}
      {onNewRule && (
        <button type="button" onMouseDown={keep} onClick={onNewRule} className={button}>
          New rule from this
        </button>
      )}
    </div>
  );
}
```

```tsx
// src/components/grammar/ReadingTools.tsx
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { SelectionToolbar } from "@/components/grammar/SelectionToolbar";
import { readSelection } from "@/components/grammar/readSelection";
import { HIGHLIGHT_COLOURS, type HighlightColour } from "@/lib/blockText";
import { updateRule } from "@/lib/rules";
import {
  addHighlight,
  fieldText,
  highlightCells,
  isCells,
  removeHighlight,
  unhighlightCells,
  withFieldText,
  type CellSelection,
  type Selected,
} from "@/lib/selectionEdits";
import type { Block, Rule } from "@/lib/types";

/** A box in this component's own coordinates. */
type Box = { top: number; left: number; width: number; height: number };

/**
 * The selection, where its toolbar goes, and, for a selection across cells,
 * the outline drawn round them.
 */
type Shown = { selected: Selected | CellSelection; top: number; left: number; outline: Box | null };

/**
 * The reading view's tools: select words in a rule, or drag across cells of
 * a table, and a toolbar below the selection highlights them. Every change
 * is an ordinary save of the rule through `updateRule`, the same as Edit's
 * Save, so it is optimistic and a failure is reported in the banner like any
 * other.
 */
export function ReadingTools({ rule, children }: { rule: Rule; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    const onChange = () => {
      const box = root.current;
      const found = box ? readSelection(box) : null;
      if (!box || !found) {
        setShown(null);
        return;
      }
      const frame = box.getBoundingClientRect();
      const outline = isCells(found.selected) ? cellsBox(box, found.selected, frame) : null;
      const below = outline ? outline.top + outline.height : found.rect.bottom - frame.top;
      const from = outline ? outline.left : found.rect.left - frame.left;
      setShown({
        selected: found.selected,
        outline,
        top: below + 8,
        // ponytail: a fixed allowance for the toolbar's width keeps it inside the card near the right edge; measure the toolbar if it ever grows.
        left: Math.max(0, Math.min(from, frame.width - 280)),
      });
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, []);

  function saveBlock(changed: Block) {
    const blocks = rule.blocks.map((block) => (block.id === changed.id ? changed : block));
    updateRule(rule.id, { title: rule.title, topic: rule.topic, blocks });
    document.getSelection()?.removeAllRanges();
    setShown(null);
  }

  const selected = shown?.selected;
  const block = selected ? rule.blocks.find((candidate) => candidate.id === selected.blockId) : undefined;

  let onHighlight: ((colour: HighlightColour) => void) | null = null;
  let onRemove: (() => void) | null = null;

  if (selected && block) {
    if (isCells(selected)) {
      if (block.kind === "table") {
        // Offered when some colour would change some cell: a column already
        // all green still offers the others.
        if (HIGHLIGHT_COLOURS.some((colour) => highlightCells(block, selected, colour) !== null)) {
          onHighlight = (colour) => {
            const next = highlightCells(block, selected, colour);
            if (next) saveBlock(next);
          };
        }
        const cleared = unhighlightCells(block, selected);
        if (cleared) onRemove = () => saveBlock(cleared);
      }
    } else {
      const text = fieldText(block, selected.field);
      if (text !== null) {
        if (addHighlight(text, selected.field, selected, "yellow") !== null) {
          onHighlight = (colour) => {
            const next = addHighlight(text, selected.field, selected, colour);
            if (next !== null) saveBlock(withFieldText(block, selected.field, next));
          };
        }
        const removed = removeHighlight(text, selected.field, selected);
        if (removed !== null) onRemove = () => saveBlock(withFieldText(block, selected.field, removed));
      }
    }
  }

  return (
    // While cells are selected the browser's own selection colour is hidden:
    // it runs in reading order, row by row, and for a column would light up
    // cells outside it. The outline shows what is selected instead.
    <div ref={root} className={`relative ${shown?.outline ? "selection:bg-transparent" : ""}`}>
      {children}
      {shown?.outline && (
        <div
          aria-hidden="true"
          style={shown.outline}
          className="pointer-events-none absolute rounded-sm bg-indigo-500/10 ring-2 ring-indigo-500 dark:ring-indigo-400"
        />
      )}
      {shown && (onHighlight || onRemove) && (
        <SelectionToolbar
          top={shown.top}
          left={shown.left}
          onHighlight={onHighlight}
          onRemove={onRemove}
          onLink={null}
          onNewRule={null}
        />
      )}
    </div>
  );
}

/** The box round the rectangle's two corner cells, which bound every cell between. */
function cellsBox(root: HTMLElement, cells: CellSelection, frame: DOMRect): Box | null {
  const table = root.querySelector(`[data-block="${CSS.escape(cells.blockId)}"]`);
  const first = table?.querySelector(`[data-field="cell:${cells.top}:${cells.left}"]`)?.getBoundingClientRect();
  const last = table?.querySelector(`[data-field="cell:${cells.bottom}:${cells.right}"]`)?.getBoundingClientRect();
  if (!first || !last) return null;
  return { top: first.top - frame.top, left: first.left - frame.left, width: last.right - first.left, height: last.bottom - first.top };
}
```

In `src/app/(workspace)/rule/page.tsx`, import `ReadingTools` and wrap the blocks list:

```tsx
        <ReadingTools rule={rule}>
          <div className="mt-5 space-y-5">
            {rule.blocks.map((block) => (
              <BlockView key={block.id} block={block} linkIndex={linkIndex} />
            ))}
          </div>
        </ReadingTools>
```

- [ ] **Step 4: Run the checks**

Run: `npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build`
Expected: all pass; the route table still lists `/rule` as dynamic, like every workspace page.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "Highlight words in a rule by selecting them"
```

---

### Task 5: Link to… and New rule from this

**Files:**
- Create: `src/components/grammar/LinkToDialog.tsx`
- Modify: `src/components/grammar/AddRuleDialog.tsx`, `src/components/grammar/ReadingTools.tsx`

**Interfaces:**
- Consumes: `linkRange`, `applyLink`, `LinkRange` (Task 3); `suggestRefs` from `src/lib/refSuggestions.ts`; `KIND_LABEL`, `LinkTarget` from `src/lib/links.ts`; `useLinkTargets`; `useSettings`; `Modal`.
- Produces: `LinkToDialog({ targets, words, selfTitle, onPick, onClose })`; `AddRuleDialog` gains optional `initialTitle?: string`, `initialTopic?: string`, `onCreated?: (rule: Rule) => void`.

- [ ] **Step 1: The dialog**

```tsx
// src/components/grammar/LinkToDialog.tsx
"use client";

import { useId, useState } from "react";

import { Modal } from "@/components/Modal";
import { KIND_LABEL, type LinkTarget } from "@/lib/links";
import { suggestRefs } from "@/lib/refSuggestions";

/**
 * Searches every rule, verb table, word and phrase for what the selected
 * words should link to, starting from the words themselves, since they are
 * most often the name. The suggestion search the Ref field uses, so the two
 * offer the same names in the same order. A name holding a bar is left out:
 * `[[a|b]]` reads as the name "a" shown as "b".
 */
export function LinkToDialog({
  targets,
  words,
  selfTitle,
  onPick,
  onClose,
}: {
  targets: readonly LinkTarget[];
  words: string;
  /** The rule being read, which a link from itself would only lead back to. */
  selfTitle: string;
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  const inputId = useId();
  const [query, setQuery] = useState(words);
  const found = suggestRefs(targets, query, [selfTitle], undefined, "rule").filter((s) => !s.name.includes("|"));

  return (
    <Modal title="Link to" onClose={onClose}>
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium">
        Search
      </label>
      <input id={inputId} type="search" className="field" value={query} autoFocus onChange={(event) => setQuery(event.target.value)} />
      {found.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Nothing saved matches that.</p>
      ) : (
        <ul className="mt-3 space-y-1">
          {found.map((suggestion) => (
            <li key={`${suggestion.kind}:${suggestion.name}`}>
              <button
                type="button"
                className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => onPick(suggestion.name)}
              >
                <span>{suggestion.name}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{KIND_LABEL[suggestion.kind]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
```

- [ ] **Step 2: The new rule dialog takes a starting title and topic**

In `src/components/grammar/AddRuleDialog.tsx`:
- Props become `{ topics, onClose, initialTitle = "", initialTopic = "", onCreated }`, typed with `initialTitle?: string; initialTopic?: string;` and `/** Given the new rule instead of opening it, for a rule made from a selection, whose reader stays where they are. */ onCreated?: (rule: Rule) => void;` (import `type Rule` from `@/lib/types`).
- `useState(initialTitle)` and `useState(initialTopic)`.
- On submit: `const rule = createRule({ title, topic }); if (onCreated) onCreated(rule); else router.push(\`/rule?id=${rule.id}&edit=1\`); onClose();`
- The submit button reads `{onCreated ? "Create" : "Create and write it"}`.
- Update the component comment: from the Grammar page it makes the empty rule and opens it in Edit mode; from a selection it hands the rule back and the reader stays on the page.

- [ ] **Step 3: Wire both into ReadingTools**

In `src/components/grammar/ReadingTools.tsx`:
- Import `AddRuleDialog`, `LinkToDialog`, `useLinkTargets` from `@/lib/useLinkTargets`, `useSettings` from `@/lib/useSettings`, and `applyLink, linkRange, type LinkRange` from `@/lib/selectionEdits`.
- Extend the component comment: "and Link to… and New rule from this turn them into a link".
- Add state and hooks:

```tsx
  const { targets } = useLinkTargets();
  const { settings } = useSettings();
  /**
   * Held apart from `shown` because opening a dialog moves focus, which
   * clears the page's selection and with it `shown`; the dialog still needs
   * to know what was selected.
   */
  const [dialog, setDialog] = useState<{ kind: "link" | "rule"; selected: Selected; range: LinkRange } | null>(null);
```

- Add the link action, and compute it in the text branch, inside `if (text !== null)` after `onRemove` (a selection across cells offers neither):

```tsx
  function link(chosen: { selected: Selected; range: LinkRange }, name: string) {
    const target = rule.blocks.find((candidate) => candidate.id === chosen.selected.blockId);
    const current = target ? fieldText(target, chosen.selected.field) : null;
    if (target && current !== null) saveBlock(withFieldText(target, chosen.selected.field, applyLink(current, chosen.range, name)));
  }
```

```tsx
    const range = linkRange(text, selected.field, selected);
    if (range) {
      onLink = () => setDialog({ kind: "link", selected, range });
      onNewRule = () => setDialog({ kind: "rule", selected, range });
    }
```

  with `let onLink: (() => void) | null = null;` and `let onNewRule: (() => void) | null = null;` declared beside `onRemove`.
- The toolbar renders when any of the four is set, and receives `onLink={onLink}` and `onNewRule={onNewRule}`.
- After the toolbar:

```tsx
      {dialog?.kind === "link" && (
        <LinkToDialog
          targets={targets}
          words={dialog.range.words}
          selfTitle={rule.title}
          onPick={(name) => {
            link(dialog, name);
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "rule" && (
        <AddRuleDialog
          topics={settings.topics}
          initialTitle={dialog.range.words}
          initialTopic={rule.topic}
          onCreated={(created) => link(dialog, created.title)}
          onClose={() => setDialog(null)}
        />
      )}
```

- [ ] **Step 4: Run the checks**

Run: `npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "Link selected words, or start a new rule from them"
```

---

### Task 6: Highlights in Edit mode

**Files:**
- Modify: `src/lib/blockText.ts` (add `highlightRuns`), `src/components/grammar/BlockEditor.tsx`
- Create: `src/components/grammar/MarkedField.tsx`
- Test: `src/lib/blockText.test.ts`, `src/components/grammar/MarkedField.test.tsx`

**Interfaces:**
- Consumes: `HIGHLIGHT`, `COLOUR_BY_CODE`, `HighlightColour` inside `blockText.ts`; `HIGHLIGHT_CLASS` (Task 2).
- Produces: `highlightRuns(text: string): { text: string; marker?: true; colour?: HighlightColour }[]`; `MarkedField({ id, value, onChange, className, multiline?, placeholder? })`.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/blockText.test.ts` (and import `highlightRuns`):

```ts
describe("highlightRuns", () => {
  it("cuts the text at its markers, keeping every character", () => {
    expect(highlightRuns("a ==g:b== c")).toEqual([
      { text: "a " },
      { text: "==g:", marker: true },
      { text: "b", colour: "green" },
      { text: "==", marker: true },
      { text: " c" },
    ]);
    for (const text of ["", "x == y", "==y:a==\n- ==b:c==", "==y:open"]) {
      expect(highlightRuns(text).map((run) => run.text).join("")).toBe(text);
    }
  });
});
```

```tsx
// src/components/grammar/MarkedField.test.tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarkedField } from "@/components/grammar/MarkedField";

const html = (value: string) =>
  renderToStaticMarkup(<MarkedField id="f" value={value} onChange={() => {}} className="field" />);

describe("MarkedField", () => {
  it("tints a highlight behind the box and greys its markers", () => {
    const markup = html("a ==y:b== c");
    expect(markup).toMatch(/<mark class="[^"]*bg-yellow-200[^"]*">b<\/mark>/);
    expect(markup).toContain('<span class="text-slate-400 dark:text-slate-500">==y:</span>');
    expect(markup).toContain("text-transparent!");
  });

  it("leaves a box without highlights drawing its own text", () => {
    const markup = html("x == y");
    expect(markup).not.toContain("text-transparent!");
    expect(markup).toContain("invisible");
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/lib/blockText.test.ts src/components/grammar/MarkedField.test.tsx`
Expected: FAIL, neither exists.

- [ ] **Step 3: Implement**

Add to `src/lib/blockText.ts`, after `parseTextBlock`:

```ts
/**
 * The text cut at its highlights' markers, every character kept, for Edit
 * mode, which shows the markers faintly and tints what they hold. The whole
 * text at once: a highlight never crosses a line, so lines need no splitting.
 */
export function highlightRuns(text: string): { text: string; marker?: true; colour?: HighlightColour }[] {
  return text.split(HIGHLIGHT).flatMap((piece, i) => {
    if (!piece) return [];
    if (i % 2 === 0) return [{ text: piece }];
    return [
      { text: piece.slice(0, 4), marker: true as const },
      { text: piece.slice(4, -2), colour: COLOUR_BY_CODE[piece[2]] },
      { text: "==", marker: true as const },
    ];
  });
}
```

```tsx
// src/components/grammar/MarkedField.tsx
"use client";

import { useRef, type UIEvent } from "react";

import { HIGHLIGHT_CLASS } from "@/components/grammar/RichText";
import { highlightRuns } from "@/lib/blockText";

/**
 * A text box that shows its highlights, as the owner chose on 28 September:
 * tinted, with the markers in faint grey. A textarea or input cannot colour
 * part of its own text, so a copy of the text is drawn behind it, and the
 * box's own letters are made transparent over the copy; the caret and the
 * selection stay the box's. Both are drawn from one class list so the
 * letters line up, and the copy follows the box when it scrolls.
 *
 * The copy is always in the page, only hidden when there is no highlight, so
 * that one appearing or going while typing changes a class rather than the
 * element, and the caret stays where it was.
 */
export function MarkedField({
  id,
  value,
  onChange,
  className,
  multiline = false,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  className: string;
  multiline?: boolean;
  placeholder?: string;
}) {
  const behind = useRef<HTMLDivElement>(null);
  const runs = highlightRuns(value);
  const marked = runs.some((run) => run.marker);
  const follow = (event: UIEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (!behind.current) return;
    behind.current.scrollTop = event.currentTarget.scrollTop;
    behind.current.scrollLeft = event.currentTarget.scrollLeft;
  };
  const shared = `${className} ${multiline ? "whitespace-pre-wrap break-words" : "whitespace-pre"}`;
  const own = `${shared} relative ${marked ? "bg-transparent! text-transparent! caret-slate-900 dark:caret-slate-100" : ""}`;

  return (
    <div className="relative">
      <div
        ref={behind}
        aria-hidden="true"
        className={`${shared} pointer-events-none absolute inset-0 overflow-hidden border-transparent! ${marked ? "" : "invisible"}`}
      >
        {runs.map((run, index) =>
          run.marker ? (
            <span key={index} className="text-slate-400 dark:text-slate-500">{run.text}</span>
          ) : run.colour ? (
            <mark key={index} className={`rounded-sm text-inherit ${HIGHLIGHT_CLASS[run.colour]}`}>{run.text}</mark>
          ) : (
            <span key={index}>{run.text}</span>
          ),
        )}
        {/* A final line break takes no room in the copy unless something follows it. */}
        {multiline && value.endsWith("\n") ? " " : null}
      </div>
      {multiline ? (
        <textarea id={id} className={own} value={value} placeholder={placeholder} onScroll={follow} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input id={id} className={own} value={value} placeholder={placeholder} onScroll={follow} onChange={(event) => onChange(event.target.value)} />
      )}
    </div>
  );
}
```

In `src/components/grammar/BlockEditor.tsx`, import `MarkedField` and replace the three kinds of box:
- Text block: `<MarkedField id={inputId} multiline className="field min-h-28 font-mono text-sm [field-sizing:content]" value={block.text} onChange={(text) => onChange({ ...block, text })} placeholder="Explain the rule. **bold**, *italic*, lines starting with - for bullets, [[Name]] to link." />` (the placeholder it has today). `[field-sizing:content]` is new: the box grows with its text instead of scrolling, since a scrollbar in the box that the copy behind it lacks would shift where lines wrap. Say so in a comment.
- Table cell: `<MarkedField id={\`${inputId}-${r}-${c}\`} className={\`field min-w-24 max-w-xl py-1 [field-sizing:content] ${isHeader ? "font-semibold" : ""}\`} value={cell} onChange={(value) => onChange(withCell(block, r, c, value))} />`, keeping the comment about sizing to what is typed.
- Example sentence and translation: `<MarkedField id={…} className="field" value={block.sentence} onChange={(sentence) => onChange({ ...block, sentence })} />` and the same for `translation`.

- [ ] **Step 4: Run the checks**

Run: `npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build`
Expected: all pass, `RuleEditor.test.tsx` included.

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "Show highlights while editing a rule"
```

---

### Task 7: Record it, and check it in the browser

**Files:**
- Modify: `Docs/grammar.md`

- [ ] **Step 1: Amend the design**

In `Docs/grammar.md`:
- The status line: stages 1 to 3 are built; stages 4 and 5 remain.
- "Blocks", Text: add `==y:highlighted words==` to the markup list, and `[[Name|shown words]]` beside `[[links]]`.
- "Reading and editing": colours are yellow, green, blue and purple, with the reason (blue replaced pink on 28 September, since red, rose and pink are kept for warnings, and the owner added purple the same day); markers are `==y:…==`, `==g:…==`, `==b:…==`, `==p:…==`; a selection across table cells covers the rectangle between its corner cells, so a row, a column or the whole table can be highlighted or cleared at once, with an outline drawn in place of the browser's row-by-row selection; Edit mode shows the markers in faint grey with a tint behind them (the owner's choice on 28 September, over invisible markers or a rich text editor, both turned down for their cost); examples take highlights but not links; outside a table, a selection works within one field and one line; Link to… keeps the selected words, writing `[[Name|words]]` when they are not the name; New rule from this asks for the title and topic, starting from the words and this rule's topic.
- "Links": a link may carry the words it shows, `[[Dativ|dem]]`; renaming the target keeps them.
- "Build order": mark stage 3 built.

Scan the file for U+2014 and U+2013 afterwards.

- [ ] **Step 2: Commit**

```bash
git add Docs/grammar.md
git commit -m "Record the grammar reading tools in the design"
```

- [ ] **Step 3: Browser check (controller, not a subagent)**

With `npm run dev` on port 3000 and the Playwright MCP browser, signed in as the test account in `.env.local` (`E2E_EMAIL`, `E2E_PASSWORD`), never the owner's own account: add a topic in Settings, a rule with a text block, a table and an example; in the reading view, highlight across bold in all four colours, recolour, remove; drag down a column starting in an empty header corner, along a row, and from the first cell to the last, and check the outline covers exactly those cells and highlighting colours them whole; triple-click a single cell and note what it selects; link a word to another rule (the label shows the selected word), and make a new rule from a selection; open Edit and see the tint and the faint markers line up with the letters, in light and dark. Delete what was made, topic included, so the test account ends as it started.

- [ ] **Step 4: Update `HANDOFF.md`**

Stage 3 built; branch and commits; `splitGaps` is gone, and stage 5 reads gaps as `gap` tokens from `parseInline(sentence, "sentence")`, which also skips highlight markers; the rulings reported to the owner.
