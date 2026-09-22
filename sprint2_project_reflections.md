# Sprint 2 project reflections, Definition Capture

Repository: https://github.com/Liezljvv74/definition-capture

Turing College repository: https://github.com/TuringCollegeSubmissions/lfouri-AFA.BAI.2.8

The app is reviewed locally at http://localhost:3000. There is no deployed URL: the session is checked on the server, so it needs a Node host rather than the static hosting Sprint 1 used, and setting that up was not part of this sprint.

## 1. What I built and how I scoped it down

Definition Capture is a personal language-study workspace. It currently holds three lists, Vocabulary, Phrases and Verb tables, and turns what is in them into flashcards.

Sprint 1 was a browser-only version with no accounts. This sprint replaced that with user accounts and a database, so the same lists are available to me on any device I sign in on, and are private to my account.

I kept the scope to what one person uses: capture an entry, find it again, link entries to each other, and review them.

## 2. The persistence decision

Sprint 1 stored everything in the browser and clearing site data would have lost everything. This sprint moved the lists into Supabase, where Row Level Security keeps my data safe, because it is checked by Postgres on every query.

## 3. Authentication

Supabase Auth manages authentication. No password is stored, compared or hashed by my code. Being signed in is decided on the server twice: `src/proxy.ts` runs before every request and redirects anyone without a session, and the workspace layout asks again before any protected page renders. Both verify the token's signature with `getClaims()` rather than believing the cookie, because a cookie is a claim made by whoever sent the request.

## 4. My data, and what the columns mean

Everything I save is one row in `learning_items`, with the part that is particular to its type in a small table beside it. The columns that matter are `id`, which is the row's own identifier and what a `/word?id=` link points at; `user_id`, which is the account that owns the row and the column every security policy compares against `auth.uid()`; `item_type`, which is `word`, `phrase` or `verb_table` and says which detail table holds the rest; `title`, which is the word, the phrase or the verb; and the shared fields `ref`, `source`, `needs_review` and `created_at`.

The detail tables hold only what is particular to a type. `word_details` has the definition, `phrase_details` has the literal meaning and the example, and `verb_table_details` has the tenses and the grid. They have no `user_id` of their own and reach through the shared id instead, so there is one answer to who owns a row rather than two that can disagree.

`words`, `phrases` and `verb_tables` still exist, but as views. When I add a word, the app inserts into the `words` view, and an `instead of` trigger on that view splits it into one row in `learning_items`, stamped with my account's id, and one in `word_details`. Categories become rows in `tags` and `item_tags` in the same write. In the Table Editor the new row shows in `learning_items` with my `user_id` on it, which is the same id the Authentication tab shows for my account.

## 5. The optional task

I took the “password-reset email flow”, and built it on its own feature branch, `feat/password-reset`, which comes into `main` through a pull request rather than straight onto `main`.

“Forgot your password?” on the sign-in screen emails a link through Supabase Auth. The link lands on `/auth/reset`, which exchanges the code for a session on the server, then sends the reader to `/choose-password`, a form that asks for the new password and nothing else, because following the link already proves control of the mailbox. Choosing a password signs out every other session. The screen answers the same way whether or not the address has an account, so the form cannot be used to discover who has one.

Two other things on the optional list were already part of the app by then: the “self-service sign-up page” at `/sign-up`, including the confirmation email Supabase sends, and “tag filtering”, which this app calls categories, with a filter on both list pages and on the flashcard deck builder.

## 6. One thing that was harder than Sprint 1

Although I love the fact that I can use a database to bring this idea to life, I struggle getting my head around databases and creating schemas.

## 7. What I would keep, and what I would change

Keep: documenting the project rules in `CLAUDE.md` and making the agent follow them.

Change: I would set up a database and authentication earlier.

## Handed in

- Repository: https://github.com/TuringCollegeSubmissions/lfouri-AFA.BAI.2.8
- Pull request for the optional task: https://github.com/Liezljvv74/definition-capture/pull/8
- `README.md`, `CLAUDE.md` and the `Docs/` folder, as app documentation
- The app runs locally with `npm run dev` at http://localhost:3000

![The Definition Capture home page](AppScreenshot.JPG)
