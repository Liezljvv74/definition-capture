import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

/**
 * One rule for every crawler, AI ones included (GPTBot, ClaudeBot,
 * PerplexityBot and Google-Extended all honour `*`): read the public pages,
 * stay out of the workspace. The workspace bounces them to sign-in anyway and
 * is marked noindex; this saves them the trip.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/home", "/vocabulary", "/word", "/phrases", "/phrase", "/verbs", "/grammar",
        "/rule", "/flashcards", "/settings", "/choose-password", "/auth",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
