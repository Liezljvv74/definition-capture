import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const claims = vi.fn();
const signOut = vi.fn();
vi.mock("@/lib/supabaseServer", () => ({
  createSupabaseServerClient: async () => ({ auth: { getClaims: async () => ({ data: claims() }), signOut } }),
}));

const deleteUser = vi.fn();
const createClient = vi.fn((url: string, key: string) => ({ url, key, auth: { admin: { deleteUser } } }));
vi.mock("@supabase/supabase-js", () => ({ createClient: (url: string, key: string) => createClient(url, key) }));

import { DELETE } from "./route";

const del = (body: unknown) =>
  DELETE(new Request("http://x/api/account", { method: "DELETE", body: JSON.stringify(body) }));

describe("DELETE /api/account", () => {
  beforeEach(() => {
    claims.mockReturnValue({ claims: { sub: "u1", email: "Reader@example.com" } });
    deleteUser.mockResolvedValue({ error: null });
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://p.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("deletes the signed-in user, with the secret key, and clears the session", async () => {
    const res = await del({ email: " reader@EXAMPLE.com " });
    expect(res.status).toBe(200);
    expect(createClient.mock.calls[0][1]).toBe("sb_secret_test");
    expect(deleteUser).toHaveBeenCalledWith("u1");
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("takes who to delete from the token, never the request", async () => {
    await del({ email: "reader@example.com", userId: "someone-else" });
    expect(deleteUser).toHaveBeenCalledWith("u1");
  });

  it("refuses a signed-out caller", async () => {
    claims.mockReturnValue(null);
    expect((await del({ email: "reader@example.com" })).status).toBe(401);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it.each([[{ email: "other@example.com" }], [{}], ["not json"]])("refuses without the account's own email: %j", async (body) => {
    expect((await del(body)).status).toBe(400);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("refuses an account with no email on its token", async () => {
    claims.mockReturnValue({ claims: { sub: "u1" } });
    expect((await del({ email: "" })).status).toBe(400);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("fails without deleting when the key is missing", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    expect((await del({ email: "reader@example.com" })).status).toBe(502);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("reports a refused delete and keeps the session", async () => {
    deleteUser.mockResolvedValue({ error: { status: 500 } });
    expect((await del({ email: "reader@example.com" })).status).toBe(502);
    expect(signOut).not.toHaveBeenCalled();
  });
});
