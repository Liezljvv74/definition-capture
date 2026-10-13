import type { CSSProperties } from "react";

/*
 * The narrated tour of the app, shown on the landing page and on Home. The
 * files are in `public/` and named in the proxy's matcher, so a signed-out
 * visitor can load them. `preload="none"` keeps the 6 MB file from loading
 * until someone presses play; the poster stands in until then. The captions
 * track is off by default and follows the narration line by line.
 */
export function DemoVideo({ headingId, tilt = -0.6 }: { headingId: string; tilt?: number }) {
  return (
    <section
      aria-labelledby={headingId}
      className="paste tape tape-right rounded-[6px_12px_4px_10px] border-[2.5px] border-ink bg-card p-3 pb-4 shadow-[4px_5px_0_var(--color-shadow)]"
      style={{ "--r": `${tilt}deg` } as CSSProperties}
    >
      <h2 id={headingId} className="hand-title mb-2 px-1 text-[1.3rem] leading-8">
        See it in use
      </h2>
      <video
        className="block aspect-video w-full rounded-[3px] border border-rule bg-ink"
        controls
        playsInline
        preload="none"
        poster="/captured-demo-poster.jpg"
      >
        <source src="/captured-demo.mp4" type="video/mp4" />
        <track kind="captions" src="/captured-demo.vtt" srcLang="en" label="English" />
        <a href="/captured-demo.mp4">Download the video</a>
      </video>
    </section>
  );
}
