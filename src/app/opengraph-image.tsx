import { ImageResponse } from "next/og";

import { SITE_NAME } from "@/lib/site";

export const alt = `${SITE_NAME}: a personal glossary for language learners`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The picture a shared link shows, drawn at build time with Next's own image
 * generator rather than a design file that would drift from the app. The
 * logo's navy and the review card's pale blue.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: "100%", height: "100%", padding: 80, background: "#1b4390", color: "#d7e6f4" }}>
        <div style={{ fontSize: 40 }}>{SITE_NAME}</div>
        <div style={{ fontSize: 72, fontWeight: 700, color: "#ffffff", marginTop: 24, lineHeight: 1.1 }}>
          Your personal glossary for learning a language
        </div>
      </div>
    ),
    size,
  );
}
