import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { TutorSidebar } from "./TutorSidebar";

const html = (props: Partial<Parameters<typeof TutorSidebar>[0]> = {}) =>
  renderToStaticMarkup(<TutorSidebar conversations={[]} activeId={null} {...props} />);

describe("TutorSidebar", () => {
  it("has the search box, no New conversation button, and says when there are none", () => {
    const out = html();
    expect(out).toContain("Search conversations");
    // The owner's decision (7 October 2026): a conversation is started from the box under Tutor, not the sidebar.
    expect(out).not.toContain("New conversation");
    expect(out).toContain("No conversations yet.");
  });

  it("lists each conversation by name on one line, linking to it, the open one marked", () => {
    const out = html({ conversations: [{ id: "c1", name: "Dative" }, { id: "c2", name: "Word order" }], activeId: "c2" });
    expect(out).toMatch(/href="\/tutor\/?\?c=c1"/);
    expect(out).toContain("truncate");
    expect(out).toMatch(/aria-current="page"[^>]*>Word order|Word order[^<]*<\/a>/);
    expect(out).toContain("Actions for Dative");
  });

  it("has a Conversations button for phones", () => {
    expect(html()).toContain(">Conversations<");
  });
});
