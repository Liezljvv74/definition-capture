import type { Metadata } from "next";

import { EnterMovesDown } from "@/components/EnterMovesDown";

import "./globals.css";

export const metadata: Metadata = {
  title: "Definition Capture",
  description: "A personal language study system.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col">
        <PageBackground />
        <EnterMovesDown />
        {/* Nothing is gated here any more. `src/proxy.ts` turns a signed-out
            request away before a protected page is rendered, and
            `(workspace)/layout.tsx` checks again on the server before the
            pages inside it run. What used to be a client component hiding
            markup the browser had already been given is now a redirect that
            happens before the markup exists. */}
        {children}
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
