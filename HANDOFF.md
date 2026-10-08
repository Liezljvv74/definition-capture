# Handoff: the grammar feature, after stage 1

Written 26 September 2026 at the end of the session that built and released
stage 1 of the grammar feature, for the model that continues the build.
Delete this file once stage 2 has started, as its predecessor was deleted
when stage 1 started; the design in `Docs/grammar.md` is the document that
lasts.

## Where things stand

- **Multi user test (7 October 2026): 626 of 626 checks passed, report `Reports/Multi user test.pdf`.** Three accounts on the local Supabase copy (live sign-up has a captcha; no test data put in production), each with a row in all 16 tables, attacking the other two: 562 database checks with their own tokens and the publishable key (read, insert, change, delete, cross-account links, every function, own-rights escalation, signed-out) plus 64 app checks in a real browser (pages by id, tutor routes, lists). Refusals counted only for access reasons; every account's data fingerprinted unchanged. Sanity: RLS switched off on `tags` locally gave 18 failures, then restored. Live and local access rules, grants and function settings fingerprinted identical (388 entries, `749a5ce3…`). Test accounts deleted, local stack stopped. Scripts and how to rerun them: `supabase/tests/multiuser/` (README there).
- **Settled (7 October 2026):** the owner confirmed the live tutor answers after the signing-secret fix, and found no other dead links. **Saved for later, at the owner's word:** dashboard checks (Vercel Sensitive toggles, Deployment Protection mode, no stray `TUTOR_SIGNING_SECRET` elsewhere; Supabase Auth captcha, email confirmation, rate limits); whether to commit HANDOFF.md; polish (phone sidebar focus trap, ⋯ menus closing on outside click, README table-count wording); accepted security lows (no Origin check on tutor routes, proxy matcher anchor, CSP unsafe-inline, braces 3.0.3 awaiting a patched release).
- **Merged and deployed (7 October 2026): PR #51, main at `a06e793`, branch `unlink-on-delete` deleted.** Vercel production deployment complete; Permissions-Policy confirmed served. Security report committed as `Reports/2026-10-07-security-scan.pdf`. (two commits: unlink-on-delete `34df911`, then the security-scan fixes). Security scan (Supabase, Next.js, Vercel scanners, npm audit, secret sweep): no critical or high app findings. Fixed: `server-only` on tutorServer/supabaseServer (Vitest aliases it to its empty module), Vitest 3 -> 5 with @types/node 22, `npm audit fix` (sharp, source-map-js), merge search titles from signed answer text, Permissions-Policy header, Preview copy of `TUTOR_SIGNING_SECRET` removed from Vercel (Production keeps it), and `20261007195955_drop_conversation_messages.sql` pushed live (table dropped; a Vercel rollback past PR #50 would now fail, roll forward). Left on purpose: braces 3.0.3 under eslint-config-next (lint-time only, no patched release), CSP unsafe-inline, no Origin check on route handlers (SameSite cookie), proxy matcher anchor. Owner to check in dashboards: Sensitive toggles in Vercel, Deployment Protection mode, Supabase Auth settings. Earlier on this branch: Owner found a deleted rule still linked from another. Deleting a rule, word, phrase or verb table now runs `rewriteLinks(kind, id, name, null)` after removing it: `[[Name]]` becomes its shown words, a "See also" line drops the name (and the line if empty), links stay if another item has the name. Delete warning now ends "Those links will be removed." 844 tests. Links left behind by deletes before this stay dotted until removed by hand (Remove link) or re-pointed.
- **Built, not released (7 October 2026): branch `tutor-conversations`, head after the draft change, not pushed.** Owner's first-look fixes in `30f4bc5`: no New conversation button (start from the box under Tutor); search queries carry Qwen3's task line (`asQuery`), measured to keep unrelated grammar answers outside the 0.5 cut-off; a rule's topic is cut to 60 characters in the shared `cleanNames` (the tags check had failed a merged rule's save, and the Grammar page had the same latent gap); rename saves on leaving the box. Then (owner's decision): a merged rule is a draft on the page only (Save as rule or Discard), never stored in the conversation; the merge route returns `{ reply, remaining }`. Then (`ecd2521`, owner's rule): an answer is saved as a rule once; `tutor_conversation_rules.exchange_id` (unique, migration edited in place since unpushed, applied to the local DB by hand) records the answer, the page shows Open instead of Save as rule. 834 unit tests, 4 tutor e2e pass locally. Embeddings switched to `qwen/qwen3-embedding-8b` at 1024 dimensions (`ad96c28`, owner's choice): the OpenRouter account's guardrails refuse `baai/bge-m3` (404). Checked locally: halfvec insert and rpc work, and meaning search finds related conversations and nothing for an unrelated query at the 0.5 cut-off. A local demo is running for the owner: `npm run dev` against the local stack via a temporary `.env.development.local` (delete it and stop the server afterwards), account demo@captured.local, two seeded conversations. Saved tutor conversations per `Docs/tutor-conversations.md` and plan `Docs/plans/2026-10-07-tutor-conversations.md`, built subagent-driven (11 tasks, each reviewed; final whole-branch review on Opus, its 7 findings fixed in `9798968`). 829 unit tests, tsc/eslint/build clean, 4 tutor e2e tests pass on localhost, local rehearsal `supabase/tests/tutor_conversations.sql` passes. Scale review report: `Reports/2026-10-07-tutor-conversations-plan-review.pdf` (uncommitted). Owner decisions: Conversations page removed (its chats deleted), RAG for search and memory across conversations, whole answers ticked, Save as rule kept per answer, merge spends one message and searches only to check, follows Answer in, links remembered per conversation, Link another rule over all rules, `TUTOR_SIGNING_SECRET` separate from the OpenRouter key, caps 2,000 exchanges / 500 conversations / 100 searches an hour (search log also capped at 3,000 rows). Local search timing at 2,000 answers: about 40 ms typical, 130 to 170 ms when every answer matches (accepted). **Owner live-data test findings fixed in `944796d`:** follow-ups searched only their own words (shop exercise books as sources) and merges searched the whole answers' text (a DWDS Kubikkilometer page); now `followUp` puts the topic in front, `mergeSearch` sends only the answers' topics, and `onReferenceSite` keeps only citations on the reference site or its www. "Idea 3:" labels came from "one idea at a time"; reworded and cleaned in `cleanText`. Answers saved before this keep their old text and sources. Then `ef8cc69` (owner's suggestion): at most three sources per answer or merged rule (`SOURCES_MAX`, also applied when showing older answers), and a merged rule lists only its own search's citations, none copied from the ticked answers. 839 unit tests. **Merged and deployed (7 October 2026): PR #50, main at `07464f2`, branch `tutor-conversations` deleted.** Vercel reported the production deployment complete; smoke check: `/` 200, `/tutor` redirects signed-out visitors to `/`, `/conversations` redirects to `/tutor`, `POST /api/tutor/search` answers 401 signed out. Local Supabase stack stopped (data kept). First live question failed: `TUTOR_SIGNING_SECRET` was not in the project's Vercel variables (logs: "OPENROUTER_API_KEY or TUTOR_SIGNING_SECRET is not configured", refused before any message was spent). Added via `vercel env add ... --sensitive` for Production and Preview, piped from `.env.local` (never displayed), and production redeployed. If a stray copy was saved elsewhere in Vercel (another project or Shared Environment Variables), the owner deletes it. Remaining: the owner tries it live, then (with the owner's yes) the migration that drops `conversation_messages` and deletes `supabase/tests/conversation_messages.sql`; after it, roll forward only. Final checks on the branch head: tsc, eslint, 840 unit tests, build (tutor routes dynamic), 8/8 Playwright on localhost against the local copy. Reports committed (`39086f6`). The owner's two live test conversations were deleted from the live database at their request (the live tutor tables are empty). **Release progress:** `TUTOR_SIGNING_SECRET` saved in Vercel by the owner (same value as `.env.local`, copied via clipboard, never printed). Migration `20261007122134_tutor_conversations.sql` pushed live on 7 October 2026 with the owner's yes (old `conversation_messages` rows deleted). Remaining: the real test against live, PR and merge, then the drop migration. **Original release list:** (1) owner sets `TUTOR_SIGNING_SECRET` in Vercel as Sensitive (Production and Preview) before the code reaches main; `.env.local` already has a local one; (2) check `npx supabase migration list` and that `vector` is not in `public` live, then `npx supabase db push` of `20261007122134_tutor_conversations.sql` with the owner's yes (it deletes every account's old Conversations chat); (3) one real call on localhost against the live project (a few cents): ask, follow up, merge, search, confirm `embedding` is filled (the halfvec insert path is only proven by this), tune the 0.5 closeness cut-off; (4) push the branch, PR, merge on the owner's word; (5) after the deploy is live, a migration dropping `conversation_messages` and deleting `supabase/tests/conversation_messages.sql`; after that a Vercel rollback past this release fails, roll forward instead. Deferred minors worth a later look: tutor_searches cap reachable by 30 hours of maximum searching; README count wording; phone panel has no focus trap.
- **Merged (5 October 2026): PR #49, branch `sign-out-from-gear` (deleted), main at `b107496`, deployed.** Sign out is the last item in the gear menu (AccountMenu.tsx), below a dashed rule; Settings keeps its own button. Owner's decision, replacing the earlier "sign out only in Settings" one.
- **Merged (5 October 2026): PR #48, branch `sticky-new-conversation` (deleted), main at `9866215`, deployed.** Conversations' title and New conversation share a bar that sticks under the nav (`STICKY_FILTERS`). Checked in a browser at desktop and phone widths. Local note: the first `npx supabase start` after a stop can return before the database container is up; wait and check `docker ps` before seeding or running e2e.
- **Merged (5 October 2026): PR #47, branch `grammar-scope` (deleted), main at `331785c`, deployed.** Owner's rule: the tutor and Conversations only discuss the grammar of the studied language (`scopeRule` in tutor.ts, shared); Conversations needs a studied language. Earlier replies are signed by the server (`signTurn`/`verifiedTurns` in tutorServer.ts, HMAC keyed from `OPENROUTER_API_KEY`) and only verified ones reach the model: the tutor returns a signature per answer, Conversations stores it in the new `conversation_messages.signature` column (migration `20261005133733_conversation_message_signature.sql`, pushed live first). Rotating the OpenRouter key drops older replies from context. Re-count retried once in `reserveMessage`. New Playwright tests in `e2e/conversations/` (need the local E2E account marked paid in the local DB); Settings helpers in `e2e/language.ts`. Came out of an ai-architect review whose three low points are all fixed. 752 unit tests, 7 e2e tests.
- **Merged (5 October 2026): PR #46, branch `remove-link` (deleted), main at `01fc8dc`, deployed.** Remove link in a rule's reading view: on a selection touching a link (`removeLinks` in selectionEdits.ts, bold kept) and on right-click of a link (`data-link` on link elements; ReadingTools selects its words and suppresses the browser menu). Not yet tried in a browser. 740 tests.
- **Merged (5 October 2026): PR #45, branch `tutor-saved-rules` (deleted), deployed from `9e30e41`.** The tutor is told the account's rule titles (`loadRuleTitles`, newest 300): a question a saved rule covers gets `existing_rule`, a link to it and a question back instead of an answer; every answer names up to 3 `related_rules`, offered unticked in the save dialog and added to See also when ticked. Names are kept only if saved. Vercel missed the production build for the merge commit `01698e9` (it built the branch preview only); an empty commit `9e30e41` on main triggered it. If a merge does not deploy within a few minutes, check `npx vercel ls definition-capture`. 735 tests.
- **Merged (5 October 2026): PR #44, branch `bold-links` (deleted), main at `4c6a575`, deployed.** Bold words (bold table headers included) can be linked and made into rules: `**[[Name|words]]**` parses as a bold link (`bold: true` on the link token) and renders in `<strong>`; `linkRange` takes a selection inside one bold run as the whole run. Italic is still refused (owner not asked). Not yet tried in a browser. 729 tests.
- **Merged (5 October 2026): PR #43, branch `sources-at-the-end` (deleted), main at `4c514d3`, deployed.** Owner's rule: sources are never named in a tutor explanation, only listed at the end. Root cause was the web plugin's default search prompt (asks for a Markdown link per citation); `buildRequest` now passes its own `search_prompt`. Backed by the instructions and by `SOURCE_NOTE`/`SITE_BRACKET` in `cleanText`. 725 tests.
- **Merged (5 October 2026): PR #42, branch `claude-sonnet-model` (deleted), main at `73fad75`, deployed.** `DEFAULT_TUTOR_MODEL` is now `anthropic/claude-sonnet-5.5` (owner's choice; `OPENROUTER_MODEL` is unset locally and in Vercel). Measured with real calls: about $0.03 per tutor question, $0.003 to $0.005 per chat message, roughly 3 to 8 times gpt-5-mini. The OpenRouter account's data policy refuses Gemini 3.x Flash and Flash-Lite (404, "0 endpoints"); `google/gemini-2.5-flash` and `anthropic/claude-haiku-4.5` both passed the same checks if a cheaper model is wanted.
- **Merged (5 October 2026): PR #41, branch `hourglass` (deleted), main at `cffa3af`, deployed.** A turning hourglass (`.hourglass` in `notebook.css`) after "Thinking…" in the tutor and Conversations; reduced motion keeps it still.
- **Merged (5 October 2026): PR #40, branch `Conversations` (deleted), main at `b031d3d`, deployed.** The Tutor tab is a menu of Grammar tutor (`/tutor`) and Conversations (`/conversations`): a plain chat via `POST /api/conversation`, sent the last ten turns, replying in the native language from Settings, spending the tutor's allowance (`src/lib/reserveMessage.ts`, shared by both routes). `OPENROUTER_API_KEY` is now read only in `tutorServer.ts`; `OPENROUTER_MODEL` switches both. Saved in the new `conversation_messages` table (migration `20261005074442_conversation_messages.sql`, pushed live first with the owner's yes): one conversation per account, New conversation deletes it (owner not yet asked whether past conversations should be kept and listed). Rehearsed in `supabase/tests/conversation_messages.sql`. 723 tests.
- **Merged (4 October 2026): PR #39, branch `housekeeping` (deleted), main at `9884a6b`, deployed.** `8d96d75`: next and eslint-config-next 16.3.4 -> 16.3.8 (critical RCE advisory in next/og ImageResponse, which opengraph-image.tsx uses), brace-expansion via npm audit fix, Supabase CLI 2.119.0. Left on purpose: `braces` under eslint-config-next (no patched release; lint-time only) and vitest's mocker advisory (fixed only in vitest 4.1.11+/5, which the vitest.config.ts note defers). Second commit: rules.ts cleanNames helper, Grammar page callbacks hoisted, two weak scoped-export tests removed, CSP comment corrected, local config.toml lists /auth/reset, last em dashes outside src/ removed. 711 tests, build passes.
- **Merged (4 October 2026): PR #38, branch `no-em-dashes` (deleted), main at `03d2f8e`, deployed.** `452121d` + `ddf7e90`: em dashes removed from comments and test names in 62 files under `src/`; six deliberate ones remain (parseWord separator and its test data, the tutor cleaner and its test input, two tests asserting none appear). Applied migrations untouched. 713 tests. If tsc reports `LayoutProps` missing, run `npx next typegen` (the route types live in `.next`).
- **4 October 2026:** PR #36 (new README screenshot) and PR #37 (`secure_password_change = true` in local `supabase/config.toml`) merged, main at `f0cbe3c`. The owner turned on the hosted **Secure password change** switch on 4 October 2026 (not done by Claude: `supabase config push` would also overwrite the hosted auth settings with the weaker local ones). Any new password path must start a fresh session (re-sign-in or a reset link) before `updateUser`, or build the emailed-nonce step.
- **Merged (3 October 2026): PR #35, code review fixes for verb practice, main at `59fe371`, deployed.** Failed saves are kept per verb and retried against it, Practise is gated on a failed load, plurals fixed, repeated tenses asked from their filled column, leftovers removed. Verbs start fresh in verb practice (owner's choice; flashcard verb progress is not carried across). 713 tests.
- **Merged (3 October 2026): PR #34, branch `landing-first` (deleted), main at `1f3e37f`, deployed.** `ffd2091`: signed-out visitors go to `/` instead of `/sign-in` (proxy and workspace layout), the tutor's 401 goes to `/`, and Sign out in Settings lands on `/`. 711 tests. No migration.
- **Merged (3 October 2026): PR #33, verb practice, main at `94a5708`, deployed.** Migration `20261003184103_verb_practice.sql` pushed live first with the owner's yes. Spec `Docs/verb-practice.md`.
- **Merged (3 October 2026): PR #32, branch `mobile-fixes` (deleted), main at `7b36a8f`, deployed.** Rule text smaller on phones (`c0b4b07`), the rule list written on the lines (`e9236cd`), the phone word list one line per word with the meaning beside it (`c8097e8`; Ref and collections now only on the word page and desktop table), and each setting as a slim dropdown line (`b66453e`); then made phone-only at the owner's request: wider screens keep the original rule cards and setting cards (`max-sm:` for the phone styles). 683 tests.
- **Merged (3 October 2026): PR #30, read aloud (branch `Voice`, deleted), main at `6544f8d`, deployed.** Migration `20261003101311_user_settings_speech_rate.sql` was pushed to the live project first, with the owner's yes. Spec `Docs/voice.md`, plan `Docs/plans/2026-10-03-voice.md`. Rule language is guessed per part (alphabet, then common words) with the whole rule as fallback; the player watches `speechSynthesis.speaking` because Chrome's online voices misreport ends. Also in this PR: the large brand on sign-in and sign-up. README brought up to date and the landing privacy heading reworded in PR #31, merged, main at `890860c`, deployed.
- **Merged (3 October 2026): PR #29, branch `ui-improvement` (deleted), main at `ebedc99`, deployed by Vercel.** It renames the app to "Captured" (SITE_NAME, README, CLAUDE.md, llms.txt, backup filename prefix `captured-`; the repo, Vercel project, domain, backup `format` tag and IndexedDB name keep the old name) and restyles every page as lined notebook paper after `design/captured-notebook-mockup.html`: tokens and utilities in `src/app/notebook.css` (swapping for a "dark notebook" under prefers-color-scheme), pieces in `src/components/notebook/` (paper, Scribble, doodles, idle margin doodles off on /grammar and /rule, the landing page's Try one now card). Grammar pages are deliberately calm: no tilt, tape or doodles. Visual only: no routes, data, auth or copy changed beyond the rename. A final whole-branch review was done and its fixes are in `18bc186`; the README describes the look as of `dc38aef` (its landing screenshot in `assets/` still shows the old design). Owner feedback round 1 is `757a4a3`: section colours per tab (`section-*` utilities, set in MainNav and on page titles), the word list written on the ruling (one 32px line per row, `RuledLines` snaps `[data-ruled-snap]` and keeps the sticky bar's `ruled` lines continuous), and a tighter dashboard; `progress beside the welcome` follows it, with stars instead of tape on the progress block; Phrases got the same ruled list. Then (85bb560, b2e6231, 4cae879): word and phrase pages fit one screen (text left, facts as pairs right, Edit by the title); the body hand takes its 7 from a Kalam subset in `src/fonts/` (variable `--hand-digits`, not `--font-*`, which Tailwind strips inside theme values); the pre-existing Settings hydration error is fixed. Phrases list is 90rem wide with Phrase at 26%. Tutor (b71b692): saving several answers from one conversation now works (free numbered title on a clash) and each later rule links to the earlier ones with a See also line. 649 tests, tsc and eslint pass. No migration was involved.
- `main` is at `4bc3fb0` (merge of PR #28, Link to finds rules by their text, 3 October, deployed), after PR #27 (tutor answers stay in the chosen language; braces, links and em dashes cleaned from answers), after PR #26 (the paid grammar tutor), after PR #25 (landing copy: "Your personal repository for learning any language"), after PR #24 (the landing page screenshot in the README), after PR #23 (the README brought up to date with the app), after PR #22 (the landing page fits one screen; its questions are `<details>` dropdowns), after PR #21 (Cloudflare Turnstile captcha), after PR #20 (the public landing page and the dashboard at /home), after PR #19 (the tracked Supabase skill brought up to date), after PR #18 (the first Playwright end-to-end test), after PR #17 (wrapping cells in the table editor), after PR #16 (wider rule card with tables inside it), after PR #15 (drag to select in the table editor), after PR #14 (table selection and clipboard), after PR #13 (grammar stage 3, reading tools), after PR #12 (Grammar colours) and PR #11
  ("grammar-stage-2", links),
  PR #10 ("grammar-fixes") and PR #9 ("grammar-stage-1"), clean, pushed to
  `origin`, and deployed: Vercel builds every push to `main`, and the
  production site is https://definition-capture.vercel.app. All feature
  branches are deleted locally and on GitHub.
- The one live Supabase project has every migration applied, up to and
  including `20261005074442_conversation_messages.sql`. Applied migrations are never
  edited; a change is a new migration made with
  `npx supabase migration new <name>` and pushed with `npx supabase db push`
  **before** the code that needs it reaches `main`.
- The local Supabase copy (Docker, `npx supabase start`, project id
  `Captured` in `supabase/config.toml`) is stopped. Starting it
  applies every migration to an empty database. Stage 1 was rehearsed there
  with a copy of the live data and browser checks in Playwright; the temporary
  `.env.development.local` that pointed the dev server at it was deleted
  afterwards. If you recreate it, restart `npm run dev`: the Content Security
  Policy's `connect-src` is built from the environment when the server starts.
- `C:\Users\Liezl\Documents\db-backups\2026-09-25-rollout` (outside the
  repository) holds the pre-refactor dump, including login data. The owner has
  said to keep it until they decide otherwise. Do not delete or move it.
- The two `.claude/skills` entries `supabase` and
  `supabase-postgres-best-practices` were reinstalled on 26 September with
  `npx skills add supabase/agent-skills -s '*' -a claude-code -y` as plain
  copies (no longer junctions); `.claude/skills/` is git-ignored. The tracked
  copy in `.agents/skills/supabase` and `skills-lock.json` were brought up to
  that newer version in PR #19 (merged 2 October).
- All checks pass at `fb18bf4` (462 tests): `npx tsc --noEmit`, `npx eslint src/`,
  `npx vitest run`, `npm run build`.
- PR #18 (merged 2 October, branch deleted, deployed) added the first
  Playwright end-to-end test: `e2e/`, `playwright.config.ts`
  and `npm run e2e`. It signs in to a dedicated test account (`E2E_EMAIL` and
  `E2E_PASSWORD` in `.env.local`), adds, finds and deletes a word, and passes
  against production; 520 Vitest tests, tsc and eslint pass with it. **The
  owner's rule: ask before every e2e run against production**, and offer
  localhost (`E2E_BASE_URL=http://localhost:3000`) instead. The test account
  still holds a stray word `e2e-1790604408062` from a run before this branch.
- **PR #20 (merged 2 October, branch deleted, deployed and checked live)** replaced the home page with a public landing page at `/` and a
  signed-in dashboard at `/home`. Design `Docs/homepage.md`, plan
  `Docs/plans/2026-10-02-homepage.md`. Built task by task with a review per
  task and a final whole-branch review; 560 Vitest tests, tsc and eslint pass;
  the local e2e run (4 tests, on the local Supabase copy) passed. **Both its
  migrations are already live** (owner approved each push):
  `20261002115126_home_summary.sql` (`home_summary()`, a defaulted `only_due`
  on `build_deck`) and `20261002132234_home_summary_difficult_words.sql` (the
  remember card draws only hard words or phrases of five or more letters), so
  the live app is unaffected until the code merges. Owner decisions recorded
  in the design: no price or "free" anywhere (undecided); "Picks up to 50
  cards" and the "counts as learned" line struck as demo speak; Your progress
  sits under the greeting; the remember card's word is itself the toggle and
  is always a hard item; a rotating quote shows when nothing is due, in a
  fixed-height box; the phone menu closes on outside taps and back; the
  dashboard is sized to fit one laptop screen.
- **Captcha (PR #21, merged and deployed 2 October):** Cloudflare Turnstile
  through Supabase Auth on sign-in, magic link, password reset (sign-in page
  and Settings), sign-up and the Settings current-password check, all through
  `src/lib/session.ts`; `src/components/Turnstile.tsx`, no new dependency.
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set in Vercel Production (type Config)
  and in `.env.local`; the widget lists definition-capture.vercel.app and
  localhost. The owner confirmed the live widget passes them silently and
  sign-in works. The secret key lives only in the Supabase dashboard: the
  owner switched captcha on there (Authentication, Attack Protection) on
  2 October and confirmed sign-in still works; turning it off restores
  sign-in instantly if anything ever breaks. Signed-in e2e tests now run on localhost only, against the
  local Supabase copy with the site key empty (procedure in CLAUDE.md).
  The Vercel CLI is linked to this folder (`.vercel/`, git-ignored).
- **PR #26 (merged and deployed 3 October):** the
  paid grammar tutor (`Docs/tutor.md`, plan `Docs/plans/2026-10-02-tutor.md`).
  `/tutor` and `POST /api/tutor` call OpenRouter server-side (built-in fetch,
  default model `openai/gpt-5-mini`, override with `OPENROUTER_MODEL`), answers
  in rule blocks, Exa search limited to per-language reference domains, Save
  as rule; `account_plans` (read-only to users; mark paid in the dashboard)
  and `tutor_usage` (insert user_id and select only); free 5 messages total,
  paid 30 per UTC day, reserved before the call so failed answers count (the
  owner's decision); Native language and Level settings (backup v13).
  Reviewed per task and as a whole branch; 638 tests, build and local e2e pass.
  Live: the key is a Secret in Vercel, both tutor migrations are applied, the
  owner's account is marked paid, and searches use OpenRouter's `web` plugin
  (the `openrouter:web_search` tool broke the reply format).
- **README (PR #23):** rewritten against the code and fact-checked; the
  owner's standing rule is to update README.md in the same change as anything
  user-visible, setup, env, schema or test-related. It shows the landing page
  (`assets/landing-page.png`, the owner's screenshot). The retired
  `AppScreenshot.JPG` and `sprint2_project_reflections.md` were removed.

## Fixes after the owner tested stage 1 (PR #10, 26 September)

- **Topics are created only in Settings.** Adding or editing a rule picks the
  topic from a select of the Settings list (`src/components/grammar/TopicSelect.tsx`);
  with no topics it links to `/settings?section=grammar`. Never offer a field
  that creates a topic by typing.
- **Tables stay inside the card** (changed 29 September, merged as PR #16): the rule page is `max-w-6xl` like the Grammar list, a table is `w-full` inside `tableScrollClass` (`overflow-x-auto`) in `BlockView.tsx`, and wraps long cells; the old break-out showed the card edge through the rows. Edit mode cells now wrap too (merged as PR #17): `MarkedField`'s `wrap` makes a `rows=1` textarea marked `data-single-line` that grows to its text by measurement (so Firefox works without `field-sizing`), turns line breaks into spaces and has spell-check off; `enterMovesDown.ts` treats such a textarea as an input, so Enter still moves down; `TableEditor` is `table-fixed w-full` with a narrow first column for the bars.
- **Keyboard rule, app-wide.** Tab keeps the browser's order (across, then the
  next line). Enter in a field moves to the field below, by position on
  screen, the cell underneath in a table; with nothing below it submits the
  form. Textareas keep Enter for new lines, and a field's own Enter handler
  wins by calling `preventDefault`. One place: `src/lib/enterMovesDown.ts`,
  mounted by `src/components/EnterMovesDown.tsx` in the root layout. New
  forms get it for free; do not add per-component Enter handlers that
  duplicate it. The owner wrote Tab goes "to the left" but described reading
  order; it was built left to right, so confirm if it comes up again.
- Keep this file current: the owner asked for `HANDOFF.md` to be brought up
  to date after every committed change.
- **Ponytail everywhere.** The owner turned on the `ponytail:ponytail` skill
  (full level) and asked that every agent used from now on works under it
  too: each subagent dispatch prompt must tell the agent to invoke that skill
  first and follow it, and reviewers judge diffs by the same ladder.

## Read before touching anything

1. `CLAUDE.md`: the project's rules. Authentication and data rules are hard
   rules, not preferences.
2. `Docs/grammar.md`: the design of record for this feature. Every stage below
   is a section there. Its decisions stand; where it is silent, decide and
   record the ruling in the plan.
3. `Docs/schema.md`: the database as it is. Nine tables, no views, seven
   functions, none `security definer`, RLS on `(select auth.uid()) = user_id`.
4. `Docs/plans/2026-09-26-grammar-stage-1.md`: the plan stage 1 was built
   from. Use it as the model for the stage 2 plan: header, Global Constraints,
   Review Focus with each line pinned to a test, a file table, then tasks with
   exact code and test steps.
5. The pinned memories, which the harness loads on its own. In short: no em or
   en dashes anywhere (replies, code, comments, commits, docs); never push to
   the Turing College remotes `submission` (never) or `sprint2` (only when the
   owner asks, each time); the app ships empty, so no example rules, topics or
   words are ever committed or seeded; no interface copy that describes or
   sells a feature; do not touch the Sprint3 project; the static-export era is
   over, so nothing is designed around the absence of a server.

## How stage 1 was built, and how the owner wants work done

- **Process.** The owner chose subagent-driven development from a written
  plan: one fresh implementer per task, a task review after each, a
  whole-branch review at the end, then `superpowers:finishing-a-development-branch`.
  Work happened on a feature branch **in place** (the owner declined a
  worktree), was pushed to `origin` as a pull request, and merged with
  `gh pr merge <n> --merge --delete-branch` when the owner said "merge the PR".
  Each step (push, PR, merge) waited for the owner's word.
- **Plans live in `Docs/plans/`**, not the superpowers default location.
- **The migration went to live during Task 1**, with the owner's explicit
  permission, since it was additive. Ask again for the next one; permission
  for one push does not carry over.
- **Reviews caught real plan defects** (a wrong width calculation, an italic
  pattern that ate arithmetic, a missing store registration in
  `StoreErrorBanner`). Rule on such findings, record the ruling, and report
  every ruling to the owner in the finishing message. One implementer once
  edited an applied migration and reported reverting it when it had not;
  verify such claims with `git diff <base> HEAD -- supabase/migrations`.
- **The owner checks the result in the browser themselves** on production.
  They did not report problems from the stage 1 walkthrough at the time of
  writing, but ask whether they have done it before building on top of it.

## What stage 1 built (the ground the next stages stand on)

Database, migration `20260926072632_grammar_rules.sql`:

- `items.item_type` accepts `'grammar'`; new nullable columns `blocks jsonb`,
  `map_x real`, `map_y real`, with checks `items_grammar_fields`,
  `items_blocks_limit` (at most 200 blocks), `items_map_only_grammar`,
  `items_grammar_no_source`.
- `tags.context` accepts `'grammar'` beside `'collection'`;
  `item_tags_grammar_one` holds a rule to one topic at position 1.
- `save_items(jsonb)` reads the keys `topic`, `blocks`, `map_x`, `map_y` and
  raises `a rule needs a topic`. A key absent from the payload leaves that
  column alone, which is how a position can later be saved without touching
  the blocks. `set_updated_at` ignores `map_x` and `map_y` (and `updated_at`,
  `needs_review`, `source_id`, `has_answer`), so dragging on the map is not an
  edit.
- `has_answer` has no grammar branch on purpose: rules make no flashcards.

Code:

| File | What it is |
| --- | --- |
| `src/lib/types.ts` | `TextBlock`, `TableBlock` (`headerRow`, `headerColumn`, `cells: string[][]`), `ExampleBlock` (`sentence`, `translation`), `Block`, `Rule` (`id, title, topic, blocks, dateAdded, dateUpdated`), `RuleInput` |
| `src/lib/blocks.ts` | `readBlocks` off unknown JSON, constructors, `moveBlock`, table row and column edits, `flattenBlocks` for the Excel sheet; caps `MAX_BLOCKS` 200, `MAX_TABLE_ROWS` 30, `MAX_TABLE_COLUMNS` 12 |
| `src/lib/blockText.ts` | the markup parser: `parseInline` (bold, italic, `[[links]]`), `parseTextBlock` (lines, `- ` bullets), `splitGaps` (`{dem}` gaps in an example), `plainText` |
| `src/lib/rules.ts`, `useRules.ts` | the rule store from `createRemoteStore` (`itemType: "grammar"`): `getRules`, `findByTitle`, `createRule`, `updateRule`, `deleteRules`, `parseRule`, `parseRuleList`, `importRules`, `toWireRule` |
| `src/lib/remoteStore.ts` | `ItemType` includes `"grammar"`; `flattenRow` yields `source`, `collections`, `topic` from the embedded select |
| `src/lib/settings.ts`, `renames.ts` | `Settings.topics`; `saveNames` for the three name lists; `renameTopic` through `rename_tag('grammar', from, to)`, which merges when the new name exists |
| `src/lib/inUse.ts` | `countUses`, `inUseReason`: why a name's bin is switched off |
| `src/components/grammar/` | `RichText` (rendering with a `LinkIndex`), `BlockView`, `BlockEditor`, `RuleEditor`, `AddRuleDialog` |
| `src/app/(workspace)/grammar/page.tsx` | the list, filtered by topic and search |
| `src/app/(workspace)/rule/page.tsx` | one rule at `/rule?id=`; `&edit=1` opens editing |
| `src/components/Badges.tsx` | `TopicBadge`; `MainNav.tsx` has the Grammar tab; the home page has the fourth card in `--color-card-rose` |
| `src/lib/backup.ts`, `backupFile.ts`, `ImportDialog.tsx`, `ExportDialog.tsx` | rules in the JSON backup as `BACKUP_VERSION` 11, a Grammar sheet in the Excel export; older files still read |
| `src/components/StoreErrorBanner.tsx` | registers the rules store's error, like the other three |

Links today: a `[[Name]]` in a rule resolves through `buildLinkIndex(entries,
phrases)` from `src/components/RefText.tsx`, so it reaches words and phrases
only. The rule page says so in a comment marked for stage 2.

## Still to build

The design's build order, `Docs/grammar.md` "Build order", stages 2 to 5.
Each stage is usable on its own, and the owner asked for stages to be built
one at a time, each with its own plan and branch. Stage 2 is next; stages 3
and 4 both build on its links.

### Stage 2: Links (`Docs/grammar.md`, "Links") (BUILT, live since PR #11)

**Plan written, 26 September:** `Docs/plans/2026-09-26-grammar-stage-2.md`
(six tasks, no migration). Approved by the owner; being built
subagent-driven on branch `grammar-stage-2` (in place). Ledger:
`.superpowers/sdd/2026-09-26-grammar-stage-2/progress.md` (git-ignored); trust
it and `git log` for which tasks are done. Task 1 (verb table notes in the
store and backups) is committed as `efb91a1` and reviewed clean. Task 2 (the link
model, `src/lib/links.ts`, with precedence taken from `LINK_ORDER`) is
committed as `f8c54d9` and `cc40380` and reviewed clean. Task 3 (every page
links to all four kinds, verb table notes on screen, `/verbs?verb=` scrolls
to and rings the table) is committed as `376ce01` and reviewed clean. Task 4
(renaming a word, phrase or rule rewrites links to it, `src/lib/linkRenames.ts`)
is committed as `8e270d8` and reviewed clean. Task 5 (Linked from on
word, phrase, rule pages and the verb card; the delete warning on the
Grammar list) is committed as `8b9ae1e` and reviewed clean. Task 6 (docs) is
`38d69fb`. The final whole-branch review asked for three fixes, made in
`58b2ebe`: links between verb tables now open the target and respect the
unsaved-draft guard; restoring a backup without verb notes keeps existing
notes in Update mode (`BACKUP_VERSION` 12); the link index is cached across
cards. All checks pass (460 tests). The missing highlight ring after "Discard them" was fixed before merge
(`settle()` in the Verbs page keeps `highlightId` for the table the link
asked for). Parked as rare: a renamed
item that links to itself can race two saves; renaming onto a higher-precedence
name re-points links; the delete warning overstates when a lower-precedence
item shares the rule's name. After the owner tested it, `a word can link to the
verb table of the same name` was fixed on the branch: the Ref suggestions
left out every name matching the item being edited, which hid the verb table
"arbeiten" from the word "arbeiten"; now a name is left out only when the link
would reach the edited item itself (`selfKind` on `RefField`/`suggestRefs`).
**Stage 2 is merged (PR #11) and live.** Next is stage 3, reading tools. The ledger workspace was deleted after the review. The notes below are the background it was
written from; the plan is what to execute.

**Decided by the owner on 26 September, overriding the design where they
differ; amend `Docs/grammar.md` in the stage 2 plan to match:**

- **Linking to one verb table** opens the Verbs page scrolled to that table
  and highlights it (for example `/verbs?id=<id>`). No new page.
- **Shared names use a fixed order for now**, not a recorded choice: a plain
  `[[Name]]` resolves to a rule, else a verb table, else a word, else a phrase.
  The design's "link records which item was meant" is deferred until clashes
  actually happen. So no new link syntax in stage 2, and `parseRef.ts` and
  `blockText.ts` stay as they are.

What the design requires, with where it lands in the code:

- **Rules and verb tables become link targets.** `buildLinkIndex` in
  `RefText.tsx` builds a `Map<foldedName, href>` from phrases then words, later
  `set` winning. Extend it to rules (`/rule?id=`) and verb tables. Verb tables
  have no page of their own: `/verbs` is one list page with a search; a link
  needs a way to land on one table (a query parameter or anchor the page
  scrolls to). Every caller that builds the index (word, phrase, rule pages,
  and the lists) has to pass all four lists. `refSuggestions.ts` and
  `RefField.tsx` offer names while typing; `RefSuggestion.kind` is
  `"word" | "phrase"` and must gain rules and verb tables. `RichText.tsx`
  in `grammar/` uses the same `LinkIndex`, so it follows for free.
- **Verb tables get a notes field.** `VerbTable` in `types.ts` has no `ref`;
  the `items.ref` column exists for every type and `save_items` already
  writes it. Add `ref` to the type, to `fromRow`/`toPayload` in
  `verbTables.ts`, to the wire shape and `parseVerbTable` (absent in old
  backups means empty), to the verb page with a `RefField`, and to the Excel
  sheet.
- **Shared names.** Settled above: a fixed order, rule, verb table, word,
  phrase. In `buildLinkIndex` that means setting them lowest precedence
  first (phrases, words, verb tables, rules), since a later `set` wins.
- **Renames update links.** Renaming any item rewrites every `[[Old name]]`
  pointing at it, in `ref` text of words, phrases and verb tables and in the
  `blocks` of rules. Today an item's title changes through the ordinary edit
  forms and `save_items`. Two shapes are possible: a database function like
  `rename_tag` that rewrites `ref` and `blocks` in one transaction, or a
  client rewrite that sends the affected rows through `save_items`. The
  database route is atomic and matches the schema's habit; whichever is
  chosen, a rename rewrites only links that resolve to the renamed item
  under the fixed order; a link to a shared name that resolves elsewhere is
  left alone.
- **Deleting a rule that is linked to** warns first, with a count by type
  ("3 rules and 2 words link to Dative. Their links will stop working."), and
  then leaves those links dotted. All four lists are loaded in the browser,
  so the count can be computed from text without a query.
- **Linked from.** Rule, word, phrase and verb pages list the items that link
  to them, computed from text already written. One function that scans all
  four lists for `[[Name]]` tokens naming the item, shared by the count above
  and this list.

Entry points to read first: `src/components/RefText.tsx`,
`src/components/RefField.tsx`, `src/lib/refSuggestions.ts`,
`src/lib/parseRef.ts`, `src/lib/blockText.ts`, `src/lib/verbTables.ts`,
`src/app/(workspace)/verbs/page.tsx`, and `rename_tag` in
`supabase/migrations/20260925154728_refactor_build_new_schema.sql` as the
model for any new function (security invoker, `set search_path = ''`, grants
revoked from `anon` and PUBLIC, one owner check).

### Stage 3: Reading tools ("Reading and editing") (BUILT, merged as PR #13)

**Plan:** `Docs/plans/2026-09-28-grammar-stage-3.md`, approved by the owner on
28 September with two changes (purple as a fourth colour; a selection across
table cells covers the rectangle between its corners). Built subagent-driven
on branch `grammar-stage-3` (in place, from `main` at `fb18bf4`), committing
after each task as the owner asked; not pushed. Ledger:
`.superpowers/sdd/2026-09-28-grammar-stage-3/progress.md` (git-ignored); trust
it and `git log` for which tasks are done. Owner's rulings for this stage:
highlight colours yellow, green, blue, purple (no pink: red family is for
warnings); Edit mode tints highlights with faint visible markers; Link to…
writes `[[Name|words]]`; New rule from this asks for title and topic. Stage 2
was tested by the owner. The owner's Supabase is on the free plan, so the
dashboard password settings from the security audit cannot be changed.

- Task 1 (labelled links `[[Name|words]]` in every parser): `1220a0f`, reviewed clean.
- Task 2 (parser positions and highlights, `==y:…==` with y g b p; reading view renders them with `data-block`, `data-field`, `data-at`; `splitGaps` deleted, so stage 5 reads gaps as `gap` tokens from `parseInline(sentence, "sentence")`): `477e9df`, reviewed clean.
- Task 3 (`src/lib/selectionEdits.ts`, pure highlight, recolour, remove, link and whole-cell edits): `b3a3f95`, then `9dfcb4f` after review found an earlier unclosed `==g:` could capture a new marker; ruling: every highlight edit is verified by reparsing (words shown unchanged, new highlight exactly where asked). Reviewed clean.
- Task 4 (selection toolbar on the rule page: `readSelection.ts`, `SelectionToolbar.tsx`, `ReadingTools.tsx`; four colours and Remove highlight, whole cells for a selection across a table with an outline): `4a83a4e`, then `39fa8eb` for Chromium's triple click (the range ends at offset 0 of the next element, so the end steps back to the previous text) and to skip saving an unchanged recolour. Reviewed clean.
- Task 5 (Link to… `LinkToDialog.tsx`; New rule from this reuses `AddRuleDialog` with `initialTitle`, `initialTopic`, `onCreated`): `ea882af`, then `a17625c`: `titleProblem` in `rules.ts` refuses a new rule title holding `|`, `[` or `]` for every caller, and a link is written only if the selected words are still where they were. Reviewed clean.
- Task 6 (Edit mode: `MarkedField.tsx` draws a tinted copy behind each box with faint markers; the text block box now grows with its text, `field-sizing: content`, and resizes only vertically): `50e1c9b`, then `6d3cdfa` so box and copy stay the same size. Reviewed clean. Commit `50e1c9b` names its implementer's model in the attribution line.
- Task 7 (`Docs/grammar.md` records stage 3): `c16491b`. Browser check passed on the test account (see the ledger); the test rules and topic were deleted afterwards. The final whole-branch review asked for fixes, made in `0a2bce7` (a rule renamed in its editor can no longer take `|`, `[` or `]`, which would have broken every link to it; `LinkToDialog` filters all three; `shownWords` shared from `blockText.ts`; `COLOUR_BY_CODE` derived; `scrollbar-gutter: stable` on the text block box and its copy for Firefox, which has no `field-sizing`). Re-reviewed clean; 509 tests pass. **Stage 3 is merged (PR #13, `main` at `e55ef92`) and deployed; the branch is deleted.** Next is stage 4, the map. The owner decided on 28 September to leave stray highlight markers as they are (an unclosed `==g:` typed by hand makes the toolbar refuse a highlight on that line); an automatic tidy-up on Save was offered and declined for now. Parked as rare: a word, phrase or verb table already named with `|` is no longer reachable as `[[a|b]]`. Only Chromium was checked in the browser; Firefox, Safari and touch are unchecked. Ledger workspace deleted after the review.
- Browser checks: sign in as the test account from `.env.local` (`E2E_EMAIL`, `E2E_PASSWORD`), never the owner's. The Playwright MCP echoes any code it runs, including code loaded from a file, so a password passed through it lands in the transcript. A `next dev` on port 3000 may already be running (the owner's); use it rather than stopping it.

The notes below are the background the plan was written from.

- **Highlights** in yellow, green or pink on a text selection, plus Remove
  highlight, in text blocks, examples and table cells. Stored inside the text
  as markup, not as offsets, so editing around them cannot make them drift.
  The design does not fix the marker syntax; pick one that `parseInline` can
  tokenise and that `plainText` strips, and show it as highlighted text in
  Edit mode rather than as raw markers.
- **Link to…** searches every rule, word, phrase and verb table and turns the
  selection into a link (needs stage 2's four-type index).
- **New rule from this** creates an empty rule titled with the selection
  (`createRule` exists), links the selection to it, and keeps the reader on
  the page. Empty rules get a marker on the map in stage 4.

### After stage 3: table selection and clipboard in Edit mode (merged as PR #14, live)

Commit `ae7f226`, built as a bounded change the owner approved in chat on
28 September (no plan document). The table editor moved out of
`BlockEditor.tsx` into `src/components/grammar/TableEditor.tsx`: grey bar
handles above columns and beside rows (and a corner one for the whole table)
select them, Shift-click extends, Shift-click a cell selects the block from
the anchor cell. Ctrl or Cmd with C, X, V copy, cut and paste through the
browser's own clipboard events as tab-separated lines, the spreadsheet form;
cut empties cells; paste grows the table up to 30 by 12 and shows an amber
note if anything was left out; one value pasted into one cell with no
selection is left to the text box. The handles are out of the Tab order.
Grid logic is in `src/lib/blocks.ts` (`cellRange`, `cellsToText`,
`textToGrid`, `clearCells`, `pasteGrid`), tested; 519 tests pass. Checked in
Chromium on the test account. Known ceiling (marked `ponytail:`): a
spreadsheet cell holding a line break arrives as two rows. Merged as PR #14
(`main` at `62c727c`) on 29 September and deployed; the branch is deleted.
The owner first tried it on the live site before it was pushed, which is
why it seemed missing: the live site only has what is merged to `main`.

### Drag to select in the table editor (merged as PR #15, live)

Commit `bc95a5c`, 29 September. The owner found the bars alone did not
cover selecting part of a row or column, and approved in chat: press in a
cell and drag to another selects the block (a drag inside one cell still
selects text); dragging along the bars selects several rows or columns;
Copy, Cut and Paste buttons appear while cells are selected (through
`navigator.clipboard`, with a note to use the keys if the browser refuses);
a right-click inside the selection keeps it. All in `TableEditor.tsx`.
Checked in Chromium on the test account; 519 tests pass. Merged as PR #15
(`main` at `a23db7b`) and deployed; the branch is deleted. Note for testing: the owner checks on
the live site, which only has what is merged to `main`.

### Stage 4: Map ("Map")

- A **List | Map** toggle on the Grammar page; a narrow screen opens on List.
- Nodes are rules coloured by topic, with a line wherever one rule links to
  another. Selecting a rule shows the words, phrases and verb tables it links
  to around it; nothing else is drawn permanently.
- Positions are saved: placed automatically the first time near linked rules,
  then kept wherever dragged. The columns `map_x` and `map_y` exist,
  `save_items` accepts them, and `set_updated_at` ignores them. `Rule` and
  `toRulePayload` do not carry them yet; a position save should send only
  `id`, `map_x`, `map_y` so the blocks are left alone.
- Dragging and pinch-zoom everywhere; empty rules carry a marker. No drawing
  library is installed; decide whether SVG by hand is enough before adding
  one, and read the design's reasons for a saved layout.

### Stage 5: Practice ("Practice")

- Starts from a Practise grammar button on the Grammar page, on a rule's page
  (that rule only), and on the home page's "Own your progress" card, whose
  line becomes "Test yourself." with two buttons: Create flashcards and
  Practise grammar.
- A session is 10 questions from all rules, one topic, one rule, or needs
  review, mixing three kinds: a hidden non-header table cell labelled by its
  headers, one marked gap in an example (`splitGaps`), and "Which rule is
  this?" with four choices preferring the same topic.
- Checking ignores case and surrounding spaces; an accent or umlaut slip is
  **almost**, shown with the difference highlighted and not counted correct.
  `src/lib/judgeAnswer.ts` (`normaliseAnswer`, `similarity`, `judgeAnswer`)
  and `foldName.ts` already hold the flashcard versions of these ideas.
- Every answer goes through `record_review(target_item uuid, answer text,
  took_ms integer)`, which returns the `progress` row; wrong and almost both
  record `'again'`. The log names the rule, not the cell or example.
- Needs review: a wrong or almost answer sets `items.needs_review` (written
  directly, not through `save_items`, as the flashcards do); three correct in
  a row, `progress.streak` reaching three, clears it; it can be set or cleared
  by hand on the rule's page. `Rule` has no `needsReview` field yet;
  `fromRuleRow` would read `needs_review`, and the grammar list needs a
  "needs review" filter like Vocabulary's.
- Rules stay out of flashcard decks: no change to `has_answer`, `cardBack` or
  the deck dialog.

### Stage 6: Later

Freehand drawing as a block type. Not scheduled; a new shape in the `blocks`
array, not a schema change.

## Grammar colours (PR #12, merged and live)

The owner asked for Grammar to use lighter and darker green-greys instead of
rose, with red kept only for warnings and important notices. Header and home
card use `--color-card-sage: #bdc9bf` (was `--color-card-rose`); topic badges
use Tailwind's built-in `olive` scale. Keep red out of any new Grammar UI.

## Security audit, 26 September (after stage 2)

No Critical or High findings; RLS, functions, keys, session checks and link
rendering were verified sound. Open, not acted on (owner to decide):
- **Medium (addressed 4 October 2026: Secure password change is on):** a password change needs the old password only in the browser;
  `/choose-password` and `updateUser` accept any live session. Smallest fix:
  turn on "Secure password change" in the Supabase dashboard (Authentication,
  Providers, Email).
- **Low:** the CSP comment in `next.config.ts` overstates what `connect-src`
  protects; minimum password length is 6 (raise to 8 in the dashboard and
  `MIN_PASSWORD` in `src/lib/session.ts`); local `supabase/config.toml` is
  weaker than the hosted Auth settings; no size limits on item text columns.
- A second pass with the updated Supabase skill confirmed all of the above
  and added two Lows: `display_name` in `user_settings` and each rule block
  are also unbounded in size; and signing out other sessions after a password
  change stops them refreshing, but their current access tokens stay valid
  until they expire (JWT expiry, one hour). Local `config.toml` also lacks the
  `http://localhost:3000/auth/reset` redirect URL.

## Small items deferred from stage 1's reviews

None of these blocks anything; fold them into a stage when a task touches the
file, or leave them:

- A pre-existing em dash in a comment in `src/components/StoreErrorBanner.tsx`.
- (Done 4 October 2026: the rules.ts helper, the hoisted Grammar callbacks, the redundant scope tests.)
- `npm audit` reports findings in vitest's dependency tree; not acted on.
- Long-list virtualisation and leaner list requests were noted during the
  index review as optional improvements for a much larger dataset; the owner
  said to leave optional improvements for later discussion.
- Tutor, found 8 October 2026 by a scripted check against the real model: in a
  new conversation, a second question asked before the page has moved to the
  conversation's own address (about a second after the first answer) is
  answered and saved, but its answer does not appear until a reload. The
  `router.replace` remounts `TutorChat` under the conversation's key from the
  server's copy, which lacks the answer still in flight. Too fast for a person
  to hit easily; not fixed.
- Leaked-password protection is a switch in the Supabase dashboard
  (Authentication, Providers); it is the one advisor finding left, and only
  the owner can flip it.

## Retiring the old name (planned, 8 October 2026)

On 8 October 2026 the owner renamed the project folder from
`Sprint2_Project_Captured` to `Captured`. Every reference to the folder was
changed with it, including the local Supabase `project_id`, so the Docker
containers are now `supabase_*_Captured` and the local database starts empty:
recreate the E2E account through `/sign-up` before the next end-to-end run.
The old `supabase_*_Sprint2_Project_Captured` volumes can be deleted.
After the rename the whole app was checked on the new local stack: every
migration applied, all 8 end-to-end tests passed, every workspace page loaded
without errors, and the real tutor answered, merged two answers into a saved
rule, and found conversations by search. The local E2E account is now
`e2e@local.test`, marked paid in the local `account_plans`; its password was
throwaway, so reset it in local Studio (port 54323) before the next run.

The names below still say `definition-capture`. `CLAUDE.md` calls them
permanent, but the owner has said losing old backup files is acceptable, and
none of them is as fixed as that suggests. Not done yet; do them when the owner
asks, and update `CLAUDE.md` and `README.md` with them.

Safe, in code and one GitHub setting:

- **Backup `format`** (`BACKUP_FORMAT` in `src/lib/backup.ts`). `parseBackup`
  never reads the tag, so old files still import after a change. Only newly
  written files carry the new name.
- **IndexedDB name** (`DB_NAME` in `src/lib/exportFolder.ts`). Each browser
  forgets the chosen export folder once; the owner picks it again in Settings.
- **Folder picker `id`** (`definition-capture-exports`, same file). The picker
  opens at Documents once instead of the last folder.
- **GitHub repository.** GitHub redirects the old URL; run
  `git remote set-url origin <new url>`; Vercel's Git link follows the rename.
  Leave the `sprint2` and `submission` remotes alone.
- **Vercel project name.** Renaming it changes no domain and no deploy.

The live domain (`definition-capture.vercel.app`) is the one with risk, and
three of its steps are dashboard work only the owner can do. In this order:

1. Add the new domain in Vercel (`captured.vercel.app` is probably taken), and
   keep the old one, redirecting to the new, so bookmarks and sent emails work.
2. Supabase, Authentication, URL Configuration: add the new origin's
   `/auth/callback` and `/auth/reset` to Redirect URLs and make it the Site URL.
   Without this, reset and email sign-in links fail.
3. Cloudflare Turnstile: add the new hostname to the widget. Without this,
   nobody can sign in on the live site.
4. Then the code: `SITE_URL` in `src/lib/site.ts`, `public/llms.txt`, the
   `baseURL` in `playwright.config.ts`, and the domain throughout `CLAUDE.md`,
   `README.md` and this file.

## When more people use the app (thinking, 7 October 2026)

Nothing here is built or decided; it is a list for the owner to choose from
when the app grows past a handful of accounts. What protects each account's
data from the others already scales: row level security and the composite
keys do not care how many accounts exist, and the multi-user test
(`supabase/tests/multiuser/`) proved it on 7 October. What does not scale is
mostly money, storage, email and the way the app is run. Roughly in the order
it would bite:

1. **One Supabase project is both development and production.** Local
   development, `db push` and the owner's own experiments all touch the live
   data. With other people's notes in it, a bad migration or a test run is
   their loss. Recommended first step: a second free project (the free plan
   allows two) as staging, migrations pushed there first, and a backup
   (`supabase db dump`, as in `db-backups/`) before every live push. The free
   plan has no daily backups or point-in-time recovery; Pro has them.
2. **Sign-up emails.** Supabase's built-in email sender is for trying things
   out: it is rate-limited to a few emails an hour and, on current plans, only
   delivers to the project team's own addresses. Confirmation, magic-link and
   reset emails to strangers need custom SMTP (Authentication, Emails, SMTP
   Settings; Resend, Postmark and the like have free tiers). Check what the
   live project does today; it is on the saved-for-later dashboard list.
3. **The tutor's bill.** Each question is a paid OpenRouter call (model plus
   web search plus an embedding). Limits per account exist (5 free messages
   ever, 30 a day for paid, 100 searches an hour, `src/lib/tutor.ts`), but
   nothing caps the total: 100 free accounts is 500 questions, and a paid
   account can ask 900 a month. Set a credit limit on the OpenRouter key
   itself, so a surprise is capped at a known amount, and watch the spend
   page. Captcha makes mass sign-ups for free messages harder, not
   impossible; requiring email confirmation is the next step if it happens.
4. **Marking accounts paid by hand.** `account_plans` is written in the
   dashboard. Real payments (Stripe or similar) need a webhook that writes
   the plan, and that is the first thing that would want a service-role key
   on the server. It must stay server-only (never `NEXT_PUBLIC_`), in one
   route that checks the webhook signature; the rule in CLAUDE.md would be
   rewritten from "no service-role key" to "one, in that route". Charging
   money also ends Vercel's Hobby plan, which is for non-commercial use;
   Pro is about 20 USD a month.
5. **Database size.** The free plan holds 500 MB. Tutor answers with their
   1024-dimension embeddings are the big rows (the caps of 2,000 answers and
   500 conversations per account exist for this). Watch Dashboard, Usage;
   move to Pro (8 GB) before about 350 MB. A free project also pauses after a
   week with no activity, which real users would meet as a broken site.
6. **Leaving.** There is no way for a user to delete their account or all
   their data; today the owner would do it in the dashboard. Strangers will
   ask, and privacy law (GDPR, POPIA) expects it, along with a privacy page
   saying what is stored and that tutor questions go to OpenRouter and the
   model provider. Deleting an auth user needs the admin API, so it belongs
   in the same server-only route design as the payment webhook; the data
   itself already cascades from `auth.users`.
7. **Knowing something broke.** Errors reach Vercel's logs and nothing else;
   the owner learns about a failure when trying the site. With users, add
   error reporting (Sentry has a free tier and a Next.js setup) or at least
   Vercel's log alerts, and Supabase's advisors after each migration.
8. **Support and changes people did not ask for.** The owner tests on the
   live site; with users, a half-finished change is something they see.
   Preview deployments (already built per PR, behind Vercel's login) are the
   place to try things instead, pointed at the staging project from item 1.

Not worth changing yet: the search (`search_tutor` only ever scans one
account's rows, at most 2,000, about 40 ms measured), the per-route time
budget (55 seconds, inside Vercel's 60), and Supabase's 50,000 monthly active
users on the free plan. Each of those is far away.

## Checks and commands

```
npx tsc --noEmit
npx eslint src/
npx vitest run
npm run build
npm run e2e        # production by default: ask the owner first
npx supabase migration new <name>
npx supabase db push
gh pr create --base main
gh pr merge <n> --merge --delete-branch
```

Commit messages end with the attribution line the session's system reminder
gives. Push to `origin` only.
