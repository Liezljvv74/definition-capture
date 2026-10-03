/**
 * The classes that pin a page's filter row under the nav.
 *
 * A string rather than a wrapper component, so each page keeps the layout it
 * already had for its own controls and only gains the sticking. Vocabulary
 * lays three of them out in a row, Phrases has a single search box, and
 * wrapping would have meant restructuring three pages to share one behaviour.
 *
 * `top` is the nav's measured height, published as `--nav-height` by
 * `MainNav`, so the bar sits against the nav at any width instead of at one
 * width and slightly wrong at the rest.
 *
 * `z-20` is below the nav at `z-30`, so the nav's dropdowns still open over
 * this, and above the list scrolling underneath it.
 *
 * The background is not decoration. Without it the rows would slide visibly
 * through the search box, and the page's backdrop artwork would show between
 * the controls. The negative margins let that background reach the edges of
 * the content column rather than stopping at the padding.
 *
 * It is the paper itself, lines included (`ruled`), with `RuledLines`
 * keeping its lines level with the page's as it sticks. Plain paper colour
 * read as a gap in the ruling.
 */
export const STICKY_FILTERS =
  "ruled sticky top-[var(--nav-height)] z-20 -mr-4 py-3 pr-4 md:-mr-8 md:pr-8";
