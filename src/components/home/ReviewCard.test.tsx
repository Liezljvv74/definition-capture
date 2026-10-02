import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ReviewCard } from "@/components/home/ReviewCard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const html = (state: Parameters<typeof ReviewCard>[0]["state"]) =>
  renderToStaticMarkup(<ReviewCard state={state} />);

describe("ReviewCard", () => {
  it("names the due count and offers Review now", () => {
    const out = html({ kind: "due", count: 14 });
    expect(out).toContain("14 items need reviewing");
    expect(out).toContain("Review now");
    expect(out).toContain("Customise deck");
  });

  it("uses the singular for one", () => {
    expect(html({ kind: "due", count: 1 })).toContain("1 item needs reviewing");
  });

  it("offers new items when nothing is due", () => {
    const out = html({ kind: "new", count: 9 });
    expect(out).toContain("Nothing due. 9 new items to learn");
    expect(out).toContain("Learn new items");
  });

  it("is caught up with no button to press", () => {
    const out = html({ kind: "caughtUp", next: "tomorrow" });
    expect(out).toContain("All caught up. Next review tomorrow");
    expect(out).not.toContain("Review now");
  });

  it("points an account with no cards at Vocabulary", () => {
    expect(html({ kind: "noCards" })).toContain("Nothing to review yet");
    expect(html({ kind: "empty" })).toContain("Capture your first word");
    expect(html({ kind: "empty" })).toMatch(/href="\/vocabulary\/?"/);
  });

  it("never says how many cards a deck picks", () => {
    // Struck by the owner as demo speak.
    expect(html({ kind: "due", count: 3 })).not.toMatch(/picks up to/i);
  });

  it("shows a quote only when there is nothing to review", () => {
    const quote = { text: "A different language", by: "Federico Fellini" };
    const out = (state: Parameters<typeof ReviewCard>[0]["state"]) =>
      renderToStaticMarkup(<ReviewCard state={state} quote={quote} />);
    for (const state of [{ kind: "caughtUp", next: null }, { kind: "noCards" }, { kind: "empty" }] as const) {
      expect(out(state)).toContain("“A different language”");
      expect(out(state)).toContain("Federico Fellini");
    }
    expect(out({ kind: "due", count: 2 })).not.toContain("Fellini");
    expect(out({ kind: "new", count: 2 })).not.toContain("Fellini");
  });
});
