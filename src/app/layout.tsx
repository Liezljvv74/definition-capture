import type { Metadata } from "next";
import { Kalam, Patrick_Hand } from "next/font/google";
import localFont from "next/font/local";

import { EnterMovesDown } from "@/components/EnterMovesDown";
import { NotebookDoodles } from "@/components/notebook/NotebookDoodles";
import { NotebookPaper } from "@/components/notebook/NotebookPaper";
import { RuledLines } from "@/components/notebook/RuledLines";

import { DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // The landing page's title is the default; every other page names itself
  // and gets the site name after it.
  title: { default: `${SITE_NAME}: a personal repository for learning any language`, template: `%s · ${SITE_NAME}` },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: { type: "website", siteName: SITE_NAME, url: "/", title: SITE_NAME, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: SITE_NAME, description: DESCRIPTION },
};

/*
 * The notebook's two hands: Kalam for headings, Patrick Hand for body text.
 * next/font serves them from this app at build time, so a visitor's browser
 * asks no outside font server and the Content Security Policy needs no
 * change. Each sets a CSS variable that `notebook.css` puts first in a stack
 * with fallbacks; nothing uses them until a page opts into the notebook.
 */
const kalam = Kalam({ weight: ["400", "700"], subsets: ["latin"], display: "swap", variable: "--font-kalam" });
const patrickHand = Patrick_Hand({ weight: "400", subsets: ["latin"], display: "swap", variable: "--font-patrick" });

/*
 * Kalam's 7, for the body hand. Patrick Hand writes 7 with a crossbar, which
 * the owner read as a stray mark beside a count ("7 rules"). The file is a
 * digits-only subset of Kalam (Google Fonts, `text=0123456789`, SIL Open Font
 * Licence), limited here to U+0037 so it goes first in the stack and only the
 * 7 comes from it: Kalam's 1 reads as a slash at body size, so the other
 * figures stay Patrick Hand's. No fallback face: one covering every character
 * would shadow Patrick Hand. Its variable is not `--font-*`: Tailwind drops a
 * `var(--font-...)` it does not know from inside a theme value.
 */
const digits = localFont({
  src: "../fonts/kalam-digits.woff2",
  display: "swap",
  variable: "--hand-digits",
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0037" }],
});

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full ${kalam.variable} ${patrickHand.variable} ${digits.variable}`}>
      <body className="flex min-h-full flex-col">
        <PageBackground />
        <EnterMovesDown />
        {/* Nothing is gated here any more. `src/proxy.ts` turns a signed-out
            request away before a protected page is rendered, and
            `(workspace)/layout.tsx` checks again on the server before the
            pages inside it run. What used to be a client component hiding
            markup the browser had already been given is now a redirect that
            happens before the markup exists. */}
        {/* Every page is a page of the notebook: ruled paper, margin line and
            punch holes behind it, and the doodle triggers once for all. */}
        <NotebookPaper>
          <NotebookDoodles />
          <RuledLines />
          {children}
        </NotebookPaper>
      </body>
    </html>
  );
}

/**
 * The logo, as a small mark floating in the bottom right corner of every page.
 *
 * It used to be a large centred backdrop, showing through the margins around
 * the cards. That works on a page with room to spare and not on a full list:
 * the artwork sat behind the table, the reader saw pieces of it between rows,
 * and it read as something gone wrong rather than as decoration. Small and
 * cornered is the version that can be on every page without being in the way
 * of any of them.
 *
 * `fixed`, so it stays where it is while a long list scrolls past rather than
 * being dragged up the screen, and so it is in the same place on every page.
 * `pointer-events-none` so it can never intercept a click, which matters more
 * now that it sits in front of the page rather than behind it: `z-40` puts it
 * over the content and the nav and under the modal overlay at `z-50`, so a
 * dialog still covers it.
 *
 * `--logo-shade` is the only number to change: raise it to fade the mark
 * further, lower it to bring the artwork forward. At 80% the artwork is laid
 * over the page at a fifth of its strength, which is faint enough to read
 * straight past and still be there when you look for it.
 */
function PageBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-40 bg-no-repeat
        [--logo-shade:80%] [background-position:right_bottom]
        [background-size:min(24vmin,180px)]"
      style={{
        backgroundImage: "url(/captured-logo-bg.png)",
        opacity: "calc(100% - var(--logo-shade))",
      }}
    />
  );
}
