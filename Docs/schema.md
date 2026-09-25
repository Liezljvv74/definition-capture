# Schema design

The design of record for the database. The SQL lives in the migrations and
this explains why it is shaped the way it is. The refactor that produced this
shape, and the reasoning behind each decision, is in `Docs/db-refactor-plan.md`.

| Migration | What it does |
| --- | --- |
| `…_refactor_build_new_schema.sql` | the nine tables, their policies and functions, and the copy of every row out of the old schema, proved by assertions |
| `…_refactor_drop_old_schema.sql` | drops the old schema, then asserts the finished shape: the tables, the policies, the functions and the grants |

Everything before those two built the schema they replaced: `learning_items`
with a detail table per type, compatibility views over it with `instead of`
triggers, a second copy of the category list in `user_settings`, and tables
for goals, sessions and streaks that nothing ever read. The history is in
those migrations and in the git log; none of it is live.

---

## The shape

Nine tables, no views, seven functions, none of them `security definer`.

| Table | Holds | Written by |
| --- | --- | --- |
| `items` | every word, phrase and verb table | `save_items`; `needs_review` directly |
| `tags` | the account's tags; today every one is a collection | Settings, `save_items`, `rename_tag` |
| `item_tags` | which item carries which tag, in order | `save_items`, `rename_tag` |
| `sources` | where a definition came from | Settings, `save_items`, `rename_item_source` |
| `decks` | a deck asked for once and played | `build_deck` |
| `deck_cards` | a deck's cards in order | `build_deck` |
| `progress` | each item's place in the review schedule | `record_review` |
| `reviews` | every answer ever given, append-only | `record_review` |
| `user_settings` | one row of preferences per account | Settings |

### Principles

1. **One row per item, in one table.** Three kinds of item with five detail
   fields between them did not justify three detail tables, three views and
   three triggers. Checks keep each detail field on its own type.
2. **Every fact has one home.** Collections and sources are rows that items
   point at, so renaming one is one row and there is no second copy to keep
   in step.
3. **The app writes base tables.** No views and no `instead of` triggers, so
   upserts and batched writes work.
4. **Every owned row carries `user_id`, and the database proves it agrees
   with its parent** through composite foreign keys `(x_id, user_id)`. A link
   between two accounts' rows cannot exist, and every policy is one indexed
   equality rather than an `exists` per row.
5. **One policy per command, and a command with no policy is also revoked.**
6. **Keep only what something reads.**
7. **Timestamps belong to the database.**

---

## The tables, and why each is shaped as it is

### `items`

`item_type` is `word`, `phrase` or `verb_table`, checked. The common columns
are `title`, `ref`, `source_id`, `needs_review` and the two timestamps. The
detail columns belong to one type each: `definition` to a word,
`literal_meaning` and `usage_example` to a phrase, `tenses` and `verb_rows` to
a verb table. A check per type says a column is set exactly when the item is
of its type, so a word cannot carry a phrase's fields and a phrase cannot lack
its own.

`verb_rows` is jsonb: an array of `{ person, conjugations[], notes }`, where
`conjugations[i]` belongs to `tenses[i]`. It is read and written whole, never
queried into, which is what jsonb is for.

`has_answer` is a stored generated column: whether the item has a card back at
all. It is the one rule about card backs the database needs, so a deck can be
filled without sending every item to the browser. The back itself is built in
`cardBack` in `src/lib/flashcards.ts`, and `flashcards.test.ts` holds the two
rules together.

One unique index, `(user_id, item_type, lower(title))`, where there used to be
one partial index per type.

Two triggers: `items_guard` refuses a change to `id`, `user_id` or `item_type`
and quietly keeps `created_at`; `set_updated_at` sets `updated_at`. An upsert
sends every column, changed or not, so the guard compares with `is distinct
from` and only a real change is refused.

### `tags` and `item_tags`

A tag has a `context` saying what it is for. `collection` is the only one
today, and it is what the app calls a Collection (it used to say Category).
Contexts exist because tags are expected to serve other purposes later, and
each context keeps its own names and its own rules.

`item_tags` copies the tag's `context`, held to it by the composite foreign
key `(tag_id, context, user_id)`, which is what lets a per-context rule live
in a check rather than a trigger: at most five collections per item.
`position` keeps the order they were given in.

A tag still on an item cannot be deleted. Settings switches the bin off for
one in use and says how many words and phrases use it; renaming, which can
merge two, is how one in use changes. The foreign key is deferred to the end
of the transaction: each request from the app is its own transaction, so a
delete of a tag in use is still refused, but deleting a whole account removes
its items and its tags in one cascade, and an immediate check fires part way
through that cascade and refuses it.

### `sources`

A plain lookup table rather than a tag context, because an item has at most
one source. The same in-use rule and the same deferred foreign key as tags.
Verb tables carry no source.

### `decks` and `deck_cards`

A deck is built once, played and finished with. It keeps its owner and its
cards in order, nothing else. `build_deck` keeps the newest ten per account; a
deck pruned while open in another tab loads as empty.

### `progress`

One row per item that has been answered: times seen and correct, streak,
lapses, ease, interval, due date, last review. Mastery is not stored; it can
be read off the streak and the interval.

### `reviews`

Append-only: every answer, with its outcome, response time, and the schedule
before and after (`prior_ease`, `prior_interval_days`, `next_due_at`). It is
what a history of improvement is drawn from: accuracy and speed over time,
study days (grouped by the reader's own time zone when drawn, not stored as a
counter), and how strongly each item is known. There is no update or delete
policy, and those commands are revoked as well.

The browser decides whether an answer was right, so `record_review` is
`security invoker` and a reader could write their own rows directly. That is
accepted: they are the reader's own rows. Nothing should treat `reviews` as a
tamper-proof record.

### `user_settings`

Display name, language, verb persons and tenses, answer separators, and the
words to skip when sorting. Collections and sources used to be arrays here,
copied into `tags` by a background call; they are rows of their own now.

---

## Functions

All `security invoker`, all with `search_path = ''`, execute granted to
`authenticated` only (and to nobody on the two trigger functions).

| Function | Does |
| --- | --- |
| `save_items(payload jsonb)` | saves any number of items with their source and collections, in one transaction. Names are resolved, and created when missing, inside the call. A key left out of the payload leaves that part of an existing item alone. `user_id` comes from the session, never the payload. |
| `record_review(item, answer, took_ms)` | writes a review and upserts the item's progress |
| `build_deck(item_types, tag_ids, only_needs_review, only_recent, size)` | fills a deck, due first then at random, or newest first; keeps the newest ten decks |
| `rename_tag(context, from, to)` | renames a tag, or merges it into one that already has the new name |
| `rename_item_source(from, to)` | the same for a source |
| `items_guard()`, `set_updated_at()` | triggers on `items` (and `user_settings` for the second) |

---

## Security

- Row level security on every table, enabled in the migration that creates it.
- Policies are `to authenticated` on `(select auth.uid()) = user_id`, one per
  command, `with check` on insert and update. The two migrations assert the
  exact set, not "at least one each".
- `anon` holds no privilege on any table, sequence or function, and the
  default privileges for what `postgres` creates grant it nothing. The app
  never queries signed out.
- No view, so nothing can run as its owner past row level security.
- No `security definer` function.

Leaked password protection is a dashboard setting, not a migration.

---

## The important queries

| Path | What runs |
| --- | --- |
| Load a list | one request per 1,000 rows: `items` of one type, newest first, with `sources(name)` and `item_tags(position, context, tags(name))` embedded through the composite keys |
| Save one or many | one `save_items` call per 500 items |
| Restore, Replace | `save_items` for the file, then a delete of this list's ids the file lacks. Each file item takes the id of the row it replaces (by name, else by id), so progress and history survive |
| Build a deck | one `build_deck` call, over `items_user_answerable_idx` |
| Load a deck | one request: `deck_cards` with `items(...)` embedded |
| Answer a card | one `record_review` call |

---

## Spaced repetition

SM-2, trimmed, in `record_review`. Correct answers step 1 day, then 6, then
multiply by `ease`; the two fixed steps stop a brand new card jumping to a
fortnight. A correct answer also adds 0.10 to `ease`, capped at 3.00.

`again` and `revealed` reset the streak and the interval, drop `ease` by 0.20
with a floor of 1.30, and count a lapse. `skipped` holds the streak and the
ease and only zeroes the interval, because moving past a card is not the same
as getting it wrong.

Changing the algorithm means changing one function and, if the numbers should
be restated, replaying `reviews` into a fresh `progress`. The log keeps the
schedule before and after every answer, so nothing is lost by changing your
mind.

---

## Adding a kind of item later

To add, say, sentences:

1. Add `'sentence'` to the `item_type` check on `items`, and its detail
   columns, nullable, with a check tying them to the type like the others.
2. A branch in `has_answer`, and the same branch in `cardBack`.
3. Its fields in `save_items`'s record type and shaping.
4. A store built on `remoteStore` with `itemType: "sentence"`, and a page,
   form and dialogs as for any list.

Collections, sources, decks, progress and reviews work on the new type the
moment its rows exist, because each of them references `items` and not a
page. Step 2 is the one that fails silently if forgotten: without a branch,
`has_answer` is false and decks simply leave the new type out.

When the detail columns for all types together stop fitting comfortably in
one table (five or six types, or one type with many fields), detail tables
become worth their cost again.
