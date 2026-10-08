// Multi-user isolation test, app layer: each account signs in through a real
// browser on localhost (pointed at the LOCAL Supabase copy) and tries the
// other accounts' pages and tutor routes. Run after db-test.cjs, whose seeded
// accounts and ids it uses (supabase/tests/multiuser/README.md).
const path = require("node:path");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const { createRequire } = require("node:module");

const project = process.cwd();
const outDir = path.join(project, "test-results", "multiuser");
const { chromium } = createRequire(path.join(project, "package.json"))("@playwright/test");
const BASE = "http://localhost:3000";
const PASSWORD = "MultiUser-Test-2026!";
const { meta } = JSON.parse(fs.readFileSync(path.join(outDir, "db-results.json"), "utf8"));
const LETTERS = ["A", "B", "C"];

const psql = (q) =>
  execFileSync("docker", ["exec", "-i", "supabase_db_Captured", "psql", "-U", "postgres", "-t", "-A", "-q"], { input: q, encoding: "utf8" }).trim();
const usage = () => psql("select count(*) from public.tutor_usage where user_id in (select id from auth.users where email like '%@multiuser.test')");

const results = [];
const record = (group, attacker, victim, target, action, expected, pass, detail) => results.push({ group, attacker, victim, target, action, expected, pass, detail });

async function post(page, url, body) {
  return page.evaluate(
    async ([u, b]) => {
      const r = await fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
      let j = null;
      try { j = await r.json(); } catch {}
      return { status: r.status, body: j };
    },
    [url, body],
  );
}

async function main() {
  const usageBefore = usage();
  const browser = await chromium.launch();

  for (const X of LETTERS) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/sign-in/`);
    await page.getByRole("textbox", { name: "Email address" }).fill(meta[X].email);
    await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/home\/?/, { timeout: 30000 });

    // Own lists show only own items.
    await page.goto(`${BASE}/vocabulary/`);
    await page.getByText(`Wort${X}`).first().waitFor({ timeout: 20000 }).catch(() => {});
    const vocab = await page.content();
    const foreignWords = LETTERS.filter((L) => L !== X && vocab.includes(`Wort${L}`));
    record("App pages", X, "others", "/vocabulary", "word list shows the other accounts' words", "only own words", vocab.includes(`Wort${X}`) && foreignWords.length === 0, foreignWords.length ? `shows ${foreignWords.join(", ")}` : "own word only");
    await page.goto(`${BASE}/grammar/`);
    await page.getByText(`Rule ${X}`).first().waitFor({ timeout: 20000 }).catch(() => {});
    const grammar = await page.content();
    const foreignRules = LETTERS.filter((L) => L !== X && grammar.includes(`Rule ${L}`));
    record("App pages", X, "others", "/grammar", "rule list shows the other accounts' rules", "only own rules", grammar.includes(`Rule ${X}`) && foreignRules.length === 0, foreignRules.length ? `shows ${foreignRules.join(", ")}` : "own rule only");
    await page.goto(`${BASE}/tutor/`);
    const tutor = await page.content();
    const foreignConvs = LETTERS.filter((L) => L !== X && tutor.includes(`Conversation ${L}`));
    record("App pages", X, "others", "/tutor sidebar", "conversation list shows the other accounts' conversations", "only own", tutor.includes(`Conversation ${X}`) && foreignConvs.length === 0, foreignConvs.length ? `shows ${foreignConvs.join(", ")}` : "own conversation only");

    for (const Y of LETTERS) {
      if (X === Y) continue;
      const v = meta[Y];
      for (const [route, id, notFound, secret] of [
        ["rule", v.rule, "Rule not found", `rule text ${Y}`],
        ["word", v.word, "Word not found", `secret meaning ${Y}`],
        ["phrase", v.phrase, "Phrase not found", `phrase meaning ${Y}`],
      ]) {
        await page.goto(`${BASE}/${route}/?id=${id}`);
        await page.getByText(notFound).first().waitFor({ timeout: 20000 }).catch(() => {});
        const html = await page.content();
        record("App pages", X, Y, `/${route}?id=…`, `open the other account's ${route} by its id`, `"${notFound}"`, html.includes(notFound) && !html.includes(secret), html.includes(secret) ? "content shown" : html.includes(notFound) ? notFound : "unexpected page");
      }
      await page.goto(`${BASE}/tutor/?c=${v.conv}`);
      const conv = await page.content();
      record("App pages", X, Y, "/tutor?c=…", "open the other account's tutor conversation", '"That conversation was not found."', conv.includes("That conversation was not found.") && !conv.includes(`Zauberwort${Y}`), conv.includes(`Zauberwort${Y}`) ? "content shown" : "not found");

      let r = await post(page, "/api/tutor/", { question: "Tell me more", conversationId: v.conv, answerIn: "native" });
      record("Tutor routes", X, Y, "POST /api/tutor", "ask a question inside the other account's conversation", "404, nothing spent", r.status === 404, `${r.status} ${JSON.stringify(r.body)}`);
      r = await post(page, "/api/tutor/merge/", { conversationId: v.conv, exchangeIds: v.exchanges, answerIn: "native" });
      record("Tutor routes", X, Y, "POST /api/tutor/merge", "merge the other account's answers in their conversation", "404, nothing spent", r.status === 404, `${r.status} ${JSON.stringify(r.body)}`);
      r = await post(page, "/api/tutor/merge/", { conversationId: meta[X].conv, exchangeIds: v.exchanges, answerIn: "native" });
      record("Tutor routes", X, Y, "POST /api/tutor/merge", "merge the other account's answers into own conversation", "400, nothing spent", r.status === 400, `${r.status} ${JSON.stringify(r.body)}`);
      r = await post(page, "/api/tutor/search/", { query: `Zauberwort${Y}` });
      const hits = (r.body?.results ?? []).filter((h) => h.conversationId === v.conv).length;
      record("Tutor routes", X, Y, "POST /api/tutor/search", "search for words only in the other account's answers", "no results from them", r.status === 200 && hits === 0, `${r.status}, ${hits} of their conversations found`);
    }
    await ctx.close();
  }

  // A visitor who is not signed in.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  for (const [url, body] of [["/api/tutor/", { question: "x" }], ["/api/tutor/merge/", { conversationId: meta.A.conv, exchangeIds: meta.A.exchanges }], ["/api/tutor/search/", { query: "Zauberwort" }]]) {
    const r = await post(page, url, body);
    record("Signed-out visitor", "anon", "all", `POST ${url}`, "call the tutor route", "401", r.status === 401, String(r.status));
  }
  for (const route of [`/tutor/?c=${meta.A.conv}`, `/rule/?id=${meta.A.rule}`, `/word/?id=${meta.A.word}`]) {
    await page.goto(`${BASE}${route}`);
    const landed = new URL(page.url()).pathname;
    record("Signed-out visitor", "anon", "A", route.split("?")[0], "open an account's page", "sent to the landing page", landed === "/", `landed on ${landed}`);
  }
  await browser.close();

  const usageAfter = usage();
  record("Integrity", "-", "all", "tutor_usage", "messages spent by the refused tutor attempts", "none", usageBefore === usageAfter, `${usageBefore} before, ${usageAfter} after`);

  const summary = { total: results.length, passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass) };
  fs.writeFileSync(path.join(outDir, "app-results.json"), JSON.stringify({ summary, results }, null, 1));
  console.log(`app: ${summary.passed}/${summary.total} passed; failed: ${summary.failed.length}`);
  for (const f of summary.failed) console.log(" FAIL", f.group, f.attacker, "->", f.victim, f.target, f.action, "|", f.detail);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
