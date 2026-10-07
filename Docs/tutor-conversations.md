# Tutor conversations

Design agreed with the owner on 7 October 2026, on branch
`tutor-conversations`. It turns the grammar tutor (`Docs/tutor.md`) into a
page of saved conversations, like Projects in Claude, with memory, search and
rules made from several answers at once. It replaces the Conversations page.

## Intent

- The learner keeps many conversations with the tutor and comes back to any of
  them later to ask follow-up questions. Closing the page loses nothing.
- The tutor remembers: the open conversation, and what was said in the
  learner's other conversations where it is relevant to the question.
- At any point the learner ticks one or more answers and turns them into one
  grammar rule. The tutor merges them, saying each thing once, in the shape
  answers already have, and the rule is saved through today's save dialog.
- Rules saved from a conversation stay linked to it, so a rule saved weeks
  later from the same conversation links to the earlier ones.
- Conversations are listed on the left, one line per name, under a search box
  that searches conversations only, by keyword and by meaning (RAG).

Settled in the design conversation:

| Question | Owner's decision |
| --- | --- |
| The Conversations page | Removed. Its saved chats are deleted, not carried across. |
| What RAG is for | Search, and memory across all conversations. |
| What is ticked for a rule | Whole answers. |
| Single answers | Keep **Save as rule** on each answer (free, as today). Ticking two or more offers **Make one rule** (one message). |
| Web search in a merge | On, limited to the reference sites, used only to check and correct, never to add topics. |
| Links across visits | Remembered per conversation in a table, linked automatically. |
| Linking to other rules | Any grammar rule can be linked from the save dialog, not only the tutor's suggestions. |

Defaults taken without objection: search and embeddings do not spend the
allowance; free accounts get the same page within their five trial messages;
a new conversation is named after its first answer's title.

Out of scope: payments; reading answers aloud; sharing conversations;
a rate limit on search (see Weak points).

## Approach

Embeddings are made in the tutor's own server routes, through OpenRouter's
`POST https://openrouter.ai/api/v1/embeddings`, with the same key and the same
`fetch` as the tutor's call. The model is `baai/bge-m3` (1024 dimensions,
multilingual, about $0.01 per million tokens), in one constant
`EMBEDDING_MODEL` beside `DEFAULT_TUTOR_MODEL`.

Rejected:

- A Supabase Edge Function with the built-in `gte-small`: English only, and it
  would be the project's first Edge Function, deployed outside Vercel.
- Supabase automatic embeddings (pgmq, pg_cron, pg_net): the function connects
  with a privileged database connection that bypasses RLS and accepts calls
  with no session, which CLAUDE.md's rules exist to prevent.

pgvector is available on the free plan. At a few thousand exchanges per
account an exact scan filtered by `user_id` is fast, so there is no vector
index; an HNSW index (with `hnsw.iterative_scan = relaxed_order`, since an
approximate index filters after it scans) is added only if `EXPLAIN` shows the
scan getting slow.

## Data

One migration, made with `npx supabase migration new tutor_conversations`,
enables `vector` in the `extensions` schema and adds three tables and one
function. Every type and operator from pgvector is written schema-qualified
(`extensions.vector`, `operator(extensions.<=>)`), as functions here use
`search_path = ''`. It ends with a block that checks the policies and grants
are exactly these, as `20261005074442_conversation_messages.sql` does.

### `tutor_conversations`

| Column | |
| --- | --- |
| `id` | uuid, primary key, default `gen_random_uuid()` |
| `user_id` | uuid, references `auth.users`, cascade |
| `name` | text, 1 to 120 characters, trimmed |
| `created_at` | timestamptz, default now() |
| `updated_at` | timestamptz, default now(); last activity, which orders the sidebar |

`unique (id, user_id)` for the composite keys below. Index on
`(user_id, updated_at desc)`. RLS: select, insert, update and delete on
`(select auth.uid()) = user_id`, with `with check` on insert and update.
Grants: select, delete, insert (`user_id`, `name`), update (`name`,
`updated_at`).

### `tutor_exchanges`

One row per question and its answer, or per merged rule. A pair per row means
ticking, signing and embedding all work on one row, and a failed answer saves
nothing.

| Column | |
| --- | --- |
| `id` | bigint, generated always as identity, primary key; also the order |
| `conversation_id`, `user_id` | foreign key `(conversation_id, user_id)` to `tutor_conversations (id, user_id)`, cascade |
| `kind` | text, `'answer'` or `'merge'` |
| `question` | text, 1 to 1000 characters; for a merge, the label shown, such as "Rule from 3 answers" |
| `reply` | jsonb: `title`, `topic`, `blocks`, `sources`, `existing_rule`, `related_rules`, as `TutorReply` |
| `answer_text` | text, 1 to 32000 characters: `answerText(reply)`, what is signed and what the model is sent back |
| `signature` | text, `^[0-9a-f]{64}$`: `signTurn(userId, answer_text)` |
| `embedding` | `extensions.vector(1024)`, nullable: question and answer embedded as one piece; null when embedding failed |
| `fts` | tsvector, generated always, stored: `to_tsvector('simple', question \|\| ' ' \|\| answer_text)` |
| `created_at` | timestamptz, default now() |

The `simple` configuration does no stemming but works the same in every
language; per-language configurations would need a language guess for mixed
messages, and the vector half covers what stemming would. Indexes: btree on
`(user_id, conversation_id, id)`, GIN on `fts`. RLS: select and insert, with
`with check` on insert. Grants: select, and insert on the named columns only
(`conversation_id`, `user_id`, `kind`, `question`, `reply`, `answer_text`,
`signature`, `embedding`), so the order and time stay the database's. No
update and no delete: an exchange is written once, and the cascade removes it
with its conversation.

An account can insert rows of its own with the publishable key, including a
made-up reply or vector. That only affects its own rows, and a made-up reply
never reaches the model, because its signature will not verify.

### `tutor_conversation_rules`

The rules saved from each conversation, linked automatically when another rule
is saved from it.

| Column | |
| --- | --- |
| `conversation_id`, `user_id` | foreign key to `tutor_conversations (id, user_id)`, cascade |
| `item_id` | foreign key `(item_id, user_id)` to `items (id, user_id)`, cascade |
| `created_at` | timestamptz, default now() |

Primary key `(conversation_id, item_id)`. It holds the rule's id, not its
title, so a renamed rule is linked under its new name. RLS: select, insert and
delete on the owner. Grants: select, delete, insert (`conversation_id`,
`user_id`, `item_id`).

### `search_tutor(query text, query_embedding extensions.vector(1024), match_count int)`

`language sql`, `stable`, `security invoker`, `set search_path = ''`. It ranks
the account's exchanges twice, by `ts_rank_cd` against
`websearch_to_tsquery('simple', query)` and by cosine distance (`<=>`) to
`query_embedding`, and fuses the two orders by reciprocal rank fusion
(`k = 50`), over a full outer join. Both halves also filter on
`user_id = (select auth.uid())`, so the planner uses the index rather than
relying on the policy alone. A null `query_embedding` gives keyword-only
results; rows with a null embedding take part in the keyword half only.
It returns `exchange_id`, `conversation_id`, `kind`, `question`,
`answer_text`, `reply`, `signature` and `score`, best first.

### `conversation_messages`

Its rows are deleted in the same migration. The table is dropped by a second
migration once no deployed code reads it.

`Docs/schema.md` is updated: fifteen tables (three added, one dropped) and
eleven functions.

## Server

All three routes run on Node, verify the session with `serverUserId()`,
answer 401 without one, and log status codes and short reasons only, never the
learner's text. OpenRouter is still reached only from `tutorServer.ts`, which
gains `embed(texts: string[]): Promise<number[][]>`.

### `POST /api/tutor`

Body `{ conversationId?, question, answerIn }`.

1. With a `conversationId`, read the conversation under RLS; one that is not
   the account's, or no longer exists, answers 404.
2. Allowance and reservation as today; refusals still come first.
3. History: the conversation's last 10 exchanges from the database, kept only
   where the signature verifies (`verifiedTurns`). Nothing in the request is
   trusted as history any more.
4. Memory: embed the question, call `search_tutor` across all the account's
   conversations, drop exchanges already in the history, verify signatures,
   and keep the best 5. They are given to the model after the instructions as
   earlier exchanges ("Earlier, the learner asked: ... You answered: ...").
   Embedding or search failing leaves memory out, not the answer.
5. Ask the model and read the reply as today (`buildRequest`, `readReply`,
   reference sites, rule titles).
6. Save: a first question creates the conversation, named with the reply's
   title; then insert the exchange, with the question and answer embedded
   together, and set the conversation's `updated_at`. An embedding that fails
   is saved as null. A save that fails still returns the answer, with
   `saved: false`, as it was paid for.
7. Return `{ conversationId, exchange, remaining, saved }`.

### `POST /api/tutor/merge`

Body `{ conversationId, exchangeIds }`, 2 to 10 ids.

1. Read the conversation and those exchanges under RLS; 404 if the
   conversation is missing, 400 if any id is not one of its exchanges.
   Keep only exchanges whose signature verifies; fewer than 2 left is 400.
2. Allowance and reservation as on a question: a merge spends one message.
3. Ask the model with `tutorInstructions` plus a merge instruction, built by
   one pure function (`mergeInstructions`): combine these answers into one
   rule, saying each thing once, and use the search results only to check and
   correct what the answers say, never to add new topics. The answers are
   given as the content to merge. Web search is on, with the same reference
   sites as a question; an unlisted language goes without and shows "Not
   checked against a reference". Same `REPLY_SCHEMA` and `readReply`.
4. Sources are the fresh citations and the ticked answers' sources, without
   repeats.
5. Save it as a `kind = 'merge'` exchange labelled "Rule from N answers", so
   it shows in the conversation, can be saved, and can be ticked again.
6. Return as `POST /api/tutor`.

### `POST /api/tutor/search`

Body `{ query }`, 2 to 200 characters. Embed the query and call
`search_tutor` with `match_count` 30; on an embedding failure call it with a
null embedding (keyword only). Group by conversation, best first, each with
its name and a snippet of about 80 characters around the best match. It does
not spend the allowance.

### Browser, under RLS

`src/lib/tutorConversations.ts` lists the sidebar's conversations, renames
and deletes them, and reads and writes `tutor_conversation_rules`. It is not
built on `remoteStore`, which is for the four item lists. Writes are
optimistic; a failure reloads the list and puts a message in the banner, as
elsewhere.

## The page

`/tutor` is a new, empty conversation; `/tutor?c=<id>` opens one, so a reload
or a bookmark stays on it, and `#e-<id>` scrolls to an exchange. The server
loads the sidebar list, the open conversation's exchanges, and its saved rule
ids before rendering. An id that is not found opens an empty conversation with
"That conversation was not found."

### Sidebar (left, about 16rem, sticky under the top bar, scrolling on its own)

1. A search box labelled "Search conversations".
2. **New conversation**, which opens `/tutor`.
3. The conversations, newest activity first, one line per name, cut with an
   ellipsis (full name on hover), the open one highlighted. Each line has a
   ⋯ menu with **Rename** (edited in place) and **Delete** (confirmed in a
   dialog). With none saved: "No conversations yet."

While the search box has text, results replace the list: each conversation's
name and, under it in small text, one line of the matching snippet. Choosing
one opens it at the matching exchange. Clearing the box brings the list back.
A failed search shows "Search is not available right now."

On phones the sidebar is a **Conversations** button at the top of the page,
opening it as a panel over the page; choosing a conversation closes it.

### Main area, top to bottom

1. **Answer in**, as today.
2. The conversation: each question, and each answer rendered as rule blocks
   with its sources (or "Not checked against a reference"), **Save as rule**,
   and a tick box, "Include in a rule". A merged rule shows the same way,
   headed with its label.
3. With two or more ticked, a bar above the question box: **Make one rule
   from N answers** and **Clear**. While the tutor works, "Thinking…" with the
   hourglass, as today.
4. The question box with **Ask** and the allowance line, as today.

When the trial or the day's limit is used up, the question box and the merge
bar are replaced as today. The sidebar, search, reading and **Save as rule**
keep working, as none of them costs a message.

Red is used only for errors.

### Saving a rule

`SaveAsRuleDialog` keeps its title, topic, free numbered title and See also
line. What it links to:

1. **Automatic:** every rule in `tutor_conversation_rules` for this
   conversation that still exists, as today's `linkTo`, but across visits.
2. **Suggested:** the tutor's up to 3 `related_rules`, unticked. They are
   chosen from all the account's grammar rules (`loadRuleTitles`), whoever
   made them.
3. **Chosen:** a **Link another rule** search field lists matching grammar
   rules by title and text, with the matcher the rule editor's Link to dialog
   uses (`ruleSearch.ts`). Choosing one adds it as a ticked box.

`createRule` saves optimistically, so the `tutor_conversation_rules` row is
written once the rule's own save has gone through; a rule that fails to save
records nothing.

## Removed

`/conversations` and its error page; `POST` and `DELETE /api/conversation`
and their tests; `ConversationChat`; `loadConversation`, `saveExchange` and
`clearConversation`; `chatInstructions`, `buildChatRequest` and
`readChatReply`; `readHistory` and the browser-sent history; the Tutor tab's
two-item menu, which becomes one Tutor tab; `e2e/conversations/`; the
Conversations sections of the README.

## Failures

| Failure | What happens |
| --- | --- |
| Model call fails | "The tutor could not answer. Try again." beside the question, as today; the message is spent, as today |
| Embedding fails on a question | Answered without memory; saved with no embedding, still found by keyword |
| Saving the exchange fails | Answer shown, with "This answer was not saved." |
| Merge fails | As a failed question; the ticked answers stay ticked |
| Search embedding fails | Keyword-only results, nothing shown |
| Search fails | "Search is not available right now."; the list stays |
| Rename, delete or a link record fails | List reloaded, message in the banner |
| Unknown or other account's conversation | Empty conversation, "That conversation was not found." |

## Weak points

- Search has no rate limit; each call embeds a query at a fraction of a cent.
  Add a cap if abuse appears.
- The embedding model is fixed by the column's dimension. Changing it means
  re-embedding every exchange (and a new column if the dimension changes).
- Rotating `OPENROUTER_API_KEY` leaves older answers unverified: still shown
  and searchable, no longer sent to the model as history or memory.
- No vector index: fine for thousands of exchanges per account; add HNSW with
  iterative scans if `EXPLAIN` shows the scan slowing.

## Verification

- Unit tests: `mergeInstructions` and the merge request (search on, the check
  only sentence); merging sources without repeats; memory selection (signed
  only, none already in the history, at most 5); each route's 401, 404 for
  another account's conversation, 400 for bad bodies and merges outside 2 to
  10; naming from the first reply; search falling back to keyword only;
  `embed` reading OpenRouter's response and rejecting a wrong dimension.
- Database rehearsal, a rolled-back script in
  `supabase/tests/tutor_conversations.sql` on the local copy: each account
  sees only its own conversations, exchanges and links; exchanges cannot be
  updated or deleted directly; a link to another account's rule or
  conversation is refused; deleting a conversation removes its exchanges and
  links; deleting a rule removes its links; `search_tutor` returns only the
  caller's rows, and keyword-only with a null embedding.
- One real call on localhost with the owner's key (a few cents): embeddings,
  memory and a merge end to end.
- End-to-end tests on localhost, with conversations put straight into the
  local database rather than asked for: the sidebar loads; a conversation
  opens from its URL; rename and delete; answers render with sources; ticking
  two shows the merge bar; **Save as rule** saves, and a second rule saved
  after reopening links to the first; **Link another rule** finds a rule made
  on the Grammar page; search finds a conversation by keyword. Asking a
  question and making a merged rule are left to the unit tests and the real
  call, as each run would cost money.
- `npx tsc --noEmit`, `npx eslint src/ e2e/`, `npx vitest run`,
  `npm run build` (`/tutor` and the three routes dynamic).
- README, CLAUDE.md, `Docs/schema.md` and `Docs/tutor.md` (stored history is
  no longer out of scope) updated in the same branch.

## Release order

1. The first migration pushed to the live project with `npx supabase db push`,
   with the owner's yes at the time.
2. The code merged to `main`, which deploys it.
3. The second migration, dropping `conversation_messages`, pushed once the
   deploy is live.
