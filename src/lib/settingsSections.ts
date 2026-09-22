/**
 * The three groups Settings is divided into.
 *
 * One list, shared by the menu that offers them and the page that renders
 * them, so a group cannot be offered and then not exist. It lives here rather
 * than in either of those files because neither owns it: the nav needs the
 * labels to build its menu, and the page needs the keys to decide what to
 * show.
 *
 * Settings grew a section at a time until it was eight of them on one scroll,
 * which is a list to hunt through rather than a page to read. The grouping is
 * by what somebody came to change: who they are, how their glossary is
 * organised, or how their answers are marked.
 */
export type SettingsSectionKey = "profile" | "glossary" | "flashcards";

export const SETTINGS_SECTIONS: {
  key: SettingsSectionKey;
  label: string;
  /** Shown under the heading, so a section says what it is for. */
  description: string;
}[] = [
  {
    key: "profile",
    label: "Profile",
    description: "Who you are, how you sign in, and where exports are written.",
  },
  {
    key: "glossary",
    label: "Glossary settings",
    description: "The lists the word, phrase and conjugation forms offer.",
  },
  {
    key: "flashcards",
    label: "Flashcard settings",
    description: "How a typed answer is marked against what you saved.",
  },
];

/**
 * The section a `?section=` names, or the first one.
 *
 * Anything unrecognised falls back rather than showing an empty page: the
 * value comes from a URL, so it can be anything at all, and a settings page
 * that renders nothing is indistinguishable from one that is broken.
 */
export function readSectionKey(value: string | null): SettingsSectionKey {
  const found = SETTINGS_SECTIONS.find((section) => section.key === value);
  return found?.key ?? SETTINGS_SECTIONS[0].key;
}
