import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ recordsError: null as string | null }));

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("mode=due") }));
vi.mock("@/lib/useVerbTables", () => ({ useVerbTables: () => ({ tables: [], loaded: true, error: null }) }));
vi.mock("@/lib/useTenseRecords", () => ({
  useTenseRecords: () => ({ records: [], loaded: true, error: state.recordsError, reload: () => {} }),
}));
vi.mock("@/lib/useSettings", () => ({ useSettings: () => ({ settings: { answerSeparators: ",/" }, loaded: true }) }));

import PractisePage from "@/app/(workspace)/verbs/practise/page";

describe("the practice session page", () => {
  it("says the results could not be loaded rather than that there is nothing to practise", () => {
    state.recordsError = "Could not load your verb practice: offline.";
    const out = renderToStaticMarkup(<PractisePage />);
    expect(out).toContain("Could not load your verb practice: offline.");
    expect(out).not.toContain("Nothing to practise");
  });

  it("says there is nothing to practise when there really is nothing", () => {
    state.recordsError = null;
    expect(renderToStaticMarkup(<PractisePage />)).toContain("Nothing to practise");
  });
});
