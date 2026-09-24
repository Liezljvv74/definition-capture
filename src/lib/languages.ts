/**
 * The languages Settings offers, and the words each one skips when sorting.
 *
 * A language is stored as its two-letter ISO 639-1 code (`fr`), never as its
 * name. A name depends on the language it is written in, "French" here and
 * "Französisch" in a German interface, so it is worked out for display and
 * never saved. The code is also what `Intl.Collator` takes, which is the
 * other thing a language is for: it sets the alphabetical order of every
 * list.
 */

export type LanguagePreset = {
  code: string;
  /**
   * Articles, in every form a word can be saved with. Empty for a language
   * that has none, where choosing it still sets the alphabetical order.
   */
  skipWords: readonly string[];
};

/**
 * The most commonly learned languages, going by Duolingo's yearly reports,
 * plus Dutch. A word ending in an apostrophe is elided onto the next one
 * (French `l'homme`) and is matched without a space; see `sortName.ts`.
 *
 * Arabic is next on those reports and deliberately absent: its article is
 * written joined to the word, so it is a prefix rather than a word to skip,
 * and a list of words cannot express it.
 */
export const LANGUAGE_PRESETS: readonly LanguagePreset[] = [
  { code: "zh", skipWords: [] },
  { code: "nl", skipWords: ["de", "het", "een"] },
  { code: "en", skipWords: ["the", "a", "an"] },
  { code: "fr", skipWords: ["le", "la", "les", "l'", "un", "une", "des"] },
  {
    code: "de",
    skipWords: [
      "der",
      "die",
      "das",
      "dem",
      "den",
      "des",
      "ein",
      "eine",
      "einen",
      "einem",
      "einer",
      "eines",
    ],
  },
  {
    code: "it",
    skipWords: ["il", "lo", "la", "i", "gli", "le", "l'", "un", "uno", "una", "un'"],
  },
  { code: "ja", skipWords: [] },
  { code: "ko", skipWords: [] },
  { code: "pt", skipWords: ["o", "a", "os", "as", "um", "uma", "uns", "umas"] },
  { code: "ru", skipWords: [] },
  { code: "es", skipWords: ["el", "la", "los", "las", "un", "una", "unos", "unas"] },
];

/**
 * Every ISO 639-1 language, as candidates for the full menu.
 *
 * A fixed list because there is no `Intl` API that lists the languages a
 * browser can collate. `languageMenu` filters this down to the ones this
 * browser can, so the menu never offers an order it would not honour.
 */
const ISO_639_1 = (
  "aa ab ae af ak am an ar as av ay az ba be bg bi bm bn bo br bs ca ce ch co " +
  "cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd " +
  "gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv " +
  "ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg " +
  "mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os " +
  "pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss " +
  "st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo " +
  "wa wo xh yi yo za zh zu"
).split(" ");

/**
 * The shape a stored code must have, matching the check constraint on
 * `user_settings.language`. Anything else a row or a backup file carries
 * reads as no language chosen.
 */
export function readLanguageCode(value: unknown): string {
  return typeof value === "string" && /^[a-z]{2,3}$/.test(value) ? value : "";
}

/** A typed language name for one the menu does not have. */
export const MAX_LANGUAGE_NAME = 60;

export function readLanguageName(value: unknown): string {
  // Trimmed again after the cut, which can leave a space at the end, and the
  // database refuses a name that is not trimmed.
  return typeof value === "string"
    ? value.trim().slice(0, MAX_LANGUAGE_NAME).trim()
    : "";
}

export function presetFor(code: string): LanguagePreset | undefined {
  return LANGUAGE_PRESETS.find((preset) => preset.code === code);
}

let names: Intl.DisplayNames | null | undefined;

/** "French" for `fr`, or the code itself where the browser has no name for it. */
export function languageName(code: string): string {
  if (names === undefined) {
    try {
      names = new Intl.DisplayNames(["en"], { type: "language" });
    } catch {
      names = null;
    }
  }
  return names?.of(code) ?? code;
}

/**
 * Whether this browser has a collation for the language.
 *
 * Browsers ship different sets, so a language chosen on one device can be
 * missing on another. Asked rather than assumed, so Settings can say so
 * instead of the order quietly falling back.
 */
export function canSortIn(code: string): boolean {
  try {
    return Intl.Collator.supportedLocalesOf([code]).length > 0;
  } catch {
    return false;
  }
}

export type LanguageMenu = {
  /** The languages with a ready-made list, by name. */
  presets: { code: string; name: string }[];
  /** Every other language this browser can sort in, by name. */
  others: { code: string; name: string }[];
};

let menu: LanguageMenu | null = null;

/**
 * Built once and kept, because the answer cannot change while the page is
 * open. Only ever called in the browser: the server's `Intl` is a different
 * build with a different set of languages, and a menu rendered there would
 * not match the one the browser hydrates.
 */
export function languageMenu(): LanguageMenu {
  if (menu) return menu;

  const byName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name, "en");
  const presetCodes = new Set(LANGUAGE_PRESETS.map((preset) => preset.code));

  menu = {
    presets: LANGUAGE_PRESETS.map(({ code }) => ({ code, name: languageName(code) })).sort(
      byName,
    ),
    others: ISO_639_1.filter((code) => !presetCodes.has(code) && canSortIn(code))
      .map((code) => ({ code, name: languageName(code) }))
      // A language the browser can sort but cannot name would show as a bare
      // code, which is no use to pick from.
      .filter((entry) => entry.name !== entry.code)
      .sort(byName),
  };
  return menu;
}
