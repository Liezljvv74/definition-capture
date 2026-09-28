# Design: grammar rules

The design of record for the grammar feature. Stages 4 and 5 of the build order
below are not built yet. It was worked out question by question before any code
was written, because the first grammar page (added on 20 September, removed the
next day in `fbaa483`) was taken out for want of a clear approach, not for want
of need. Each section records what was decided and, where it matters, the
alternative that was turned down.

Reviewed on 26 September against the database refactor of the day before
(`Docs/db-refactor-plan.md`). Every decision below stood; what changed is the
Data section, which now names the tables and functions that exist, and the
word for a rule's grouping, which is Topic: "category" was retired from the
app in the refactor, and a rule's one grouping is not a Collection either.

**Stages 1 to 3 are built** (26 to 28 September 2026): rules, blocks, the reading view and Edit, topics in Settings, the tab, the home card, backup and export, links, and the reading tools: highlights, Link to… and New rule from this. Stages 4 and 5 remain.

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
  `- item`, `[[links]]` (`[[Name|shown words]]` to link words other than the
  target's name), and `==y:highlighted words==`. Rendered by the app's own
  code; no markdown or rich text library is installed, and this small set
  does not justify one. The edit box grows with the text rather than
  scrolling, so a long block stays readable while it is written.
- **Table.** A free grid: rows and columns added and removed at will, with an
  optional header row and an optional header column. Cells accept links, bold
  and italic, so a case table can link "dem" to the rule that explains it.
  In Edit mode, handles above the columns and beside the rows select them,
  Shift-click selects the block between two cells, and the selection can be
  copied, cut and pasted. The clipboard holds the block the way spreadsheets
  do, a tab between cells and a line per row, so a block goes between two
  rules and to and from Excel or Google Sheets, markup included. Cut empties
  the cells and keeps the rows; a paste grows the table to fit, up to its
  limits, and says so if anything was left out (the owner's choices on 28
  September).
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

- **Highlight** in yellow, green, blue or purple, and Remove highlight on text
  already marked. Blue replaced pink on 28 September, since red, rose and pink
  are kept for warnings, and the owner added purple the same day. The app
  gives the colours no meaning; the reader decides. Highlights work in text
  blocks, examples and table cells, and are stored inside the text as markup,
  `==y:…==`, `==g:…==`, `==b:…==` and `==p:…==`, rather than as character
  offsets, so editing the words around a highlight cannot make it drift. A
  selection across table cells covers the rectangle between its corner cells,
  so a row, a column or the whole table can be highlighted or cleared at once,
  with an outline drawn over that rectangle in place of the browser's own
  row-by-row selection; outside a table, a selection works within one field
  and one line. An edit is refused rather than made whenever it would change
  the words the rule shows or leave a marker that would not read back where it
  was put, for example when text typed earlier on the line already holds an
  unclosed `==g:`; a selection across table cells leaves such cells, and empty
  ones, unchanged and highlights the rest. In Edit mode the markers show in
  faint grey with a tint behind them, the owner's choice on 28 September over
  invisible markers or a rich text editor, both turned down for their cost.
  Examples take highlights but not links.
- **Link to…**, which searches every rule, word, phrase and verb table, turns
  the selection into a link, and keeps the selected words, writing
  `[[Name|words]]` when they are not the name.
- **New rule from this**, which asks for the title and topic, starting from
  the selected words and this rule's topic, creates an empty rule, links the
  selection to it, and keeps the reader on the page. The empty rule appears on
  the map with a marker, so named but unwritten concepts become a visible
  to-do list. A title cannot contain `|`, `[` or `]`, since links are written
  with them, and the dialog refuses one that does.

## Links

The existing `[[Name]]` syntax, written in `ref` text and resolved by title
when shown (`src/lib/parseRef.ts`, `src/components/RefText.tsx`), becomes the
one way to link everywhere. A separate "Related" field was rejected: two
mechanisms are harder to learn than one, and a link written in the sentence
that explains it carries its reason with it.

What changes:

- **Rules and verb tables are link targets**, the same as words and phrases.
  The suggestion box in `RefField` offers all four types. A link to a verb
  table opens the Verbs page scrolled to that table and highlighted
  (`/verbs?verb=<name>`).
- **A link may carry the words it shows**, `[[Dativ|dem]]`, when the linked
  words are not the target's name; renaming the target keeps them.
- **Verb tables get a notes field** that renders links, as words and phrases
  have. It is the `ref` column every item already carries; the verb table
  store simply starts sending and showing it.
- **Shared names.** A shared name resolves by a fixed order: rule, verb table,
  word, phrase. The owner chose this on 26 September over recording which item
  a link meant, which is deferred until clashes actually happen. This is a
  real change for a link that already existed: before this stage a shared
  name always resolved to the word, so an existing `[[sein]]` that used to
  reach the word now re-points to a verb table or rule named "sein" once one
  exists.
- **Renames update links.** Renaming a rule, word or phrase rewrites every
  `[[Old name]]` that points at it, one write per affected list
  (`src/lib/linkRenames.ts`); a verb table cannot be renamed, so it is never
  the source of a rewrite. A rename that changes only case or accents
  rewrites nothing, since names are matched with `foldName` and already
  resolve, and a name a higher-precedence item already owns is left alone.
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
3. **Reading tools** (built 28 September 2026). Highlights, Link to…, New rule from this.
4. **Map.** The toggle, saved positions, selection showing linked items.
5. **Practice.** The three question kinds, answer checking, recording, needs
   review, and the home page card.
6. **Later.** Freehand drawing as a block type.
