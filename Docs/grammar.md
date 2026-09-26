# Design: grammar rules

The design of record for the grammar feature. Stage 1 of the build order below is built; stages 2 to 5 are not. It
was worked out question by question before any code was written, because the
first grammar page (added on 20 September, removed the next day in `fbaa483`)
was taken out for want of a clear approach, not for want of need. Each section
records what was decided and, where it matters, the alternative that was
turned down.

Reviewed on 26 September against the database refactor of the day before
(`Docs/db-refactor-plan.md`). Every decision below stood; what changed is the
Data section, which now names the tables and functions that exist, and the
word for a rule's grouping, which is Topic: "category" was retired from the
app in the refactor, and a rule's one grouping is not a Collection either.

**Stage 1 is built** (26 September 2026): rules, blocks, the reading view and Edit, topics in Settings, the tab, the home card, backup and export. Stages 2 to 5 remain.

The feature is for the account owner's own study. Its purpose is to record
grammar rules in a structured way, link concepts to each other and to the
existing lists, and see the language learned as a whole.

---

## Rules

One rule is one entry. A **Grammar** list page shows every rule, and each rule
has its own page, the same pairing as Vocabulary and a single word. One long
document per language was rejected: it gives a concept nothing to link to or
from, and there would be nothing to draw a map with.

Grammar sits after Verbs in the navigation and gets a fourth list card on the
home page, beside Verbs.

Each rule has a **title**, unique per account, since links find their target by
title. It has one **topic** from its own list of grammar topics, managed in
Settings. Sharing the collections list with words and phrases was rejected:
"Food" and "Cases" do not belong in the same picker, and the map colours rules
by topic.

## Blocks

A rule's content is an ordered stack of blocks, not a fixed set of sections.
Real grammar notes alternate between explanation and tables, and a fixed
layout leaves empty sections on rules that do not need them.

The first version has three block types:

- **Text.** Line breaks, `**bold**`, `*italic*`, bullet lists written as
  `- item`, and `[[links]]`. Rendered by the app's own code; no markdown or
  rich text library is installed, and this small set does not justify one.
- **Table.** A free grid: rows and columns added and removed at will, with an
  optional header row and an optional header column. Cells accept links, bold
  and italic, so a case table can link "dem" to the rule that explains it.
- **Example.** A sentence in the language with its translation underneath,
  styled to stand apart from explanation. Gap words are marked in braces,
  `Ich gebe {dem} Mann das Buch`, and are what practice blanks out. An example
  may mark several gaps.

Blocks are reordered by a drag handle, and also by Move up and Move down in
each block's menu, so reordering works from a keyboard and on a phone.

**Freehand drawing** is planned as a later block type. The blocks are stored
together as one JSON array on the rule (see Data), so a new block type is a
new shape in that array, not a schema change.

## Reading and editing

A rule opens in a **reading view** with an Edit button. Rules are read far more
often than they are written, and links, tables and formatting read best
rendered. In Edit mode each block shows its own controls.

The reading view is not inert. Selecting text offers:

- **Highlight** in yellow, green or pink, and Remove highlight on text already
  marked. The app gives the colours no meaning; the reader decides. Highlights
  work in text blocks, examples and table cells. They are stored inside the
  text as markup rather than as character offsets, so editing the words around
  a highlight cannot make it drift. In Edit mode they show as highlighted text,
  not as raw markers.
- **Link to…**, which searches every rule, word, phrase and verb table and
  turns the selection into a link.
- **New rule from this**, which creates an empty rule titled with the
  selection, links the selection to it, and keeps the reader on the page. The
  empty rule appears on the map with a marker, so named but unwritten concepts
  become a visible to-do list.

## Links

The existing `[[Name]]` syntax, written in `ref` text and resolved by title
when shown (`src/lib/parseRef.ts`, `src/components/RefText.tsx`), becomes the
one way to link everywhere. A separate "Related" field was rejected: two
mechanisms are harder to learn than one, and a link written in the sentence
that explains it carries its reason with it.

What changes:

- **Rules and verb tables become link targets.** Today only words and phrases
  can be. The suggestion box in `RefField` offers all four types.
- **Verb tables get a notes field** that renders links, as words and phrases
  have. It is the `ref` column every item already carries; the verb table
  store simply starts sending and showing it.
- **Shared names.** Today a word wins over a phrase with the same title. With
  four types, clashes get likelier ("sein" the verb table and "sein" the word).
  When a target is picked from the suggestion box and its name is shared, the
  link records which item was meant; it still reads as normal text. Unshared
  names stay plain `[[Name]]`, and a plain link to a shared name falls back to
  the existing order. A fixed order alone was rejected because the right target
  depends on the sentence: "see [[sein]]" in a grammar rule means the table.
- **Renames update links.** Renaming any item rewrites every `[[Old name]]` that
  points at it, for all four types. Today a rename silently turns incoming
  links into dotted text; since the map is drawn from links, that would remove
  lines from it without a word.
- **Deleting a rule that is linked to** warns first ("3 rules and 2 words link
  to Dative. Their links will stop working.") and then leaves those links
  dotted. A new rule of the same name brings them back.
- **Linked from.** Rule, word, phrase and verb pages list the items that link
  to them. It is computed from text already written, so there is nothing extra
  to keep in step.

## Map

The Grammar page has a **List | Map** toggle. The map is another way of looking
at the same rules, so it is a view on that page rather than a new navigation
item. On a narrow screen the page opens on List, with Map one tap away.

- **Nodes are rules**, coloured by topic, with a line wherever one rule links
  to another.
- **Selecting a rule** shows the words, phrases and verb tables it links to
  around it. Drawing every linked item permanently was rejected; after a few
  dozen links it becomes unreadable.
- **Positions are saved.** A rule is placed automatically the first time,
  near the rules it links to, and stays wherever it is dragged. A map that
  rearranges itself on each visit defeats the point of a mental map: where a
  concept sits is part of remembering it.
- Dragging and pinch-zoom work everywhere. Empty rules carry a marker.

## Practice

Practice is in the first version. Rules are not flashcards and stay out of
flashcard decks; practice is its own activity, built entirely from content the
account owner wrote, with no answers to author separately.

**Where it starts.** A Practise grammar button on the Grammar page, on each
rule's page (for that rule alone), and on the home page's "Own your progress"
card. That card's line becomes "Test yourself.", with two buttons beneath it:
Create flashcards and Practise grammar.

**A session.** The reader picks all rules, one topic, one rule, or needs
review. A session is 10 questions mixing three kinds:

- **A hidden table cell.** Any filled, non-header cell can be hidden; the
  headers label the question ("Dative · masculine: ___"). Marking cells by hand
  was rejected as tedious.
- **A gap in an example.** One marked gap is hidden per question. Random gaps
  were rejected because they fall on words the example is not about.
- **Which rule is this?** An example is shown with 4 rules to choose from,
  preferring rules in the same topic so the answer is not obvious. Examples
  with no marked gap still take part here.

The session ends with a score and a list of what was missed, each linked to
its rule.

**Checking answers.** Case and surrounding spaces are ignored. A mistake only
in an accent or umlaut counts as **almost**: the correct spelling is shown with
the difference highlighted, and it is not counted as correct. Umlauts are often
the point of the rule, but a slip should not feel like a total miss.

**Recording answers.** Every answer goes through `record_review` into
`reviews`, like a flashcard answer, so there is one history of everything
practised and each rule gets a schedule in `progress`. Wrong and almost both
record as `again`. The log records the rule, not the cell or example asked,
which is enough to find weak rules. A separate grammar log with its own
outcomes was rejected as a second history for no gain.

**Needs review.** A wrong or almost answer marks the rule as needing review.
Three correct answers in a row for that rule, across sessions, clear it; that
is `progress.streak` reaching three. It can also be set or cleared by hand on
the rule's page, as on a word's.

## Data

The schema is the one `schema.md` describes after the refactor: one `items`
table for every kind of item, tags with a context, no views, and every write
through `save_items`. A rule follows "Adding a kind of item later" there:

- `'grammar'` joins the `item_type` check on `items`.
- Three nullable columns on `items`: `blocks jsonb`, the ordered block array,
  and `map_x` and `map_y`, where the rule sits on the map. A check ties them
  to the type the way `definition` is tied to a word. (Before the refactor
  this was to be a detail table of its own; one table with typed columns is
  the shape now, and the policies and composite keys already cover it.)
- Topics are tags with `context = 'grammar'`, linked through `item_tags`, with
  a check that a rule carries exactly one. Settings shows them in their own
  editor with the same rules as collections: a topic still on a rule cannot be
  removed, and renaming one onto another merges them.
- Nothing for the title: `items_user_type_title_key` already makes it unique
  per type.
- `save_items` declares the three new columns, and `set_updated_at` leaves
  `map_x` and `map_y` out of what counts as an edit, so dragging a node on the
  map does not mark the rule as edited.

**Rules make no flashcards, and nothing has to be added to say so.**
`has_answer` is false for a type it has no branch for, `cardBack` the same,
and the deck dialog offers only the three types. `schema.md` should record
that the absence is deliberate when the type is added, since it also warns
that a forgotten branch fails silently.

The old `grammar_rules` table is not revived. It predates the shared items
table and would sit outside everything built on it.

The migration is pushed before any code that needs it reaches `main`.

**Backup.** Rules go into the JSON backup as version 11, with a `toWire`
beside their `parse`, and older files still read. The Excel export gets a
Grammar sheet with title, topic and flattened text: the JSON protects the
content, and the sheet is only for glancing at it.

The feature ships empty, like every list.

---

## Build order

Too much for one change. Suggested stages, each usable on its own:

1. **Rules and blocks.** Migration, store, the Grammar list and rule pages,
   text, table and example blocks, the reading view and Edit, topics in
   Settings, navigation and the home page card, backup and export.
2. **Links.** Rules and verb tables as targets, the verb table notes field,
   shared-name links, rename rewriting, the delete warning, Linked from.
3. **Reading tools.** Highlights, Link to…, New rule from this.
4. **Map.** The toggle, saved positions, selection showing linked items.
5. **Practice.** The three question kinds, answer checking, recording, needs
   review, and the home page card.
6. **Later.** Freehand drawing as a block type.
