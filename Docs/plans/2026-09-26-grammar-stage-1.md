# Grammar, stage 1: rules and blocks. Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Grammar list of rules, each a stack of text, table and example blocks with a topic, readable and editable in the app, with topics in Settings, a nav tab, a home card, and rules carried in the JSON and Excel backups.

**Architecture:** A rule is a fourth `item_type` on the one `items` table, with its blocks as a jsonb array, and its topic a tag with `context = 'grammar'`. The list store is `createRemoteStore` with `itemType: "grammar"`, exactly like the three existing lists, and every write goes through `save_items`. Rendering of block text is the app's own small parser (bold, italic, bullets, `[[links]]`), not a library.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript 5, Tailwind 4, Supabase (Postgres 17, RLS, `@supabase/ssr`), Vitest 3 in the node environment, `write-excel-file`.

**Spec:** `Docs/grammar.md` (the design of record; this plan implements its Build order stage 1). Read it first. The schema it builds on is `Docs/schema.md`, and the project's rules are `CLAUDE.md`.

## Global Constraints

- No em dashes (U+2014) and no en dashes (U+2013) anywhere: code, comments, copy, commit messages, this plan's output. Use commas, colons, brackets or two sentences.
- Comments explain *why*, in full sentences, matching the density of the surrounding code.
- Interface copy is written for someone using the app, never describing or selling a feature.
- The word "category" is retired. A rule's grouping is a **Topic**; words and phrases have **Collections**.
- The migration is created with `npx supabase migration new <name>` (never a hand-invented filename), rehearsed locally, and pushed with `npx supabase db push` **before** any code that needs it reaches `main`. Vercel deploys every push to `main`.
- Every new page lives under `src/app/(workspace)/`. Read `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md` and `04-linking-and-navigating.md` before writing a page: this Next.js differs from training data.
- No note data in browser storage; no service-role key; RLS policies on `(select auth.uid()) = user_id`, one per command. The existing policies on `items`, `tags` and `item_tags` already cover the new type and context; the migration adds no policy.
- Nothing is seeded. The feature ships empty: no default topics, no example rules.
- Check with `npx tsc --noEmit`, `npx eslint src/`, `npx vitest run`, and `npm run build` when a route changed. Commit after each task; push to `origin` only, never to the Turing College remotes.
- Git commit messages end with the attribution line the session's system reminder gives.

## Review Focus

Inputs the spec implies that no task's tests would otherwise exercise, each pinned to a test in the task that owns it:

1. **A rule saved with no topic, or an empty title.** Expected: refused before it reaches the database, with a message on the form; and refused by `save_items` too. Tests: Task 1 (SQL rehearsal), Task 7 (`RuleEditor` disables Save).
2. **Markup that never closes**, such as `**bold` or `[[name` or a lone `*`. Expected: shown as the literal characters, never swallowed and never a crash. Test: Task 3.
3. **A table row shorter or longer than the others**, from a hand-edited backup. Expected: every row read to the same width; nothing dropped silently beyond the caps. Test: Task 2.
4. **A backup from version 10 or earlier**, which has no `rules` and no `topics`. Expected: imports exactly as before, and a Replace restore does not touch the rules or topics already saved. Tests: Task 9.
5. **Two rules with the same title differing only in case.** Expected: the add dialog and the editor refuse the second, matching the way words are matched (`foldName`), because the database's unique index would refuse it anyway with a worse message. Test: Task 4 (`findByTitle`), Task 8 (dialog uses it).

---

## File structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/<stamp>_grammar_rules.sql` (new, via CLI) | the `'grammar'` type, its columns and checks, the `'grammar'` tag context, `set_updated_at` and `save_items` taught the new columns and the topic |
| `src/lib/types.ts` (modify) | `Block`, `TextBlock`, `TableBlock`, `ExampleBlock`, `Rule`, `RuleInput` |
| `src/lib/blocks.ts` (new) + `blocks.test.ts` | reading blocks off unknown JSON, block constructors, reorder, table row/column edits, flattening for Excel |
| `src/lib/blockText.ts` (new) + `blockText.test.ts` | the text markup: inline tokens, lines and bullets, gaps in examples, plain text |
| `src/lib/remoteStore.ts` (modify) + `remoteStore.test.ts` | `ItemType` gains `"grammar"`; `flattenRow` gains `topic` |
| `src/lib/rules.ts` (new) + `ruleRow.test.ts` | the rule store: row and payload mapping, wire shape, parse, import |
| `src/lib/useRules.ts` (new) | the React hook |
| `src/lib/settings.ts`, `src/lib/renames.ts` (modify) + `renames.test.ts` | the topics list: load, save, rename through `rename_tag('grammar', …)` |
| `src/lib/settingsSections.ts` (modify) + test, `src/components/AccountMenu.tsx` (comment) | a Grammar settings section |
| `src/app/(workspace)/settings/page.tsx` (modify) | the topics editor |
| `src/components/Badges.tsx` (modify) | `TopicBadge` |
| `src/components/grammar/RichText.tsx`, `BlockView.tsx` (new) + `BlockView.test.tsx` | reading view of blocks |
| `src/components/grammar/BlockEditor.tsx`, `RuleEditor.tsx` (new) | editing |
| `src/components/grammar/AddRuleDialog.tsx` (new) | title and topic for a new rule |
| `src/app/(workspace)/grammar/page.tsx`, `src/app/(workspace)/rule/page.tsx` (new) | the list and the rule page |
| `src/components/MainNav.tsx` + test, `src/app/(workspace)/page.tsx`, `src/app/globals.css` (modify) | tab, home card, card colour |
| `src/lib/backup.ts`, `src/lib/backupFile.ts`, `src/components/backup/ImportDialog.tsx`, `ExportDialog.tsx` (modify) + four backup tests | rules in backups, version 11 |
| `Docs/schema.md`, `Docs/grammar.md` (modify), `HANDOFF.md` (delete) | record what was built |

Names used across tasks (a later task's implementer sees only their own task, so these are the contract):

```ts
// src/lib/types.ts
type TextBlock = { kind: "text"; id: string; text: string };
type TableBlock = { kind: "table"; id: string; headerRow: boolean; headerColumn: boolean; cells: string[][] };
type ExampleBlock = { kind: "example"; id: string; sentence: string; translation: string };
type Block = TextBlock | TableBlock | ExampleBlock;
type Rule = { id: string; title: string; topic: string; blocks: Block[]; dateAdded: string; dateUpdated: string | null };
type RuleInput = { title: string; topic: string; blocks: Block[] };

// src/lib/blocks.ts
MAX_BLOCKS = 200; MAX_TABLE_ROWS = 30; MAX_TABLE_COLUMNS = 12
readBlocks(value: unknown): Block[]
newTextBlock(): TextBlock; newTableBlock(): TableBlock; newExampleBlock(): ExampleBlock
moveBlock(blocks: Block[], from: number, to: number): Block[]
withRow(table: TableBlock): TableBlock; withoutLastRow(table): TableBlock
withColumn(table): TableBlock; withoutLastColumn(table): TableBlock
withCell(table, row: number, column: number, value: string): TableBlock
flattenBlocks(blocks: Block[]): string

// src/lib/blockText.ts
type InlineToken = { kind: "text" | "bold" | "italic"; value: string } | { kind: "link"; name: string }
type TextLine = { kind: "paragraph" | "bullet"; tokens: InlineToken[] }
parseInline(text: string): InlineToken[]
parseTextBlock(text: string): TextLine[]
splitGaps(sentence: string): { value: string; gap: boolean }[]
plainText(text: string): string

// src/lib/rules.ts
subscribe, getSnapshot, getServerSnapshot, clearError, subscribeToError, getError, settled, reload
getRules(): Rule[]; findByTitle: (name: string, ignoreId?: string) => Rule | undefined
createRule(input: { title: string; topic: string }): Rule
updateRule(id: string, input: RuleInput): Rule | null
deleteRules: (ids: readonly string[]) => number
fromRuleRow(row): Rule | null; toRulePayload(rule): Record<string, unknown>
type WireRule = { id; title; topic; blocks: Block[]; dateAdded; dateUpdated }
toWireRule(rule): WireRule; parseRule(raw, allowMissingId?): Rule | null
parseRuleList(list: unknown[]): { rules: Rule[]; unreadable: number }
importRules(incoming: Rule[], mode: ImportMode): ImportCounts

// src/lib/useRules.ts
useRules(): { rules: Rule[]; loaded: boolean; error: string | null }

// src/lib/settings.ts
Settings.topics: string[]      // sorted, no defaults
// src/lib/renames.ts
renameTopic(from: string, to: string): Promise<string | null>
```

---

### Task 1: The migration

**Files:**
- Create: `supabase/migrations/<stamp>_grammar_rules.sql` (the CLI names it)
- Reference: `supabase/migrations/20260925154728_refactor_build_new_schema.sql` (the `save_items` and `set_updated_at` bodies this replaces, lines 241 to 430)

**Interfaces:**
- Produces: `items.blocks jsonb`, `items.map_x real`, `items.map_y real`; `item_type = 'grammar'`; `tags.context = 'grammar'`; `save_items` accepting payload keys `topic` (a name), `blocks`, `map_x`, `map_y` for a grammar item.

- [ ] **Step 1: Create the file**

```bash
cd "C:/Users/Liezl/Documents/Building with AI Course/Sprint2_Project_Captured"
npx supabase migration new grammar_rules
```

- [ ] **Step 2: Write the migration**

Replace the created file's contents with:

```sql
-- Grammar rules: a fourth kind of item, and topics, a second tag context.
-- `Docs/grammar.md` is the design; this is its Data section.
--
-- Additive. Nothing the app reads today changes shape, so the app keeps
-- working between this push and the deploy that starts writing rules.

/* --------------------------------------------------- the fourth item type */

alter table public.items drop constraint items_item_type_check;
alter table public.items add constraint items_item_type_check
  check (item_type in ('word', 'phrase', 'verb_table', 'grammar'));

-- A rule's content is an ordered array of blocks, read and written whole,
-- which is what jsonb is for; a new block type is a new shape in the array,
-- not a column. `map_x` and `map_y` are where the rule sits on the map,
-- unset until it has been placed (stage 4 of the design).
alter table public.items
  add column blocks jsonb,
  add column map_x real,
  add column map_y real,
  add constraint items_grammar_fields check ((item_type = 'grammar') = (blocks is not null)),
  add constraint items_blocks_limit check (
    blocks is null
    or (jsonb_typeof(blocks) = 'array' and jsonb_array_length(blocks) <= 200)),
  add constraint items_map_only_grammar check (
    item_type = 'grammar' or (map_x is null and map_y is null)),
  -- A rule has no source, for the reason a verb table has none: Settings
  -- counts a source's uses from words and phrases only.
  add constraint items_grammar_no_source check (item_type <> 'grammar' or source_id is null);

-- `has_answer` has no branch for grammar and falls to `else false`. That is
-- deliberate: rules make no flashcards. `build_deck` and the deck dialog only
-- ever draw from items with an answer, so rules stay out of decks without
-- anything more being said.

/* -------------------------------------------------------- the topic context */

-- Topics are tags in their own context: a rule has exactly one, and the list
-- is separate from collections. The check keeps a rule to at most one;
-- `save_items` refuses a rule with none.
alter table public.tags drop constraint tags_context_check;
alter table public.tags add constraint tags_context_check
  check (context in ('collection', 'grammar'));

alter table public.item_tags add constraint item_tags_grammar_one
  check (context <> 'grammar' or position = 1);

/* ---------------------------------------------- moving a node is not an edit */

create or replace function public.set_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.updated_at is distinct from old.updated_at then
    return new;
  end if;
  -- Dragging a rule on the map changes `map_x` and `map_y` and nothing the
  -- reader wrote, so it joins the columns that do not count as an edit.
  if (to_jsonb(new) - array['updated_at', 'needs_review', 'source_id', 'has_answer', 'map_x', 'map_y'])
     is distinct from
     (to_jsonb(old) - array['updated_at', 'needs_review', 'source_id', 'has_answer', 'map_x', 'map_y']) then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

/* ----------------------------------------------- save_items learns rules */

-- The body of `refactor_build_new_schema` with the grammar columns declared
-- and the topic resolved, the way a source is: by name, created if missing.
-- `create or replace` keeps the grants. A key absent from the payload leaves
-- that part of an existing item alone, as before; `map_x` and `map_y` are
-- absent from every save the rule editor makes and present only from the map.
create or replace function public.save_items(payload jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  owner uuid := auth.uid();
begin
  if owner is null then
    raise exception 'not signed in';
  end if;
  if jsonb_typeof(payload) is distinct from 'array' then
    raise exception 'save_items takes an array of items';
  end if;
  if exists (select 1 from jsonb_array_elements(payload) e where e ->> 'id' is null) then
    raise exception 'every item needs an id';
  end if;
  -- A rule sent with a blank topic, or a new rule sent without one, has no
  -- topic to be filed under; the check on `item_tags` holds it to one.
  if exists (
    select 1 from jsonb_array_elements(payload) e
    where e ->> 'item_type' = 'grammar'
      and btrim(coalesce(e ->> 'topic', '')) = ''
      and (e ? 'topic' or not exists (
        select 1 from public.item_tags it
        where it.item_id = (e ->> 'id')::uuid and it.context = 'grammar'))
  ) then
    raise exception 'a rule needs a topic';
  end if;

  insert into public.sources (user_id, name)
  select distinct on (lower(btrim(e ->> 'source'))) owner, btrim(e ->> 'source')
  from jsonb_array_elements(payload) e
  where btrim(coalesce(e ->> 'source', '')) <> ''
    and e ->> 'item_type' not in ('verb_table', 'grammar')
  order by lower(btrim(e ->> 'source'))
  on conflict (user_id, lower(name)) do nothing;

  with s as (
    select * from jsonb_to_recordset(payload) as x(
      id uuid, item_type text, title text, ref text, source text,
      needs_review boolean, definition text, literal_meaning text,
      usage_example text, tenses text[], verb_rows jsonb, blocks jsonb,
      map_x real, map_y real, created_at timestamptz, updated_at timestamptz)
  ), shaped as (
    select
      s.id, s.item_type, btrim(coalesce(s.title, '')) as title,
      coalesce(s.ref, '') as ref, s.needs_review, s.created_at, s.updated_at,
      s.map_x, s.map_y,
      s.source is not null and s.item_type not in ('verb_table', 'grammar') as has_source,
      case when s.item_type not in ('verb_table', 'grammar') then (
        select src.id from public.sources src
        where src.user_id = owner and lower(src.name) = lower(btrim(s.source))) end as source_id,
      case when s.item_type = 'word' then coalesce(s.definition, '') end as definition,
      case when s.item_type = 'phrase' then coalesce(s.literal_meaning, '') end as literal_meaning,
      case when s.item_type = 'phrase' then coalesce(s.usage_example, '') end as usage_example,
      case when s.item_type = 'verb_table' then coalesce(s.tenses, '{}') end as tenses,
      case when s.item_type = 'verb_table' then coalesce(s.verb_rows, '[]') end as verb_rows,
      case when s.item_type = 'grammar' then coalesce(s.blocks, '[]') end as blocks
    from s
  ), updated as (
    update public.items i set
      item_type = sh.item_type,
      title = sh.title,
      ref = sh.ref,
      source_id = case when sh.has_source then sh.source_id else i.source_id end,
      needs_review = coalesce(sh.needs_review, i.needs_review),
      updated_at = coalesce(sh.updated_at, i.updated_at),
      definition = sh.definition,
      literal_meaning = sh.literal_meaning,
      usage_example = sh.usage_example,
      tenses = sh.tenses,
      verb_rows = sh.verb_rows,
      blocks = sh.blocks,
      map_x = coalesce(sh.map_x, i.map_x),
      map_y = coalesce(sh.map_y, i.map_y)
    from shaped sh
    where i.id = sh.id
    returning i.id
  )
  insert into public.items
    (id, user_id, item_type, title, ref, source_id, needs_review, created_at,
     updated_at, definition, literal_meaning, usage_example, tenses, verb_rows,
     blocks, map_x, map_y)
  select
    sh.id, owner, sh.item_type, sh.title, sh.ref, sh.source_id,
    coalesce(sh.needs_review, false), coalesce(sh.created_at, now()),
    coalesce(sh.updated_at, sh.created_at, now()),
    sh.definition, sh.literal_meaning, sh.usage_example, sh.tenses, sh.verb_rows,
    sh.blocks, sh.map_x, sh.map_y
  from shaped sh
  where not exists (select 1 from updated u where u.id = sh.id);

  -- Collections, unchanged from before.
  insert into public.tags (user_id, context, name)
  select distinct on (lower(btrim(n))) owner, 'collection', btrim(n)
  from jsonb_array_elements(payload) e,
       jsonb_array_elements_text(
         case when jsonb_typeof(e -> 'collections') = 'array' then e -> 'collections' end) n
  where btrim(n) <> ''
  order by lower(btrim(n))
  on conflict (user_id, context, lower(name)) do nothing;

  delete from public.item_tags it
  using jsonb_array_elements(payload) e
  where jsonb_typeof(e -> 'collections') = 'array'
    and it.item_id = (e ->> 'id')::uuid
    and it.context = 'collection';

  insert into public.item_tags (item_id, tag_id, user_id, context, position)
  select item_id, tag_id, owner, 'collection',
         row_number() over (partition by item_id order by first_at)
  from (
    select (e ->> 'id')::uuid as item_id, t.id as tag_id, min(n.at) as first_at
    from jsonb_array_elements(payload) e,
         jsonb_array_elements_text(
           case when jsonb_typeof(e -> 'collections') = 'array' then e -> 'collections' end)
           with ordinality as n(name, at)
    join public.tags t
      on t.user_id = owner and t.context = 'collection'
     and lower(t.name) = lower(btrim(n.name))
    where jsonb_typeof(e -> 'collections') = 'array'
    group by 1, 2
  ) picked;

  -- Topics, for the rules that sent a `topic`: one name, one link.
  insert into public.tags (user_id, context, name)
  select distinct on (lower(btrim(e ->> 'topic'))) owner, 'grammar', btrim(e ->> 'topic')
  from jsonb_array_elements(payload) e
  where e ->> 'item_type' = 'grammar' and btrim(coalesce(e ->> 'topic', '')) <> ''
  order by lower(btrim(e ->> 'topic'))
  on conflict (user_id, context, lower(name)) do nothing;

  delete from public.item_tags it
  using jsonb_array_elements(payload) e
  where e ->> 'item_type' = 'grammar' and e ? 'topic'
    and it.item_id = (e ->> 'id')::uuid
    and it.context = 'grammar';

  insert into public.item_tags (item_id, tag_id, user_id, context, position)
  select (e ->> 'id')::uuid, t.id, owner, 'grammar', 1
  from jsonb_array_elements(payload) e
  join public.tags t
    on t.user_id = owner and t.context = 'grammar'
   and lower(t.name) = lower(btrim(e ->> 'topic'))
  where e ->> 'item_type' = 'grammar' and btrim(coalesce(e ->> 'topic', '')) <> '';
end;
$$;

/* ---------------------------------------------------------- the proof */

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'items_grammar_fields')
     or not exists (select 1 from pg_constraint where conname = 'item_tags_grammar_one')
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'items' and column_name = 'blocks') then
    raise exception 'the grammar columns or checks did not land';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_updated_at' and p.prosrc like '%map_x%'
  ) then
    raise exception 'set_updated_at does not exclude the map position';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('save_items', 'set_updated_at')
      and (p.prosecdef or p.proconfig is distinct from array['search_path=""'])
  ) then
    raise exception 'a replaced function lost its security settings';
  end if;
end;
$$;
```

- [ ] **Step 3: Check the file for dashes**

Run: `grep -cP "[\x{2013}\x{2014}]" supabase/migrations/*_grammar_rules.sql`
Expected: `0`

- [ ] **Step 4: Rehearse locally**

```bash
npx supabase start
npx supabase db reset --local
```
Expected: the last line names the new migration among those applied, with no error.

- [ ] **Step 5: Exercise the behaviour as a signed-in user**

Save as `%TEMP%\grammar-rehearsal.sql` and run with `docker exec -i supabase_db_Sprint2_Project_Captured psql -U postgres -d postgres < "%TEMP%\grammar-rehearsal.sql"` (from Git Bash: `< "$TEMP/grammar-rehearsal.sql"`). It creates a throwaway account first.

```sql
\set ON_ERROR_STOP 0
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data)
values ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'rehearsal@example.test', crypt('x', gen_salt('bf', 4)), now(), now(), now(), '', '', '', '', '{}', '{}');
begin;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
-- A rule with a topic: saved, filed, and no flashcard.
select public.save_items('[{"id":"22222222-2222-4222-8222-222222222222","item_type":"grammar","title":"Dative","topic":"Cases","blocks":[{"kind":"text","id":"b1","text":"Wem?"}]}]'::jsonb);
select 'saved' as t, title, has_answer, (select t.name from public.item_tags it join public.tags t on t.id = it.tag_id where it.item_id = i.id and it.context = 'grammar') as topic
from public.items i where id = '22222222-2222-4222-8222-222222222222';
-- Changing the topic replaces the link; leaving the key out keeps it.
select public.save_items('[{"id":"22222222-2222-4222-8222-222222222222","item_type":"grammar","title":"Dative","topic":"Nouns","blocks":[]}]'::jsonb);
select public.save_items('[{"id":"22222222-2222-4222-8222-222222222222","item_type":"grammar","title":"Dative","blocks":[]}]'::jsonb);
select 'after' as t, count(*) as links, string_agg(t.name, ',') as topics from public.item_tags it join public.tags t on t.id = it.tag_id where it.item_id = '22222222-2222-4222-8222-222222222222';
-- Refused: a new rule with no topic, and a rule with a blank one.
savepoint a; select public.save_items('[{"id":"33333333-3333-4333-8333-333333333333","item_type":"grammar","title":"Genitive","blocks":[]}]'::jsonb); rollback to savepoint a;
savepoint b; select public.save_items('[{"id":"22222222-2222-4222-8222-222222222222","item_type":"grammar","title":"Dative","topic":"  ","blocks":[]}]'::jsonb); rollback to savepoint b;
-- Dragging on the map is not an edit; changing a block is.
update public.items set map_x = 10, map_y = 20 where id = '22222222-2222-4222-8222-222222222222';
select 'moved' as t, updated_at = created_at as never_edited from public.items where id = '22222222-2222-4222-8222-222222222222';
rollback;
delete from auth.users where id = '11111111-1111-4111-8111-111111111111';
```

Expected output, in order: `saved | Dative | f | Cases`; `after | 1 | Nouns`; `ERROR: a rule needs a topic` twice; `moved | t`.

- [ ] **Step 6: Push to the live project**

Ask the owner before this step; it changes the live database. Then:

```bash
npx supabase db push --linked --yes
npx supabase db advisors --linked --type security
```
Expected: the migration listed as applied; the advisors show no new security finding (leaked password protection is the one known warning).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/*_grammar_rules.sql
git commit -m "Add the grammar item type, its columns and the topic tag context"
```

---

### Task 2: Block types and `blocks.ts`

**Files:**
- Modify: `src/lib/types.ts` (append after the verbs section, before `/* ---- import */`)
- Create: `src/lib/blocks.ts`, `src/lib/blocks.test.ts`

**Interfaces:**
- Consumes: `readString` from `src/lib/types.ts`; `plainText` from `src/lib/blockText.ts` (Task 3; until then, `flattenBlocks` is written in Task 3's last step)
- Produces: the types and functions listed under "Names used across tasks"

- [ ] **Step 1: Add the types**

In `src/lib/types.ts`, before `/* ---- import */`:

```ts
/* ----------------------------------------------------------------- grammar */

/** One passage of a rule, in the app's own light markup; see `blockText.ts`. */
export type TextBlock = { kind: "text"; id: string; text: string };

/**
 * A free grid, `cells[row][column]`, every row the same width. The two flags
 * say whether the first row and the first column are labels rather than
 * content, which is what names a hidden cell when a rule is practised.
 */
export type TableBlock = {
  kind: "table";
  id: string;
  headerRow: boolean;
  headerColumn: boolean;
  cells: string[][];
};

/**
 * A sentence in the language with its translation. Words the example is
 * about are marked in braces, `Ich gebe {dem} Mann das Buch`, and are what
 * practice blanks out.
 */
export type ExampleBlock = {
  kind: "example";
  id: string;
  sentence: string;
  translation: string;
};

export type Block = TextBlock | TableBlock | ExampleBlock;

/**
 * A grammar rule: a title, one topic, and an ordered stack of blocks. The
 * blocks are one jsonb array on the row, so a new block type is a new shape
 * here and in `readBlocks`, not a schema change.
 */
export type Rule = {
  id: string;
  title: string;
  /** Exactly one, from the topics list in Settings. */
  topic: string;
  blocks: Block[];
  dateAdded: string;
  dateUpdated: string | null;
};

export type RuleInput = { title: string; topic: string; blocks: Block[] };
```

- [ ] **Step 2: Write the failing tests**

`src/lib/blocks.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  MAX_BLOCKS,
  MAX_TABLE_COLUMNS,
  moveBlock,
  newTableBlock,
  newTextBlock,
  readBlocks,
  withCell,
  withColumn,
  withoutLastColumn,
  withoutLastRow,
  withRow,
} from "@/lib/blocks";
import type { TableBlock } from "@/lib/types";

/**
 * Blocks come off a jsonb column and out of backup files, and both can hold
 * anything. A reader that throws on one odd block would make a whole rule
 * unopenable, and one that quietly straightens a table could hide a cell.
 */
describe("readBlocks", () => {
  it("reads the three kinds and keeps their order", () => {
    const blocks = readBlocks([
      { kind: "text", id: "a", text: "Wem?" },
      { kind: "table", id: "b", headerRow: true, headerColumn: false, cells: [["x", "y"]] },
      { kind: "example", id: "c", sentence: "Ich gebe {dem} Mann", translation: "I give the man" },
    ]);
    expect(blocks.map((block) => block.kind)).toEqual(["text", "table", "example"]);
    expect(blocks[0]).toEqual({ kind: "text", id: "a", text: "Wem?" });
  });

  it("skips what it cannot read, rather than refusing the rule", () => {
    const blocks = readBlocks([null, 42, { kind: "drawing" }, { kind: "text", id: "a", text: "ok" }]);
    expect(blocks).toHaveLength(1);
  });

  it("gives a block without an id one, so React can key it", () => {
    const [block] = readBlocks([{ kind: "text", text: "no id" }]);
    expect(block.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reads a ragged table to one width, padding short rows and never dropping a cell", () => {
    const [table] = readBlocks([{ kind: "table", id: "t", cells: [["a"], ["b", "c", "d"], []] }]) as [
      TableBlock,
    ];
    expect(table.cells).toEqual([
      ["a", "", ""],
      ["b", "c", "d"],
      ["", "", ""],
    ]);
    // The flags default to off; a hand-written file need not spell them out.
    expect(table.headerRow).toBe(false);
    expect(table.headerColumn).toBe(false);
  });

  it("caps a table's width and the number of blocks", () => {
    const wide = Array.from({ length: MAX_TABLE_COLUMNS + 5 }, (_, at) => String(at));
    const [table] = readBlocks([{ kind: "table", id: "t", cells: [wide] }]) as [TableBlock];
    expect(table.cells[0]).toHaveLength(MAX_TABLE_COLUMNS);

    const many = Array.from({ length: MAX_BLOCKS + 10 }, () => ({ kind: "text", id: "x", text: "" }));
    expect(readBlocks(many)).toHaveLength(MAX_BLOCKS);
  });

  it("gives an empty table one empty cell, so it can be edited", () => {
    const [table] = readBlocks([{ kind: "table", id: "t", cells: [] }]) as [TableBlock];
    expect(table.cells).toEqual([[""]]);
  });

  it("reads nothing from something that is not a list", () => {
    expect(readBlocks(null)).toEqual([]);
    expect(readBlocks("text")).toEqual([]);
  });
});

describe("moveBlock", () => {
  const blocks = [newTextBlock(), newTextBlock(), newTextBlock()];
  const ids = (list: typeof blocks) => list.map((block) => block.id);

  it("moves a block to a new place and leaves the rest in order", () => {
    const moved = moveBlock(blocks, 0, 2);
    expect(ids(moved)).toEqual([blocks[1].id, blocks[2].id, blocks[0].id]);
  });

  it("does nothing for a place outside the list, or the same place", () => {
    expect(moveBlock(blocks, 0, 0)).toBe(blocks);
    expect(moveBlock(blocks, 0, 7)).toBe(blocks);
    expect(moveBlock(blocks, -1, 1)).toBe(blocks);
  });
});

describe("table edits", () => {
  const table = withCell(withRow(withColumn(newTableBlock())), 1, 1, "dem");

  it("adds rows and columns of empty cells, keeping every row the same width", () => {
    expect(table.cells).toEqual([
      ["", ""],
      ["", "dem"],
    ]);
  });

  it("removes the last row or column, but never the last of either", () => {
    expect(withoutLastRow(table).cells).toEqual([["", ""]]);
    expect(withoutLastColumn(table).cells).toEqual([[""], [""]]);
    expect(withoutLastRow(withoutLastRow(table)).cells).toEqual([["", ""]]);
    expect(withoutLastColumn(withoutLastColumn(table)).cells).toEqual([[""], [""]]);
  });

  it("does not change the table it was given", () => {
    const before = JSON.stringify(table);
    withCell(table, 0, 0, "x");
    withRow(table);
    expect(JSON.stringify(table)).toBe(before);
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run src/lib/blocks.test.ts`
Expected: FAIL, cannot find module `@/lib/blocks`.

- [ ] **Step 4: Write `src/lib/blocks.ts`**

```ts
import { plainText } from "@/lib/blockText";
import { readString, type Block, type ExampleBlock, type TableBlock, type TextBlock } from "@/lib/types";

/** Matches the check on `items.blocks`. */
export const MAX_BLOCKS = 200;
/** Enough for any paradigm; a guard against a runaway file, not a design limit. */
export const MAX_TABLE_ROWS = 30;
export const MAX_TABLE_COLUMNS = 12;

/**
 * A block id is only a key: React needs one to keep an editor's state with
 * its block through a reorder, and nothing else reads it. Made here rather
 * than by `createId` in `remoteStore` so this module stays free of the
 * database and its session, which its tests do not need.
 */
const newId = () => crypto.randomUUID();

export const newTextBlock = (): TextBlock => ({ kind: "text", id: newId(), text: "" });
export const newTableBlock = (): TableBlock => ({
  kind: "table",
  id: newId(),
  headerRow: true,
  headerColumn: false,
  cells: [[""]],
});
export const newExampleBlock = (): ExampleBlock => ({
  kind: "example",
  id: newId(),
  sentence: "",
  translation: "",
});

/**
 * A table's cells off unknown JSON: every row read to the same width, the
 * widest row's, so a cell is never dropped because its row was longer than
 * the one above. Short rows are padded with empty cells. At least one cell
 * always, so an empty table can still be edited.
 */
function readCells(value: unknown): string[][] {
  const rows = (Array.isArray(value) ? value : [])
    .slice(0, MAX_TABLE_ROWS)
    .map((row) => (Array.isArray(row) ? row.map((cell) => readString(cell)) : []));
  const width = Math.max(1, Math.min(MAX_TABLE_COLUMNS, ...rows.map((row) => row.length)));
  if (rows.length === 0) rows.push([]);
  return rows.map((row) => Array.from({ length: width }, (_, at) => row[at] ?? ""));
}

function readBlock(raw: unknown): Block | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;
  const id = readString(value.id).trim() || newId();
  switch (value.kind) {
    case "text":
      return { kind: "text", id, text: readString(value.text) };
    case "table":
      return {
        kind: "table",
        id,
        headerRow: value.headerRow === true,
        headerColumn: value.headerColumn === true,
        cells: readCells(value.cells),
      };
    case "example":
      return {
        kind: "example",
        id,
        sentence: readString(value.sentence),
        translation: readString(value.translation),
      };
    default:
      // A block type this version does not know, such as a drawing from a
      // later one, is skipped rather than refusing the rule around it.
      return null;
  }
}

/**
 * The blocks off a jsonb column or a backup. Anything unreadable is skipped
 * rather than throwing: a rule with one odd block should still open.
 */
export function readBlocks(value: unknown): Block[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_BLOCKS)
    .map(readBlock)
    .filter((block): block is Block => block !== null);
}

/** The list with the block at `from` moved to `to`; the same list when there is nothing to do. */
export function moveBlock(blocks: Block[], from: number, to: number): Block[] {
  const inRange = (at: number) => at >= 0 && at < blocks.length;
  if (from === to || !inRange(from) || !inRange(to)) return blocks;
  const next = [...blocks];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/* The table edits return a new block; the editor keeps the old one until it
   is saved, so an edit that is cancelled costs nothing. */

export function withRow(table: TableBlock): TableBlock {
  if (table.cells.length >= MAX_TABLE_ROWS) return table;
  const width = table.cells[0]?.length ?? 1;
  return { ...table, cells: [...table.cells, Array.from({ length: width }, () => "")] };
}

export function withoutLastRow(table: TableBlock): TableBlock {
  if (table.cells.length <= 1) return table;
  return { ...table, cells: table.cells.slice(0, -1) };
}

export function withColumn(table: TableBlock): TableBlock {
  if ((table.cells[0]?.length ?? 0) >= MAX_TABLE_COLUMNS) return table;
  return { ...table, cells: table.cells.map((row) => [...row, ""]) };
}

export function withoutLastColumn(table: TableBlock): TableBlock {
  if ((table.cells[0]?.length ?? 0) <= 1) return table;
  return { ...table, cells: table.cells.map((row) => row.slice(0, -1)) };
}

export function withCell(table: TableBlock, row: number, column: number, value: string): TableBlock {
  return {
    ...table,
    cells: table.cells.map((cells, r) =>
      r === row ? cells.map((cell, c) => (c === column ? value : cell)) : cells,
    ),
  };
}

/**
 * A rule's content as one string, for the Excel sheet, where a cell cannot
 * hold blocks. Tables become one line per row with cells separated by a
 * pipe, examples show the translation in brackets, and the markup is
 * stripped. The JSON backup protects the content; this is for glancing at.
 */
export function flattenBlocks(blocks: Block[]): string {
  return blocks
    .map((block) => {
      switch (block.kind) {
        case "text":
          return plainText(block.text);
        case "table":
          return block.cells.map((row) => row.map(plainText).join(" | ")).join("\n");
        case "example":
          return `${plainText(block.sentence)} (${block.translation})`;
      }
    })
    .filter((text) => text.trim() !== "")
    .join("\n\n");
}
```

Until Task 3 exists, add a temporary `src/lib/blockText.ts` holding only `export const plainText = (text: string) => text;` so this compiles; Task 3 replaces it.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/blocks.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/blocks.ts src/lib/blocks.test.ts src/lib/blockText.ts
git commit -m "Add the block and rule types, and the block reader"
```

---

### Task 3: The text markup, `blockText.ts`

**Files:**
- Create (replacing the stub): `src/lib/blockText.ts`, `src/lib/blockText.test.ts`

**Interfaces:**
- Produces: `parseInline`, `parseTextBlock`, `splitGaps`, `plainText` and the `InlineToken`, `TextLine` types.

- [ ] **Step 1: Write the failing tests**

`src/lib/blockText.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { parseInline, parseTextBlock, plainText, splitGaps } from "@/lib/blockText";

/**
 * The markup is deliberately tiny: bold, italic, bullets and `[[links]]`.
 * What matters is that anything else, including markup that never closes,
 * comes out as the characters typed. Text that vanishes because a star was
 * left open is the failure this guards against.
 */
describe("parseInline", () => {
  it("reads bold, italic and links in among plain text", () => {
    expect(parseInline("Der **Dativ** ist *wichtig*, siehe [[Cases]].")).toEqual([
      { kind: "text", value: "Der " },
      { kind: "bold", value: "Dativ" },
      { kind: "text", value: " ist " },
      { kind: "italic", value: "wichtig" },
      { kind: "text", value: ", siehe " },
      { kind: "link", name: "Cases" },
      { kind: "text", value: "." },
    ]);
  });

  it("shows unclosed markup as the characters typed", () => {
    expect(parseInline("a **b")).toEqual([{ kind: "text", value: "a **b" }]);
    expect(parseInline("a *b")).toEqual([{ kind: "text", value: "a *b" }]);
    expect(parseInline("a [[b")).toEqual([{ kind: "text", value: "a [[b" }]);
    expect(parseInline("2 * 3 * 4")).toEqual([{ kind: "text", value: "2 * 3 * 4" }]);
  });

  it("does not read across a line break", () => {
    expect(parseInline("**a\nb**")).toEqual([{ kind: "text", value: "**a\nb**" }]);
  });

  it("returns nothing for an empty string", () => {
    expect(parseInline("")).toEqual([]);
  });
});

describe("parseTextBlock", () => {
  it("makes a paragraph of each line and a bullet of each line starting with a dash", () => {
    expect(parseTextBlock("First.\n- one\n- two\nLast.")).toEqual([
      { kind: "paragraph", tokens: [{ kind: "text", value: "First." }] },
      { kind: "bullet", tokens: [{ kind: "text", value: "one" }] },
      { kind: "bullet", tokens: [{ kind: "text", value: "two" }] },
      { kind: "paragraph", tokens: [{ kind: "text", value: "Last." }] },
    ]);
  });

  it("drops blank lines, and keeps a dash that is not a bullet", () => {
    expect(parseTextBlock("a\n\n\n-b")).toEqual([
      { kind: "paragraph", tokens: [{ kind: "text", value: "a" }] },
      { kind: "paragraph", tokens: [{ kind: "text", value: "-b" }] },
    ]);
  });
});

describe("splitGaps", () => {
  it("marks the words in braces", () => {
    expect(splitGaps("Ich gebe {dem} Mann {das} Buch")).toEqual([
      { value: "Ich gebe ", gap: false },
      { value: "dem", gap: true },
      { value: " Mann ", gap: false },
      { value: "das", gap: true },
      { value: " Buch", gap: false },
    ]);
  });

  it("leaves an unclosed or empty brace as text", () => {
    expect(splitGaps("a {b")).toEqual([{ value: "a {b", gap: false }]);
    expect(splitGaps("a {} b")).toEqual([{ value: "a {} b", gap: false }]);
  });
});

describe("plainText", () => {
  it("strips the markup and the braces, keeping the words", () => {
    expect(plainText("**Dativ** und *Akkusativ*, siehe [[Cases]]: {dem}")).toBe(
      "Dativ und Akkusativ, siehe Cases: dem",
    );
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/lib/blockText.test.ts`
Expected: FAIL, `parseInline` is not exported.

- [ ] **Step 3: Write `src/lib/blockText.ts`**

```ts
/**
 * The markup a text block accepts, and nothing more:
 *
 *   **bold**   *italic*   [[Name]] links   lines starting with "- " as bullets
 *
 * Rendered by the app's own code rather than a markdown library, because this
 * set does not justify one. The one rule that matters is that anything the
 * parser does not recognise, including markup that is never closed, comes out
 * as the characters typed: a star left open must not swallow a paragraph.
 */

export type InlineToken =
  | { kind: "text"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "italic"; value: string }
  /** A name, resolved against the link index when shown; see `RefText`. */
  | { kind: "link"; name: string };

export type TextLine = { kind: "paragraph" | "bullet"; tokens: InlineToken[] };

/**
 * The same shape as `NAME_LINK` in `parseRef.ts`: a link never spans a line
 * and never holds a bracket. Kept as its own copy because that module also
 * turns bare URLs into links, which a passage of grammar must not do to
 * every slash it contains.
 */
const LINK = /(\[\[[^[\]\n]+\]\])/;
/** Bold before italic, so `**` is not read as an empty italic pair. */
const EMPHASIS = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/;

function pushText(tokens: InlineToken[], value: string): void {
  if (!value) return;
  const last = tokens[tokens.length - 1];
  if (last && last.kind === "text") last.value += value;
  else tokens.push({ kind: "text", value });
}

export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  for (const segment of text.split(LINK)) {
    if (!segment) continue;
    if (LINK.test(segment) && segment.startsWith("[[")) {
      const name = segment.slice(2, -2).trim();
      if (name) tokens.push({ kind: "link", name });
      else pushText(tokens, segment);
      continue;
    }
    for (const part of segment.split(EMPHASIS)) {
      if (!part) continue;
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        tokens.push({ kind: "bold", value: part.slice(2, -2) });
      } else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
        tokens.push({ kind: "italic", value: part.slice(1, -1) });
      } else {
        pushText(tokens, part);
      }
    }
  }
  return tokens;
}

/**
 * Lines become paragraphs, a line starting with "- " becomes a bullet, and
 * blank lines are dropped: each line is already its own block on screen, so
 * an empty one would only be a gap.
 */
export function parseTextBlock(text: string): TextLine[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) =>
      line.startsWith("- ")
        ? { kind: "bullet", tokens: parseInline(line.slice(2)) }
        : { kind: "paragraph", tokens: parseInline(line) },
    );
}

/** The gaps in an example, `{dem}`, split out from the words around them. */
export function splitGaps(sentence: string): { value: string; gap: boolean }[] {
  const parts: { value: string; gap: boolean }[] = [];
  for (const segment of sentence.split(/(\{[^{}\n]+\})/)) {
    if (!segment) continue;
    if (segment.startsWith("{") && segment.endsWith("}") && segment.length > 2) {
      parts.push({ value: segment.slice(1, -1), gap: true });
    } else {
      const last = parts[parts.length - 1];
      if (last && !last.gap) last.value += segment;
      else parts.push({ value: segment, gap: false });
    }
  }
  return parts;
}

/** The words without their markup, for a spreadsheet cell or a search. */
export function plainText(text: string): string {
  return text
    .split("\n")
    .map((line) =>
      parseInline(line)
        .map((token) => (token.kind === "link" ? token.name : token.value))
        .join(""),
    )
    .join("\n")
    .replace(/\{([^{}\n]+)\}/g, "$1");
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/blockText.test.ts src/lib/blocks.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the flatten test to `blocks.test.ts`**

Append:

```ts
describe("flattenBlocks", () => {
  it("writes a rule as readable lines for a spreadsheet", async () => {
    const { flattenBlocks } = await import("@/lib/blocks");
    const text = flattenBlocks([
      { kind: "text", id: "a", text: "**Wem?**" },
      { kind: "table", id: "b", headerRow: true, headerColumn: false, cells: [["m", "f"], ["dem", "der"]] },
      { kind: "example", id: "c", sentence: "Ich gebe {dem} Mann", translation: "I give the man" },
    ]);
    expect(text).toBe("Wem?\n\nm | f\ndem | der\n\nIch gebe dem Mann (I give the man)");
  });
});
```

Run: `npx vitest run src/lib/blocks.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/blockText.ts src/lib/blockText.test.ts src/lib/blocks.test.ts
git commit -m "Parse the text markup a grammar block accepts"
```

---

### Task 4: The rule store

**Files:**
- Modify: `src/lib/remoteStore.ts` (the `ItemType` type and `flattenRow`, around lines 226 to 255), `src/lib/remoteStore.test.ts`
- Create: `src/lib/rules.ts`, `src/lib/ruleRow.test.ts`, `src/lib/useRules.ts`

**Interfaces:**
- Consumes: `createRemoteStore`, `createId` (`remoteStore.ts`); `planImport`; `readBlocks`; `foldName`.
- Produces: everything listed for `rules.ts` and `useRules.ts` in "Names used across tasks"; `flattenRow` exported, and rows it returns carry `topic: string`.

- [ ] **Step 1: Write the failing store tests**

Append to `src/lib/remoteStore.test.ts`:

```ts
describe("flattenRow", () => {
  it("reads the source, the collections in order, and the one topic off an items row", async () => {
    const { flattenRow } = await import("@/lib/remoteStore");
    const row = flattenRow({
      id: "a",
      sources: { name: "Manual" },
      item_tags: [
        { position: 2, context: "collection", tags: { name: "Home" } },
        { position: 1, context: "grammar", tags: { name: "Cases" } },
        { position: 1, context: "collection", tags: { name: "Food" } },
      ],
    });
    expect(row.source).toBe("Manual");
    expect(row.collections).toEqual(["Food", "Home"]);
    expect(row.topic).toBe("Cases");
  });

  it("reads no topic and no source as empty strings", async () => {
    const { flattenRow } = await import("@/lib/remoteStore");
    const row = flattenRow({ id: "a", sources: null, item_tags: [] });
    expect(row.topic).toBe("");
    expect(row.source).toBe("");
  });
});
```

`src/lib/ruleRow.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { fromRuleRow, parseRule, toRulePayload, toWireRule } from "@/lib/rules";
import type { Rule } from "@/lib/types";

vi.mock("@/lib/supabaseClient", () => ({ getSupabase: () => null }));
vi.mock("@/lib/session", () => ({
  currentUserId: () => "user-1",
  subscribe: () => () => {},
}));

/**
 * The rule store's codecs: an `items` row in, a `save_items` payload out, and
 * the backup shape between. Nothing here fails loudly when it drifts, which
 * is why each direction is pinned.
 */
const rule: Rule = {
  id: "7f3b1c88-0c4e-4f4a-9a2b-0c2b3f9f5a11",
  title: "Dative",
  topic: "Cases",
  blocks: [{ kind: "text", id: "b1", text: "Wem?" }],
  dateAdded: "2026-02-03T09:15:00.000Z",
  dateUpdated: null,
};

const row = {
  id: rule.id,
  title: "Dative",
  topic: "Cases",
  blocks: [{ kind: "text", id: "b1", text: "Wem?" }],
  created_at: "2026-02-03T09:15:00.000Z",
  updated_at: "2026-02-03T09:15:00.000Z",
};

describe("fromRuleRow", () => {
  it("reads every field", () => {
    expect(fromRuleRow(row)).toEqual(rule);
  });

  it("reads an updated_at that differs from created_at as an edit", () => {
    expect(fromRuleRow({ ...row, updated_at: "2026-03-01T00:00:00.000Z" })?.dateUpdated).toBe(
      "2026-03-01T00:00:00.000Z",
    );
  });

  it("refuses a row with no id or no title", () => {
    expect(fromRuleRow({ ...row, id: "" })).toBeNull();
    expect(fromRuleRow({ ...row, title: " " })).toBeNull();
  });
});

describe("toRulePayload", () => {
  it("writes the keys save_items reads, and never an owner", () => {
    expect(toRulePayload(rule)).toEqual({
      id: rule.id,
      title: "Dative",
      topic: "Cases",
      blocks: rule.blocks,
      created_at: rule.dateAdded,
      updated_at: undefined,
    });
  });
});

describe("the backup shape", () => {
  it("survives a round trip", () => {
    expect(parseRule(toWireRule(rule))).toEqual(rule);
  });

  it("stands in today's date and a fresh id where a hand-written file has none", () => {
    const parsed = parseRule({ title: "Genitive", topic: "Cases" }, true);
    expect(parsed?.id).toBe("");
    expect(parsed?.blocks).toEqual([]);
    expect(Number.isNaN(Date.parse(parsed?.dateAdded ?? ""))).toBe(false);
  });

  it("refuses a rule without a title", () => {
    expect(parseRule({ id: "x", topic: "Cases" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/lib/ruleRow.test.ts src/lib/remoteStore.test.ts`
Expected: FAIL (module `@/lib/rules` missing; `flattenRow` not exported).

- [ ] **Step 3: Extend `remoteStore.ts`**

Change the type and `flattenRow`:

```ts
/** The kinds of item the `items` table holds, one list store each. */
export type ItemType = "word" | "phrase" | "verb_table" | "grammar";
```

```ts
/**
 * An `items` row with its embeds flattened: `source` is the source's name or
 * "", `collections` the collection names in the order they were given, and
 * `topic` the one grammar topic or "". Exported for its test.
 */
export function flattenRow(row: Row): Row {
  const source = row.sources as { name?: unknown } | null;
  const links = Array.isArray(row.item_tags) ? (row.item_tags as Row[]) : [];
  const nameOf = (link: Row) => {
    const name = (link.tags as { name?: unknown } | null)?.name;
    return typeof name === "string" ? name : null;
  };
  const collections = links
    .filter((link) => link.context === "collection")
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map(nameOf)
    .filter((name): name is string => name !== null);
  const topic = links.filter((link) => link.context === "grammar").map(nameOf).find(Boolean) ?? "";
  return {
    ...row,
    source: typeof source?.name === "string" ? source.name : "",
    collections,
    topic,
  };
}
```

- [ ] **Step 4: Write `src/lib/rules.ts`**

```ts
/**
 * The grammar rule store, built on the same factory as the other three
 * lists: synchronous reads, optimistic writes, and a reload putting the
 * truth back when a write fails. See `remoteStore.ts`.
 *
 * A rule is an `items` row of type `grammar`; its topic travels as a name,
 * which `save_items` resolves to the tag and creates when missing.
 */

import { readBlocks } from "@/lib/blocks";
import { foldName } from "@/lib/foldName";
import { planImport } from "@/lib/planImport";
import { createId, createRemoteStore } from "@/lib/remoteStore";
import {
  readString,
  type Block,
  type ImportCounts,
  type ImportMode,
  type Rule,
  type RuleInput,
} from "@/lib/types";

/** An `items` row as a rule, and back. Exported for the test that holds the pair together. */
export function fromRuleRow(row: Record<string, unknown>): Rule | null {
  const id = readString(row.id);
  const title = readString(row.title).trim();
  if (!id || !title) return null;

  const dateAdded = readString(row.created_at);
  const updatedAt = readString(row.updated_at);
  return {
    id,
    title,
    topic: readString(row.topic).trim(),
    blocks: readBlocks(row.blocks),
    dateAdded,
    // The database starts `updated_at` at `created_at`; equal means never edited.
    dateUpdated: updatedAt && updatedAt !== dateAdded ? updatedAt : null,
  };
}

export function toRulePayload(rule: Rule): Record<string, unknown> {
  return {
    id: rule.id,
    title: rule.title,
    topic: rule.topic,
    blocks: rule.blocks,
    // Used for a new row only; an existing one keeps its dates in the database.
    created_at: rule.dateAdded,
    updated_at: rule.dateUpdated ?? undefined,
  };
}

/** A rule as a backup file spells it. Declared for the reason `WireWord` is. */
export type WireRule = {
  id: string;
  title: string;
  topic: string;
  blocks: Block[];
  dateAdded: string;
  dateUpdated: string | null;
};

export function toWireRule(rule: Rule): WireRule {
  return {
    id: rule.id,
    title: rule.title,
    topic: rule.topic,
    blocks: rule.blocks,
    dateAdded: rule.dateAdded,
    dateUpdated: rule.dateUpdated,
  };
}

/**
 * A rule off a backup file. `allowMissingId` is for imported files, where a
 * hand-written one may have no id yet; the caller assigns one.
 */
export function parseRule(raw: unknown, allowMissingId = false): Rule | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;

  const rawId = readString(value.id).trim();
  const id = rawId || (allowMissingId ? "" : null);
  const title = readString(value.title).trim() || null;
  if (id === null || !title) return null;

  return {
    id,
    title,
    topic: readString(value.topic).trim(),
    blocks: readBlocks(value.blocks),
    dateAdded: readString(value.dateAdded) || new Date().toISOString(),
    dateUpdated: typeof value.dateUpdated === "string" ? value.dateUpdated : null,
  };
}

const store = createRemoteStore<Rule>({
  itemType: "grammar",
  idOf: (rule) => rule.id,
  nameOf: (rule) => rule.title,
  fromRow: fromRuleRow,
  toPayload: toRulePayload,
});

export const subscribe = store.subscribe;
export const getSnapshot = store.getSnapshot;
export const getServerSnapshot = store.getServerSnapshot;
export const clearError = store.clearError;
export const subscribeToError = store.subscribeToError;
export const getError = store.getError;
export const settled = store.settled;
export const reload = store.reload;

/* ----------------------------------------------------------------- queries */

export function getRules(): Rule[] {
  return store.items();
}

/** Case- and accent-insensitive, the way every name in the app is matched. */
export const findByTitle = store.findByName;

/* --------------------------------------------------------------- mutations */

/** A new, empty rule; the reader fills it in on its own page. */
export function createRule(input: { title: string; topic: string }): Rule {
  const rule: Rule = {
    id: createId(),
    title: input.title.trim(),
    topic: input.topic.trim(),
    blocks: [],
    dateAdded: new Date().toISOString(),
    dateUpdated: null,
  };
  store.insert(rule);
  return rule;
}

export function updateRule(id: string, input: RuleInput): Rule | null {
  const existing = store.items().find((rule) => rule.id === id);
  if (!existing) return null;
  const updated: Rule = {
    ...existing,
    title: input.title.trim(),
    topic: input.topic.trim(),
    blocks: input.blocks,
    dateUpdated: new Date().toISOString(),
  };
  store.update(updated);
  return updated;
}

export const deleteRules = store.removeMany;

/* ------------------------------------------------------------------ import */

export function parseRuleList(list: unknown[]): { rules: Rule[]; unreadable: number } {
  const rules = list
    .map((item) => parseRule(item, true))
    .filter((rule): rule is Rule => rule !== null);
  return { rules, unreadable: list.length - rules.length };
}

/** Matched by title, the rule the unique index and links already use. */
export function importRules(incoming: Rule[], mode: ImportMode): ImportCounts {
  const plan = planImport(store.items(), incoming, mode, {
    keyOf: (rule) => foldName(rule.title),
    idOf: (rule) => rule.id,
    withId: (rule, id) => ({ ...rule, id }),
    merge: (existing, candidate) => ({ ...candidate, id: existing.id }),
  });

  if (plan.toReplace) {
    store.replaceAll(plan.toReplace);
    return plan.counts;
  }
  store.updateMany(plan.toUpdate);
  store.insertMany(plan.toInsert);
  return plan.counts;
}
```

- [ ] **Step 5: Write `src/lib/useRules.ts`**

```ts
"use client";

import { useSyncExternalStore } from "react";

import { getServerSnapshot, getSnapshot, subscribe } from "@/lib/rules";
import type { Rule } from "@/lib/types";

/** The grammar rules, read the same way the other lists are. */
export function useRules(): { rules: Rule[]; loaded: boolean; error: string | null } {
  const { items, loaded, error } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { rules: items, loaded, error };
}
```

- [ ] **Step 6: Run the tests and the checks**

Run: `npx vitest run src/lib/ruleRow.test.ts src/lib/remoteStore.test.ts && npx tsc --noEmit && npx eslint src/`
Expected: PASS, no type or lint errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/remoteStore.ts src/lib/remoteStore.test.ts src/lib/rules.ts src/lib/ruleRow.test.ts src/lib/useRules.ts
git commit -m "Add the grammar rule store"
```

---

### Task 5: Topics in Settings

**Files:**
- Modify: `src/lib/settings.ts` (the `Settings` type, `DEFAULT_SETTINGS`, `fromRow`, `fromRowSorted`, `load`, `syncToSession`, `RestoredSettings`, `parseSettings`, `saveSettings`, `saveNames`, `readNames`, `storedNames`, `noteRenamed`, `seedDefaults`), `src/lib/renames.ts`, `src/lib/renames.test.ts`, `src/lib/settingsSections.ts`, `src/lib/settingsSections.test.ts`, `src/components/AccountMenu.tsx` (one comment), `src/app/(workspace)/settings/page.tsx`

**Interfaces:**
- Consumes: `useRules`, `reload as reloadRules` from `rules.ts`; `countUses`, `inUseReason` from `inUse.ts`; `NameListEditor`; `rename_tag(tag_context, from_name, to_name)` in the database.
- Produces: `Settings.topics`, `renameTopic`, a `grammar` settings section.

- [ ] **Step 1: Write the failing tests**

In `src/lib/settingsSections.test.ts`, change the "offers the three groups" test to expect four keys:

```ts
  it("offers the four groups the gear menu offers", () => {
    expect(SETTINGS_SECTIONS.map((section) => section.key)).toEqual([
      "profile",
      "glossary",
      "grammar",
      "flashcards",
    ]);
  });
```

In `src/lib/renames.test.ts`: add `topics: ["Cases", "Word order"]` to `state.lists` and `state.stored` in `beforeEach`, add `reloadRules` to the mocks, and a describe block:

```ts
vi.mock("@/lib/rules", () => ({ reload: () => state.calls.push("reload:rules") }));
```

```ts
describe("renameTopic", () => {
  it("renames the grammar tag, shows it, and reads the rules again", async () => {
    expect(await renameTopic("Cases", "Fälle")).toBeNull();
    expect(state.calls).toEqual([
      "rpc:rename_tag:Cases->Fälle",
      "note:topics:Cases->Fälle",
      "reload:rules",
    ]);
  });

  it("changes nothing when the database refuses", async () => {
    state.rpcError = { message: "boom" };
    expect(await renameTopic("Cases", "Fälle")).toMatch(/Could not rename that topic/);
    expect(state.calls).toEqual(["rpc:rename_tag:Cases->Fälle"]);
  });
});
```

Also make the rpc mock record the context, so the two tag lists cannot be confused: change the push in the `rpc` mock to
`state.calls.push(\`rpc:${name}:${args.tag_context ? args.tag_context + ":" : ""}${args.from_name}->${args.to_name}\`)`
and update the existing collection expectations from `rpc:rename_tag:Meal->Dinner` to `rpc:rename_tag:collection:Meal->Dinner` (three places), and the topic ones above to `rpc:rename_tag:grammar:Cases->Fälle`.

Import `renameTopic` at the top alongside `renameCollection`.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/lib/renames.test.ts src/lib/settingsSections.test.ts`
Expected: FAIL.

- [ ] **Step 3: Teach `settings.ts` the topics list**

Apply these changes in `src/lib/settings.ts`:

The type and defaults:
```ts
  /** In the reader's own order, which is what the Source column sorts by. */
  sources: string[];
  /** The groupings a grammar rule is filed under, one per rule. Empty until the reader adds one. */
  topics: string[];
```
and in `DEFAULT_SETTINGS`, after `sources`: `topics: [],`.

The stored copies:
```ts
let storedCollections: string[] = [];
let storedSources: string[] = [];
let storedTopics: string[] = [];
```
Reset all three in `syncToSession` where the first two are reset.

`fromRow` takes a fourth argument and does not fall back to defaults for topics (there are none):
```ts
function fromRow(
  row: Record<string, unknown> | null,
  collectionNames: string[],
  sourceNames: string[],
  topicNames: string[],
): Settings {
  ...
  const lists = {
    collections: collections.length > 0 ? collections : [...DEFAULT_COLLECTIONS],
    sources: sources.length > 0 ? sources : [...DEFAULT_SOURCES],
    topics: readNameList(topicNames, NO_LIMIT),
  };
```
`fromRowSorted` takes and passes the same fourth argument and sorts `topics` like `collections`.

`load` reads a fourth list in the same `Promise.all`:
```ts
      readWithSkewRetry(
        () => supabase.from("tags").select("name").eq("context", "grammar"),
        stillWanted,
      ),
```
Name it `topics`, add it to the `ABANDONED` check and the `error` chain, set `storedTopics = namesOf(topics.data)`, and pass `storedTopics` to `fromRowSorted`.

`RestoredSettings` gains `topics` among the optional fields (a file from before topics leaves the reader's alone):
```ts
export type RestoredSettings = Omit<
  Settings,
  "language" | "languageOther" | "sortSkipWords" | "topics"
> &
  Partial<Pick<Settings, "language" | "languageOther" | "sortSkipWords" | "topics">>;
```
and `parseSettings` adds, beside the `sortSkipWords` spread:
```ts
    ...(value.topics === undefined ? {} : { topics: readNameList(value.topics, NO_LIMIT) }),
```

`saveSettings`: in `next`, add `topics: readNameList(change.topics ?? snapshot.settings.topics, NO_LIMIT),`; sort it with the others (`next.topics = sortedNames(next.topics, next.language);`); and after the `change.sources` block:
```ts
  if (change.topics) {
    void saveNames(supabase, userId, "topics", next.topics).then(({ error, stored, kept }) => {
      if (error) return failed(error);
      storedTopics = stored;
      if (kept) reload();
    });
  }
```
Change the two existing `saveNames` calls to pass `"collections"` and `"sources"` instead of `"tags"` and `"sources"`.

`saveNames` and `readNames` take the list name rather than a table, and look the table and context up:
```ts
/** The three name lists that are rows: where each lives, and its tag context if it is a tag. */
type NameList = "collections" | "sources" | "topics";
const NAME_ROWS: Record<NameList, { table: "tags" | "sources"; context: string | null }> = {
  collections: { table: "tags", context: "collection" },
  sources: { table: "sources", context: null },
  topics: { table: "tags", context: "grammar" },
};
```
In `saveNames(supabase, userId, list: NameList, wanted)`: `const { table, context } = NAME_ROWS[list];`, the insert spreads `...(context ? { context } : {})`, and `remove` adds `.eq("context", context)` when `context` is not null. In `readNames(supabase, list: NameList)` likewise. `storedNames(list: NameList)` passes `list` straight through. `noteRenamed(list: NameList, …)` swaps `storedTopics` when `list === "topics"`. `seedDefaults` calls `saveNames(…, "collections", …)` and `saveNames(…, "sources", …)`; it seeds no topics.

- [ ] **Step 4: Add `renameTopic` to `renames.ts`**

```ts
type RenamableList = keyof Pick<
  Settings,
  "collections" | "sources" | "topics" | "verbPersons" | "verbTenses" | "sortSkipWords"
>;
```
`renameInList` excludes `"collections" | "sources" | "topics"`. `renameThroughDatabase` takes `list: "collections" | "sources" | "topics"`; the rpc branch becomes:
```ts
  const { error } =
    list === "sources"
      ? await supabase.rpc("rename_item_source", { from_name: from, to_name: name })
      : await supabase.rpc("rename_tag", {
          tag_context: list === "topics" ? "grammar" : "collection",
          from_name: from,
          to_name: name,
        });
```
and after `noteRenamed`, reload what carries the name:
```ts
  if (list === "topics") reloadRules();
  else {
    reloadWords();
    reloadPhrases();
  }
```
with `import { reload as reloadRules } from "@/lib/rules";`. Add:
```ts
/** A topic, on the list and on every rule filed under it; merges like a collection. */
export function renameTopic(from: string, to: string): Promise<string | null> {
  return renameThroughDatabase("topics", "topic", from, to);
}
```

- [ ] **Step 5: The settings section and its editor**

`src/lib/settingsSections.ts`: `SettingsSectionKey` gains `"grammar"`, and this entry goes between glossary and flashcards:
```ts
  {
    key: "grammar",
    label: "Grammar settings",
    description: "The topics a grammar rule is filed under.",
  },
```
In `src/components/AccountMenu.tsx`, the comment near line 54 that says "three groups" becomes "four groups".

In `src/app/(workspace)/settings/page.tsx`, add beside `CollectionsAndSources`:
```tsx
/**
 * The topics rules are filed under. One per rule, so a topic still on a rule
 * cannot be removed, for the reason a collection in use cannot: the database
 * refuses the delete, and the bin says so first.
 */
function Topics() {
  const { settings } = useSettings();
  const { rules, loaded } = useRules();
  const uses = countUses(rules.map((rule) => [rule.topic]));

  return (
    <SettingSection title="Topics">
      <NameListEditor
        legend="Topics"
        description="What a grammar rule is filed under: Cases, Word order, Tenses. Every rule has one. Renaming one renames it on every rule, and renaming it to the name of another merges the two. One that is in use cannot be removed."
        names={settings.topics}
        onChange={(topics) => saveSettings({ topics })}
        onRename={renameTopic}
        removeBlockedBy={(name) =>
          loaded ? inUseReason(uses, name) : "Checking whether anything uses it"
        }
        maxLength={MAX_NAME}
        placeholder="e.g. Cases"
      />
    </SettingSection>
  );
}
```
and in `Settings()`, after the glossary branch: `{section.key === "grammar" && <Topics />}`. Import `useRules` and `renameTopic`.

`inUseReason` says "word or phrase uses it"; for topics that reads wrongly. In `src/lib/inUse.ts`, give `inUseReason` a third parameter `noun = "word or phrase"` and `nounPlural = "words and phrases"`, used in the two sentences, and pass `"rule", "rules"` from `Topics`. Update `inUse.test.ts` expectations only if they break (they should not; the defaults are the old text).

- [ ] **Step 6: Run the tests and checks**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src/`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/settings.ts src/lib/renames.ts src/lib/renames.test.ts src/lib/settingsSections.ts src/lib/settingsSections.test.ts src/lib/inUse.ts src/components/AccountMenu.tsx "src/app/(workspace)/settings/page.tsx"
git commit -m "Add grammar topics to Settings"
```

---

### Task 6: Reading blocks: `RichText`, `BlockView`, `TopicBadge`

**Files:**
- Create: `src/components/grammar/RichText.tsx`, `src/components/grammar/BlockView.tsx`, `src/components/grammar/BlockView.test.tsx`
- Modify: `src/components/Badges.tsx`

**Interfaces:**
- Consumes: `parseTextBlock`, `parseInline`, `splitGaps` (Task 3); `LinkIndex` from `RefText.tsx`; `Block` types.
- Produces: `RichText({ text, linkIndex })`, `InlineText({ text, linkIndex })`, `BlockView({ block, linkIndex })`, `TopicBadge({ name, onSelect? })`.

- [ ] **Step 1: Write the failing test**

`src/components/grammar/BlockView.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BlockView } from "@/components/grammar/BlockView";
import type { LinkIndex } from "@/components/RefText";

/**
 * Rendered to a string, as `MainNav.test.tsx` is, so this needs no jsdom.
 * These pin what the reader sees: which cells are headers, that a gap is
 * marked and its braces are not shown, and that a link resolves.
 */
const links: LinkIndex = new Map([["cases", "/rule?id=r1"]]);
const html = (block: Parameters<typeof BlockView>[0]["block"]) =>
  renderToStaticMarkup(<BlockView block={block} linkIndex={links} />);

describe("BlockView", () => {
  it("renders text with bold, italic, bullets and a resolved link", () => {
    const markup = html({ kind: "text", id: "a", text: "**Wem?** *dem*\n- one\nsee [[Cases]] and [[Nothing]]" });
    expect(markup).toContain("<strong>Wem?</strong>");
    expect(markup).toContain("<em>dem</em>");
    expect(markup).toContain("<li>one</li>");
    expect(markup).toContain('href="/rule?id=r1"');
    // An unresolved name reads as dotted text, as it does in a Ref.
    expect(markup).toContain("decoration-dotted");
  });

  it("marks the header row and column of a table", () => {
    const markup = html({
      kind: "table",
      id: "t",
      headerRow: true,
      headerColumn: true,
      cells: [
        ["", "m"],
        ["Dat", "dem"],
      ],
    });
    expect(markup.match(/<th/g)).toHaveLength(3);
    expect(markup.match(/<td/g)).toHaveLength(1);
  });

  it("shows an example's gaps without their braces", () => {
    const markup = html({ kind: "example", id: "e", sentence: "Ich gebe {dem} Mann", translation: "I give the man" });
    expect(markup).not.toContain("{");
    expect(markup).toContain(">dem<");
    expect(markup).toContain("I give the man");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/components/grammar/BlockView.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `RichText.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useMemo } from "react";

import type { LinkIndex } from "@/components/RefText";
import { parseInline, parseTextBlock, type InlineToken, type TextLine } from "@/lib/blockText";
import { foldName } from "@/lib/foldName";

const linkClass =
  "text-indigo-700 underline underline-offset-2 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200";

function Inline({ tokens, linkIndex }: { tokens: InlineToken[]; linkIndex: LinkIndex }) {
  return (
    <>
      {tokens.map((token, index) => {
        switch (token.kind) {
          case "text":
            return <span key={index}>{token.value}</span>;
          case "bold":
            return <strong key={index}>{token.value}</strong>;
          case "italic":
            return <em key={index}>{token.value}</em>;
          case "link": {
            const href = linkIndex.get(foldName(token.name));
            // Unresolved names read as dotted text, exactly as in a Ref, so
            // one look says the same thing everywhere.
            if (!href) {
              return (
                <span
                  key={index}
                  title="Nothing with this name is saved yet"
                  className="text-slate-500 underline decoration-dotted underline-offset-2 dark:text-slate-400"
                >
                  {token.name}
                </span>
              );
            }
            return (
              <Link key={index} href={href} className={linkClass}>
                {token.name}
              </Link>
            );
          }
        }
      })}
    </>
  );
}

/** One line's worth of markup, for a table cell or an example. */
export function InlineText({ text, linkIndex }: { text: string; linkIndex: LinkIndex }) {
  const tokens = useMemo(() => parseInline(text), [text]);
  return <Inline tokens={tokens} linkIndex={linkIndex} />;
}

/** A text block: paragraphs, with runs of bullets grouped into one list. */
export function RichText({ text, linkIndex }: { text: string; linkIndex: LinkIndex }) {
  const lines = useMemo(() => parseTextBlock(text), [text]);
  const groups = useMemo(() => groupBullets(lines), [lines]);

  return (
    <div className="space-y-2 text-slate-800 dark:text-slate-200">
      {groups.map((group, index) =>
        group.kind === "list" ? (
          <ul key={index} className="list-disc space-y-1 pl-5">
            {group.lines.map((line, at) => (
              <li key={at}>
                <Inline tokens={line.tokens} linkIndex={linkIndex} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={index}>
            <Inline tokens={group.line.tokens} linkIndex={linkIndex} />
          </p>
        ),
      )}
    </div>
  );
}

type Group = { kind: "paragraph"; line: TextLine } | { kind: "list"; lines: TextLine[] };

/** Consecutive bullets become one list; each paragraph stands alone. */
function groupBullets(lines: TextLine[]): Group[] {
  const groups: Group[] = [];
  for (const line of lines) {
    const last = groups[groups.length - 1];
    if (line.kind === "bullet") {
      if (last && last.kind === "list") last.lines.push(line);
      else groups.push({ kind: "list", lines: [line] });
    } else {
      groups.push({ kind: "paragraph", line });
    }
  }
  return groups;
}
```

- [ ] **Step 4: Write `BlockView.tsx`**

```tsx
"use client";

import { InlineText, RichText } from "@/components/grammar/RichText";
import type { LinkIndex } from "@/components/RefText";
import { splitGaps } from "@/lib/blockText";
import type { Block, ExampleBlock, TableBlock } from "@/lib/types";

/** One block, as the reader sees it. */
export function BlockView({ block, linkIndex }: { block: Block; linkIndex: LinkIndex }) {
  switch (block.kind) {
    case "text":
      return <RichText text={block.text} linkIndex={linkIndex} />;
    case "table":
      return <TableView table={block} linkIndex={linkIndex} />;
    case "example":
      return <ExampleView example={block} />;
  }
}

const headerClass =
  "border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";
const cellClass =
  "border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:text-slate-200";

function TableView({ table, linkIndex }: { table: TableBlock; linkIndex: LinkIndex }) {
  return (
    // Its own scroll container, so a wide paradigm never widens the page.
    <div className="overflow-x-auto">
      <table className="border-collapse">
        <tbody>
          {table.cells.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => {
                const isHeader = (table.headerRow && r === 0) || (table.headerColumn && c === 0);
                const Cell = isHeader ? "th" : "td";
                return (
                  <Cell key={c} className={isHeader ? headerClass : cellClass} scope={isHeader ? (r === 0 ? "col" : "row") : undefined}>
                    <InlineText text={cell} linkIndex={linkIndex} />
                  </Cell>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Set apart from explanation: a left rule and a tint. The gaps are shown
 * underlined and without their braces; the braces are for the author and
 * for practice, not the reader.
 */
function ExampleView({ example }: { example: ExampleBlock }) {
  return (
    <figure className="rounded-r-lg border-l-4 border-emerald-400 bg-emerald-50/60 px-4 py-3 dark:border-emerald-500 dark:bg-emerald-500/10">
      <p className="text-slate-900 dark:text-slate-100">
        {splitGaps(example.sentence).map((part, index) =>
          part.gap ? (
            <span key={index} className="font-semibold underline decoration-emerald-500 underline-offset-4">
              {part.value}
            </span>
          ) : (
            <span key={index}>{part.value}</span>
          ),
        )}
      </p>
      {example.translation && (
        <figcaption className="mt-1 text-sm text-slate-600 dark:text-slate-300">{example.translation}</figcaption>
      )}
    </figure>
  );
}
```

- [ ] **Step 5: Add `TopicBadge` to `Badges.tsx`**

```tsx
/** A rule's topic. Given `onSelect` it filters the Grammar list to that topic. */
export function TopicBadge({ name, onSelect }: { name: string; onSelect?: (name: string) => void }) {
  const base =
    "inline-flex items-center rounded-md bg-rose-50 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-rose-700 dark:bg-rose-500/15 dark:text-rose-300";
  if (!onSelect) return <span className={base}>{name}</span>;
  return (
    <button
      type="button"
      onClick={() => onSelect(name)}
      title={`Show only ${name}`}
      className={`${base} cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-500/25`}
    >
      {name}
    </button>
  );
}
```

- [ ] **Step 6: Run the test and the checks**

Run: `npx vitest run src/components/grammar && npx tsc --noEmit && npx eslint src/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/grammar/RichText.tsx src/components/grammar/BlockView.tsx src/components/grammar/BlockView.test.tsx src/components/Badges.tsx
git commit -m "Render grammar blocks for reading"
```

---

### Task 7: Editing: `BlockEditor`, `RuleEditor`, and the rule page

**Files:**
- Create: `src/components/grammar/BlockEditor.tsx`, `src/components/grammar/RuleEditor.tsx`, `src/app/(workspace)/rule/page.tsx`

**Interfaces:**
- Consumes: `moveBlock`, `newTextBlock`, `newTableBlock`, `newExampleBlock`, `withRow`, `withoutLastRow`, `withColumn`, `withoutLastColumn`, `withCell` (Task 2); `BlockView`, `TopicBadge` (Task 6); `useRules`, `updateRule`, `findByTitle` (Task 4); `useSettings` for `settings.topics`; `buildLinkIndex`, `useWords`, `usePhrases`; `formatDate`, `formatDateTime`.
- Produces: `RuleEditor({ rule, topics, onSave, onCancel })`, the `/rule?id=<id>&edit=1` route.

Before writing the page, read `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md` (client pages, `useSearchParams` and the Suspense boundary the existing `word/page.tsx` shows).

- [ ] **Step 1: Write `BlockEditor.tsx`**

```tsx
"use client";

import { useId } from "react";

import { withCell, withColumn, withoutLastColumn, withoutLastRow, withRow } from "@/lib/blocks";
import type { Block, ExampleBlock, TableBlock, TextBlock } from "@/lib/types";

const KIND_LABEL: Record<Block["kind"], string> = { text: "Text", table: "Table", example: "Example" };

/**
 * One block with its own controls. Reordering is offered two ways: a drag
 * handle, and Move up and Move down, so it works from a keyboard and on a
 * phone, where dragging is unreliable.
 */
export function BlockEditor({
  block,
  index,
  count,
  onChange,
  onRemove,
  onMove,
  onDragStart,
}: {
  block: Block;
  index: number;
  count: number;
  onChange: (block: Block) => void;
  onRemove: () => void;
  onMove: (to: number) => void;
  onDragStart: () => void;
}) {
  const inputId = useId();
  const menuButton =
    "cursor-pointer rounded px-2 py-1 text-xs text-slate-600 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-700";

  return (
    <section className="card p-3 sm:p-4" aria-label={`${KIND_LABEL[block.kind]} block`}>
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <span
          draggable
          onDragStart={onDragStart}
          title="Drag to reorder"
          aria-hidden="true"
          className="cursor-grab select-none px-1 text-slate-400"
        >
          ⋮⋮
        </span>
        <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
          {KIND_LABEL[block.kind]}
        </span>
        <span className="ml-auto flex gap-1">
          <button type="button" className={menuButton} disabled={index === 0} onClick={() => onMove(index - 1)}>
            Move up
          </button>
          <button type="button" className={menuButton} disabled={index === count - 1} onClick={() => onMove(index + 1)}>
            Move down
          </button>
          <button type="button" className={menuButton} onClick={onRemove}>
            Remove
          </button>
        </span>
      </div>

      {block.kind === "text" && <TextFields block={block} onChange={onChange} inputId={inputId} />}
      {block.kind === "table" && <TableFields block={block} onChange={onChange} inputId={inputId} />}
      {block.kind === "example" && <ExampleFields block={block} onChange={onChange} inputId={inputId} />}
    </section>
  );
}

function TextFields({ block, onChange, inputId }: { block: TextBlock; onChange: (block: Block) => void; inputId: string }) {
  return (
    <>
      <label htmlFor={inputId} className="sr-only">
        Text
      </label>
      <textarea
        id={inputId}
        className="field min-h-28 font-mono text-sm"
        value={block.text}
        onChange={(event) => onChange({ ...block, text: event.target.value })}
        placeholder="Explain the rule. **bold**, *italic*, lines starting with - for bullets, [[Name]] to link."
      />
    </>
  );
}

function TableFields({ block, onChange, inputId }: { block: TableBlock; onChange: (block: Block) => void; inputId: string }) {
  const small = "btn btn-secondary px-2.5 py-1 text-xs";
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <tbody>
            {block.cells.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => {
                  const isHeader = (block.headerRow && r === 0) || (block.headerColumn && c === 0);
                  return (
                    <td key={c} className="border border-slate-200 p-0.5 dark:border-slate-700">
                      <label htmlFor={`${inputId}-${r}-${c}`} className="sr-only">
                        {`Row ${r + 1}, column ${c + 1}`}
                      </label>
                      <input
                        id={`${inputId}-${r}-${c}`}
                        className={`field min-w-24 py-1 ${isHeader ? "font-semibold" : ""}`}
                        value={cell}
                        onChange={(event) => onChange(withCell(block, r, c, event.target.value))}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={small} onClick={() => onChange(withRow(block))}>Add row</button>
        <button type="button" className={small} disabled={block.cells.length <= 1} onClick={() => onChange(withoutLastRow(block))}>Remove last row</button>
        <button type="button" className={small} onClick={() => onChange(withColumn(block))}>Add column</button>
        <button type="button" className={small} disabled={block.cells[0].length <= 1} onClick={() => onChange(withoutLastColumn(block))}>Remove last column</button>
        <label className="ml-2 inline-flex items-center gap-1.5 text-sm">
          <input type="checkbox" className="accent-indigo-600" checked={block.headerRow} onChange={(event) => onChange({ ...block, headerRow: event.target.checked })} />
          First row is a header
        </label>
        <label className="inline-flex items-center gap-1.5 text-sm">
          <input type="checkbox" className="accent-indigo-600" checked={block.headerColumn} onChange={(event) => onChange({ ...block, headerColumn: event.target.checked })} />
          First column is a header
        </label>
      </div>
    </div>
  );
}

function ExampleFields({ block, onChange, inputId }: { block: ExampleBlock; onChange: (block: Block) => void; inputId: string }) {
  return (
    <div className="space-y-2">
      <div>
        <label htmlFor={`${inputId}-sentence`} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
          Sentence. Put braces round the words the rule is about: Ich gebe {"{dem}"} Mann das Buch
        </label>
        <input id={`${inputId}-sentence`} className="field" value={block.sentence} onChange={(event) => onChange({ ...block, sentence: event.target.value })} />
      </div>
      <div>
        <label htmlFor={`${inputId}-translation`} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
          Translation
        </label>
        <input id={`${inputId}-translation`} className="field" value={block.translation} onChange={(event) => onChange({ ...block, translation: event.target.value })} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `RuleEditor.tsx`**

```tsx
"use client";

import { useId, useState } from "react";

import { BlockEditor } from "@/components/grammar/BlockEditor";
import { moveBlock, newExampleBlock, newTableBlock, newTextBlock } from "@/lib/blocks";
import { MAX_NAME } from "@/lib/constants";
import { findByTitle } from "@/lib/rules";
import type { Block, Rule, RuleInput } from "@/lib/types";

/**
 * The whole rule in edit mode: title, topic and the stack of blocks. Nothing
 * is written until Save; Cancel throws the draft away, which is what lets
 * every block edit return a new block without touching the store.
 */
export function RuleEditor({
  rule,
  topics,
  onSave,
  onCancel,
}: {
  rule: Rule;
  /** The topics on the Settings list, offered as suggestions. A new one may be typed. */
  topics: readonly string[];
  onSave: (input: RuleInput) => void;
  onCancel: () => void;
}) {
  const inputId = useId();
  const [title, setTitle] = useState(rule.title);
  const [topic, setTopic] = useState(rule.topic);
  const [blocks, setBlocks] = useState<Block[]>(rule.blocks);
  /** The block being dragged, by index, while a drag is in progress. */
  const [dragging, setDragging] = useState<number | null>(null);

  const clash = findByTitle(title, rule.id);
  const problem =
    title.trim() === ""
      ? "A rule needs a title."
      : clash
        ? `There is already a rule called “${clash.title}”.`
        : topic.trim() === ""
          ? "A rule needs a topic."
          : null;

  const replace = (index: number, block: Block) =>
    setBlocks((current) => current.map((existing, at) => (at === index ? block : existing)));
  const add = (block: Block) => setBlocks((current) => [...current, block]);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (problem) return;
        onSave({ title: title.trim(), topic: topic.trim(), blocks });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_16rem]">
        <div>
          <label htmlFor={`${inputId}-title`} className="mb-1 block text-sm font-medium">
            Title
          </label>
          <input id={`${inputId}-title`} className="field" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
        </div>
        <div>
          <label htmlFor={`${inputId}-topic`} className="mb-1 block text-sm font-medium">
            Topic
          </label>
          {/* A datalist rather than a select, so a topic can be typed the
              first time it is needed instead of going to Settings first. */}
          <input id={`${inputId}-topic`} className="field" list={`${inputId}-topics`} value={topic} maxLength={MAX_NAME} onChange={(event) => setTopic(event.target.value)} />
          <datalist id={`${inputId}-topics`}>
            {topics.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
      </div>

      <div
        className="space-y-3"
        onDragOver={(event) => {
          if (dragging !== null) event.preventDefault();
        }}
      >
        {blocks.map((block, index) => (
          <div
            key={block.id}
            onDrop={(event) => {
              event.preventDefault();
              if (dragging !== null) setBlocks((current) => moveBlock(current, dragging, index));
              setDragging(null);
            }}
          >
            <BlockEditor
              block={block}
              index={index}
              count={blocks.length}
              onChange={(next) => replace(index, next)}
              onRemove={() => setBlocks((current) => current.filter((_, at) => at !== index))}
              onMove={(to) => setBlocks((current) => moveBlock(current, index, to))}
              onDragStart={() => setDragging(index)}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary" onClick={() => add(newTextBlock())}>+ Text</button>
        <button type="button" className="btn btn-secondary" onClick={() => add(newTableBlock())}>+ Table</button>
        <button type="button" className="btn btn-secondary" onClick={() => add(newExampleBlock())}>+ Example</button>
      </div>

      {problem && title.trim() !== "" && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {problem}
        </p>
      )}

      <div className="flex gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
        <button type="submit" className="btn btn-primary" disabled={problem !== null}>
          Save
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Write the rule page**

`src/app/(workspace)/rule/page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { TopicBadge } from "@/components/Badges";
import { BlockView } from "@/components/grammar/BlockView";
import { RuleEditor } from "@/components/grammar/RuleEditor";
import { buildLinkIndex, type LinkIndex } from "@/components/RefText";
import { formatDate, formatDateTime } from "@/lib/format";
import { updateRule } from "@/lib/rules";
import type { Rule } from "@/lib/types";
import { usePhrases } from "@/lib/usePhrases";
import { useRules } from "@/lib/useRules";
import { useSettings } from "@/lib/useSettings";
import { useWords } from "@/lib/useWords";

/**
 * One rule, addressed as `/rule?id=abc`, the shape every item page has. It
 * opens in a reading view, because a rule is read far more often than it is
 * written, and Edit turns the same page into the editor. `&edit=1` opens it
 * editing straight away, which is how a rule just made arrives.
 */
export default function RulePage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <RuleDetail />
    </Suspense>
  );
}

function Skeleton() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
      <div className="card h-56 animate-pulse" aria-hidden="true" />
    </main>
  );
}

function RuleDetail() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const { rules, loaded } = useRules();
  const { entries } = useWords();
  const { phrases } = usePhrases();
  const rule = rules.find((candidate) => candidate.id === id);
  // Rules and verb tables become link targets in stage 2; until then a
  // `[[Name]]` in a rule reaches what a Ref reaches: words and phrases.
  const linkIndex = useMemo(() => buildLinkIndex(entries, phrases), [entries, phrases]);

  return (
    <>
      <header className="bg-card-rose">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/grammar" className="text-sm font-medium text-slate-900 hover:underline">
            ← Back to Grammar
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
        {!loaded ? (
          <div className="card h-56 animate-pulse" aria-hidden="true" />
        ) : rule ? (
          <RuleBody key={rule.id} rule={rule} linkIndex={linkIndex} startEditing={params.get("edit") === "1"} />
        ) : (
          <NotFound />
        )}
      </main>
    </>
  );
}

function RuleBody({ rule, linkIndex, startEditing }: { rule: Rule; linkIndex: LinkIndex; startEditing: boolean }) {
  const router = useRouter();
  const { settings } = useSettings();
  const [editing, setEditing] = useState(startEditing);

  if (editing) {
    return (
      <article className="card p-5 sm:p-7">
        <RuleEditor
          rule={rule}
          topics={settings.topics}
          onSave={(input) => {
            updateRule(rule.id, input);
            setEditing(false);
            // Drop `&edit=1` so a reload shows the rule rather than the editor.
            router.replace(`/rule?id=${rule.id}`);
          }}
          onCancel={() => {
            setEditing(false);
            router.replace(`/rule?id=${rule.id}`);
          }}
        />
      </article>
    );
  }

  return (
    <article className="card p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{rule.title}</h1>
        <TopicBadge name={rule.topic} />
      </div>

      {rule.blocks.length === 0 ? (
        <p className="mt-4 text-slate-500 italic dark:text-slate-400">Nothing written yet. Use Edit to start.</p>
      ) : (
        <div className="mt-5 space-y-5">
          {rule.blocks.map((block) => (
            <BlockView key={block.id} block={block} linkIndex={linkIndex} />
          ))}
        </div>
      )}

      <dl className="mt-6 grid gap-4 border-t border-slate-200 pt-5 sm:grid-cols-2 dark:border-slate-800">
        <div>
          <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">Date added</dt>
          <dd className="mt-1.5 text-sm text-slate-700 dark:text-slate-300">
            <span title={formatDateTime(rule.dateAdded)}>{formatDate(rule.dateAdded)}</span>
            {rule.dateUpdated && (
              <span className="block text-xs text-slate-500 dark:text-slate-400" title={formatDateTime(rule.dateUpdated)}>
                Edited {formatDate(rule.dateUpdated)}
              </span>
            )}
          </dd>
        </div>
      </dl>

      {/* Deleting is not offered here; the Grammar list owns that, as the word list does. */}
      <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-800">
        <button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>
          Edit
        </button>
      </div>
    </article>
  );
}

function NotFound() {
  return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <h1 className="text-lg font-semibold">Rule not found</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        There is no rule with that ID in your account. It may have been deleted, or the link may
        belong to a different account.
      </p>
      <Link href="/grammar" className="btn btn-primary mt-5">
        Back to Grammar
      </Link>
    </div>
  );
}
```

`bg-card-rose` is defined in Task 8; until then the header renders with no colour, which is fine for the type check.

- [ ] **Step 4: Check**

Run: `npx tsc --noEmit && npx eslint src/`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/grammar/BlockEditor.tsx src/components/grammar/RuleEditor.tsx "src/app/(workspace)/rule/page.tsx"
git commit -m "Add the rule page, reading and editing"
```

---

### Task 8: The Grammar list, the add dialog, the tab and the home card

**Files:**
- Create: `src/components/grammar/AddRuleDialog.tsx`, `src/app/(workspace)/grammar/page.tsx`
- Modify: `src/components/MainNav.tsx` (`LINKS`), `src/components/MainNav.test.tsx`, `src/app/(workspace)/page.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: `createRule`, `findByTitle`, `deleteRules` (Task 4); `useRules`; `TopicBadge`; `useListPage`; `RowEditButton`, `RowDeleteButton`, `ConfirmDeleteDialog`; `Modal`; `useSorting`; `STICKY_FILTERS`.

- [ ] **Step 1: Write the failing nav test change**

In `src/components/MainNav.test.tsx`: the first test also expects `"Grammar"` and `'href="/grammar"'`; the `served` list gains `"/grammar"` and `"/rule"`.

Run: `npx vitest run src/components/MainNav.test.tsx`
Expected: FAIL on "Grammar".

- [ ] **Step 2: The tab, the colour and the home card**

`MainNav.tsx`, `LINKS`:
```ts
const LINKS = [
  { href: "/verbs", label: "Verbs", isActive: (path: string) => path.startsWith("/verbs") },
  // A rule's own page counts as the list, the way a word's does.
  {
    href: "/grammar",
    label: "Grammar",
    isActive: (path: string) => path.startsWith("/grammar") || path.startsWith("/rule"),
  },
] as const;
```

`globals.css`, after `--color-card-purple`:
```css
  /* Grammar. Chosen at the same lightness as the three above, and it clears
     4.8:1 against slate 700. */
  --color-card-rose: #e6c3c0;
```

`src/app/(workspace)/page.tsx`: the grid becomes `md:grid-cols-2 xl:grid-cols-4`, and a fourth card follows Verbs:
```tsx
            <Link
              href="/grammar"
              className="rounded-2xl bg-card-rose p-5 transition hover:brightness-95"
            >
              <h3 className="text-xl font-semibold text-slate-900">Grammar</h3>
              <p className="mt-2 text-sm leading-6 text-slate-800">
                Write down the rules, with tables and examples.
              </p>
            </Link>
```
The comment above that grid says "three cards"; make it "four".

- [ ] **Step 3: Write `AddRuleDialog.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Modal } from "@/components/Modal";
import { MAX_NAME } from "@/lib/constants";
import { createRule, findByTitle } from "@/lib/rules";

/**
 * Only the title and the topic: a rule is written on its own page, where
 * there is room, so this makes the empty rule and goes there in Edit mode.
 */
export function AddRuleDialog({ topics, onClose }: { topics: readonly string[]; onClose: () => void }) {
  const router = useRouter();
  const inputId = useId();
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");

  const clash = findByTitle(title);
  const problem =
    clash ? `There is already a rule called “${clash.title}”.` : topic.trim() === "" ? "A rule needs a topic." : null;
  const ready = title.trim() !== "" && problem === null;

  return (
    <Modal title="New rule" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready) return;
          const rule = createRule({ title, topic });
          onClose();
          router.push(`/rule?id=${rule.id}&edit=1`);
        }}
      >
        <div>
          <label htmlFor={`${inputId}-title`} className="mb-1 block text-sm font-medium">Title</label>
          <input id={`${inputId}-title`} className="field" value={title} maxLength={200} autoFocus onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Dative" />
        </div>
        <div>
          <label htmlFor={`${inputId}-topic`} className="mb-1 block text-sm font-medium">Topic</label>
          <input id={`${inputId}-topic`} className="field" list={`${inputId}-topics`} value={topic} maxLength={MAX_NAME} onChange={(event) => setTopic(event.target.value)} placeholder="e.g. Cases" />
          <datalist id={`${inputId}-topics`}>
            {topics.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
        {problem && title.trim() !== "" && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">{problem}</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!ready}>Create and write it</button>
        </div>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 4: Write the Grammar list page**

`src/app/(workspace)/grammar/page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { TopicBadge } from "@/components/Badges";
import { ConfirmDeleteDialog, RowDeleteButton } from "@/components/DeleteControls";
import { AddRuleDialog } from "@/components/grammar/AddRuleDialog";
import { RowEditButton } from "@/components/RowEditButton";
import { STICKY_FILTERS } from "@/components/StickyFilters";
import { foldName } from "@/lib/foldName";
import { deleteRules } from "@/lib/rules";
import { useListPage } from "@/lib/useListPage";
import { useRules } from "@/lib/useRules";
import { useSettings } from "@/lib/useSettings";
import { useSorting } from "@/lib/useSorting";

/**
 * Every rule, one row each, with the same search, filter and per-row
 * controls as the other lists. The List | Map toggle arrives in stage 4 of
 * the design; until then this is the list alone.
 */
export default function GrammarPage() {
  const router = useRouter();
  const { rules, loaded } = useRules();
  const { settings } = useSettings();
  const sorting = useSorting();
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("");
  const [adding, setAdding] = useState(false);

  const visible = useMemo(() => {
    const needle = foldName(query);
    return rules
      .filter((rule) => !topic || foldName(rule.topic) === foldName(topic))
      .filter((rule) => !needle || foldName(rule.title).includes(needle))
      .sort((a, b) => sorting.compareText(a.title, b.title));
  }, [rules, query, topic, sorting]);

  const { pendingDelete, setPendingDelete, pendingNames } = useListPage(
    visible,
    (rule) => rule.id,
    (rule) => rule.title,
  );

  // The filter offers every topic in use as well as the Settings list, so a
  // rule filed under a topic since taken off the list is still reachable.
  const topics = useMemo(() => {
    const names = new Map<string, string>();
    for (const name of [...settings.topics, ...rules.map((rule) => rule.topic)]) {
      if (name && !names.has(foldName(name))) names.set(foldName(name), name);
    }
    return [...names.values()].sort(sorting.compareText);
  }, [settings.topics, rules, sorting]);

  const subtitle = !loaded
    ? "Loading your rules…"
    : `${rules.length} ${rules.length === 1 ? "rule" : "rules"}`;

  return (
    <>
      <header className="bg-card-rose">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">Grammar</h1>
            <p className="mt-0.5 text-sm text-slate-700">{subtitle}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        {loaded && rules.length === 0 ? (
          <div className="card mx-auto max-w-xl p-8 text-center">
            <h2 className="text-lg font-semibold">No rules yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-300">
              A rule has a title and a topic, and is written as text, tables and examples on its own page.
            </p>
            <button type="button" className="btn btn-primary mt-5" onClick={() => setAdding(true)}>
              + Add rule
            </button>
          </div>
        ) : (
          <>
            <div className={`${STICKY_FILTERS} mb-3 flex flex-wrap items-center gap-2`}>
              <div className="w-full sm:w-1/2 lg:w-64">
                <label htmlFor="rule-search" className="sr-only">Search rules</label>
                <input id="rule-search" type="search" className="field" placeholder="Search rules…" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
              {topics.length > 0 && (
                <div className="w-full sm:w-44">
                  <label htmlFor="rule-topic" className="sr-only">Filter by topic</label>
                  <select id="rule-topic" className="field" value={topic} onChange={(event) => setTopic(event.target.value)}>
                    <option value="">All topics</option>
                    {topics.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
              )}
              <button type="button" className="btn btn-primary shrink-0 sm:ml-auto" onClick={() => setAdding(true)}>
                <span aria-hidden="true">+</span> Add rule
              </button>
            </div>

            {visible.length !== rules.length && (
              <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                Showing {visible.length} of {rules.length} rules.
              </p>
            )}

            <ul className="space-y-1.5">
              {visible.map((rule) => (
                <li key={rule.id} className="card flex flex-wrap items-center gap-3 px-4 py-3">
                  <Link href={`/rule?id=${rule.id}`} className="font-medium text-indigo-700 hover:underline dark:text-indigo-300">
                    {rule.title}
                  </Link>
                  <TopicBadge name={rule.topic} onSelect={setTopic} />
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {rule.blocks.length === 0 ? "Nothing written yet" : `${rule.blocks.length} ${rule.blocks.length === 1 ? "block" : "blocks"}`}
                  </span>
                  <span className="ml-auto flex items-center gap-1">
                    <RowEditButton label={rule.title} onClick={() => router.push(`/rule?id=${rule.id}&edit=1`)} />
                    <RowDeleteButton label={rule.title} onClick={() => setPendingDelete([rule.id])} />
                  </span>
                </li>
              ))}
            </ul>

            {loaded && visible.length === 0 && (
              <p className="py-6 text-sm text-slate-600 dark:text-slate-300">
                No rule matches.{" "}
                <button type="button" className="cursor-pointer text-indigo-700 underline underline-offset-2 dark:text-indigo-300" onClick={() => { setQuery(""); setTopic(""); }}>
                  Clear the search
                </button>
              </p>
            )}
          </>
        )}
      </main>

      {adding && <AddRuleDialog topics={settings.topics} onClose={() => setAdding(false)} />}

      {pendingDelete && (
        <ConfirmDeleteDialog
          names={pendingNames}
          noun="rule"
          nounPlural="rules"
          onConfirm={() => {
            deleteRules(pendingDelete);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 5: Run the checks and the build**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src/ && npm run build`
Expected: all pass; the route table lists `/grammar` and `/rule` as `ƒ` (server-rendered on demand), like `/verbs` and `/word`.

- [ ] **Step 6: Try it in the browser**

Sign in on `http://localhost:3000` (against the live database, which now has the migration from Task 1). Add a rule with a new topic, write a text block, a table and an example, save, reload, open it from the list, filter by its topic, rename the topic in Settings, delete the rule. Check the Settings bin is off for the topic while the rule uses it.

- [ ] **Step 7: Commit**

```bash
git add src/components/grammar/AddRuleDialog.tsx "src/app/(workspace)/grammar/page.tsx" src/components/MainNav.tsx src/components/MainNav.test.tsx "src/app/(workspace)/page.tsx" src/app/globals.css
git commit -m "Add the Grammar list, its tab and its home card"
```

---

### Task 9: Rules in the backup and the Excel export

**Files:**
- Modify: `src/lib/backup.ts`, `src/lib/backupFile.ts`, `src/components/backup/ImportDialog.tsx`, `src/components/backup/ExportDialog.tsx`, `src/lib/backup.test.ts`, `src/lib/backupRoundTrip.test.ts`, `src/lib/buildBackup.test.ts`, `src/lib/applyImport.test.ts`

**Interfaces:**
- Consumes: `getRules`, `toWireRule`, `parseRuleList`, `importRules`, `WireRule` (Task 4); `flattenBlocks` (Task 2); `useRules`.
- Produces: backup version 11 with a `rules` list; `BackupList` includes `"rules"`.

- [ ] **Step 1: Write the failing tests**

`backup.test.ts`: the `contents` helper gains `rules: []`. Add:
```ts
  it("reads rules, and a version 10 file without them as having none", () => {
    const parsed = ok(
      JSON.stringify({
        version: 11,
        words: [],
        rules: [{ id: crypto.randomUUID(), title: "Dative", topic: "Cases", blocks: [] }],
      }),
    );
    expect(parsed.rules.map((rule) => rule.title)).toEqual(["Dative"]);
    expect(ok(JSON.stringify({ version: 10, words: [entry("Tür")] })).rules).toEqual([]);
  });
```
and in the "Replace only touches the lists the file carries" block:
```ts
  it("leaves rules alone when a file from before rules is restored", () => {
    const old = contents({ words: [entry("Tür")] });
    expect(leavesListAlone(old, "rules", "replace")).toBe(true);
  });
```

`backupRoundTrip.test.ts`: where the file is built by hand (`verbTables: [toWireVerbTable(table)]`), add a rule built with `toWireRule` and a test that reads it back equal; extend the scope loop to `["words", "phrases", "verbTables", "rules"] as const` and assert a `rules` scope leaves the other three empty.

`buildBackup.test.ts`: seed a rule with `createRule({ title: "Dative", topic: "Cases" })` and assert `buildBackup().rules[0]` equals `{ id, title: "Dative", topic: "Cases", blocks: [], dateAdded, dateUpdated: null }` with the id and date from the created rule; and `buildBackup("words").rules` is `[]`.

`applyImport.test.ts`: add a mock
```ts
vi.mock("@/lib/rules", () => ({
  getRules: () => [],
  parseRuleList: () => ({ rules: [], unreadable: 0 }),
  importRules: spies.importRules,
}));
```
with `importRules: importer("rules")` in `spies`, `rules: []` in the `contents` helper, and a test that a file holding only words leaves rules alone in replace mode (`leavesListAlone(only, "rules", "replace")` is true) and that a file with rules calls the rules importer with the mode.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/backup.test.ts src/lib/backupRoundTrip.test.ts src/lib/buildBackup.test.ts src/lib/applyImport.test.ts`
Expected: FAIL (type errors on `rules`).

- [ ] **Step 3: `backup.ts`**

- `BACKUP_VERSION = 11`, with this added to the version history comment: `11 adds `rules`, the grammar rules, each with its title, topic and blocks. A file without the key has no rules, and a Replace restore of such a file leaves the rules already saved alone, as it does for any list the file lacks.`
- `export type BackupList = "words" | "phrases" | "verbTables" | "rules";`
- `Backup` gains `rules: WireRule[];`, `buildBackup` gains `rules: wants("rules") ? getRules().map(toWireRule) : [],`
- `BackupContents` gains `rules: Rule[];`; the bare-array branch returns `rules: []`.
- `parseBackup` destructures `rules: rawRules`, builds `const ruleList = asArray(rawRules);` and `parsedRules = ruleList ? parseRuleList(ruleList) : { rules: [], unreadable: 0 }`, adds a `rules` entry to `lists`, and returns `rules: parsedRules.rules`.
- `ImportResult` gains `rules: ImportCounts;` and `applyImport` returns `rules: leavesListAlone(contents, "rules", mode) ? { ...NO_IMPORT } : importRules(contents.rules, mode),`.
- `withNamesInUse` adds the rules' topics to the file's topics, only when the file carries topics (a file from before topics must not have its absent list saved as a short one):
```ts
    topics:
      settings.topics === undefined
        ? undefined
        : [...settings.topics, ...contents.rules.map((rule) => rule.topic)].filter((name) => name.trim() !== ""),
```
Imports: `getRules, importRules, parseRuleList, toWireRule, type WireRule` from `@/lib/rules`, `type Rule` from types.

- [ ] **Step 4: `backupFile.ts`**

`countOf` gains `rules: backup.rules`. `SCOPE_FILE_WORD` (near the top of the file) gains `rules: "grammar"`. A fourth sheet:
```ts
  const rules: Sheet<Blob> = {
    sheet: "Grammar",
    columns: [{ width: 28 }, { width: 18 }, { width: 80 }, { width: 16 }],
    data: [
      headerRow(["Title", "Topic", "Content", "Date added"]),
      ...backup.rules.map<Row>((rule) => [
        { value: rule.title, type: String },
        { value: rule.topic, type: String },
        // Tables and examples flattened to lines; the JSON backup protects
        // the content, and the sheet is for glancing at it.
        { value: flattenBlocks(rule.blocks), type: String, wrap: true },
        { value: formatDate(rule.dateAdded), type: String },
      ]),
    ],
  };
```
and `all` becomes `{ words, phrases, verbTables: verbs, rules }`.

- [ ] **Step 5: The dialogs**

`ExportDialog.tsx`: read `const { rules, loaded: rulesLoaded } = useRules();`, include `rulesLoaded` wherever the other three `loaded` flags gate the dialog, add `rules: rules.length` to `counts` and it to the `all` sum, and a fourth `ScopeChoice`:
```tsx
              <ScopeChoice
                label="Grammar rules"
                detail={`${counts.rules} ${counts.rules === 1 ? "rule" : "rules"}`}
                checked={scope === "rules"}
                disabled={busy}
                onSelect={() => setScope("rules")}
              />
```
(copy the `disabled` expression the neighbouring choices use).

`ImportDialog.tsx`: `Preview` gains `matchingRules: number;`; read `const { rules, loaded: rulesLoaded } = useRules();`, add `rulesLoaded` to `ready`; in the preview computation add `const savedRules = new Set(rules.map((rule) => foldName(rule.title)));`, `rules: parsed.rules` in `contents`, and `matchingRules: parsed.rules.filter((rule) => savedRules.has(foldName(rule.title))).length`; a fourth `ReplaceLine` in the confirm step:
```tsx
          <ReplaceLine
            label="Grammar rules"
            saved={rules.length}
            incoming={contents.rules.length}
            matching={preview.matchingRules}
            untouched={leavesListAlone(contents, "rules", "replace")}
          />
```
and a fourth count line beside the verb tables one:
```tsx
            <li>
              {ruleCount} {ruleCount === 1 ? "grammar rule" : "grammar rules"}:{" "}
              {ruleCount - preview.matchingRules} new to you,{" "}
              {preview.matchingRules} of your {rules.length} already saved.
            </li>
```
with `const ruleCount = contents.rules.length;`. The done step lists per-list counts from `result`; add `result.rules` the same way the others appear there.

- [ ] **Step 6: Run everything**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src/`
Expected: all pass.

- [ ] **Step 7: Prove the old-file test bites**

Temporarily change `leavesListAlone` to `return mode === "replace" && contents[list].length === 0 && list !== "rules";` and run `npx vitest run src/lib/backup.test.ts`: the "leaves rules alone" test must fail. Restore the line and run again: pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/backup.ts src/lib/backupFile.ts src/components/backup/ImportDialog.tsx src/components/backup/ExportDialog.tsx src/lib/backup.test.ts src/lib/backupRoundTrip.test.ts src/lib/buildBackup.test.ts src/lib/applyImport.test.ts
git commit -m "Carry grammar rules in backups, version 11"
```

---

### Task 10: Documents, the handoff, and the release

**Files:**
- Modify: `Docs/schema.md`, `Docs/grammar.md`
- Delete: `HANDOFF.md`

- [ ] **Step 1: `Docs/schema.md`**

In "The shape" table, `items` becomes "every word, phrase, verb table and grammar rule". In the `items` section, after the verb table paragraph:

```markdown
A grammar rule's content is `blocks`, jsonb: an ordered array of text, table
and example blocks, read and written whole. `map_x` and `map_y` are where it
sits on the grammar map, unset until placed. `has_answer` has no branch for
grammar and is false for every rule, deliberately: rules make no flashcards,
and that is the intent rather than an omission.
```
In "`tags` and `item_tags`": "`collection` is one context; `grammar` is the other: a rule's topic, exactly one per rule (`item_tags_grammar_one` holds it to one, and `save_items` refuses a rule with none)." In "Adding a kind of item later", note that `set_updated_at` and `save_items` are the two functions a new column has to be declared in, as the grammar migration shows.

- [ ] **Step 2: `Docs/grammar.md`**

Under the heading, after the review note: "**Stage 1 is built** (26 September 2026): rules, blocks, the reading view and Edit, topics in Settings, the tab, the home card, backup and export. Stages 2 to 5 remain."

- [ ] **Step 3: Delete `HANDOFF.md`**

Its own first paragraph says to delete it once the work has started. `git rm HANDOFF.md`.

- [ ] **Step 4: Final checks**

Run: `npx tsc --noEmit && npx eslint src/ && npx vitest run && npm run build`
Then: `grep -rnP "[\x{2013}\x{2014}]" src/lib/blocks.ts src/lib/blockText.ts src/lib/rules.ts src/components/grammar Docs/schema.md Docs/grammar.md supabase/migrations/*_grammar_rules.sql` must print nothing.

- [ ] **Step 5: Commit and push**

```bash
git add Docs/schema.md Docs/grammar.md
git commit -m "Record stage 1 of the grammar feature"
git push origin main
```
Vercel deploys `main`. Afterwards, sign in on production and repeat Task 8 step 6 there.

---

## Self-review notes

- Spec coverage for stage 1: rules with title and topic (Tasks 1, 4, 7, 8); the three block types with the listed markup (Tasks 2, 3, 6, 7); reordering by drag and by Move up/down (Task 7); reading view with Edit (Task 7); topics in Settings with the in-use rule and merge-on-rename (Task 5); nav after Verbs and the fourth home card (Task 8); backup and Excel (Task 9); ships empty (no seeds anywhere); no flashcards from rules (Task 1's comment, `has_answer` unchanged). Highlights, Link to…, New rule from this, the map, and practice are later stages and are not here.
- Names: `findByTitle`, `createRule`, `updateRule`, `deleteRules`, `renameTopic`, `settings.topics`, `flattenBlocks`, `BlockView`, `RuleEditor` are used with the same signatures throughout.
- Review Focus items 1 to 5 each have their test in Tasks 1, 3, 2, 9 and 4/8.
