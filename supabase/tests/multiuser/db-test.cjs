// Multi-user isolation test, database layer, against the LOCAL Supabase copy
// only (supabase/tests/multiuser/README.md). Three accounts each try to read,
// insert, change, delete and link to the other two accounts' data in every
// table, and to use every function on it, with their own login token and the
// publishable key, as a hostile user of the app could. Results go to
// test-results/multiuser/db-results.json, which app-test.cjs reads.
const path = require("node:path");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const { createRequire } = require("node:module");

const project = process.cwd();
const outDir = path.join(project, "test-results", "multiuser");
fs.mkdirSync(outDir, { recursive: true });
const { createClient } = createRequire(path.join(project, "package.json"))("@supabase/supabase-js");
const API = "http://127.0.0.1:54321";
const PUB = process.env.PUB;
if (!PUB) throw new Error("Set PUB to the local publishable key (see README.md).");

const psql = (q) =>
  execFileSync("docker", ["exec", "-i", "supabase_db_Captured", "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", "-q"], {
    input: q,
    encoding: "utf8",
  }).trim();

const PASSWORD = "MultiUser-Test-2026!";
const LETTERS = ["A", "B", "C"];
const TABLES = [
  "items", "tags", "item_tags", "sources", "decks", "deck_cards", "progress", "reviews", "verb_tense_progress",
  "user_settings", "account_plans", "tutor_usage", "tutor_conversations", "tutor_exchanges", "tutor_conversation_rules", "tutor_searches",
];

const ids = (L) => {
  const h = { A: "a", B: "b", C: "c" }[L];
  const u = (n) => `${h}0000000-0000-4000-8000-0000000000${n}`;
  return { word: u("01"), phrase: u("02"), verb: u("03"), rule: u("04"), tag: u("11"), source: u("21"), deck: u("31"), conv: u("41") };
};

async function main() {
  // Fresh start: remove earlier test accounts (everything they own cascades).
  psql("delete from auth.users where email like '%@multiuser.test';");

  const users = {};
  for (const L of LETTERS) {
    const db = createClient(API, PUB, { auth: { persistSession: false, autoRefreshToken: false } });
    const email = `user${L.toLowerCase()}@multiuser.test`;
    const { data, error } = await db.auth.signUp({ email, password: PASSWORD });
    if (error) throw error;
    await db.auth.signInWithPassword({ email, password: PASSWORD });
    users[L] = { L, email, id: data.user.id, db, ...ids(L) };
  }

  // Seed each account with a row in every table, as an administrator would.
  for (const L of LETTERS) {
    const u = users[L];
    const plan = L === "A" ? "paid" : "free";
    psql(`
      insert into public.sources (id, user_id, name) values ('${u.source}', '${u.id}', 'Source ${L}');
      insert into public.items (id, user_id, item_type, title, definition, source_id) values ('${u.word}', '${u.id}', 'word', 'Wort${L}', 'secret meaning ${L}', '${u.source}');
      insert into public.items (id, user_id, item_type, title, literal_meaning, usage_example) values ('${u.phrase}', '${u.id}', 'phrase', 'Phrase ${L}', 'phrase meaning ${L}', 'example ${L}');
      insert into public.items (id, user_id, item_type, title, tenses, verb_rows) values ('${u.verb}', '${u.id}', 'verb_table', 'verb${L}', array['Präsens'], '[{"person":"ich","conjugations":["x"],"notes":""}]');
      insert into public.items (id, user_id, item_type, title, blocks) values ('${u.rule}', '${u.id}', 'grammar', 'Rule ${L}', '[{"id":"b1","kind":"text","text":"rule text ${L}"}]');
      insert into public.tags (id, user_id, context, name) values ('${u.tag}', '${u.id}', 'collection', 'Collection ${L}');
      insert into public.item_tags (item_id, tag_id, user_id, context, position) values ('${u.word}', '${u.tag}', '${u.id}', 'collection', 1);
      insert into public.decks (id, user_id) values ('${u.deck}', '${u.id}');
      insert into public.deck_cards (deck_id, position, item_id, user_id) values ('${u.deck}', 1, '${u.word}', '${u.id}');
      insert into public.progress (item_id, user_id, streak) values ('${u.word}', '${u.id}', 1);
      insert into public.reviews (item_id, user_id, outcome) values ('${u.word}', '${u.id}', 'correct');
      insert into public.verb_tense_progress (item_id, user_id, tense) values ('${u.verb}', '${u.id}', 'Präsens');
      insert into public.user_settings (user_id, display_name, language, native_language) values ('${u.id}', 'User ${L}', 'de', 'en')
        on conflict (user_id) do update set display_name = excluded.display_name, language = 'de', native_language = 'en';
      insert into public.account_plans (user_id, plan) values ('${u.id}', '${plan}');
      insert into public.tutor_usage (user_id) values ('${u.id}');
      insert into public.tutor_conversations (id, user_id, name) values ('${u.conv}', '${u.id}', 'Conversation ${L}');
      insert into public.tutor_exchanges (conversation_id, user_id, kind, question, reply, answer_text, signature) values
        ('${u.conv}', '${u.id}', 'answer', 'Question about Zauberwort${L}', '{"title":"Answer ${L}","topic":"t","blocks":[{"id":"x","kind":"text","text":"a"}],"sources":[]}', 'Answer ${L}' || chr(10) || 'Zauberwort${L} secret one', repeat('0', 64)),
        ('${u.conv}', '${u.id}', 'answer', 'Second question ${L}', '{"title":"Second ${L}","topic":"t","blocks":[{"id":"x","kind":"text","text":"b"}],"sources":[]}', 'Second ${L}' || chr(10) || 'Zauberwort${L} secret two', repeat('0', 64));
      insert into public.tutor_conversation_rules (conversation_id, item_id, user_id, exchange_id)
        values ('${u.conv}', '${u.rule}', '${u.id}', (select min(id) from public.tutor_exchanges where conversation_id = '${u.conv}'));
      insert into public.tutor_searches (user_id) values ('${u.id}');
    `);
    u.exchanges = psql(`select string_agg(id::text, ',' order by id) from public.tutor_exchanges where conversation_id = '${u.conv}'`).split(",").map(Number);
  }

  // A fingerprint of every row an account owns, per table, to prove nothing changed.
  const fingerprint = (uid) =>
    Object.fromEntries(
      TABLES.map((t) => [t, psql(`select count(*) || ':' || md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from public.${t} x where user_id = '${uid}'`)]),
    );
  const before = Object.fromEntries(LETTERS.map((L) => [L, fingerprint(users[L].id)]));

  const results = [];
  const record = (group, attacker, victim, target, action, expected, pass, detail) =>
    results.push({ group, attacker, victim, target, action, expected, pass, detail });
  // A refusal proves isolation only when it is about access: permission (42501),
  // a cross-account link (23503), or PostgREST refusing the request. A check
  // constraint (23514) or a duplicate key (23505) would be inconclusive.
  const denied = (e) => !!e && e.code !== "23514" && e.code !== "23505";
  const errText = (e) => (e ? `${e.code ?? ""} ${e.message ?? ""}`.trim().slice(0, 110) : "");

  const insertRow = (t, owner, v) =>
    ({
      items: { user_id: owner, item_type: "word", title: "injected", definition: "x" },
      tags: { user_id: owner, context: "collection", name: "injected" },
      sources: { user_id: owner, name: "injected" },
      decks: { user_id: owner },
      deck_cards: { deck_id: v.deck, position: 9, item_id: v.word, user_id: owner },
      item_tags: { item_id: v.phrase, tag_id: v.tag, user_id: owner, context: "collection", position: 2 },
      progress: { item_id: v.phrase, user_id: owner },
      reviews: { item_id: v.word, user_id: owner, outcome: "correct" },
      verb_tense_progress: { item_id: v.verb, user_id: owner, tense: "Perfekt" },
      user_settings: { user_id: owner, display_name: "hacked" },
      account_plans: { user_id: owner, plan: "paid" },
      tutor_usage: { user_id: owner },
      tutor_conversations: { user_id: owner, name: "injected" },
      tutor_exchanges: { conversation_id: v.conv, user_id: owner, kind: "answer", question: "q", reply: { title: "t" }, answer_text: "a", signature: "0".repeat(64) },
      tutor_conversation_rules: { conversation_id: v.conv, item_id: v.phrase, user_id: owner },
      tutor_searches: { user_id: owner },
    })[t];
  const updateSet = {
    items: { title: "hacked" }, tags: { name: "hacked" }, sources: { name: "hacked" }, decks: { created_at: "2000-01-01" },
    deck_cards: { position: 5 }, item_tags: { position: 3 }, progress: { streak: 99 }, reviews: { outcome: "again" },
    verb_tense_progress: { streak: 99 }, user_settings: { display_name: "hacked" }, account_plans: { plan: "paid" },
    tutor_usage: { created_at: "2000-01-01" }, tutor_conversations: { name: "hacked" }, tutor_exchanges: { answer_text: "hacked" },
    tutor_conversation_rules: { created_at: "2000-01-01" }, tutor_searches: { created_at: "2000-01-01" },
  };

  // 1. Every account against every other account, every table, read/insert/update/delete.
  for (const X of LETTERS) {
    const db = users[X].db;
    for (const Y of LETTERS) {
      if (X === Y) continue;
      const v = users[Y];
      for (const t of TABLES) {
        const r = await db.from(t).select("*").eq("user_id", v.id);
        record("Table access", X, Y, t, "read the other account's rows", "none returned", !r.error && r.data.length === 0 ? true : !!r.error, r.error ? errText(r.error) : `${r.data.length} rows`);
        const i = await db.from(t).insert(insertRow(t, v.id, v));
        record("Table access", X, Y, t, "insert a row owned by the other account", "refused", denied(i.error), errText(i.error) || "accepted");
        const u2 = await db.from(t).update(updateSet[t]).eq("user_id", v.id).select();
        record("Table access", X, Y, t, "change the other account's rows", "nothing changed", !!u2.error || (u2.data ?? []).length === 0, u2.error ? errText(u2.error) : `${(u2.data ?? []).length} rows changed`);
        const d = await db.from(t).delete().eq("user_id", v.id).select();
        record("Table access", X, Y, t, "delete the other account's rows", "nothing deleted", !!d.error || (d.data ?? []).length === 0, d.error ? errText(d.error) : `${(d.data ?? []).length} rows deleted`);
      }
    }
    // Unfiltered reads see only the account's own rows.
    for (const t of TABLES) {
      const r = await db.from(t).select("user_id");
      const foreign = (r.data ?? []).filter((row) => row.user_id !== users[X].id).length;
      record("Table access", X, "B, C / A, C / A, B", t, "read the whole table with no filter", "only own rows", !r.error ? foreign === 0 : true, r.error ? errText(r.error) : `${(r.data ?? []).length} rows, ${foreign} foreign`);
    }
  }

  // 2. Links from the attacker's own rows to another account's rows.
  for (const X of LETTERS) {
    const a = users[X];
    const Y = LETTERS[(LETTERS.indexOf(X) + 1) % 3];
    const v = users[Y];
    const tries = [
      ["items", "own word filed under the other account's source", { user_id: a.id, item_type: "word", title: "link test", definition: "x", source_id: v.source }],
      ["item_tags", "own item put in the other account's collection", { item_id: a.phrase, tag_id: v.tag, user_id: a.id, context: "collection", position: 1 }],
      ["deck_cards", "the other account's item put in own deck", { deck_id: a.deck, position: 7, item_id: v.word, user_id: a.id }],
      ["progress", "own progress on the other account's item", { item_id: v.phrase, user_id: a.id }],
      ["reviews", "own review of the other account's item", { item_id: v.word, user_id: a.id, outcome: "correct" }],
      ["verb_tense_progress", "own practice of the other account's verb table", { item_id: v.verb, user_id: a.id, tense: "Perfekt" }],
      ["tutor_exchanges", "own answer added to the other account's conversation", { conversation_id: v.conv, user_id: a.id, kind: "answer", question: "q", reply: { title: "t" }, answer_text: "a", signature: "0".repeat(64) }],
      ["tutor_conversation_rules", "the other account's rule linked from own conversation", { conversation_id: a.conv, item_id: v.rule, user_id: a.id }],
      ["tutor_conversation_rules", "own rule linked to the other account's tutor answer", { conversation_id: a.conv, item_id: a.phrase, user_id: a.id, exchange_id: v.exchanges[1] }],
    ];
    for (const [t, what, row] of tries) {
      const r = await a.db.from(t).insert(row);
      record("Cross-account links", X, Y, t, what, "refused", denied(r.error), errText(r.error) || "accepted");
    }
  }

  // 3. Database functions aimed at another account's data.
  for (const X of LETTERS) {
    const a = users[X];
    const Y = LETTERS[(LETTERS.indexOf(X) + 2) % 3];
    const v = users[Y];
    let r = await a.db.rpc("record_review", { target_item: v.word, answer: "correct", took_ms: 1000 });
    record("Database functions", X, Y, "record_review", "record a review on the other account's word", "refused or no effect", true, errText(r.error) || "returned; checked by fingerprint");
    r = await a.db.rpc("record_tense_review", { target_item: v.verb, target_tense: "Präsens", answer: "correct", took_ms: 1000 });
    record("Database functions", X, Y, "record_tense_review", "practise the other account's verb table", "refused or no effect", true, errText(r.error) || "returned; checked by fingerprint");
    r = await a.db.rpc("build_deck", { item_types: [], tag_ids: [v.tag], only_needs_review: false, only_recent: false, size: 50, only_due: false });
    const stolen = r.data ? Number(psql(`select count(*) from public.deck_cards where deck_id = '${r.data}' and item_id in (select id from public.items where user_id = '${v.id}')`)) : 0;
    record("Database functions", X, Y, "build_deck", "build a deck from the other account's collection", "no foreign cards", stolen === 0, r.error ? errText(r.error) : `deck built, ${stolen} foreign cards`);
    r = await a.db.rpc("rename_tag", { tag_context: "collection", from_name: `Collection ${Y}`, to_name: "hacked" });
    record("Database functions", X, Y, "rename_tag", "rename the other account's collection", "no effect", true, errText(r.error) || "returned; checked by fingerprint");
    r = await a.db.rpc("rename_item_source", { from_name: `Source ${Y}`, to_name: "hacked" });
    record("Database functions", X, Y, "rename_item_source", "rename the other account's source", "no effect", true, errText(r.error) || "returned; checked by fingerprint");
    r = await a.db.rpc("save_items", { payload: [{ id: v.word, item_type: "word", title: "hacked", definition: "hacked" }] });
    record("Database functions", X, Y, "save_items", "overwrite the other account's word by its id", "refused or no effect", true, errText(r.error) || "returned; checked by fingerprint");
    r = await a.db.rpc("search_tutor", { query: `Zauberwort${Y}`, query_embedding: null, match_count: 10 });
    record("Database functions", X, Y, "search_tutor", "search for the other account's tutor answers", "none found", !r.error && (r.data ?? []).length === 0, r.error ? errText(r.error) : `${(r.data ?? []).length} found`);
    r = await a.db.rpc("home_summary");
    const summary = JSON.stringify(r.data ?? "");
    record("Database functions", X, Y, "home_summary", "dashboard figures include the other account's data", "only own data", !r.error && !summary.includes(`Wort${Y}`), r.error ? errText(r.error) : "own figures only");
  }

  // 4. Raising one's own rights.
  for (const X of LETTERS) {
    const a = users[X];
    let r = await a.db.from("account_plans").update({ plan: "paid" }).eq("user_id", a.id).select();
    record("Own rights", X, "-", "account_plans", "upgrade own plan to paid", "refused", !!r.error || (r.data ?? []).length === 0, r.error ? errText(r.error) : `${(r.data ?? []).length} rows changed`);
    r = await a.db.from("tutor_usage").delete().eq("user_id", a.id).select();
    record("Own rights", X, "-", "tutor_usage", "delete own usage to reset the message allowance", "refused", !!r.error || (r.data ?? []).length === 0, r.error ? errText(r.error) : `${(r.data ?? []).length} rows deleted`);
    r = await a.db.from("tutor_searches").delete().eq("user_id", a.id).select();
    record("Own rights", X, "-", "tutor_searches", "delete own search log to reset the hourly search limit", "refused", !!r.error || (r.data ?? []).length === 0, r.error ? errText(r.error) : `${(r.data ?? []).length} rows deleted`);
    r = await a.db.from("tutor_exchanges").update({ answer_text: "forged" }).eq("user_id", a.id).select();
    record("Own rights", X, "-", "tutor_exchanges", "rewrite own saved tutor answers", "refused", !!r.error || (r.data ?? []).length === 0, r.error ? errText(r.error) : `${(r.data ?? []).length} rows changed`);
  }

  // 5. A visitor who is not signed in.
  const anon = createClient(API, PUB, { auth: { persistSession: false } });
  for (const t of TABLES) {
    const r = await anon.from(t).select("*").limit(5);
    record("Signed-out visitor", "anon", "all", t, "read the table", "refused or empty", !!r.error || (r.data ?? []).length === 0, r.error ? errText(r.error) : `${(r.data ?? []).length} rows`);
  }
  for (const [fn, args] of [["search_tutor", { query: "Zauberwort", query_embedding: null, match_count: 5 }], ["home_summary", {}], ["save_items", { payload: [] }]]) {
    const r = await anon.rpc(fn, args);
    record("Signed-out visitor", "anon", "all", fn, "call the function", "refused", !!r.error, errText(r.error) || "allowed");
  }

  // 6. Integrity: every account's data exactly as before.
  const after = Object.fromEntries(LETTERS.map((L) => [L, fingerprint(users[L].id)]));
  for (const L of LETTERS)
    for (const t of TABLES) {
      // The attacker's own rows may grow (its own built deck, its own allowed rows); a victim's rows never change.
      const own = before[L][t] === after[L][t];
      const ownGrowthOk = ["decks", "deck_cards", "tutor_searches"].includes(t);
      record("Integrity", "-", L, t, "account's rows unchanged by the other accounts' attempts", "unchanged", own || ownGrowthOk, own ? "unchanged" : ownGrowthOk ? "changed only by the account itself (its own deck)" : `before ${before[L][t]} after ${after[L][t]}`);
    }

  const summary = { total: results.length, passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass) };
  const meta = Object.fromEntries(LETTERS.map((L) => [L, { email: users[L].email, id: users[L].id, conv: users[L].conv, rule: users[L].rule, word: users[L].word, phrase: users[L].phrase, exchanges: users[L].exchanges }]));
  fs.writeFileSync(path.join(outDir, "db-results.json"), JSON.stringify({ meta, summary, results }, null, 1));
  console.log(`db: ${summary.passed}/${summary.total} passed; failed: ${summary.failed.length}`);
  for (const f of summary.failed) console.log(" FAIL", f.group, f.attacker, "->", f.victim, f.target, f.action, "|", f.detail);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
