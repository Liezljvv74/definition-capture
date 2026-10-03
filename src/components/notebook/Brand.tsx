import Image from "next/image";

import { SITE_NAME } from "@/lib/site";

/** The app's name and logo as a small heading above a public form, as on the landing page. */
export function Brand() {
  return (
    <span className="hand-title mb-6 flex items-center gap-2 text-xl">
      <Image src="/captured-logo.png" alt="" width={32} height={32} />
      {SITE_NAME}
    </span>
  );
}
