import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

/** The public pages: the landing page first, then the two ways in. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/sign-up/`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${SITE_URL}/sign-in/`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
