import { beforeEach, describe, expect, it, vi } from "vitest";

import WorkspaceLayout from "./layout";

/**
 * The second session check — the one that sits with the pages it protects.
 *
 * It exists because a check living in only one place stops being true the
 * moment somebody edits that place: narrow the proxy's matcher by accident
 * and every page behind it swings open. So the thing worth asserting here is
 * not "a signed-out request is refused" in general — `proxy.test.ts` covers
 * that — but that this layout refuses *on its own*, with the proxy entirely
 * out of the picture. Nothing in this file imports or runs the proxy.
 */
const { redirect, serverUserId } = vi.hoisted(() => ({
  // The real `redirect` throws to unwind rendering. A mock that merely
  // returns would let the layout fall through to its `return` and hide the
  // very bug this test is for.
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
  serverUserId: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/supabaseServer", () => ({ serverUserId }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WorkspaceLayout", () => {
  it("refuses when there is no session, even though the proxy never ran", async () => {
    serverUserId.mockResolvedValue(null);

    await expect(WorkspaceLayout({ children: null })).rejects.toThrow(
      "NEXT_REDIRECT:/sign-in",
    );
    expect(redirect).toHaveBeenCalledWith("/sign-in");
  });

  it("renders when there is a session", async () => {
    serverUserId.mockResolvedValue("user-1");

    await expect(WorkspaceLayout({ children: null })).resolves.toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("asks the server, not the cookie", async () => {
    // `serverUserId` wraps `getClaims`, which verifies the token's signature.
    // If this layout ever starts reading a session straight out of a cookie,
    // this call disappears and the test says so.
    serverUserId.mockResolvedValue("user-1");
    await WorkspaceLayout({ children: null });
    expect(serverUserId).toHaveBeenCalledTimes(1);
  });
});
