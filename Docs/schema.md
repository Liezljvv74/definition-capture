# Schema design

The design of record for the database. The SQL lives in the migrations and
this explains why it is shaped the way it is. The refactor that produced this
shape, and the reasoning behind each decision, is in `Docs/db-refactor-plan.md`.

| Migration | What it does |
| --- | --- |
| `…_refactor_build_new_schema.sql` | the nine tables, their policies and functions, and the copy of every row out of the old schema, proved by assertions |
| `…_refactor_drop_old_schema.sql` | drops the old schema, then asserts the finished shape: the tables, the policies, the functions and the grants |
| `…_optimise_indexes_for_scale.sql` | two indexes found by measuring every query at scale; see "Measured at scale" below |

Everything before those two built the schema they replaced: `learning_items`
with a detail table per type, compatibility views over it with `instead of`
triggers, a second copy of the category list in `user_settings`, and tables
for goals, sessions and streaks that nothing ever read. The history is in
those migrations and in the git log; none of it is live.

---

## The shape

Sixteen tables (once the follow-up migration has dropped `conversation_messages`, which
still exists until then), no views, twelve functions, none of them `security definer`.

| Table | Holds | Written by |
| --- | --- | --- |
| `items` | every word, phrase, verb table and grammar rule | `save_items`; `needs_review` directly |
| `tags` | the account's tags, in two contexts: a collection, or a rule's topic | Settings, `save_items`, `rename_tag` |
| `item_tags` | which item carries which tag, in order | `save_items`, `rename_tag` |
| `sources` | where a definition came from | Settings, `save_items`, `rename_item_source` |
| `decks` | a deck asked for once and played | `build_deck` |
| `deck_cards` | a deck's cards in order | `build_deck` |
| `progress` | each item's place in the review schedule | `record_review` |
| `verb_tense_progress` | each verb tense's place in the review schedule | `record_tense_review` |
| `reviews` | every answer ever given, append-only | `record_review`, `record_tense_review` |
| `user_settings` | one row of preferences per account | Settings |
| `account_plans` | `free` or `paid`, for the grammar tutor; no row means free | an administrator only |
| `tutor_usage` | one row per tutor question, append-only | the tutor route |
| `tutor_conversations` | an account's saved conversations with the tutor | the tutor page |
| `tutor_exchanges` | one question and its answer (or one merged rule) in a conversation, written once | the tutor page |
| `tutor_conversation_rules` | which rules were saved from which conversation | the tutor page |
| `tutor_searches` | one row per sidebar search, append-only, for the hourly limit | the tutor search route |

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

`item_type` is `word`, `phrase`, `verb_table` or `grammar`, checked. The common columns
are `title`, `ref`, `source_id`, `needs_review` and the two timestamps. `ref`
is a notes field that renders links, shown and edited by the browser; words and
phrases have always carried it, and verb tables use it for notes on the table.
The detail columns belong to one type each: `definition` to a word,
`literal_meaning` and `usage_example` to a phrase, `tenses` and `verb_rows` to
a verb table. A check per type says a column is set exactly when the item is
of its type, so a word cannot carry a phrase's fields and a phrase cannot lack
its own.

`verb_rows` is jsonb: an array of `{ person, conjugations[], notes }`, where
`conjugations[i]` belongs to `tenses[i]`. It is read and written whole, never
queried into, which is what jsonb is for.

A grammar rule's content is `blocks`, jsonb: an ordered array of text, table
and example blocks, read and written whole. `map_x` and `map_y` are where it
sits on the grammar map, unset until placed. `has_answer` has no branch for
grammar and is false for every rule, deliberately: rules make no flashcards,
and that is the intent rather than an omission.

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

A tag has a `context` saying what it is for. `collection` is one context;
`grammar` is the other: a rule's topic, exactly one per rule.
`item_tags_grammar_one` holds it to one, and `save_items` refuses a rule with
none. Contexts exist because tags are expected to serve other purposes later,
and each context keeps its own names and its own rules.

`item_tags` copies the tag's `context`, held to it by the composite foreign
key `(tag_id, context, user_id)`, which is what lets a per-context rule live
in a check rather than a trigger: at most five collections per item.
`position` keeps the order they were given in.

A tag still on an item cannot be deleted. Settings switches the bin off for
one in use and says how many things use it: words and phrases for a
collection, rules for a topic. Renaming, which can merge two, is how one in
use changes. The foreign key is deferred to the end of the transaction: each
request from the app is its own transaction, so a delete of a tag in use is
still refused, but deleting a whole account removes its items and its tags in
one cascade, and an immediate check fires part way through that cascade and
refuses it.

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
be read off the streak and the interval. Besides the primary key on
`item_id`, `(user_id, item_id) include (due_at)` finds one account's rows,
which the deck builder joins to without reading the table.

### `verb_tense_progress`

One row per (verb, tense) that has been practised, with the same schedule
columns as `progress` (see Docs/verb-practice.md). Verbs are practised as a
table per tense rather than as flashcards, so every tense has its own schedule
and a verb counts as learned only when every tense on its table is. Primary key
`(item_id, tense)`, which also serves the cascade from the composite foreign
key to `items`; `(user_id, due_at)` for an account's rows. A tense is its name
on the table, never blank; `record_tense_review` refuses a tense the table does
not have. Select, insert and update policies on the owner, as `progress` has,
because the function runs with the caller's rights.

### `reviews`

Append-only: every answer, with its outcome, response time, and the schedule
before and after (`prior_ease`, `prior_interval_days`, `next_due_at`). It is
what a history of improvement is drawn from, through the covering index
`(user_id, reviewed_at desc) include (outcome, response_ms)`: accuracy and
speed over time,
study days (grouped by the reader's own time zone when drawn, not stored as a
counter), and how strongly each item is known. There is no update or delete
policy, and those commands are revoked as well.

The browser decides whether an answer was right, so `record_review` is
`security invoker` and a reader could write their own rows directly. That is
accepted: they are the reader's own rows. Nothing should treat `reviews` as a
tamper-proof record.

`tense` is set on a verb tense answer and null on every other review. Anything
drawing flashcard statistics from `reviews` must filter `tense is null`.

### `user_settings`

Display name, language, verb persons and tenses, answer separators, and the
words to skip when sorting, the reader's native language (`native_language` code or `native_language_other` name, never both, same checks as the studied language) and CEFR `level` (`''` or A1 to C2), both read by the tutor, and `speech_rate` (`'slow'`, `'normal'` or `'fast'`, default `'normal'`), how fast read aloud speaks (see Docs/voice.md). Collections and sources used to be arrays here,
copied into `tags` by a background call; they are rows of their own now.

### `account_plans` and `tutor_usage`

See Docs/tutor.md. `account_plans` is selectable by its account and writable by
no one in the app: no insert, update or delete grant or policy for
`authenticated`, so nobody can upgrade themselves. `tutor_usage` grants select
and insert only, with the insert policy checking `user_id`, so a count can grow
but never be wound back. The migration ends with a check that raises if either
grant set drifts. `supabase/tests/tutor.sql` rehearses all of it.

### `tutor_conversations`, `tutor_exchanges` and `tutor_conversation_rules`

Together with `tutor_searches` below, these hold the tutor's saved
conversations; `Docs/tutor-conversations.md` is the design. They replace the
old `conversation_messages` table, whose rows the migration deleted and which a
later migration drops once no deployed code reads it.

`tutor_conversations` has `id` (uuid), `user_id`, `name` (1 to 120 characters,
trimmed), `created_at` and `updated_at`, which orders the sidebar. It carries
`unique (id, user_id)` so the tables below can reference it with a composite
key. The account may select and delete, insert `user_id` and `name`, and update
`name` and `updated_at`.

`tutor_exchanges` is one row per question and its answer, or per merged rule
(`kind` is `answer` or `merge`). It holds the `reply` as jsonb (at most 64 KB),
`answer_text` (what is signed and what the model is sent back), `signature`
(`signTurn` of the account and `answer_text`) and a nullable `embedding`
(`extensions.halfvec(1024)`, null when embedding failed or timed out). The id is
an identity because it is also the order. A pair per row means ticking,
signing and embedding all work on one row, and a failed answer saves nothing.
An exchange is written once: select and insert only, with insert granted on
named columns so the order and time stay the database's, and the cascade from
its conversation is the only delete. The composite key
`(conversation_id, user_id)` makes a link to another account's conversation
impossible. Keyword search uses a GIN index on
`to_tsvector('simple', question || ' ' || answer_text)` as an expression, so no
second copy of the text is stored; `simple` does no stemming but works the same
in every language, and the vector half covers what stemming would. There is no
vector index: at the 2,000 exchanges an account may hold, an exact scan of that
account's rows is fast, and an HNSW index is worth adding only if the limit is
raised well past that.

The account can insert a made-up reply or vector with the publishable key. That
only touches its own rows within its limits, and a made-up reply never reaches
the model, because its signature will not verify. Changing
`TUTOR_SIGNING_SECRET` leaves older answers shown and searchable but no longer
history, memory or mergeable.

`tutor_conversation_rules` links a conversation to the rules saved from it,
primary key `(conversation_id, item_id)`, with composite keys to both
`tutor_conversations` and `items`, cascading from either. It stores the rule's
id, not its title, so a renamed rule stays linked. `user_id` defaults to
`auth.uid()`. Select, insert and delete on the owner.

### `tutor_searches`

One row per sidebar search (`id`, `user_id`, `created_at`), so an account's
searches in the last hour can be counted, as `tutor_usage` counts questions
(100 an hour). Select, and insert of `user_id` only, with no delete, so an
account cannot reset its own count. The pg_cron job `tutor-searches-cleanup`
deletes rows older than a day each night.

---

## Functions

All `security invoker`, all with `search_path = ''`, execute granted to
`authenticated` only (and to nobody on the two trigger functions).

| Function | Does |
| --- | --- |
| `save_items(payload jsonb)` | saves any number of items with their source and collections, in one transaction. Names are resolved, and created when missing, inside the call. A key left out of the payload leaves that part of an existing item alone. `user_id` comes from the session, never the payload. |
| `schedule_step(streak, interval_days, ease, lapses, answer)` | the scheduling rules, shared by the two functions below so they cannot drift apart |
| `record_review(item, answer, took_ms)` | writes a review and upserts the item's progress |
| `record_tense_review(item, target_tense, answer, took_ms)` | the same for one tense of a verb table, into `verb_tense_progress` |
| `build_deck(item_types, tag_ids, only_needs_review, only_recent, size, only_due)` | fills a deck, due first then at random, or newest first; keeps the newest ten decks. `only_due` (default false) draws only items whose `progress.due_at` has passed, most overdue first |
| `home_summary()` | one row for the dashboard: `words`, `words_without_definition`, `phrases`, `verb_tables`, `grammar_rules`, `due`, `new_items`, `learning`, `learned`, `next_due_at`, `last_saved_at`, `remember_id`: a random difficult word or phrase (see Docs/homepage.md), else null; then `verb_tenses_due`, `verb_tenses_new`, `verbs_new`, `verbs_learning`, `verbs_learned`. The flashcard counts (`due` to `next_due_at`) are words and phrases only; verbs are counted by their tenses. Security invoker, so row level security applies |
| `rename_tag(context, from, to)` | renames a tag, or merges it into one that already has the new name |
| `rename_item_source(from, to)` | the same for a source |
| `search_tutor(query, query_embedding, match_count)` | the sidebar's search and the tutor's memory: ranks the account's exchanges by keyword (`ts_rank_cd`) and by meaning (cosine distance, closer than 0.5 only) and fuses the two orders by reciprocal rank. A null embedding gives keyword results only. Security invoker, and filtered on `user_id` as well as by the policy |
| `enforce_row_limit()` | `before insert` trigger on `tutor_conversations` (500 per account) and `tutor_exchanges` (2,000), refusing the row with `program_limit_exceeded`; storage is the reason, so two racing inserts may end a row over |
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
| Load a list | one request per 1,000 rows: `items` of one type, newest first, with `sources(name)` and `item_tags(position, context, tags(name))` embedded through the composite keys. Paged by keyset (after the last row's `created_at` and `id`), never by offset |
| Save one or many | one `save_items` call per 500 items |
| Restore, Replace | `save_items` for the file, then a delete of this list's ids the file lacks. Each file item takes the id of the row it replaces (by name, else by id), so progress and history survive |
| Build a deck | one `build_deck` call, over `items_user_answerable_idx` |
| Load a deck | one request: `deck_cards` with `items(...)` embedded |
| Answer a card | one `record_review` call |

---

## Measured at scale

Every query path was timed with `explain analyze` on a local database of
1,001 accounts: one with 20,000 items (14,000 words), 15,000 progress rows and
300,000 reviews, and a thousand others with 200 items each. In all, 220,000
items, 320,000 collection links, 360,000 reviews and 500,000 deck cards, with
row level security applied as the app applies it. Times are for the heavy
account with a warm cache.

| Path | Time |
| --- | --- |
| A page of 1,000 words with source and collections | 60 to 90 ms, the same for every page |
| Flashcard dialog count | 7 ms |
| Build a deck (due first, whole call) | 50 to 60 ms |
| Build a deck (newest first, or one collection) | 12 to 17 ms |
| Load a deck | 1 ms |
| Answer a card | under 1 ms for the lookups, about 20 ms for the call |
| Settings lists, renames, one item's delete with its cascades | under 2 ms each |
| Reviews per day for 90 days (37,000 reviews) | 33 ms, from the index alone |
| Save 500 items | 170 to 350 ms |

What changed because of it:

- **Keyset paging for lists.** With an offset, the database produces and
  throws away every row before the page, embeds included: the last page of
  14,000 words took 959 ms against 62 for the first. From the browser, all
  fourteen pages took 17.3 s through the API with offsets and 10.9 s with a
  cursor.
- **`progress (user_id, item_id) include (due_at)`.** `progress` was the one
  table whose policy column led no index, so the deck builder read every
  account's progress and kept the caller's. That cost grew with the number of
  accounts; it is now an index-only scan of the caller's rows.
- **A covering index for the review history,** replacing the plain one on the
  same key: 111 ms became 33.

What did not change, and why:

- The due-first deck sorts every card that could be in it, because the order
  is due date and then random. At 20,000 items that is about 50 ms; it only
  becomes worth a different approach (drawing due cards from
  `progress_user_item_idx` first) well beyond that.
- Each owned table has both a primary key on `id` and a unique key on
  `(id, user_id)`. The second is what the composite foreign keys point at;
  it is the price of making a cross-account link impossible, and it is small.
- The advisor's three "unindexed foreign key" notes are covered by primary
  keys that lead with the same column.

Beyond the database, the next limit at this size is the browser: drawing a
table of 14,000 rows took about 20 s in development mode. A list that shows a
window of rows at a time (virtualised) or pages on screen is the change that
would matter next, followed by selecting only the columns each list shows.

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
3. Its fields in `save_items`'s record type and shaping. A new column is
   declared in `save_items` (its record type, shaping, update and insert); it
   is added to `set_updated_at`'s exclusion list only when changing it must
   not count as an edit, as `map_x` and `map_y` are, because the trigger
   already sees every other column on its own.
4. A store built on `remoteStore` with `itemType: "sentence"`, and a page,
   form and dialogs as for any list, and an entry in `STORES` in
   `StoreErrorBanner.tsx`, or its failures are silent.

Collections, sources, decks, progress and reviews work on the new type the
moment its rows exist, because each of them references `items` and not a
page. Step 2 is the one that fails silently if forgotten: without a branch,
`has_answer` is false and decks simply leave the new type out.

When the detail columns for all types together stop fitting comfortably in
one table (five or six types, or one type with many fields), detail tables
become worth their cost again.
