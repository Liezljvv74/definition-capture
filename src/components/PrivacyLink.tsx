"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The privacy notice, fixed at the foot of every page, just right of the red
 * margin line (which ends at 32px, or 71px from 48rem; see `notebook-margin`).
 * Under the modal overlay (z-50) like the logo, so a dialog still covers it.
 * Not shown on the notice itself, where it would only link back to the page.
 */
export function PrivacyLink() {
  if (usePathname().startsWith("/privacy")) return null;
  return (
    <Link
      href="/privacy"
      className="fixed bottom-2 left-10 z-40 rounded-sm bg-card/90 px-1.5 text-sm text-link underline md:left-20"
    >
      Privacy
    </Link>
  );
}
