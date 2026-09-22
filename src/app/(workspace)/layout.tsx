import { redirect } from "next/navigation";

import { MainNav } from "@/components/MainNav";
import { StoreErrorBanner } from "@/components/StoreErrorBanner";
import { serverUserId } from "@/lib/supabaseServer";

/**
 * Everything behind a sign-in lives under this layout, and nothing renders
 * until the server has said who is asking.
 *
 * `(workspace)` is a route group: the brackets keep it out of the URL, so
 * `/vocabulary` is still `/vocabulary`. What it buys is a single place to put the check,
 * instead of repeating it in seven pages or pushing the whole app behind a
 * client component that can only hide things after they have been sent.
 *
 * `src/proxy.ts` already turns an unsigned request away before it reaches
 * here, so in ordinary use this never redirects. It is here because a check
 * that only lives in one place stops being true the moment somebody edits that
 * place — narrow the proxy's matcher by accident and every page behind it
 * would swing open. This is the check that sits with the pages it protects.
 *
 * `serverUserId` verifies the token's signature rather than trusting the
 * cookie it came in.
 */
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const userId = await serverUserId();
  if (!userId) redirect("/sign-in");

  return (
    <>
      {/* The nav lives here rather than in the root layout so it exists only
          behind this check. Every destination in it is protected, and the
          Backup menu inside it reaches the account's lists — neither belongs
          on the sign-in page. */}
      <MainNav />
      <StoreErrorBanner />
      {children}
    </>
  );
}
