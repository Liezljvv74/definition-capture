# Sprint 2 project reflections, Definition Capture

Repository: https://github.com/Liezljvv74/definition-capture
Turing College repository: https://github.com/TuringCollegeSubmissions/lfouri-AFA.BAI.1.8

The app is reviewed locally at http://localhost:3000. There is no deployed URL:
the session is checked on the server, so it needs a Node host rather than the
static hosting Sprint 1 used, and setting that up was not part of this sprint.

## 1. What I built and how I scoped it down

Definition Capture is a personal language-study workspace. It holds three lists,
Vocabulary, Phrases and Verb tables, and turns what is in them into flashcards.
Sprint 1 was a browser-only version with no accounts. This sprint replaced that
with real accounts and a database, so the same lists follow me to any device I
sign in on, and are private to my account.

I kept the scope to what one person actually uses: capture an entry, find it
again, link entries to each other, and review them. I left out sharing, teams and
anything collaborative.

## 2. The persistence decision

Sprint 1 stored everything in the browser. That suited one person on one machine
and nothing else: a second device saw nothing, and clearing site data would have
lost the lot.

This sprint moved every list into Supabase, which is Postgres with row level
security. The decision that mattered was not "use a database" but "let the
database enforce ownership". List queries run in the browser under the publishable
key, which anyone can read out of the page source, so the screens being locked
down proves nothing. Row level security is what actually separates my rows from
anyone else's, because it is checked by Postgres on every query no matter who is
asking.

## 3. My data, and what the columns mean

Everything a reader saves is one row in `learning_items`, with the type-specific
part in a small table beside it. The columns I care about are:

- `id`: the row's own identifier, and what a `/word?id=` link points at.
- `user_id`: the account that owns the row, matching the id under Authentication
  in the Supabase dashboard. This is the column every security policy compares
  against `auth.uid()`.
- `item_type`: `word`, `phrase` or `verb_table`, which says which detail table
  holds the rest of it.
- `title`: the word, the phrase or the verb.
- `ref`, `source`, `needs_review`, `created_at`, `updated_at`: the shared fields
  every type has.

The detail tables carry only what is particular to a type: `word_details` has the
definition, `phrase_details` has the literal meaning and example, and
`verb_table_details` has the tenses and the grid. They have no `user_id` of their
own and reach through the shared id instead, so there is one answer to who owns a
row rather than two that can disagree.

`words`, `phrases` and `verb_tables` still exist, but as views. Adding a word
sends an insert to the `words` view; an `instead of` trigger on that view splits
it into one row in `learning_items`, stamped with the signed-in account's id, and
one in `word_details`. Categories become rows in `tags` and `item_tags` in the
same write. In the Table Editor the new row appears in `learning_items` with my
`user_id` on it, which is the same value the Authentication tab shows for my test
account.

## 4. Authentication

Supabase Auth does all of it. No password is stored, compared or hashed by my
code. Being signed in is decided on the server twice over: `src/proxy.ts` runs
before every request and redirects anyone without a session, and the workspace
layout asks again before any protected page renders. Both verify the token's
signature with `getClaims()` rather than believing the cookie, because a cookie is
a claim made by whoever sent the request.

## 5. The optional task

I took the **password-reset email flow**, and built it on its own feature branch,
`feat/password-reset`, which comes into `main` through a pull request rather than
straight onto the branch.

**Forgot your password?** on the sign-in screen emails a link through Supabase
Auth. The link lands on `/auth/reset`, which exchanges the code for a session on
the server, then sends the reader to `/choose-password`, a form that asks for the
new password and nothing else, because following the link already proves control
of the mailbox. Choosing a password signs out every other session. The screen
answers the same way whether or not the address has an account, so the form cannot
be used to discover who has one.

Two other things on the optional list were already part of the app by then: the
**self-service sign-up page** at `/sign-up`, including the confirmation email
Supabase sends, and **tag filtering**, which this app calls categories, with a
filter on both list pages and on the flashcard deck builder.

## 6. One thing that was harder than Sprint 1

Making the database the authority rather than the screen. Twice this sprint the
app looked correct and was not. Once, a function that runs with elevated rights
compared the owner with `auth.uid()` using `<>`, which is null for a caller with
no session, so an unauthenticated request slipped through a check that read
perfectly well in English. Once, an import silently stopped working because a view
cannot take `on conflict`, and the failure was a Postgres error code rather than
anything visible on screen. Neither was findable by looking at the app. Both came
out of asking the database directly.

## 7. What I would keep, and what I would change

Keep: writing the rules down in `CLAUDE.md` and making the agent follow them. The
rules about server-side checks, row level security and never storing note data in
the browser caught drift more than once, and they are also what made a review of
the whole branch worth running.

Change: I would set up the verification routine earlier. Signing in as a second
account and confirming it sees nothing of the first is a two-minute check that
should have been a habit from the day accounts landed, not something done at the
end.

## Handed in

- Repository: https://github.com/Liezljvv74/definition-capture
- Pull request for the optional task: (link once merged)
- `README.md`, `CLAUDE.md` and the `Docs/` folder, as app documentation
- The app runs locally with `npm run dev` at http://localhost:3000

![The Definition Capture home page](AppScreenshot.JPG)
