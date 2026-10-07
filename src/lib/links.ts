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

/**
 * All four lists as targets, in the precedence order given by LINK_ORDER.
 * Precedence is determined by position in LINK_ORDER, not by position in the
 * returned array.
 */
export function linkTargets(
  entries: readonly Entry[],
  phrases: readonly Phrase[],
  tables: readonly VerbTable[],
  rules: readonly Rule[],
): LinkTarget[] {
  const byKind: Record<LinkKind, LinkTarget[]> = {
    rule: rules.map((r) => ({ kind: "rule" as const, id: r.id, name: r.title, href: `/rule?id=${r.id}`, texts: blockTexts(r.blocks) })),
    verb_table: tables.map((t) => ({ kind: "verb_table" as const, id: t.id, name: t.verb, href: `/verbs?verb=${encodeURIComponent(t.verb)}`, texts: [t.ref] })),
    word: entries.map((e) => ({ kind: "word" as const, id: e.id, name: e.word, href: `/word?id=${e.id}`, texts: [e.ref] })),
    phrase: phrases.map((p) => ({ kind: "phrase" as const, id: p.id, name: p.phrase, href: `/phrase?id=${p.id}`, texts: [p.ref] })),
  };
  return LINK_ORDER.flatMap((kind) => byKind[kind]);
}

/**
 * Index from folded names to hrefs. Input targets must be in LINK_ORDER
 * (which linkTargets ensures). Reverses them so lower-precedence kinds set
 * their entries first and higher-precedence kinds overwrite on clash.
 */
export function buildLinkIndex(targets: readonly LinkTarget[]): LinkIndex {
  const index: LinkIndex = new Map();
  for (const target of [...targets].reverse()) index.set(foldName(target.name), target.href);
  return index;
}

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

/** `[[Name]]` and `[[Name|words]]` for a deleted `name` become plain text: the shown words, else the name. */
export function unlinkIn(text: string, name: string): string {
  const gone = foldName(name);
  return text.replace(LINK, (whole, inner: string) => {
    const { name: linked, label } = linkParts(inner);
    return foldName(linked) === gone ? label || linked : whole;
  });
}

/** A line made only of links after "See also", as the tutor's save writes one (`withSeeAlso`). */
const SEE_ALSO = /^See also ((?:\[\[[^[\]\n]+\]\](?:, )?)+)\.$/;

/**
 * A text without the links to a deleted `name`. On a "See also" line the
 * name is taken out of the list rather than left as plain words, as the line
 * would otherwise name a rule that is gone; null when nothing is left of it.
 */
function withoutLink(text: string, name: string): string | null {
  const seeAlso = SEE_ALSO.exec(text.trim());
  if (!seeAlso) return unlinkIn(text, name);
  const gone = foldName(name);
  const kept = [...seeAlso[1].matchAll(LINK)].filter((m) => foldName(linkParts(m[1]).name) !== gone).map((m) => m[0]);
  return kept.length ? `See also ${kept.join(", ")}.` : null;
}

/** `to` null: `from` was deleted, so its links lose their link (`withoutLink`). */
function renameInBlocks(blocks: Block[], from: string, to: string | null): Block[] {
  const fix = (text: string) => (to === null ? unlinkIn(text, from) : renameLinksIn(text, from, to));
  return blocks.flatMap((block): Block[] => {
    if (block.kind === "text") {
      const text = to === null ? withoutLink(block.text, from) : renameLinksIn(block.text, from, to);
      return text === null ? [] : [{ ...block, text }];
    }
    if (block.kind === "table") return [{ ...block, cells: block.cells.map((row) => row.map(fix)) }];
    return [block];
  });
}

/**
 * The items whose links must change after the item `id` of `kind` was renamed
 * from `from` to `to`: only those that changed, ready for each store's
 * `updateMany`. Nothing when the names fold the same, since every link
 * already resolves, and nothing when a higher-precedence item of another kind
 * owns `from`, since those links pointed there all along.
 *
 * `to` null means the item was deleted (the owner's rule, 7 October 2026: a
 * deleted rule must leave no link behind). Its links lose their link, unless
 * another item still has the name, in which case they lead there. Pass lists
 * that no longer hold the deleted item, so it is never written back.
 */
export function planLinkRewrites(
  lists: { entries: readonly Entry[]; phrases: readonly Phrase[]; tables: readonly VerbTable[]; rules: readonly Rule[] },
  kind: LinkKind,
  id: string,
  from: string,
  to: string | null,
) {
  const none = { entries: [] as Entry[], phrases: [] as Phrase[], tables: [] as VerbTable[], rules: [] as Rule[] };
  if (to !== null && foldName(from) === foldName(to)) return none;
  const rank = LINK_ORDER.indexOf(kind);
  const outranked = linkTargets(lists.entries, lists.phrases, lists.tables, lists.rules).some(
    (t) =>
      t.id !== id &&
      foldName(t.name) === foldName(from) &&
      // A deleted name still in use anywhere keeps its links; a renamed one only for a higher kind.
      (to === null || LINK_ORDER.indexOf(t.kind) < rank),
  );
  if (outranked) return none;

  const changedRef = <T extends { ref: string }>(items: readonly T[]) =>
    items.flatMap((item) => {
      const ref = to === null ? unlinkIn(item.ref, from) : renameLinksIn(item.ref, from, to);
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
 * "3 rules and 2 words link to Dativ. Those links will be removed.", or
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
  return `${list} ${verb} to ${what}. Those links will be removed.`;
}
