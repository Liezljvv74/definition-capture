import { plainText } from "@/lib/blockText";
import { foldName } from "@/lib/foldName";
import { LINK_CHARS } from "@/lib/rules";
import type { Block, Rule } from "@/lib/types";

/** A rule whose text mentions what was searched for, and where. */
export type RuleMatch = { title: string; snippet: string; hits: number };

/** How many rules the Link to dialog lists under the name matches. */
const MATCH_LIMIT = 8;
/** Characters of context either side of the first hit in a snippet. */
const CONTEXT = 40;

/** One block as the words a reader sees, markup and practice braces removed. */
function blockWords(block: Block): string {
  switch (block.kind) {
    case "text":
      return plainText(block.text);
    case "table":
      return block.cells.flat().map(plainText).join(" ");
    case "example":
      return `${block.sentence.replace(/[{}]/g, "")} ${block.translation}`;
  }
}

/**
 * Rules whose title or text mentions any of the words searched for, for the
 * Link to dialog: a rule about the selected words is often not named after
 * them. Rules mentioning more of the words come first. Matching ignores
 * capitals, as names do everywhere in the app (`foldName`), but not accents,
 * which carry meaning in the languages being learned. A word must be two
 * letters or more, since one letter matches nearly every rule.
 */
export function searchRules(rules: readonly Rule[], query: string, selfTitle: string): RuleMatch[] {
  const words = [...new Set(foldName(query).split(/[\s,.;:!?()"]+/).filter((word) => word.length >= 2))];
  if (words.length === 0) return [];
  const self = foldName(selfTitle);

  const matches: RuleMatch[] = [];
  for (const rule of rules) {
    // A link to the rule being read only leads back to it, and a name holding
    // `|`, `[` or `]` cannot be written as a link at all.
    if (foldName(rule.title) === self || LINK_CHARS.test(rule.title)) continue;
    const text = [rule.title, ...rule.blocks.map(blockWords)].join(" ").replace(/\s+/g, " ");
    const folded = foldName(text);
    const found = words.filter((word) => folded.includes(word));
    if (found.length === 0) continue;

    const at = folded.indexOf(found[0]);
    const start = Math.max(0, at - CONTEXT);
    const end = Math.min(text.length, at + found[0].length + CONTEXT);
    const snippet = `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
    matches.push({ title: rule.title, snippet, hits: found.length });
  }

  return matches
    .sort((a, b) => b.hits - a.hits || a.title.localeCompare(b.title))
    .slice(0, MATCH_LIMIT);
}
