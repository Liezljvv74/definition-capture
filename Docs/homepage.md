# Homepage: a public landing page and a dashboard

Design agreed with the owner on 2 October 2026, on branch `Homepage`. It
replaces the current home page (a welcome banner and four list cards) with two
pages: a public landing page that search engines and LLMs can read, and a
signed-in dashboard drawn from the owner's mockup.

## Intent

- **Language learners should love using the app.** The dashboard answers "what
  should I do now?" the moment someone signs in: review what is due, see
  progress, get back to what they were capturing.
- **Visible to humans and LLMs.** Today every crawler is redirected to the
  sign-in form, so the app is invisible. A public page has to say what it is.
- **Keep the existing colours.** The mockup maps onto the current palette; no
  new colours, and red stays reserved for warnings.
- **A social feature will come later.** Nothing social is built now. The design
  only avoids blocking it: the display name in `user_settings` is already what
  such a feature would show.

Out of scope: pricing (undecided, so nothing anywhere mentions price or "free"),
a quick-capture box on the dashboard (offered, not requested), social features,
renaming the app or changing its logo.

## Routes and protection

| Route | Who | What |
| --- | --- | --- |
| `/` | everyone | Public landing page. A signed-in visitor is redirected to `/home` |
| `/home` | signed in | The dashboard |
| `/sign-in`, `/sign-up` | signed out | Unchanged, except that success lands on `/home` |

- The landing page is `src/app/page.tsx`, outside the `(workspace)` group, and
  `/` joins `PUBLIC_PATHS` in `src/proxy.ts`. It is the only public path that
  must match exactly: `/` as a prefix would make every path public, so the
  proxy test suite gets a case proving `/vocabulary` is still protected.
- The redirect of a signed-in visitor from `/` to `/home` happens in the proxy,
  beside the existing redirect away from `/sign-in`, so the landing page itself
  needs no session and can be prerendered.
- The dashboard is `src/app/(workspace)/home/page.tsx`, inside the group, so
  both session checks (proxy and layout) protect it.
- Everything that sends a signed-in user to `/` today points at `/home`
  instead: the logo in `MainNav`, sign-in, sign-up, `choose-password`, the
  flashcards page's links, the proxy's redirect away from `/sign-in`, and the
  auth callback's default. Anything missed still works, via the redirect.

## The dashboard

A server component. It calls `home_summary()` once and runs one query for
recent items, both with the server Supabase client under the caller's session
and row level security, in parallel, then renders. Client components are only
the two interactive pieces: the review buttons and the remembered word.

The order is the same everywhere: greeting, progress (each full width), then
review (two thirds on desktop) beside remember (one third), recently captured,
then the list cards. On a phone it is one column in that order, so the page
needs no `order-*` classes.

### Greeting

"Welcome back, {name}", where name is `display_name` or, failing that, the
email, the same fallback `AccountMenu` uses. Under it: "Last saved {relative}
ago. Here is where you left off.", from the newest `items.updated_at`. The line
is left out when the account has no items.

### Ready for review

Never hidden; its content follows the account's state.

| State | Heading | Action |
| --- | --- | --- |
| Due cards exist | "{n} items need reviewing" | **Review now**: a due-only deck of up to 50 |
| Nothing due, new items exist | "Nothing due. {n} new items to learn" | **Learn new items**: the default deck |
| Nothing due, nothing new | "All caught up. Next review {relative}" | none |
| No items that make cards | "Capture your first word" | link to `/vocabulary` |

**Customise deck** sits under the action in the first three states and opens
the existing `CreateDeckDialog`, unchanged. There is no "picks up to 50 cards"
line: the owner struck it as demo speak.

Due means `progress.due_at <= now()` on an item that still has an answer. New
means an item with `has_answer` and no `progress` row.

The buttons call `buildDeck` and navigate to `/flashcards/?deck=…`, as the
dialog does. While building, the button is disabled and says so; a failure
shows the app's existing error banner pattern and leaves the button usable.

### Your progress

A bar in three parts with counts: New (`flashcard`, the pale blue), Learning
(`indigo-400`, from the primary button's family), Learned (`flashcard-frame`,
the logo navy). All three are colours the app already uses. The heading
row shows the total. Under the bar, kept from the mockup at the owner's
request: "An item counts as learned once you have typed its meaning correctly
on your last reviews."

- Counted: items with `has_answer` only. Grammar rules and words without a
  definition never make cards and would sit in New forever.
- New: no `progress` row. Learned: `progress.streak >= 2`. Learning: the rest.
- Hidden when all three are 0.

Each segment carries its count as text as well as colour, so the bar does not
rely on colour alone.

### Do you still remember this one?

One random word or phrase with `has_answer`. The word itself is the control:
a button with `aria-expanded` and `aria-controls` that reveals the meaning in
place, with no separate Show meaning button and no visible helper text. A
visually hidden "Show meaning" or "Hide meaning" after the word tells a screen
reader what it does. The meaning is `cardBack(item)`, the same text a flashcard
shows. Hidden when no such item exists.

### Recently captured

The 6 newest items of any type by `created_at`, in two columns on desktop. Each
shows its title as a link to the item, then the type label (Vocabulary,
Phrases, Verb table, Grammar), the first collection if any, and a relative date
("today", "yesterday", "3 days ago") from `Intl.RelativeTimeFormat`. Hidden
when there are no items. The query reuses `ITEM_SELECT` from `remoteStore.ts`
and its row parsing, so titles and collections read exactly as the lists show
them.

### List cards

Four, not the mockup's three, so every list is one click from home:

- Vocabulary: "{n} words · {m} need a definition" (the second part only when m > 0)
- Phrases: "{n} phrases"
- Verbs: "{n} conjugation tables"
- Grammar: "{n} rules"

### Mobile menu

Below the `sm` breakpoint the top bar shows the logo and a menu button
(`aria-expanded`, `aria-controls`) that opens a panel with the same
destinations: the Glossary links, Verbs, Grammar, the Backup actions and
Settings. Escape and a link click close it. At `sm` and above the bar is
unchanged.

## Database change

One migration, made with `npx supabase migration new home_summary` and pushed
with `npx supabase db push` **before** any code that calls it reaches `main`.

1. **`home_summary()`**, `security invoker`, `search_path = ''`, `stable`,
   raising `not signed in` when `auth.uid()` is null like the other functions.
   Returns one row: counts of words, words without a definition, phrases, verb
   tables and grammar rules; due, new, learning and learned counts; the next
   `due_at` in the future; the newest `updated_at`; and the id of one random
   word or phrase with `has_answer`. Every subquery filters on `user_id =
   auth.uid()` as well as relying on RLS, as `build_deck` does.
2. **`build_deck` gains `only_due boolean default false`.** When true, only
   items whose `progress.due_at <= now()` are drawn, most overdue first. Postgres
   cannot add a parameter in place, so the migration drops and recreates the
   function with the same body plus the filter, and re-grants execute as the
   original does. Existing callers are unaffected, since the new parameter
   defaults to false.

`Docs/schema.md` is updated in the same change: eight functions instead of
seven, and both descriptions. `src/lib/flashcards.ts` gains `dueOnly` on the
deck options and a `homeSummary()` wrapper with its row type.

## Landing page and SEO

### The page

A server component with no session access, prerendered at build time. Copy
describes the app plainly and truthfully: no testimonials, no user counts, no
price. Sections:

1. A single `h1` naming what the app is (working line: "Your personal glossary
   for learning a language"), one supporting sentence, and two actions:
   **Create an account** (`/sign-up`) and **Sign in**.
2. What you can keep: words, phrases, verb conjugation tables, grammar rules,
   one sentence each, using the existing card colours.
3. How you remember it: flashcards built from what you saved, brought back
   when due.
4. Private: each account's lists are its own.
5. Questions and answers, short and true (for example: which languages, is it
   private, does it work on a phone, can I export my data).
6. A closing **Create an account**.

It works in dark mode like the rest of the app. A screenshot of the real
dashboard, taken from the test account, can be added once the dashboard exists.

The no-demo-speak rule governs the app's interface, not this page: explaining
the app is this page's whole job.

### Metadata and crawler files

- Root `metadata` gains `metadataBase` (`https://definition-capture.vercel.app`),
  a title template (`%s · Definition Capture`), a description, Open Graph and
  Twitter card fields, and a canonical URL for `/`.
- `src/app/opengraph-image.tsx` draws the preview image with `next/og`, which
  ships with Next: no new dependency.
- `src/app/robots.ts`: allow `/`, `/sign-in`, `/sign-up` to all agents,
  including GPTBot, ClaudeBot, PerplexityBot and Google-Extended; disallow the
  workspace and `/auth`; point at the sitemap.
- `src/app/sitemap.ts`: `/`, `/sign-up`, `/sign-in`.
- `public/llms.txt`: a short plain-text description of the app and who it is
  for, with links to the public pages.
- The `(workspace)` layout sets `robots: { index: false, follow: false }`, so a
  private URL that leaks never gets indexed.
- The landing page carries JSON-LD: a `WebApplication` (name, URL, category
  EducationalApplication, operating system Web, description, no offers) and an
  `FAQPage` built from the same questions the page shows, from one array so
  they cannot drift apart.
- `robots.txt`, `sitemap.xml`, `llms.txt` and `opengraph-image` are added to
  the proxy matcher's exclusions; without that the proxy bounces every crawler
  to `/sign-in`, as it does today.

## Verification

- `npx tsc --noEmit`, `npx eslint src/ e2e/`, `npx vitest run`, `npm run build`.
  The build's route table must show `/` as static and `/home` as dynamic.
- Vitest: proxy cases for `/` public, `/` signed in redirecting to `/home`, a
  workspace path still protected, the new matcher exclusions; `MainNav` tests
  updated for the logo target and the mobile menu; the review card's choice of
  state from a summary; the relative date helper.
- The migration rehearsed on the local Supabase copy before `db push`:
  `home_summary` on an empty account and on a populated one, a second account's
  rows never counted, and `build_deck(only_due => true)` drawing only due items.
- An end-to-end test of the dashboard against the test account, run only after
  asking the owner, per the production rule.
- The landing page checked signed out: its source contains the `h1`, the
  JSON-LD and the meta description, and `/robots.txt`, `/sitemap.xml` and
  `/llms.txt` return 200 without a session.
