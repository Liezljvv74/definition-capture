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
| A merged rule's language | Follows the Answer in switch, as a question does. |
| Answer signatures | Keyed by a secret of their own, `TUTOR_SIGNING_SECRET`, so replacing the OpenRouter key never leaves older answers unusable. |
| Storage per account | At most 2,000 saved exchanges and 500 conversations, enforced by the database. |
| Searches | At most 100 per account per hour. |

Defaults taken without objection: search and embeddings do not spend the
allowance; free accounts get the same page within their five trial messages;
a new conversation is named after its first answer's title.

Out of scope: payments; reading answers aloud; sharing conversations.

The plan was reviewed for scale on 7 October 2026 by the ai-architect agent
and the Supabase skills (`Reports/2026-10-07-tutor-conversations-plan-review.pdf`);
this spec includes what came of it.

## Approach

Embeddings are made in the tutor's own server routes, through OpenRouter's
`POST https://openrouter.ai/api/v1/embeddings`, with the same key and the same
`fetch` as the tutor's call. The model is `qwen/qwen3-embedding-8b`, asked for 1024 dimensions
(multilingual, about $0.01 per million tokens), in one constant
`EMBEDDING_MODEL` beside `DEFAULT_TUTOR_MODEL`. Vectors are stored at half
precision (`halfvec`), which halves their space and the reading of a scan for
a loss in search quality too small to notice.

`baai/bge-m3`, first chosen, is refused by the OpenRouter account's guardrails
(checked 7 October 2026); Qwen3 is allowed and gives 1024-dimension vectors when
asked, so the column is unchanged.

Rejected:

- A Supabase Edge Function with the built-in `gte-small`: English only, and it
  would be the project's first Edge Function, deployed outside Vercel.
- Supabase automatic embeddings (pgmq, pg_cron, pg_net): the function connects
  with a privileged database connection that bypasses RLS and accepts calls
  with no session, which CLAUDE.md's rules exist to prevent.

pgvector is available on the free plan. An account holds at most 2,000
exchanges, so an exact scan filtered by `user_id` is fast and there is no
vector index; an HNSW index (with `hnsw.iterative_scan = relaxed_order`, since
an approximate index filters after it scans) is added only if `EXPLAIN` shows
the scan getting slow.

### Sized for the free plan

The free plan's 500 MB is shared by every account, and past it the whole
project goes read-only, every list included. An exchange costs about 8 to 10 KB
(the reply JSON, the answer text, a 2 KB half-precision vector and index
entries), so the database holds very roughly 50,000 to 60,000 exchanges in
all. Hence: half-precision vectors kept in the row, a keyword index on an
expression rather than a stored column, a 64 KB cap on a reply, and a cap of
2,000 exchanges and 500 conversations per account, checked by the database on
every insert, so a row an account inserts directly with the publishable key is
held to it too. The owner watches Dashboard, Usage, and moves to Pro before
about 350 MB.

## Data

One migration, made with `npx supabase migration new tutor_conversations`,
enables `vector` in the `extensions` schema and `pg_cron`, and adds four
tables, two functions and a nightly job. Every type and operator from pgvector
is written schema-qualified (`extensions.halfvec`, `operator(extensions.<=>)`),
as functions here use `search_path = ''`. It ends with a block that checks the
policies, grants and job are exactly these, as
`20261005074442_conversation_messages.sql` does.

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
`updated_at`). At most 500 per account (`enforce_row_limit`).

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
| `reply` | jsonb, at most 64 KB: `title`, `topic`, `blocks`, `sources`, `existingRule`, `relatedRules`, as `TutorReply` |
| `answer_text` | text, 1 to 32000 characters: `answerText(reply)`, what is signed and what the model is sent back |
| `signature` | text, `^[0-9a-f]{64}$`: `signTurn(userId, answer_text)` |
| `embedding` | `extensions.halfvec(1024)`, nullable, storage `main` (kept in the row): question and answer embedded as one piece; null when embedding failed or ran out of time |
| `created_at` | timestamptz, default now() |

Keyword search uses a GIN index on the expression
`to_tsvector('simple', question || ' ' || answer_text)`, not a stored column,
which would keep a second copy of the text in every row. The `simple`
configuration does no stemming but works the same in every language;
per-language configurations would need a language guess for mixed messages,
and the vector half covers what stemming would. Other index: btree on
`(user_id, conversation_id, id)`. RLS: select and insert, with `with check` on
insert. Grants: select, and insert on the named columns only
(`conversation_id`, `user_id`, `kind`, `question`, `reply`, `answer_text`,
`signature`, `embedding`), so the order and time stay the database's. No
update and no delete: an exchange is written once, and the cascade removes it
with its conversation. At most 2,000 per account (`enforce_row_limit`).

An account can insert rows of its own with the publishable key, including a
made-up reply or vector. That only affects its own rows, within its limits,
and a made-up reply never reaches the model, because its signature will not
verify.

### `tutor_conversation_rules`

The rules saved from each conversation, linked automatically when another rule
is saved from it.

| Column | |
| --- | --- |
| `conversation_id`, `user_id` | foreign key to `tutor_conversations (id, user_id)`, cascade |
| `item_id` | foreign key `(item_id, user_id)` to `items (id, user_id)`, cascade |
| `user_id` | default `auth.uid()`, so the browser records a link without looking up its id; no reference of its own, as both keys cascade when the account goes |
| `created_at` | timestamptz, default now() |

Primary key `(conversation_id, item_id)`; index on `(item_id, user_id)` for
the cascade from a deleted rule. It holds the rule's id, not its title, so a
renamed rule is linked under its new name. RLS: select, insert and delete on
the owner. Grants: select, delete, insert (`conversation_id`, `user_id`,
`item_id`).

### `tutor_searches`

One row per sidebar search (`id`, `user_id`, `created_at`), so an account's
searches in the last hour can be counted, as `tutor_usage` counts questions.
Index on `(user_id, created_at)`. RLS and grants: select, and insert of
`user_id` only, so a row cannot be backdated; no delete, since an account that
could delete its rows could reset its own count. The pg_cron job
`tutor-searches-cleanup` deletes rows older than a day each night, so the
table stays small. An `enforce_row_limit` trigger caps an account at 3,000 rows
between clean-ups, above a day of honest use at 100 an hour, so direct inserts
with the publishable key cannot grow it without end.

### `enforce_row_limit()`

A `before insert` trigger function, `security invoker`, `set search_path =
''`. It counts the inserting account's rows in the table it fires on (under
row level security, so exactly that account's) and refuses the row with
`program_limit_exceeded` at the number given as its trigger argument: 500 on
`tutor_conversations`, 2,000 on `tutor_exchanges`, 3,000 on `tutor_searches`. Two inserts racing can both
pass, so an account can end one or two over; the limit is about storage.

### `search_tutor(query text, query_embedding extensions.halfvec(1024), match_count int)`

`language sql`, `stable`, `security invoker`, `set search_path = ''`. It ranks
the account's exchanges twice, by `ts_rank_cd` against
`websearch_to_tsquery('simple', query)` and by cosine distance (`<=>`) to
`query_embedding`, and fuses the two orders by reciprocal rank fusion
(`k = 50`), over a full outer join. The meaning half keeps only rows closer
than a cosine distance of 0.5, or the nearest rows would always come back,
related or not; the number is tuned against real searches before release.
Both halves also filter on `user_id = (select auth.uid())`, so the planner uses
the index rather than relying on the policy alone. A null `query_embedding`
gives keyword-only results; rows with a null embedding take part in the
keyword half only. It returns `exchange_id`, `conversation_id`,
`conversation_name`, `kind`, `question`, `answer_text`, `signature` and
`score`, best first, and no reply JSON, which neither the sidebar nor memory
uses.

### `conversation_messages`

Its rows are deleted in the same migration. The table is dropped by a second
migration once no deployed code reads it.

`Docs/schema.md` is updated: sixteen tables (four added, one dropped) and
twelve functions.

## Server

All three routes run on Node, verify the session with `serverUserId()`,
answer 401 without one, and log status codes and short reasons only, never the
learner's text. OpenRouter is still reached only from `tutorServer.ts`, which
gains `embed`. Answers are signed with `TUTOR_SIGNING_SECRET`, server-only and
Sensitive in Vercel, not with a key derived from `OPENROUTER_API_KEY`; the
routes refuse to run without both.

**Time.** Vercel stops a function at 60 seconds, and no catch block runs then,
which would lose an answer already paid for. So the question and merge routes
keep to 55: reads, rule titles and the memory search run at once; an embedding
call has 5 seconds; the model has what is left less 6 seconds to save; and the
answer is embedded only if at least 3 seconds remain, otherwise it is saved
without a vector and still found by keyword.

### `POST /api/tutor`

Body `{ conversationId?, question, answerIn }`.

1. At once: the conversation (under RLS; not the account's, or gone, is 404),
   the account's state, the conversation's last 5 exchanges (the same ten
   messages as before), how many exchanges and conversations the account
   holds, the rule titles, and memory (embed the question, then
   `search_tutor` across all the account's conversations).
2. Refusals before the reservation, so none spends a message: no studied
   language, the allowance, and a full account (2,000 exchanges, or 500
   conversations when the question would start a new one).
3. Reserve the message, as today.
4. History: those 5 exchanges, kept only where the signature verifies.
   Nothing in the request is trusted as history any more.
5. Memory: the search's signed matches not already in the history, at most 5
   and 12,000 characters, oldest first, given to the model as earlier turns
   before the history. A failed embedding still leaves keyword matches; a
   failed search leaves none, not the answer.
6. Ask the model and read the reply as today (`buildRequest`, `readReply`,
   reference sites, rule titles), within the time left.
7. Save: a first question creates the conversation, named with the reply's
   title, while the answer is embedded; then insert the exchange and set the
   conversation's `updated_at`. A save that fails still returns the answer,
   with `saved: false`, as it was paid for.
8. Return `{ conversationId, exchange, remaining, saved }`; the exchange says
   whether it can be merged.

### `POST /api/tutor/merge`

Body `{ conversationId, exchangeIds, answerIn }`, 2 to 10 ids.

1. At once: the conversation, those exchanges (under RLS), the account's state
   and holdings, and the rule titles. 404 if the conversation is missing, 400
   if any id is not one of its exchanges or fewer than 2 have a signature that
   verifies.
2. Refusals as on a question (a full account is 2,000 exchanges), then the
   reservation: a merge spends one message.
3. Ask the model with `tutorInstructions` and its merge paragraph: combine
   these answers into one rule, saying each thing once, and use the search
   results only to check and correct what the answers say, never to add new
   topics. Written in the language the Answer in switch chose. Web search is
   on, with the same reference sites as a question; an unlisted language goes
   without and shows "Not checked against a reference". Same `REPLY_SCHEMA`
   and `readReply`.
4. Sources are the fresh citations and the ticked answers' sources, without
   repeats.
5. Return it as a draft, `{ reply, remaining }`, without saving it anywhere.
   The owner's decision (7 October 2026): a merged rule is kept only as a
   grammar rule, when the learner saves it; one that is not saved goes away.
   Kept in the conversation, as first built, it could be saved twice.

### `POST /api/tutor/search`

Body `{ query }`, 2 to 200 characters. Record the search in `tutor_searches`
and count the account's searches in the last hour; over 100 is 429. Then
embed the query (with Qwen3's one-line task in front, `asQuery`, as the model
expects for a search; saved answers are embedded as they are) and call
`search_tutor` with `match_count` 30; on an
embedding failure call it with a null embedding (keyword only). Group by
conversation, best first, each with its name and a snippet of about 80
characters around the best match. It does not spend the allowance.

### Browser, under RLS

`src/lib/tutorConversations.ts` renames and deletes conversations and records
`tutor_conversation_rules`. It is not built on `remoteStore`, which is for the
four item lists. A rename or delete that fails reloads the list and says so in
the sidebar ("Could not save to the database. The list has been reloaded."),
since the app's banner is wired to the item stores only.

## The page

`/tutor` is a new, empty conversation; `/tutor?c=<id>` opens one, so a reload
or a bookmark stays on it, and `#e-<id>` scrolls to an exchange. The server
loads, all at once, the sidebar list, the account's holdings, the open
conversation's latest 500 exchanges, and its saved rule ids, and works out
which answers can be merged (signature verified). An id that is not found
opens an empty conversation with "That conversation was not found." A new
conversation gets its address after its first saved answer, with `&in=` to
keep the Answer in choice.

### Sidebar (left, about 16rem, sticky under the top bar, scrolling on its own)

1. A search box labelled "Search conversations".
2. The conversations, newest activity first, one line per name, cut with an
   ellipsis (full name on hover), the open one highlighted. Each line has a
   ⋯ menu with **Rename** (edited in place; Enter or leaving the box saves,
   Escape cancels) and **Delete** (confirmed in a dialog). With none saved:
   "No conversations yet."

There is no New conversation button (the owner's decision, 7 October 2026): a
conversation is started from the question box under Tutor, on `/tutor`, which
the Tutor tab opens.

While the search box has text, results replace the list: each conversation's
name and, under it in small text, one line of the matching snippet. Choosing
one opens it at the matching exchange. Clearing the box brings the list back.
A failed search shows "Search is not available right now."; over the hourly
limit, "Too many searches in the last hour. Try again later." A search with no
matches shows "No conversations match." in plain text.

On phones the sidebar is a **Conversations** button at the top of the page,
opening it as a panel over the page; choosing a conversation closes it, and so does Escape. Opening it puts the
cursor in the search box.

### Main area, top to bottom

1. **Answer in**, as today.
2. The conversation: each question, and each answer rendered as rule blocks
   with its sources (or "Not checked against a reference"), **Save as rule**,
   and, on an answer that can be merged, a tick box, "Include in a rule". A
   merged rule shows the same way at the end, headed "Rule from N answers",
   with **Save as rule** and **Discard**. It is a draft held by the page
   only: saving it makes it a grammar rule and removes it, **Discard** removes
   it, and leaving or reloading the page drops it.
3. With two or more ticked, a bar above the question box: **Make one rule
   from N answers** and **Clear**. While the tutor works, "Thinking…" with the
   hourglass, as today.
4. The question box with **Ask** and the allowance line, as today.

After a saved answer the page refreshes the server's copy (the sidebar's
order); after an unsaved one it does not, as that would replace the chat with
a copy that lacks the answer.

When the trial or the day's limit is used up, the question box and the merge
bar are replaced as today. A full account replaces them with "You have reached
the most conversations and answers an account can keep. Delete a conversation
to ask more." The sidebar, search, reading and **Save as rule** keep working,
as none of them costs a message.

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
`readChatReply`; `readHistory`, `verifiedTurns` and the browser-sent history;
the Tutor tab's two-item menu, which becomes one Tutor tab;
`e2e/conversations/`; the Conversations sections of the README.

## Failures

| Failure | What happens |
| --- | --- |
| Model call fails or runs out of time | "The tutor could not answer. Try again." beside the question, as today; the message is spent, as today |
| Embedding fails on a question | Answered with keyword memory only; saved with no embedding, still found by keyword |
| Too little time left after the model | Answer saved without an embedding, still found by keyword |
| Saving the exchange fails | Answer shown, with "This answer was not saved." |
| Merge fails | As a failed question; the ticked answers stay ticked |
| Account full | The question box is replaced; no message is spent; the database refuses a direct insert too |
| Search embedding fails | Keyword-only results, nothing shown |
| Over 100 searches in the hour | "Too many searches in the last hour. Try again later." |
| Search fails | "Search is not available right now."; the list stays |
| Rename, delete or a link record fails | List reloaded, message in the sidebar |
| Unknown or other account's conversation | Empty conversation, "That conversation was not found." |

## Weak points

- The free plan's 500 MB holds very roughly 50,000 to 60,000 exchanges across
  every account. Watch Dashboard, Usage, and move to Pro before about 350 MB.
- The embedding model is fixed by the column. Changing it, even to one of the
  same size, needs a migration that sets every embedding to null, since two
  models' vectors cannot be compared; those exchanges are then found by
  keyword only, as nothing can embed them again (no update grant, no
  privileged key).
- Changing `TUTOR_SIGNING_SECRET` leaves older answers unverified: still shown
  and searchable, no longer history, memory or mergeable. Replacing
  `OPENROUTER_API_KEY` does not.
- The closeness cut-off (0.5) is one fixed number; it is tuned at release and
  changed by replacing `search_tutor`.
- No vector index: fine at 2,000 exchanges per account; add HNSW with
  iterative scans if `EXPLAIN` shows the scan slowing.
- The limits can be passed by one or two when inserts race.

## Verification

- Unit tests: the merge instructions and request (search on, the check only
  sentence, the answer language); merging sources without repeats; memory
  selection (signed only, none already in the history, at most 5 and 12,000
  characters); each route's 401, 404 for another account's conversation, 400
  for bad bodies and merges outside 2 to 10, 403 `storageFull` at the limits
  before any reservation, 429 over the search limit; the answer saved without
  an embedding when time is short; naming from the first reply; search
  falling back to keyword only; `embed` reading OpenRouter's response and
  rejecting a wrong dimension; tick boxes only on mergeable answers.
- Database rehearsal, a rolled-back script in
  `supabase/tests/tutor_conversations.sql` on the local copy: each account
  sees only its own conversations, exchanges, links and searches; exchanges
  cannot be updated or deleted directly, nor the search log cleared; a reply
  over 64 KB is refused; another account cannot write into, link to or rename
  a conversation; deleting a conversation removes its exchanges and links;
  deleting a rule removes its links; the 2,001st exchange and 501st
  conversation are refused; `search_tutor` returns only the caller's rows,
  keyword-only with a null embedding, and nothing for punctuation, unknown
  words or a far-off meaning; the clean-up job is scheduled.
- `explain (analyze, buffers)` on `search_tutor` with 2,000 exchanges locally.
- One real call on localhost with the owner's key (a few cents): embeddings,
  memory, a merge, and tuning the closeness cut-off.
- End-to-end tests on localhost, with signed conversations put straight into
  the local database rather than asked for: the sidebar loads; a conversation
  opens from its URL; rename and delete; answers render with sources; ticking
  two shows the merge bar; **Save as rule** saves, and a second rule saved
  after reopening links to the first; **Link another rule** finds a rule made
  elsewhere; search finds a conversation by keyword. Asking a question and
  making a merged rule are left to the unit tests and the real call, as each
  run would cost money.
- `npx tsc --noEmit`, `npx eslint src/ e2e/`, `npx vitest run`,
  `npm run build` (`/tutor` and the three routes dynamic).
- README, CLAUDE.md, `Docs/schema.md`, `Docs/tutor.md` and `.env.example`
  updated in the same branch.

## Release order

1. `TUTOR_SIGNING_SECRET` set in `.env.local` and in Vercel (Sensitive), by
   the owner, before the code reaches `main`.
2. The first migration pushed to the live project with `npx supabase db push`,
   with the owner's yes at the time.
3. The code merged to `main`, which deploys it.
4. The second migration, dropping `conversation_messages`, pushed once the
   deploy is live. From then on, a Vercel rollback to a deployment from
   before this release would fail on the missing table; roll forward instead.
