# Verb practice

Agreed with the owner on 3 October 2026, on the branch `verb-practice`.

## Purpose

Flashcards do not work for verbs: a verb table goes into a deck as one card
whose back is every person in every tense, which nobody can type. Verbs are
learned by filling in a table for a named tense. This adds a practice session
on the Verbs page that does exactly that, gives every tense of every verb its
own review schedule, and counts a verb as done only when all its tenses are
learned, so a verb with four tenses keeps asking for the three not yet known.

## What the learner sees

### Starting a session

A **Practise** button on the Verbs page opens a dialog:

- **Verbs**: *Due for review* (the default when any tense is due), *All*, or
  *Choose*, a ticked list of verbs.
- **Tenses**: with *All* or *Choose*, tick one or more of the tenses the
  tables use. With *Due*, the tenses are chosen for you: exactly the ones that
  are due, verb by verb.
- When nothing is due, the dialog offers the tenses not yet tried instead, the
  way flashcards offer new items.
- A verb with none of the chosen tenses is left out; the dialog says how many
  verbs and tenses the session will ask.

### The session

Its own page, `/verbs/practise`, inside the signed-in workspace.

- One verb at a time: its name, the persons down the side, an empty box under
  each tense being asked.
- A box whose form was never filled in on the verb's table shows a dash and is
  not asked.
- Tab moves across to the next box and wraps to the next row; Enter moves down
  the column (the app's rule for every table).
- **Check** marks every box: a right one turns green, a wrong one red with the
  right form beside it, and the table wobbles. Every box right gets the doodle
  celebration a right flashcard gets. Right and wrong are announced to screen
  readers.
- **Next verb**, and "verb 2 of 6" to show where you are.
- At the end: how many tenses were right, and a list of the verbs and tenses to
  look at again, each linking to its table.
- On a phone the table keeps its shape with narrower boxes; with more than two
  tenses it scrolls sideways inside itself, never the whole page.

### On the Verbs page

Each verb shows its tenses with a mark for each, in ink (not red, which is for
warnings): ✓ learned, … learning, ✗ missed last time, ○ not tried.

### Marking

Exact, apart from capitals and punctuation, which are ignored as on
flashcards: `normaliseAnswer`, and the answer separators from Settings still
offer alternatives ("and/or"). Unlike flashcards, a near miss is not forgiven
as a typo, because one letter of an ending is what is being practised. Accents
must be right.

A tense counts as **right** in a session only when every box in its column is
right.

### Flashcards and the dashboard

- Verbs leave flashcard decks: "All items" draws words and phrases only, and
  the deck builder no longer offers "Verbs only". A verb card still sitting in
  one of the last ten saved decks is skipped.
- **Ready for review** counts words and phrases only.
- Beside it: "5 verb tenses due" with **Practise verbs**, which starts a Due
  session; or "3 tenses to learn" when nothing is due and some are not tried.
- **Your progress** still counts verbs, by their tenses (below).

## The schedule

Every (verb, tense) pair has its own record, with the same rules flashcards
use for an item: times seen and right, streak, lapses, ease, interval, next
due date. A right tense comes back later and later; a wrong one soon.

- A tense is **learned** at a streak of two or more, as an item is.
- A verb is **learned** when every tense currently on its table is learned;
  **learning** when any tense has been answered; **new** otherwise.
- A verb is **due** when any of its current tenses is due.
- A tense added to a table later starts as not tried, so a learned verb is not
  done again until the new tense is learned.
- A tense removed from a table is no longer counted; its record stays and
  counts again if a tense of the same name comes back. A tense is identified
  by its name on the table.
- Deleting a verb deletes its tense records (the foreign key cascades).

## Database

One migration, pushed to the live project with the owner's yes before any code
that needs it reaches `main`:

- **`verb_tense_progress`**: one row per (verb, tense) answered, with
  `user_id`, `item_id`, `tense` and the schedule columns of `progress`. Primary
  key `(item_id, tense)`; the composite foreign key `(item_id, user_id)` to
  `items` with `on delete cascade`, so a row can only belong to its owner's
  verb; an index for one account's due rows. RLS enabled, a select policy on
  `(select auth.uid()) = user_id`, and writes only through the function below.
- **`reviews.tense`**: a nullable text column, set for a verb tense answer and
  null for every other review, so the history says which tense was practised.
- **`record_tense_review(target_item, tense, answer, took_ms)`**: records one
  tense's result and moves its schedule, `security invoker`, checking that the
  item is the caller's verb table and the answer is one of the existing four.
  The scheduling arithmetic is shared with `record_review` in one helper
  function, so the two cannot drift apart.
- **`home_summary()`**: `due` counts words and phrases only; new columns
  `verb_tenses_due` and `verb_tenses_new`; New, Learning and Learned count a
  verb by its tenses as above.

`Docs/schema.md` gains the table, the column and the functions.

## How it is built

- `src/lib/verbPractice.ts`, pure and tested: the boxes to ask from a table and
  the chosen tenses; marking one box; whether a tense is right; a verb's state
  from its tense records; the order of a session.
- The **Practise** dialog on the Verbs page; the session page at
  `src/app/(workspace)/verbs/practise/`; the tense marks on each verb card.
- Reading due and new tenses through the browser client under RLS, and writing
  results through `record_tense_review`, the way flashcards use `record_review`.
- Changes to the deck builder, `flashcards.ts`, the dashboard summary and the
  review card.

## Testing

- Unit tests: boxes asked, including a tense a table lacks and an empty saved
  form; exact marking (an accent, a wrong ending, the separators, capitals);
  a tense's outcome; a verb's state, including a newly added tense; verbs left
  out of decks.
- The migration rehearsed against the local copy: recording a tense, the
  schedule moving, RLS refusing another account's rows, the dashboard summary.
- A browser pass on the local copy: a whole session at phone and desktop width,
  Tab and Enter, the results in the database, the tense marks, the dashboard
  line and its button.

## Order of work

1. The migration.
2. `verbPractice.ts` and its tests.
3. The dialog, the session page and the tense marks.
4. Flashcards and the dashboard.
5. README, `Docs/schema.md`, checks and the browser pass.

## Not in this

Choosing which persons to practise; a timed mode; reading the answers aloud
after checking; practising verbs inside grammar rules.
