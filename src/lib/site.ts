/**
 * The facts about the site that metadata, the sitemap, robots.txt and the
 * landing page all state. One place, so a custom domain later is one line.
 */
export const SITE_URL = "https://definition-capture.vercel.app";
export const SITE_NAME = "Definition Capture";

export const DESCRIPTION =
  "A personal glossary for language learners: save the words, phrases, verb conjugation tables and grammar rules you meet, and review them with flashcards that come back when they are due.";

/**
 * The landing page's questions, also sent to search engines as FAQ structured
 * data. Every answer must stay true of the app as it is; nothing about price,
 * which is undecided.
 */
export const FAQ: { question: string; answer: string }[] = [
  {
    question: "Which languages can I use it for?",
    answer:
      "Any. You write the words, meanings and conjugations yourself, so it works for whichever language you are learning.",
  },
  {
    question: "Who can see what I save?",
    answer: "Only you. Every list belongs to your account, and the database refuses anyone else's request for it.",
  },
  {
    question: "How do the flashcards work?",
    answer:
      "They are made from what you have saved. You type the meaning, and each card comes back for review on a schedule that stretches as you keep getting it right.",
  },
  {
    question: "Can I keep a copy of my data?",
    answer: "Yes. Backup saves everything to a file you keep, and you can restore from it later.",
  },
  {
    question: "Does it work on a phone?",
    answer: "Yes. It runs in the browser on a phone, a tablet or a computer.",
  },
];
