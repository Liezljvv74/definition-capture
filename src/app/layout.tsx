import type { Metadata } from "next";


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
 * The logo as a page backdrop, shaded 70%: the artwork is laid over the page
 * colour at 30% strength, which is the same thing as covering it with 70% of
 * that colour, but in one layer instead of two.
 *
 * `--logo-shade` is the only number to change: raise it to fade the logo
 * further, lower it to bring the artwork forward.
 *
 * Fixed rather than scrolling, so a long term list slides over a still
 * backdrop instead of dragging a picture up the screen, and behind everything
 * (`-z-10`) with pointer events off so it can never intercept a click. The
 * cards and headers above it are opaque, which keeps every table row at full
 * contrast, and the logo shows through the page margins.
 *
 * One layer for the whole app, not one per page. The home page wears it as a
 * small mark in the bottom right corner, in front of the page rather than
 * behind it, and `globals.css` restyles this same element rather than drawing
 * a second copy: two copies of one image at one position would stack in the
 * margins and not over the cards, leaving a visible step wherever a card edge
 * crossed the artwork. `data-page-backdrop` is the handle that rule reaches
 * for, and it overrides the position and size set here as well as the depth.
 */
function PageBackground() {
  return (
    <div
      aria-hidden="true"
      data-page-backdrop
      className="pointer-events-none fixed inset-0 -z-10 bg-center bg-no-repeat
        [--logo-shade:70%] [background-size:min(70vmin,640px)]"
      style={{
        backgroundImage: "url(/captured-logo-bg.png)",
        opacity: "calc(100% - var(--logo-shade))",
      }}
    />
  );
}
