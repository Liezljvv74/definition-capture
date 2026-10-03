import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ supported: true, playing: false }));

vi.mock("@/lib/useSpeech", () => ({
  useSpeechSupported: () => state.supported,
  useSpeech: () => ({ playing: state.playing, start: vi.fn(), stop: vi.fn() }),
}));

import { SpeakButton } from "@/components/SpeakButton";

const html = () =>
  renderToStaticMarkup(<SpeakButton speechKey="word:1" label="gehen" parts={() => []} />);

describe("SpeakButton", () => {
  it("is not shown where the browser cannot speak", () => {
    state.supported = false;
    expect(html()).toBe("");
    state.supported = true;
  });

  it("offers to read the label aloud", () => {
    state.playing = false;
    const out = html();
    expect(out).toContain('aria-label="Read aloud: gehen"');
    expect(out).toContain('aria-pressed="false"');
  });

  it("offers to stop while it is reading", () => {
    state.playing = true;
    const out = html();
    expect(out).toContain('aria-label="Stop reading"');
    expect(out).toContain('aria-pressed="true"');
    state.playing = false;
  });
});
