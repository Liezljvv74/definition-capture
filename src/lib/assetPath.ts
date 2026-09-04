/**
 * Builds a URL for a file in `public/`.
 *
 * The GitHub Pages build serves the app from a sub-path (`/definition-capture`),
 * so a bare `/captured-logo.png` would 404 there. Next rewrites the `href` of a
 * `<Link>` for you, but not the `src` of an image, so anything pointing at
 * `public/` has to add the base path itself.
 *
 * `NEXT_PUBLIC_BASE_PATH` is set from the same value as `basePath` in
 * `next.config.ts`, so the two cannot drift apart.
 */

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function asset(path: string): string {
  return `${BASE_PATH}${path}`;
}
