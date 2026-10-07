# The grammar tutor

Design agreed with the owner on 2 October 2026, on branch `tutor`. It adds the
app's first AI feature: a tutor that explains grammar concepts the learner finds
confusing, through OpenRouter, as a paid feature with a one-conversation trial.

## Intent

- A learner asks about a grammar concept they find confusing and gets a clear,
  level-appropriate explanation with practical examples and tables where they
  help, and can ask follow-up questions.
- They choose whether the tutor answers in their native language or in the
  language they are learning.
- Answers are grounded in trustworthy reference sites for the language being
  studied, and show which sources they used.
- Answers are separate from saved grammar rules. The learner decides what, if
  anything, to keep, and keeping it means saving it as a grammar rule.
- The feature is paid. A free account can try it once; a paid account has a
  daily limit.
- The OpenRouter key never reaches the browser, and the model can be switched
  by changing one setting.

Out of scope, each its own later piece of work if wanted: payments, checkout and
a pricing page (pricing is undecided, so nothing on screen mentions a price);
reading answers aloud. Saved conversations, memory and merged rules:
`Docs/tutor-conversations.md`.

## Answers as rule blocks

The tutor replies in the shape a saved grammar rule already uses: a suggested
`title`, a suggested `topic`, and `blocks`, each a text, table or example block
as defined in `src/lib/types.ts`. The page renders them with the component that
renders saved rules, and "Save as rule" saves exactly what is shown. The reply
arrives whole, after a short "Thinking…" state, rather than streaming: that
trade buys identical rendering, no new rendering library, and lossless saving.

## Plumbing

- One route handler, `POST /api/tutor` (`src/app/api/tutor/route.ts`, Node
  runtime). It verifies the session with `serverUserId()` (`getClaims`), reads
  the account's plan and usage from the database, checks the allowance, records the question, counts again, calls
  OpenRouter, validates the reply, and returns it.
  The proxy already protects `/api/*` for signed-out requests; the handler
  checks again regardless, and answers 401 without a session.
- OpenRouter is called with Node's built-in `fetch` to
  `https://openrouter.ai/api/v1/chat/completions`. No SDK: the official one is
  in beta and would add dependencies for a single call.
- `OPENROUTER_API_KEY` is read only in server code and never has a
  `NEXT_PUBLIC_` name. In Vercel it is a Sensitive environment variable.
- `OPENROUTER_MODEL` chooses the model; when unset the default is
  `anthropic/claude-sonnet-5.5`. Switching models is changing that one value in
  `.env.local` and in Vercel. The default lives in one constant beside the
  reader of the variable.
- The reply format is enforced with a JSON schema in the request
  (`response_format`), and the server treats the reply as untrusted input: it
  must parse, match the shape, and pass through `readBlocks` before it is
  returned. A reply that fails is an error, not a partial answer.

## Trusted sources

Each request uses OpenRouter's `web` plugin, pinned to the Exa engine (which
honours a domain list on every model), restricted with `include_domains` to a
fixed list of reference sites for the studied language, kept in one map in
code. Not the newer `openrouter:web_search` server tool: a real call on
2 October 2026 showed it made the model ignore the JSON schema and cite nothing,
while the plugin kept the schema and cited only allowed domains. Starting list (each domain to be confirmed reachable
during implementation; a domain that is not is dropped, not replaced by guess):

| Language | Allowed reference domains |
| --- | --- |
| English (`en`) | dictionary.cambridge.org, learnenglish.britishcouncil.org, merriam-webster.com |
| German (`de`) | duden.de, dwds.de |
| French (`fr`) | academie-francaise.fr, larousse.fr |
| Spanish (`es`) | rae.es, fundeu.es |
| Italian (`it`) | accademiadellacrusca.it, treccani.it |
| Portuguese (`pt`) | ciberduvidas.iscte-iul.pt, priberam.org |
| Dutch (`nl`) | taaladvies.net, onzetaal.nl |
| Russian (`ru`) | gramota.ru |
| Japanese (`ja`) | www.bunka.go.jp |
| Korean (`ko`) | korean.go.kr |
| Chinese (`zh`) | resources.allsetlearning.com |

The source links come back as `url_citation` annotations and are shown under
the answer, but only those on a reference site itself or its www
(`onReferenceSite`): the search also returns other hosts of the same sites,
such as shop.duden.de, whose exercise books were once listed as sources
(7 October 2026). The search takes the last message as its query, so a
follow-up is sent as `About "<the previous answer's title>": <question>`
(`followUp`) and a merge as a short list of the answers' topics
(`mergeSearch`), with the answers themselves in the instructions. When the studied language has no list (a language typed in as
"Other"), the request goes out without web search, and the answer carries the
note "Not checked against a reference". The same note shows when a search
returned no citations.

## Plan and allowance

One migration (created with `npx supabase migration new tutor`) adds:

- `account_plans`: `user_id` (primary key, references the user), `plan` text
  checked to `'free'` or `'paid'`, `updated_at`. Row level security with a
  select policy on `(select auth.uid()) = user_id` and **no** insert, update or
  delete policy or grant for `authenticated`: an account can read its plan and
  can never change it. No row means free. The owner marks an account paid in
  the Supabase dashboard (Table Editor or SQL), which runs as an administrator.
- `tutor_usage`: `id`, `user_id`, `created_at`. Row level security with select
  and insert policies (insert `with check` on the owner), and no update or
  delete: the count can only grow. A refused request records nothing. The question is recorded, and counted again,
  before OpenRouter is called, and failed answers count (owner's decision, 2 October
  2026). Two requests racing can both be refused; the limit is never exceeded. One
  edge at midnight UTC: a question reserved just before midnight and re-counted
  just after can give a paid account one extra question that day.
- Three columns on `user_settings` for the new settings below.

Limits, each one constant in code:

- Free: 5 tutor messages in total, for the life of the account. That is one
  trial conversation of a question and its follow-ups.
- Paid: 30 a day, counted from midnight UTC.

`Docs/schema.md` and `CLAUDE.md` are updated: eleven tables, how to mark an
account paid, and that `OPENROUTER_API_KEY` is server-only.

## Settings

Two new settings in their own Settings section, "Native language and level",
under Profile, with a summary such as "English · B1" (first built inside the
Language section, where its folded summary hid them):

- **Native language**: the same picker as the studied language (presets plus a
  typed name), stored exactly as the studied language is: `native_language`
  (an ISO 639-1 code, same check as `language`) and `native_language_other` (a
  typed name), at most one of the two set.
- **Level**: not set, or A1, A2, B1, B2, C1, C2 (the CEFR scale), stored as
  `level` with a check. Not set means the tutor pitches at about B1 and says
  nothing about it.

Backups include both. Older backup files without them still read, defaulting to
not set, as the project's backup rules require; `BACKUP_VERSION` goes up by one.

## The tutor page

`/tutor`, inside the `(workspace)` group, with a Tutor tab in the top bar and
in the phone menu. Top to bottom:

1. A switch for the answer language, labelled with the real language names
   (native and studied), after a visible "Answer in" label. When no native
   language is set, only the studied language is offered, with an "Add your
   native language" link to Settings.
2. The conversation: each question, and each answer rendered as rule blocks.
   Under each answer, its sources (or "Not checked against a reference") and
   **Save as rule**, which opens a small dialog with the suggested title and
   topic, editable, and saves through one `createRule` call (given the
   reply's blocks) in `src/lib/rules.ts`, so there is a single save. A title the rules refuse (duplicate, forbidden
   characters) is reported in the dialog, as Grammar does.
3. The question box (up to 1,000 characters) with **Ask**,
   and a small allowance line ("26 left today", "3 trial messages left"). No
   other explanatory copy.

Conversations are saved, searchable and remembered across the account; how the
page keeps them, and what each request sends for context, is in
`Docs/tutor-conversations.md`.

States that replace the question box:

| Situation | Copy |
| --- | --- |
| No studied language set | "Choose the language you are studying" with a link to Settings |
| Free trial used up | "The tutor is part of the paid plan." |
| Paid, daily limit reached | "You have used today's questions. They reset at midnight UTC." |

A failed call shows "The tutor could not answer. Try again." beside the
question, and the question box stays usable.

## The tutor's instructions

The system instructions tell the model: it is a grammar tutor for the studied
language; answer in the chosen answer language; always explain as if to a
ten-year-old, whatever the learner's level (short sentences, everyday words, a
plain meaning before any grammar term: the owner's rule, 2 October 2026), with
the level setting only how hard the example sentences are; give practical
example sentences (with translations into the answer
language when it differs from the studied language) and use tables where they
help; base the explanation on the search results from the allowed reference
sites; and answer only grammar and language-learning questions about the
studied language, declining anything else in one polite sentence. They end,
so it weighs most, with the answer language for every title, explanation,
table heading and translation, even when the question or the reference pages
are in another language (a German-heavy question once came back in German
with English chosen, 3 October 2026), and they forbid links in the text. The
instructions are built by one pure function so they can be tested.

Whatever the model writes, `readReply` cleans text blocks and table cells:
braces (practice markup, valid only in example sentences) and written-out
links are removed, and an em dash becomes a comma, the owner's rule for all
text the app shows.

## Verification

- Unit tests: the allowance (free 5 total, paid 30 per UTC day, the boundary at
  midnight); the request builder (model default and override, the right domains
  per language, no search for an unlisted language, level and answer language
  in the instructions, history capped at 10); reply parsing and validation,
  including malformed and wrong-shape replies; the route answering 401 without a
  session and refusing over-limit requests; the settings and backup round trip,
  including an old backup without the new fields.
- The migration rehearsed on the local Supabase copy with a rolled-back script:
  an account reads its own plan and cannot insert, update or delete one; usage
  rows can be inserted and read but not updated or deleted; neither table shows
  another account's rows; anon can do nothing.
- One real call on localhost with the owner's key, to confirm the request
  shape, the domain restriction and the citations end to end (about two cents).
- End-to-end tests on localhost cover the page loading and the special states,
  not a live answer, since each run would cost money.
- `npx tsc --noEmit`, `npx eslint src/ e2e/`, `npx vitest run`, `npm run build`
  (the route table shows `/api/tutor` and `/tutor` as dynamic).
- README, `CLAUDE.md`, `Docs/schema.md` and `.env.example` are updated in the
  same branch.
