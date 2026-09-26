# Pick up here

Written 24 September 2026 at the end of a design session, and brought up to
date on 26 September after the database refactor. Delete this file once the
work below has started.

## Where things stand

- The **grammar feature is fully designed** and nothing is built. The design
  of record is `Docs/grammar.md`. Every decision in it was made by the user,
  question by question, and confirmed as a whole. Do not re-open those
  decisions; build what it says.
- The database was **refactored on 25 September** (`Docs/db-refactor-plan.md`,
  `Docs/schema.md`), and the design's Data section was rewritten for it. The
  word for a rule's grouping is **Topic**.
- `Docs/grammar.md` and this file are **uncommitted**. `main` was otherwise
  clean at `457f8ec`. Ask before committing, and push only to `origin`.

## Next step

Turn **stage 1** of the build order in `Docs/grammar.md` into a detailed build
plan (the `superpowers:writing-plans` skill), and show it to the user before
writing code. Stage 1 is: the migration, the store, the Grammar list and rule
pages, text, table and example blocks, the reading view and Edit, topics in
Settings, navigation and the home page list card, backup and Excel export.

Ask the user first whether to commit `Docs/grammar.md`.

## Facts found during the session, worth not rediscovering

- **The old grammar page.** It was added in
  `20260920214501_add_grammar_rules.sql` and `20260920223201_add_grammar_categories.sql`,
  and dropped in `20260921110250_drop_grammar_rules.sql` (commit `fbaa483`).
  Do not revive that table. The new type is a value of `items.item_type`.
- **Adding a kind of item:** `Docs/schema.md`, "Adding a kind of item later".
  Grammar deliberately gets **no** branch in `has_answer` or `cardBack`; say
  so in `schema.md` when the type is added.
- **`items` columns:** `id, user_id, item_type, title, ref, source_id,
  needs_review, created_at, updated_at`, then the per-type detail columns and
  the generated `has_answer`. Collections are `tags(context='collection')`
  through `item_tags`; topics will be `tags(context='grammar')`. Language is
  per user in `user_settings`. Every write goes through `save_items(jsonb)`,
  which must declare any new column.
- **`set_updated_at`** compares the row without a short list of columns that
  are not edits; `map_x` and `map_y` join that list.
- **Links today:** `src/lib/parseRef.ts` (syntax), `src/components/RefField.tsx`
  and `src/lib/refSuggestions.ts` (writing and suggestions),
  `src/components/RefText.tsx` (`buildLinkIndex`, resolution by folded title,
  words win a clash). Only words and phrases are targets. A rename does not
  update links (`src/lib/renames.ts` handles collection and source renames only).
- **Stores:** `createRemoteStore` in `src/lib/remoteStore.ts`, one per list
  (`storage.ts`, `phraseStorage.ts`, `verbTables.ts`), each with an
  `itemType`, reading `items` with source and collections embedded and
  writing through `save_items`.
- **Verb table jsonb precedent:** `items.verb_rows`, typed in
  `src/lib/types.ts` (`VerbRow`, `readVerbRows`).
- **Answers:** `reviews` is append-only and written by `record_review`
  (security invoker), with outcomes `correct`, `again`, `revealed` and
  `skipped`; `progress` holds the schedule. Grammar practice records wrong and
  almost as `again`. This matters for stage 5, not stage 1.
- **Settings name lists:** `NameListEditor` with `removeBlockedBy` (see
  `CollectionsAndSources` in the settings page) is the pattern for the topics
  editor; `renames.ts` and `rename_tag(context, from, to)` handle renames and
  merges for any tag context.
- **Home page:** `src/app/(workspace)/page.tsx`. Three list cards, then the
  "Own your progress" card with `CreateDeckButton` (around lines 83 to 89).
- **Libraries:** no diagram, markdown or rich text library is installed.

## Rules to keep in mind

Everything in `CLAUDE.md` applies, in particular: the migration is pushed
before any code needing it reaches `main`; new tables get RLS in the same
migration; a new page goes under `src/app/(workspace)/`; read
`node_modules/next/dist/docs/` before writing Next code; check with
`npx tsc --noEmit`, `npx eslint src/`, `npx vitest run` and `npm run build`.
No em dashes, no seed content, no feature-selling copy in the interface.
