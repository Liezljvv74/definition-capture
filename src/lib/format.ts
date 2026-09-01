/**
 * Date formatting. Only ever rendered after hydration (the store reports
 * `loaded: false` on the server), so locale differences can't cause a mismatch.
 */

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The short form shown throughout the app — e.g. "01 Sep 2026". No time, so the
 * column stays narrow; the exact timestamp is still available as a tooltip via
 * `formatDateTime`, and sorting always uses the full ISO string underneath.
 */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
