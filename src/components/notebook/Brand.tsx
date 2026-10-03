import Image from "next/image";

import { SITE_NAME } from "@/lib/site";

/**
 * The app's name and logo, large and at the left of the page above a public
 * form, so it is plain which app is being signed in to. Sized up at the
 * owner's request on 3 October 2026; it was a small line above the form.
 */
export function Brand() {
  return (
    <header className="notebook-page mx-auto w-full max-w-6xl pt-8 sm:pt-10">
      <span className="hand-title flex items-center gap-3 text-4xl sm:gap-4 sm:text-6xl">
        <Image src="/captured-logo.png" alt="" width={96} height={96} priority className="size-14 sm:size-24" />
        {SITE_NAME}
      </span>
    </header>
  );
}
