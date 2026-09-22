# Schema design: flashcards, review and progress

The design of record for the `flashcards` branch. The SQL lives in the
migrations below and this explains why it is shaped the way it is.

| Migration | What it does |
| --- | --- |
| `…_learning_items_spine.sql` | `learning_items` plus a typed table per content type, and the compatibility views |
| `…_tags_and_categories.sql` | one labelling system across every type |
| `…_reviews_and_flashcards.sql` | review history, decks, progress, goals, streaks, and the scheduler |

All of these are applied, along with eight that followed while the feature was
built and reviewed: `card_faces` and the `needs_review` plumbing; a deck
builder that skips items with no answer on the back; a mastery ladder that
does not call one correct answer familiarity; the per-account answer
separators, and brackets joining them as a choice; the ownership check in
`apply_review` that an anonymous caller used to pass; and the review findings
migration, which indexes the delete cascade, takes the client's insert policy
off `review_logs`, filters the category aggregates by tag kind, keeps the two
category lists in step, and splits the deck builder so the recent path can use
its index. The last of them drops the three legacy tables, after checking that
every row in them was still accounted for in `learning_items`.

The backfill was checked field by field against the tables it replaced, not
merely counted: 103 words, 21 phrases and 3 verb tables, with every column and
both timestamps identical, and nothing missing from the views.

---

## The one idea

Everything the reader learns is a row in `learning_items`. What is true of all
of them lives there; what is true of one kind lives in a table named for that
kind, keyed by the same id.

```
learning_items                      one row per thing the reader learns
  id, user_id, item_type, title,
  ref, source, needs_review,
  created_at, updated_at, metadata
      |
      +-- word_details        (id) definition
      +-- phrase_details      (id) literal_meaning, usage_example
      +-- verb_table_details  (id) tenses, rows

item_tags -> learning_items         labels, any type
review_logs -> learning_items       every answer, append-only
deck_items -> learning_items        the cards in a deck
progress_summary -> learning_items  one row, derived, for speed
```

This is class table inheritance. The alternative, one wide table with a
nullable column per type, was rejected for a specific reason rather than a
stylistic one: the moment a second type exists, every `not null` that belongs
to only one of them has to be dropped, and the database stops being able to
say what a valid row looks like.

### Why not leave the three tables alone

Because a flashcard deck is the first feature that does not belong to a page.
Drawing from words and phrases and verb tables meant a three-way `UNION` with
every filter repeated per branch, and "most recently added across everything"
had no common column to sort on: the three tables spell their timestamp
`date_added`, `created_at` and `created_at`. Review history could not have a
foreign key at all, so deleting a word would leave its history pointing at
nothing, and nothing in the database would object.

### What it cost to do it this way

Nothing in `src/` changes when these migrations are applied. `words`,
`phrases` and `verb_tables` still exist as views over the join, with
`instead of` triggers so writes still work, which means the application keeps
issuing exactly the statements it issues today.

That is not a permanent arrangement. It is what lets the app move onto
`learning_items` one page at a time instead of in one commit. The views carry
a real cost: `categories` is aggregated per row through a lateral join, so a
page that has moved off the view should read `learning_items` and `item_tags`
directly.

---

## The tables, and why each exists

### `item_types`

A lookup table, not an enum. Adding a content type is then an insert rather
than a migration that rewrites a type other tables depend on. It carries the
label, the plural and the route, so a deck or a dashboard can name and link to
an item without the application holding a hard-coded map.

### `learning_items`

The spine. `title` is the name the item is known by: the word, the phrase, the
verb. Every list already had one and matched on it the same way, which is why
the app's `findByName` could live in one place; now the database agrees.

`needs_review` is a flag the reader sets, and it is deliberately not a score.
A score is derived from history and lives in `progress_summary`. This is an
opinion the reader is entitled to hold whatever their history says, and it is
one of the filters the flashcard builder offers.

`metadata jsonb` is the escape hatch and is meant to stay small. See the JSONB
guidance below.

### `word_details`, `phrase_details`, `verb_table_details`

What is true of one kind only. Keyed by the base row's id rather than carrying
one of their own, so the two cannot disagree about which item they describe.

They have no `user_id`. Ownership is the base row's, and duplicating it would
create a second answer to the same question that could drift. Their row level
security reaches through the key with an `exists` against `learning_items`.

### `tags` and `item_tags`

One labelling vocabulary for every type. Categories used to be three separate
things that could disagree: a `text[]` on `words`, another on `phrases`, and a
curated list in `user_settings` that the forms offered from. Verb tables had
none at all.

`tags` carries a `kind`, currently only `'category'`, rather than there being a
`tags` table and a near-identical `categories` table. Two tables with the same
columns, the same policies and the same join table are one table with a column
saying what it is for.

`item_tags` points at `learning_items`, which is the whole reason this works
across types: a tag applies to anything, including whatever is added next,
without this table changing.

### `review_logs`

Append-only, and the truth. Every answer is appended and never changed, so the
history can be replayed, a scheduler can be swapped without losing what
happened under the old one, and a bug in the summary is a recomputation rather
than a loss.

It has a select policy and nothing else. Append-only is worth nothing if the
client can edit what it appended, and the insert policy it started with cost
almost as much: anything holding the publishable key could append a row saying
whatever it liked, and then replaying the log would no longer reproduce the
summary. Every real write comes from `apply_review`, which is `security
definer` and therefore not subject to policies at all, so the policy bought
nothing and was dropped.

`prior_interval_days`, `prior_ease` and `next_due_at` are snapshots of what the
scheduler thought at the moment of the answer, not references to current
state. They are what make the log replayable.

`outcome` is `correct`, `again`, `revealed` or `skipped`. `again` rather than
`incorrect` because that is what the reader chose: the button that means show
me this one again. `revealed` is the third thing the card offers and is not
the same as getting it wrong.

### `progress_summary`

One row per item ever answered, derived from `review_logs`, safe to delete and
rebuild. It exists because a dashboard asking "what is due?" cannot aggregate a
review log every time, and the review queue is the query this app will run most.

No insert or update policy for the client. These rows are written by
`apply_review`, which runs as definer, so nobody can award themselves a mastery
they have not earned or push a card's due date away.

### `flashcard_decks` and `deck_items`

A deck snapshots its selection rather than re-running the filter each time,
which is what lets a deck be put down and picked up: a word edited half way
through does not silently leave the deck it is already in.

`filters jsonb` records what the reader asked for so a deck can be explained
after the fact and repeated. It is a record of a choice, not something queried.

### `study_sessions`, `daily_study`, `user_goals`

A session is one sitting, kept separate from a deck because a session may span
several decks and a deck may be picked up over several sittings.

`daily_study` is one row per reader per day, so a streak is a walk backwards
through consecutive dates rather than an aggregate over the whole history. The
answer does not get slower as the history grows. The reader's own date is
passed in, because a review at eleven at night belongs to the day they think
it does.

`user_goals` keeps ended goals rather than overwriting them, so "I used to do
ten a day" survives raising it to twenty. A partial unique index allows one
live goal per kind.

### Deliberately absent: `users`

Supabase owns the user. Everything references `auth.users(id)` and the app's
own per-account settings already live in `user_settings`. A second users table
would be a second answer to who someone is.

---

## JSONB or a column

Use a column when the value is **queried, filtered, sorted, constrained or
counted**. Use `jsonb` when it is **carried**.

| Field | Choice | Why |
| --- | --- | --- |
| `verb_table_details.rows` | `jsonb` | A grid read and written whole. No query wants one person's row across every verb, so a child table would add a join to answer a question nobody asks. |
| `flashcard_decks.filters` | `jsonb` | A record of what was asked for. Applied once, when the deck is built, and never filtered on afterwards. |
| `learning_items.metadata` | `jsonb` | The per-type oddment that would otherwise force a migration for one field on one page. |
| `learning_items.needs_review` | column | Filtered on, in the deck builder. |
| `progress_summary.due_at` | column | The most-run query in the app sorts by it. |
| `progress_summary.mastery` | column | Grouped by, on the dashboard. |
| `item_tags` | table | Joined from both directions, and a tag has to be renameable in one place. |

The trap to avoid is putting something in `metadata` because it is quicker
today and then needing to filter on it next month. A `jsonb` field can be
indexed with GIN, but it cannot be constrained, it cannot have a foreign key,
and a typo in a key is silent where a typo in a column name is a build error.

---

## The important queries

**The review queue.** Served by `progress_summary_user_due_idx`.

```sql
select i.id, i.title, i.item_type, p.due_at, p.mastery
from progress_summary p
join learning_items i on i.id = p.item_id
where p.user_id = $1 and p.due_at <= now()
order by p.due_at
limit 50;
```

**Building a deck.** One call, which is `build_flashcard_deck`:

```sql
select build_flashcard_deck(
  sources           => array['word','phrase'],
  category_ids      => array['…uuid…']::uuid[],
  only_needs_review => true,
  only_recent       => false,
  size              => 50
);
```

Empty `sources` means every type, which is what makes "All items" the default
without a special case.

**The dashboard.** Two cheap reads rather than one aggregate over history:

```sql
select mastery, count(*) from progress_summary
where user_id = $1 group by mastery;

select day, reviewed_count, correct_count from daily_study
where user_id = $1 and day > current_date - 30 order by day;
```

**The streak.** Walk `daily_study` backwards from today and stop at the first
gap. Bounded by the streak's own length, not by the history.

**Search across everything**, which the three tables could not do at all:

```sql
select id, item_type, title from learning_items
where user_id = $1 and title ilike $2
order by created_at desc limit 20;
```

For a real search rather than a prefix match, add `pg_trgm` and a GIN index on
`lower(title)`. Not worth it at a few thousand rows.

---

## Cheap and expensive

**Cheap**, because an index answers them directly: the review queue, one
type's list newest-first, the tags on an item, the items in a category, the
next unanswered card in a deck, the dashboard's mastery breakdown, a streak.

**Expensive, and each has an answer:**

- Aggregating `review_logs` for a dashboard. That is what `progress_summary`
  and `daily_study` exist to avoid. Do not go back to the log for a number a
  summary already holds.
- The compatibility views, which aggregate categories per row. Fine at this
  size, and the reason to move pages off them.
- `order by random()` in the deck builder scans the candidate set. Bounded by
  the filters and by a few thousand rows, so acceptable; if a list ever gets
  genuinely large, sample by `tablesample` or by a random cut on an indexed
  column instead.
- Counting every item for a dashboard tile. Cache it if it is ever on a hot
  path; do not until it is.

---

## Spaced repetition

SM-2, trimmed, in `apply_review`. Correct answers step 1 day, then 6, then
multiply by `ease`; the two fixed steps stop a brand new card jumping to a
fortnight. A correct answer also adds 0.10 to `ease`, capped at 3.00, so a card
answered easily several times over stops coming back so often.

`again` and `revealed` reset the streak and the interval, drop `ease` by 0.20
with a floor of 1.30, and count a lapse. `skipped` is the exception and is
deliberately gentler: it holds the streak and the ease where they are and only
zeroes the interval, because moving past a card is not the same as getting it
wrong.

Mastery is read off the streak and the interval afterwards: nothing seen is
`new`, a reset streak or a single correct answer is `learning`, and after that
`familiar`, `known` and `mastered` at intervals of under 7 days, under 21, and
beyond. One right answer deliberately does not count as familiarity, which is
a correction: it did at first, and it made the ladder meaningless.

It lives in the database rather than the browser for three reasons: the summary
it writes is not client-writable, every caller gets the same arithmetic, and it
runs inside the transaction that records the answer, so a summary can never
disagree with the log it came from.

Changing the algorithm means changing one function and, if the numbers should
be restated, replaying `review_logs` into a fresh `progress_summary`. Nothing
is lost by changing your mind, which is the entire point of the log being
append-only.

---

## The Home page challenge flow

A card on the home page, pale blue, titled **Own your progress**, described as
"Create flashcards to test your knowledge". The cards themselves are a soft
off-white with blue undertones.

1. **Create flashcards**
2. **Choose sources**, one or many: All items (the default), Words, Phrases,
   Verbs, Most recently added
3. **Apply filters**: categories, and items marked as needing review
4. **How many**, defaulting to 50 if nothing is entered
5. **Generate deck**: one call to `build_flashcard_deck`

Answering a card calls `apply_review` once. Correct flashes pale green and
moves on; wrong flashes pale orange and offers try again, see the answer, or
continue. Those three map to `again`, `revealed` and `skipped`, which is why
the outcome is not a boolean: "I looked it up" and "I gave up" and "I will try
again" are three different things to have done, and a scheduler that treats
them the same is throwing away what the reader told it.

---

## Adding a page later

The point of the shape. To add, say, sentences:

1. `insert into item_types`, one row.
2. `create table sentence_details (id uuid primary key references learning_items(id) on delete cascade, …)` plus its two policies, copied from any existing detail table.
3. A store, a hook, a page, a form and its dialogs, as for any list.

4. A branch in `card_faces`, and a fourth partial unique index beside
   `learning_items_user_word_key` and its two siblings.

What you do **not** touch: `review_logs`, `progress_summary`, `deck_items`,
`item_tags`, `flashcard_decks`, `daily_study`, `user_goals`,
`build_flashcard_deck` or `apply_review`. Tagging, progress, streaks and
dashboards all work on the new type the moment its rows exist, because every
one of them references `learning_items` and not a page.

Flashcards are the one exception, and step 4 is the reason. `card_faces` is a
`case` over `item_type` with no `else`, so a type it has not been told about
yields a null back, and the deck builder skips anything with an empty back. The
failure is silent: decks simply come back without the new type in them. That is
the price of a view that has to know what the front and the back of each kind
of thing are, which is knowledge no generic table can hold; naming it here is
cheaper than the afternoon somebody would spend finding it.

Compare that with the three-table version, where the same addition meant
widening every union, every filter and every summary.

---

## Recommendation

Apply the migrations in order, leave the application on the
compatibility views, and build the flashcard feature directly against
`learning_items` and `apply_review`. That way the new feature is written the
right way from the start and the existing pages migrate when there is a reason
to touch them, rather than all at once as a prerequisite.

The old tables were kept as `words_legacy`, `phrases_legacy` and
`verb_tables_legacy` rather than dropped, so the backfill could be checked
against what it was built from. They have since been dropped, in a migration of
their own that refused to drop anything unless every row in them still had its
counterpart in `learning_items`, matched by the id it kept. Fields were not
compared, because by then they were allowed to differ: an entry edited after
the cutover has its current wording in the spine and its old wording in the
copy, and that is the spine being right.

What settled it was that nothing maintained them. A second copy of every row
that drifts further from the truth by the day looks like data without being
data, and the moment somebody reads it to answer a question is the moment it
does harm.
