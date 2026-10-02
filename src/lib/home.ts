/**
 * What the dashboard at /home shows, worked out from the rows the server
 * loads. Pure and free of any Supabase or React import, so the decisions it
 * makes (which state the review card is in, what "yesterday" means) are tested
 * on their own, and so a server component and a client component can both use
 * it.
 */

/** One row of `home_summary()`, in the app's spelling. */
export type HomeSummary = {
  words: number;
  wordsWithoutDefinition: number;
  phrases: number;
  verbTables: number;
  grammarRules: number;
  due: number;
  newItems: number;
  learning: number;
  learned: number;
  nextDueAt: string | null;
  lastSavedAt: string | null;
  rememberId: string | null;
};

const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const text = (value: unknown) => (typeof value === "string" && value !== "" ? value : null);

/** A missing row reads as an empty account rather than throwing. */
export function readSummary(row: unknown): HomeSummary {
  const r = (row ?? {}) as Record<string, unknown>;
  return {
    words: count(r.words),
    wordsWithoutDefinition: count(r.words_without_definition),
    phrases: count(r.phrases),
    verbTables: count(r.verb_tables),
    grammarRules: count(r.grammar_rules),
    due: count(r.due),
    newItems: count(r.new_items),
    learning: count(r.learning),
    learned: count(r.learned),
    nextDueAt: text(r.next_due_at),
    lastSavedAt: text(r.last_saved_at),
    rememberId: text(r.remember_id),
  };
}

export type ReviewState =
  | { kind: "due"; count: number }
  | { kind: "new"; count: number }
  | { kind: "caughtUp"; next: string | null }
  | { kind: "noCards" }
  | { kind: "empty" };

/**
 * Which of the review card's five faces to show. Due cards come first because
 * they are the ones forgetting is working on; new items only when nothing is
 * due, so a big backlog of new words never hides a review that is overdue.
 */
export function reviewState(s: HomeSummary, now: Date): ReviewState {
  if (s.due > 0) return { kind: "due", count: s.due };
  if (s.newItems > 0) return { kind: "new", count: s.newItems };
  if (s.learning + s.learned > 0) {
    return { kind: "caughtUp", next: s.nextDueAt ? relativeDay(s.nextDueAt, now) : null };
  }
  const items = s.words + s.phrases + s.verbTables + s.grammarRules;
  return items > 0 ? { kind: "noCards" } : { kind: "empty" };
}

/** Shown on the review card when there is nothing to review. */
export const QUOTES: { text: string; by: string }[] = [
  { text: "To learn a new language is to have one more window from which to look at the world", by: "Chinese proverb" },
  { text: "A different language is a different vision of life", by: "Federico Fellini" },
  {
    text: "Start with high frequency vocabulary - begin by learning the most common words. They're the foundation of most everyday language",
    by: "Gabriel Wyner, Fluent Forever",
  },
  {
    text: "Learn through context, not translation - Understand words and phrases in context rather than translating them word-for-word.",
    by: "Luca Lampariello, Polyglot",
  },
  { text: "Grammar is the logic of speech, even if it sometimes feels as learning to dance by mail", by: "Anonymous" },
];

/**
 * Rotates by the second so a different quote can appear on each visit. It takes
 * the time as an argument, and the page calls it on the server, so the client
 * never picks one and cannot disagree with the markup it hydrates.
 */
export function quoteFor(now: Date): (typeof QUOTES)[number] {
  return QUOTES[Math.floor(now.getTime() / 1000) % QUOTES.length];
}

const DAY_MS = 86_400_000;
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/**
 * "today", "yesterday", "3 days ago", "tomorrow", "in 3 days": whole calendar
 * days between the two dates, so 23:50 last night is yesterday at 00:10.
 *
 * ponytail: days are counted in UTC because this runs on the server, which
 * does not know the reader's time zone. Near midnight a reader far from UTC
 * can see "yesterday" for something saved this morning; pass the zone in from
 * a cookie if anyone ever notices.
 */
export function relativeDay(iso: string, now: Date): string {
  const day = (d: Date) => Math.floor(d.getTime() / DAY_MS);
  const days = day(new Date(iso)) - day(now);
  if (days === 0 && new Date(iso).getTime() > now.getTime()) return "later today";
  return relative.format(days, "day");
}

export type ProgressPart = {
  label: "New" | "Learning" | "Learned";
  count: number;
  percent: number;
  className: string;
};

/** The three parts of the progress bar, pale to navy, in the app's palette. */
export function progressParts(s: HomeSummary): ProgressPart[] {
  const total = s.newItems + s.learning + s.learned;
  const share = (n: number) => (total === 0 ? 0 : (n / total) * 100);
  return [
    { label: "New", count: s.newItems, percent: share(s.newItems), className: "bg-flashcard" },
    { label: "Learning", count: s.learning, percent: share(s.learning), className: "bg-indigo-400" },
    { label: "Learned", count: s.learned, percent: share(s.learned), className: "bg-flashcard-frame" },
  ];
}

export type RecentItem = {
  id: string;
  itemType: string;
  title: string;
  collection: string | null;
  createdAt: string;
};

/**
 * A recently captured item, from the same embed the lists use
 * (`item_tags(position, context, tags(name))`). Only the first collection is
 * shown, and a grammar rule's topic is a tag too, so the context matters.
 */
export function readRecent(row: Record<string, unknown>): RecentItem {
  const links = Array.isArray(row.item_tags) ? (row.item_tags as Record<string, unknown>[]) : [];
  const first = links
    .filter((link) => link.context === "collection")
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map((link) => (link.tags as { name?: unknown } | null)?.name)
    .find((name): name is string => typeof name === "string");
  return {
    id: String(row.id),
    itemType: String(row.item_type),
    title: String(row.title),
    collection: first ?? null,
    createdAt: String(row.created_at),
  };
}

/**
 * The "do you still remember" item, in the columns `cardBack` reads. The
 * meaning is worked out in the client component that reveals it, because
 * `cardBack` lives in the client-only flashcards module.
 */
export type RememberItem = {
  id: string;
  item_type: string;
  title: string;
  definition: string | null;
  literal_meaning: string | null;
  usage_example: string | null;
  tenses: string[] | null;
  verb_rows: unknown;
};

export function readRemember(row: unknown): RememberItem | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const maybe = (value: unknown) => (typeof value === "string" ? value : null);
  return {
    id: String(r.id),
    item_type: String(r.item_type),
    title: String(r.title),
    definition: maybe(r.definition),
    literal_meaning: maybe(r.literal_meaning),
    usage_example: maybe(r.usage_example),
    tenses: Array.isArray(r.tenses) ? (r.tenses as string[]) : null,
    verb_rows: r.verb_rows ?? null,
  };
}

const LABELS: Record<string, string> = {
  word: "Vocabulary",
  phrase: "Phrases",
  verb_table: "Verb table",
  grammar: "Grammar",
};

export function typeLabel(itemType: string): string {
  return LABELS[itemType] ?? itemType;
}

/** Where an item lives. A verb table has no page of its own; Verbs opens it by name. */
export function itemHref(item: { id: string; itemType: string; title: string }): string {
  switch (item.itemType) {
    case "word":
      return `/word/?id=${item.id}`;
    case "phrase":
      return `/phrase/?id=${item.id}`;
    case "grammar":
      return `/rule/?id=${item.id}`;
    default:
      return `/verbs/?verb=${encodeURIComponent(item.title)}`;
  }
}

/** "1 word", "2 words": the count and its noun, so no caller repeats the ternary. */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
