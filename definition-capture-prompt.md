# Definition Capture — a personal glossary web app

Build me a small, local-only web app called **Definition Capture** for saving new words and concepts I encounter while studying, so I can browse, search, and review them later.

## Fixed stack and constraints (do not deviate)

- Next.js (App Router), TypeScript, Tailwind CSS.
- Runs locally with `npm run dev` at `localhost:3000`. No deployment step, no public URL.
- No backend, no database server, no user accounts.
- Data must persist in the browser across full page reloads. Before writing code, briefly propose a browser persistence mechanism (e.g. `localStorage`) with one sentence on why, then use it consistently behind a small storage module so it could be swapped later.

## The main thing: glossary entries

Each entry has:

- **Term** (required, plain text)
- **Definition** (plain text; may be left blank)
- **Module/Tag**: a dropdown, not free text, pre-populated with a short configurable list (Week 1–Week 8 plus "Unsorted"; keep the list in one easily editable constants file). Defaults to "Unsorted".
- **Source**: a dropdown with Google / Claude / ChatGPT / Manual. Defaults to "Manual".
- **Date Added**: auto-filled with the current date/time on creation, shown but not editable.
- **Needs Definition**: set automatically to true when the Definition is blank, false otherwise, so blank entries are easy to spot and fill in later.

## Pages (at least these two)

1. **`/` — glossary browser.** A table (or responsive card list on small screens) of all entries showing Term, Definition, Module/Tag, Source, Date Added, and a clear visual flag on any "Needs Definition" row. Sorted newest-first by default, re-sortable by column. A search/filter box that matches Term and Definition, plus a filter by Module/Tag. A prominent "Add term" action.
2. **`/terms/[id]` — detail page.** Each entry has its own stable ID and URL (e.g. `/terms/abc123`) that opens the right entry directly, including after a reload or when pasted into a fresh tab. Shows the full entry and offers Edit and Delete (with a confirm step for delete).

## Create / edit behavior

- The add form does light auto-population: if I paste text following a clear "term: definition" or "term - definition" pattern into the Term field, split it — first part becomes Term, remainder becomes Definition. Otherwise leave Definition as typed. (No external dictionary API lookups — keep it offline.)
- **Duplicate check**: before saving a new entry, check case-insensitively whether the Term already exists. If it does, ask whether to update the existing entry or save as a separate new one — never silently duplicate.
- Editing an entry updates it in place; Date Added stays the original creation time.

## No blank screens

- When there are no entries yet, `/` shows a friendly empty state explaining what the app is for and how to add the first term.
- Visiting a `/terms/...` URL that doesn't exist shows a readable "term not found" message with a link back to the glossary — not an error screen.

## Layout

Clean, usable, and responsive — comfortable on a laptop and on a phone (table collapses to cards or scrolls gracefully on small screens).

## Scope

Keep scope tight — the glossary CRUD flow done well is the whole app. No clipboard monitoring, no rich text, no cloud sync, no auth.

