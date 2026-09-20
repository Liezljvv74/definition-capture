/**
 * Builds a URL for a file in `public/`.
 *
 * Currently a no-op: `NEXT_PUBLIC_BASE_PATH` is unset now that the GitHub
 * Pages build is gone, so this hands back the path it was given.
 *
 * It is kept rather than inlined because the problem it solves comes back the
 * moment the app is served from a sub-path again. Next rewrites the `href` of
 * a `<Link>` for you but not the `src` of an image, so anything pointing at
 * `public/` has to add the base path itself — and having one place to do that
 * is the difference between setting `basePath` and hunting for broken logos.
 */

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function asset(path: string): string {
  return `${BASE_PATH}${path}`;
}
