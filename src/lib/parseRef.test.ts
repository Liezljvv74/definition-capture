import { describe, expect, it } from "vitest";

import { parseRef, type RefToken } from "@/lib/parseRef";

const kinds = (text: string) => parseRef(text).map((token) => token.kind);
const only = (text: string): RefToken => {
  const tokens = parseRef(text);
  expect(tokens).toHaveLength(1);
  return tokens[0];
};

/**
 * Everything `parseRef` returns that is not `text` becomes a link in
 * `RefText`, so the classification is a security boundary as much as a
 * convenience: a word promoted to `internal` is rendered same-tab with no
 * `rel="noopener"`, and one promoted to `url` gets an href straight out of
 * user-controlled text.
 */
describe("parseRef — link safety", () => {
  it("does not treat a protocol-relative URL as an internal path", () => {
    // `//evil.com` looks like a path but leaves the site.
    expect(kinds("//evil.com")).toEqual(["text"]);
  });

  it("does not treat a backslash path as an internal path", () => {
    // The same attack wearing a different hat: browsers fold `\` to `/` in
    // http(s) URLs, so `/\evil.com` resolves to http://evil.com/ while
    // looking like a local path. A guard that only counts slashes misses it.
    expect(kinds("/\\evil.com")).toEqual(["text"]);
    expect(kinds("/\\\\evil.com")).toEqual(["text"]);
  });

  it("still recognises ordinary internal paths", () => {
    expect(only("/terms")).toEqual({
      kind: "internal",
      href: "/terms",
      label: "/terms",
    });
    expect(only("/term?id=abc123")).toMatchObject({ kind: "internal" });
  });

  it("refuses every scheme except http and https", () => {
    // `classify` allow-lists rather than blocks, so these fall through to
    // text. Asserted explicitly because a future "accept any scheme" tweak
    // would turn the Ref field into a javascript: link.
    for (const hostile of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ]) {
      expect(kinds(hostile)).toEqual(["text"]);
    }
  });
});

describe("parseRef — classification", () => {
  it("links an http(s) URL and drops the scheme for display", () => {
    expect(only("https://example.com/docs")).toEqual({
      kind: "url",
      href: "https://example.com/docs",
      label: "example.com/docs",
    });
  });

  it("links a bare www host by adding https", () => {
    expect(only("www.example.com")).toEqual({
      kind: "url",
      href: "https://www.example.com",
      label: "www.example.com",
    });
  });

  it("needs a dot after www, so a single label is just text", () => {
    expect(kinds("www.example")).toEqual(["text"]);
  });

  it("links an anchor but not a bare or doubled hash", () => {
    expect(only("#definition")).toMatchObject({ kind: "anchor" });
    expect(only("#Übersicht")).toMatchObject({ kind: "anchor" });
    expect(kinds("#")).toEqual(["text"]);
    expect(kinds("#a#b")).toEqual(["text"]);
  });
});

describe("parseRef — term links", () => {
  it("reads [[Name]] as a term, keeping the name verbatim", () => {
    expect(only("[[Closure]]")).toEqual({ kind: "term", name: "Closure" });
    // Accents and spaces survive; this is a language app and the name is a key.
    expect(only("[[der Löwe]]")).toEqual({ kind: "term", name: "der Löwe" });
  });

  it("trims inside the brackets but leaves an empty one as text", () => {
    expect(only("[[  Closure  ]]")).toEqual({ kind: "term", name: "Closure" });
    expect(kinds("[[]]")).toEqual(["text"]);
    expect(kinds("[[   ]]")).toEqual(["text"]);
  });

  it("does not read a name containing a bracket or a newline", () => {
    expect(kinds("[[a[b]]")).toEqual(["text"]);
    expect(kinds("[[Wort\nzeile]]")).toEqual(["text"]);
  });

  it("keeps adjacent term links separate with nothing between them", () => {
    expect(parseRef("[[A]][[B]]")).toEqual([
      { kind: "term", name: "A" },
      { kind: "term", name: "B" },
    ]);
  });

  it("keeps the text around a term link", () => {
    expect(parseRef("a[[B]]c")).toEqual([
      { kind: "text", value: "a" },
      { kind: "term", name: "B" },
      { kind: "text", value: "c" },
    ]);
  });
});

describe("parseRef — punctuation and spacing", () => {
  it("peels wrapping punctuation off a link", () => {
    expect(parseRef("(https://example.com).")).toEqual([
      { kind: "text", value: "(" },
      { kind: "url", href: "https://example.com", label: "example.com" },
      { kind: "text", value: ")." },
    ]);
  });

  it("takes a closing bracket that belongs to the URL with it — a known limit", () => {
    // A Wikipedia link with a parenthesised title loses its last bracket,
    // which matters for a language app citing German grammar pages. Pinned
    // rather than endorsed: change it deliberately, not by accident.
    const tokens = parseRef("https://de.wikipedia.org/wiki/Tür_(Architektur)");
    expect(tokens[0]).toMatchObject({
      kind: "url",
      href: "https://de.wikipedia.org/wiki/Tür_(Architektur",
    });
    expect(tokens[1]).toEqual({ kind: "text", value: ")" });
  });

  it("preserves the original spacing exactly", () => {
    // The field round-trips through this on every render, so spacing that
    // drifted would visibly rewrite what someone typed.
    for (const input of [
      "see  https://example.com   and /terms",
      "a [[B]] c",
      "  leading and trailing  ",
      "plain words only",
    ]) {
      const rebuilt = parseRef(input)
        .map((token) =>
          token.kind === "text"
            ? token.value
            : token.kind === "term"
              ? `[[${token.name}]]`
              : token.href,
        )
        .join("");
      expect(rebuilt).toBe(input);
    }
  });

  it("returns nothing for an empty field", () => {
    expect(parseRef("")).toEqual([]);
  });

  it("merges neighbouring text rather than emitting a run of fragments", () => {
    expect(parseRef("just some words")).toEqual([
      { kind: "text", value: "just some words" },
    ]);
  });
});
