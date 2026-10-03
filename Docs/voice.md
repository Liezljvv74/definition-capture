# Read aloud

Agreed with the owner on 3 October 2026, on the branch `Voice`.

## Purpose

Hear the words, phrases and verbs being learned, and have a saved grammar rule
read out. Speech comes from the browser's own Web Speech API
(`window.speechSynthesis`): no outside text-to-speech service, no new
dependency, nothing sent anywhere.

## What gets a speaker

| Where | Button | What it reads | Voice |
| --- | --- | --- | --- |
| Vocabulary list, desktop and phone | Left of the edit pencil in each row | The word | Studied language |
| Phrases list, desktop and phone | Left of the edit pencil in each row | The phrase | Studied language |
| A word's page | Beside the title | The word | Studied language |
| A phrase's page | Beside the title | The phrase | Studied language |
| A phrase's page | Beside the usage example | The example sentence | Studied language |
| Verbs, each table | Beside each tense's name in the heading | That tense down the table, person and form, a short pause between rows ("ich gehe … du gehst …"); empty cells skipped | Studied language |
| A rule's page | One floating button, bottom right of the window | The whole rule from the top, or only the highlighted text when some of the rule is selected | Each part in its own language (below) |

Definitions and literal meanings are not read: they are usually in the
reader's own language and are not what is being practised.

A list row keeps its one ruled line (32px): the speaker is the same size as
the pencil beside it.

## Reading a rule

A rule is read as a list of parts, each with its own language:

- the title, every text block, and a table's header cells may be written in
  either language, so each is judged by its words (changed on 3 October 2026,
  after a French rule was read in an English voice): the alphabet first, for
  Russian, Chinese, Japanese and Korean, then the short words every sentence
  leans on (le, la, est, avec; the, is, with). A part with no clue of its own,
  such as a heading "Masculin", follows the language of the rule's text as a
  whole. Only the preset languages have word lists; for any other the rule is
  read in the native language, as before;
- a table's other cells: the studied language;
- an example: the sentence in the studied language, then its translation in
  the native language.

Text is read as shown: link markup and the `{taught words}` braces are
removed with `plainText`, and a link reads as its label.

With text selected inside the rule, the button reads only the selection. A
selection in the rule's text or a heading is judged by its words, as above,
with the rest of the rule as context, so a selection with no clue of its own
("Quel auxiliaire choisir?") takes the language the rule is written in;
one in an example sentence or a table cell is read in the studied language,
and one in a translation in the native language.

While a rule is read, the part being read has a dashed outline and is kept
in view with a smooth scroll (an instant one under reduced motion). The
button shows a stop icon; pressing it again, or leaving the page, stops the
reading.

## Voices and languages

- The studied language is `settings.language` (an ISO 639-1 code such as
  `es`), and the native language is `settings.nativeLanguage`.
- A voice is chosen by language: an exact match first, then any voice whose
  language starts with the code (`es-ES`, `es-MX`), then the browser's default.
  The utterance's `lang` is set either way, so a browser can choose for itself.
- A language typed in by hand (`languageOther`, no code) or no language chosen
  at all means no `lang` and the browser's default voice.
- Voices arrive a moment after the page loads (`voiceschanged`), so the choice
  is made when speech starts, not when the page renders.
- In a browser with no `speechSynthesis`, no speaker is shown. Support is read
  with `useSyncExternalStore` and a server answer of "no", so the server's HTML
  and the first render agree.

Person labels are read with their slashes as pauses: "er/sie/es" is spoken as
"er, sie, es".

## Speed

A "Reading speed" choice in Settings: Slow (0.75), Normal (1, the default) or
Fast (1.25). It is stored in Supabase with the other settings, so it follows
the account to any device. It is not added to backup files, being a
preference rather than data.

This needs one migration: a column `user_settings.speech_rate`, `text not
null default 'normal'`, checked to `('slow', 'normal', 'fast')`. Existing rows
take the default, and RLS on `user_settings` already covers it. The migration
is pushed to the live project, with the owner's yes, before any code that
reads it reaches `main`.

## How it is built

- `src/lib/speech.ts`, pure and tested: `pickVoice(voices, code)`,
  `ruleParts(rule)` returning `{ text, lang: "studied" | "native", blockId }[]`,
  `tenseParts(table, column)`, `sentences(text)` (long text split at sentence
  ends, because Chrome stops an utterance after about 15 seconds), and
  `RATES`.
- `useSpeech()`, the one hook every speaker uses: reads the two languages and
  the speed from settings, plays a list of parts in order, cancels whatever
  was playing first (one thing speaks at a time), stops on unmount, and says
  which button's speech is playing.
- `SpeakButton`, the one button: a speaker icon that becomes a stop icon while
  its speech plays, an accessible name ("Read aloud: gehen", "Stop reading"),
  `aria-pressed` while playing, hidden without speech support. It uses the
  ink and link colours, never red.
- The rule page's floating button is a `SpeakButton` in a fixed position,
  above the faded logo in the corner, clear of the page text.

Nothing here writes a note anywhere: speech reads what the lists already
hold.

## Testing

- Unit tests: voice choice and its fallbacks, rule parts and their languages,
  tense parts with empty cells skipped and slashes turned into pauses,
  sentence splitting, the speed values.
- The hook, against a fake `speechSynthesis`: starting one speech cancels
  another, parts play in order, unmounting stops it.
- The button: hidden without support; its name and `aria-pressed`.
- In the browser, before handing over: each page heard in Chrome with Spanish
  and German as the studied language, at phone and desktop width, light and
  dark.

## Order of work

1. The migration (pushed with the owner's yes).
2. `speech.ts` and `useSpeech`.
3. `SpeakButton`, then the word and phrase lists and pages.
4. Verb tense headings.
5. The rule page's floating button.
6. The Settings speed choice.
7. README, checks, and the browser listening pass.

## Not in this

Speakers on flashcards, the dashboard or the tutor; choosing a particular
voice; reading definitions or meanings; highlighting word by word. Each can
follow if wanted.
