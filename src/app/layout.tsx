import type { Metadata } from "next";

import { ImportLocalPrompt } from "@/components/ImportLocalPrompt";
import { MainNav } from "@/components/MainNav";
import { SignInGate } from "@/components/SignInGate";
import { StoreErrorBanner } from "@/components/StoreErrorBanner";
import { asset } from "@/lib/assetPath";

import "./globals.css";

export const metadata: Metadata = {
  title: "Definition Capture",
  description: "A personal list of terms and concepts worth remembering.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col">
        <PageBackground />
        <MainNav />
        {/* Every page reads a per-account table, so nothing below the nav is
            worth rendering until we know who is asking. The gate keeps
            `children` server-rendered — it only decides whether to show it. */}
        <SignInGate>
          <StoreErrorBanner />
          <ImportLocalPrompt />
          {children}
        </SignInGate>
      </body>
    </html>
  );
}

/**
 * The logo as a page backdrop, shaded 70% — the artwork is laid over the page
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
 * contrast — the logo shows through the page margins.
 *
 * The URL goes through `asset()` because a background image is not rewritten
 * for the GitHub Pages base path.
 */
function PageBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 bg-center bg-no-repeat
        [--logo-shade:70%] [background-size:min(70vmin,640px)]"
      style={{
        backgroundImage: `url(${asset("/captured-logo-bg.png")})`,
        opacity: "calc(100% - var(--logo-shade))",
      }}
    />
  );
}
