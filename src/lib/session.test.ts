import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  changePassword,
  sendMagicLink,
  sendPasswordReset,
  signInWithPassword,
  signUpWithPassword,
} from "@/lib/session";

// Each of the five Auth calls a bot could abuse must hand Supabase the
// Turnstile token, and must not send a `captchaToken` key at all when there is
// none: that is what keeps the app working where captcha is off.
const auth = {
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  signInWithOtp: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
};
vi.mock("@/lib/supabaseClient", () => ({
  getSupabase: () => ({ auth }),
  authRedirectUrl: () => "http://localhost:3000/auth/callback",
  passwordResetUrl: () => "http://localhost:3000/auth/reset",
}));

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of Object.values(auth)) fn.mockResolvedValue({ data: {}, error: null });
});

/** The options object the call handed Supabase, wherever that call keeps it. */
const optionsOf = (fn: typeof auth.signUp) => {
  const arg = fn.mock.calls[0];
  return fn === auth.resetPasswordForEmail ? arg[1] : arg[0].options;
};

const calls: [string, typeof auth.signUp, (token?: string) => Promise<unknown>][] = [
  ["signUpWithPassword", auth.signUp, (t) => signUpWithPassword("a@b.c", "secret1", t)],
  ["signInWithPassword", auth.signInWithPassword, (t) => signInWithPassword("a@b.c", "secret1", t)],
  [
    "changePassword (current-password check)",
    auth.signInWithPassword,
    (t) => changePassword("a@b.c", "old123", "new123", t),
  ],
  ["sendPasswordReset", auth.resetPasswordForEmail, (t) => sendPasswordReset("a@b.c", t)],
  ["sendMagicLink", auth.signInWithOtp, (t) => sendMagicLink("a@b.c", t)],
];

describe.each(calls)("%s", (_name, fn, call) => {
  it("passes the token to Supabase as options.captchaToken", async () => {
    await call("tok-1");
    expect(optionsOf(fn).captchaToken).toBe("tok-1");
  });

  it.each([undefined, ""])("sends no captchaToken key for %j", async (token) => {
    await call(token);
    expect(optionsOf(fn)).not.toHaveProperty("captchaToken");
  });
});

describe("a refused captcha", () => {
  it("is reported as something the reader can act on, not as a wrong password", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: "captcha verification process failed" },
    });
    const message = "Please complete the check and try again.";
    expect((await signInWithPassword("a@b.c", "x")).error).toBe(message);
    expect((await changePassword("a@b.c", "x", "y")).error).toBe(message);
  });
});
