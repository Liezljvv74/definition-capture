/**
 * The one way this app decides that two names are the same name.
 *
 * Used by every duplicate check, every `[[Name]]` lookup, the autocomplete,
 * the import matchers, and the search filters. They all have to agree: a word
 * the add form calls a duplicate must also be the one a link resolves to and
 * the one an import updates, or the same word ends up saved twice and only
 * one copy is reachable.
 *
 * Two things happen here, and both matter for a language app.
 *
 * `normalize("NFC")` composes the accents. `ü` can be stored either as one
 * character or as a plain `u` followed by a combining diaeresis, and the two
 * are different strings to JavaScript while looking identical on screen. Text
 * pasted from a PDF, or typed on a Mac, frequently arrives decomposed. Without
 * this, `Tür` pasted one way would fail the duplicate check against `Tür`
 * typed the other, be imported as a second entry, and never be found by a
 * `[[Tür]]` link — all silently, because the two spellings look the same.
 *
 * `toLowerCase` rather than `toLocaleLowerCase` because the locale-aware
 * version follows whatever locale the machine is set to, and on a Turkish one
 * `I` lowercases to `ı`. That would make one browser disagree with another
 * about what counts as a duplicate, over data that is shared between them.
 * Ordinary German case folding is identical either way.
 *
 * Lowercasing last, then composing, because lowercasing can itself decompose a
 * character; normalising afterwards guarantees the result is always NFC.
 */
export function foldName(value: string): string {
  return value.trim().toLowerCase().normalize("NFC");
}
