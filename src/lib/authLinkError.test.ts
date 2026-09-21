import { describe, expect, it } from "vitest";

import { messageForCode } from "@/lib/authLinkError";

/**
 * The sign-in screen used to render whatever arrived in `error_description` or
 * `error`, capitalised, in a red alert of its own. React escapes it, so it was
 * never a scripting hole, but a link to
 * `/sign-in/?error=Your+account+is+locked,+call+…` made this app say that in
 * its own voice, which is most of a phishing page for free.
 *
 * These tests are the closed table. If someone widens it back to echoing the
 * URL, the last one here fails.
 */
describe("messageForCode", () => {
  it("has its own words for the failures worth explaining", () => {
    expect(messageForCode("otp_expired")).toContain("expired");
    expect(messageForCode("access_denied")).toContain("already been used");
    expect(messageForCode("incomplete")).toContain("incomplete");
    expect(messageForCode("exchange_failed")).toContain("could not be completed");
    expect(messageForCode("unconfigured")).toContain("Supabase credentials");
  });

  it("falls back to one generic sentence for a code it does not know", () => {
    const generic = messageForCode("refused");
    expect(generic).toBe("That sign-in link could not be used. Ask for a new one below.");
    expect(messageForCode("something_new_from_supabase")).toBe(generic);
    expect(messageForCode("")).toBe(generic);
  });

  it("never repeats back what the URL said", () => {
    const attacks = [
      "Your+account+is+locked,+call+0800+123+456",
      "Your account is locked, call 0800 123 456",
      "<img src=x onerror=alert(1)>",
      "__proto__",
      "constructor",
      "toString",
    ];
    for (const attack of attacks) {
      const shown = messageForCode(attack);
      expect(shown).toBe("That sign-in link could not be used. Ask for a new one below.");
      // Belt and braces: nothing distinctive from the input survives.
      expect(shown).not.toContain("0800");
      expect(shown).not.toContain("<");
    }
  });
});
