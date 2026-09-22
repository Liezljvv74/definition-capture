import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRemoteStore, REFRESH_GAP_MS } from "@/lib/remoteStore";

/**
 * The half of the store its own test file cannot reach.
 *
 * `remoteStore.test.ts` mocks `getSupabase` to null, which is right for what it
 * asserts, but every write, every reload and the whole paging loop sit behind
 * `if (supabase)`. That left roughly two hundred lines with no reachable
 * coverage, and the mutations it hid are the expensive kind: delete the reload
 * that follows a failed write and the screen keeps showing rows the database
 * does not have; delete the paging loop and a list over a thousand rows is
 * silently truncated, which `buildBackup` then exports as though it were the
 * whole thing.
 *
 * So this file gives the store a fake client instead of no client. It records
 * what was asked of it and answers with whatever the test has queued, which is
 * enough to pin the decisions without a network, a database or a DOM.
 *
 * Most of it never calls `subscribe`: every write reaches `load` through the
 * reload that follows a failure, which is the path that matters. The one suite
 * that does subscribe stubs `window`, because that is where the refocus
 * listeners go and this file runs in node like the rest of them.
 */

type Row = Record<string, unknown>;
type Answer = { data: unknown[] | null; error: unknown };

/** One request, as the fake saw it. */
type Call = {
  verb: "select" | "insert" | "update" | "upsert" | "delete";
  table: string;
  rows?: Row[];
  /** The ids named by `.in("id", …)`, which is how a bulk delete travels. */
  ids?: string[];
  eq?: Record<string, string>;
  range?: [number, number];
};

const ok = (data: unknown[] = []): Answer => ({ data, error: null });
const fails = (message = "boom"): Answer => ({ data: null, error: { message } });

function fakeSupabase() {
  const calls: Call[] = [];
  /** Queued answers per verb. The last one repeats once the queue runs down. */
  const answers: Record<string, Answer[]> = {};
  /** Runs just before an answer is handed back, for mid-flight changes. */
  let onAnswer: (call: Call) => void = () => {};

  function answerFor(verb: string): Answer {
    const queue = answers[verb];
    if (!queue || queue.length === 0) return ok();
    return queue.length === 1 ? queue[0] : (queue.shift() as Answer);
  }

  function builder(call: Call) {
    const self = {
      order: () => self,
      range: (from: number, to: number) => {
        call.range = [from, to];
        return self;
      },
      eq: (column: string, value: string) => {
        call.eq = { ...call.eq, [column]: value };
        return self;
      },
      in: (_column: string, values: string[]) => {
        call.ids = values;
        return self;
      },
      then<R>(onOk: (answer: Answer) => R): Promise<R> {
        calls.push(call);
        onAnswer(call);
        return Promise.resolve(answerFor(call.verb)).then(onOk);
      },
    };
    return self;
  }

  const asRows = (rows: Row | Row[]): Row[] => (Array.isArray(rows) ? rows : [rows]);

  return {
    calls,
    answers,
    setOnAnswer(hook: (call: Call) => void) {
      onAnswer = hook;
    },
    of(verb: Call["verb"]) {
      return calls.filter((call) => call.verb === verb);
    },
    client: {
      from(table: string) {
        return {
          select: () => builder({ verb: "select", table }),
          insert: (rows: Row | Row[]) =>
            builder({ verb: "insert", table, rows: asRows(rows) }),
          update: (row: Row) => builder({ verb: "update", table, rows: [row] }),
          upsert: (rows: Row[]) => builder({ verb: "upsert", table, rows }),
          delete: () => builder({ verb: "delete", table }),
        };
      },
    },
  };
}

const state = vi.hoisted(() => ({
  supabase: null as unknown,
  userId: "user-1" as string | null,
}));

vi.mock("@/lib/supabaseClient", () => ({ getSupabase: () => state.supabase }));
vi.mock("@/lib/session", () => ({
  currentUserId: () => state.userId,
  subscribe: () => () => {},
}));

type Item = { id: string; name: string };

const make = () =>
  createRemoteStore<Item>({
    table: "things",
    orderBy: "created_at",
    idOf: (item) => item.id,
    nameOf: (item) => item.name,
    fromRow: (row) => ({ id: String(row.id), name: String(row.name) }),
    toRow: (item) => ({ id: item.id, name: item.name }),
  });

const rows = (count: number, from = 0): Row[] =>
  Array.from({ length: count }, (_, at) => ({ id: `id-${from + at}`, name: `n${from + at}` }));

/**
 * Waits for a condition rather than for a fixed number of microtasks. The
 * reload that follows a failed write is deliberately not awaited by `settled`,
 * so there is nothing to await directly.
 */
async function until(check: () => boolean, what: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error(`timed out waiting for ${what}`);
}

let fake: ReturnType<typeof fakeSupabase>;

beforeEach(() => {
  fake = fakeSupabase();
  state.supabase = fake.client;
  state.userId = "user-1";
});

describe("a write that fails", () => {
  it("says so in the banner and reloads, so the screen matches the database", async () => {
    fake.answers.insert = [fails("duplicate key")];
    fake.answers.select = [ok(rows(1))];
    const store = make();

    store.insert({ id: "local", name: "Tür" });
    // Optimistic: the row is on screen before the network has answered.
    expect(store.items().map((item) => item.id)).toEqual(["local"]);

    await store.settled();
    await until(() => fake.of("select").length > 0, "the reload");

    expect(store.getError()).toContain("Could not save to the database");
    expect(store.getError()).toContain("duplicate key");
    // The reload put the database's answer back, so the optimistic row is gone.
    await until(() => store.items().length === 1 && store.items()[0].id === "id-0", "the rows");
  });

  it("does not let its own reload clear the banner a moment later", async () => {
    // The regression the comment in `load` records: the reload succeeds, and
    // clearing the error there made the failure flash and vanish.
    fake.answers.insert = [fails()];
    fake.answers.select = [ok(rows(1))];
    const store = make();

    store.insert({ id: "local", name: "Tür" });
    await store.settled();
    await until(() => fake.of("select").length > 0, "the reload");
    await until(() => store.items()[0]?.id === "id-0", "the reloaded rows");

    expect(store.getError()).toContain("Could not save to the database");
  });

  it("is reported once for a delete split across several requests", async () => {
    fake.answers.select = [ok([])];
    const store = make();
    store.insertMany(rows(450).map((row) => ({ id: String(row.id), name: String(row.name) })));
    await store.settled();

    fake.answers.delete = [ok(), fails("gateway said no"), ok()];
    store.removeMany(store.items().map((item) => item.id));
    await store.settled();

    // One sentence, not one per batch.
    expect(store.getError()).toContain("gateway said no");
    expect((store.getError() ?? "").match(/Could not save/g)?.length).toBe(1);
  });
});

describe("a bulk delete", () => {
  /**
   * `.in("id", […])` is serialised into the query string and `delete()` is an
   * HTTP DELETE, so the ids travel in the URL. Sending them all at once built a
   * request line a gateway refuses, and the optimistic write meant the reader
   * watched every row vanish first. These pin the batching that fixed it.
   */
  it("is split into requests small enough for a URL", async () => {
    fake.answers.select = [ok([])];
    const store = make();
    store.insertMany(rows(450).map((row) => ({ id: String(row.id), name: String(row.name) })));
    await store.settled();

    store.removeMany(store.items().map((item) => item.id));
    await store.settled();

    const sizes = fake.of("delete").map((call) => call.ids?.length ?? 0);
    expect(sizes).toEqual([200, 200, 50]);
    // Every id is named exactly once, across the batches.
    const sent = fake.of("delete").flatMap((call) => call.ids ?? []);
    expect(new Set(sent).size).toBe(450);
  });

  it("stays a single request when it fits", async () => {
    const store = make();
    store.insertMany(rows(3).map((row) => ({ id: String(row.id), name: String(row.name) })));
    await store.settled();

    store.removeMany(["id-0", "id-2"]);
    await store.settled();

    expect(fake.of("delete")).toHaveLength(1);
    expect(fake.of("delete")[0].ids).toEqual(["id-0", "id-2"]);
  });
});

describe("reading the list", () => {
  it("asks for another page until a short one arrives", async () => {
    // The truncation this exists to prevent: PostgREST caps a response at 1000
    // rows and says nothing, so a single select looked like a complete list.
    fake.answers.insert = [fails()];
    fake.answers.select = [ok(rows(1000)), ok(rows(3, 1000))];
    const store = make();

    store.insert({ id: "local", name: "Tür" });
    await store.settled();
    await until(() => store.items().length === 1003, "both pages");

    expect(fake.of("select").map((call) => call.range)).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("publishes nothing when a later page fails, rather than a short list", async () => {
    fake.answers.insert = [fails()];
    fake.answers.select = [ok(rows(1000)), fails("network")];
    const store = make();

    store.insert({ id: "local", name: "Tür" });
    await store.settled();
    await until(
      () => (store.getError() ?? "").includes("Could not read"),
      "the read failure",
    );

    // The one optimistic row, not the thousand that did arrive.
    expect(store.items().map((item) => item.id)).toEqual(["local"]);
  });

  it("keeps the rows already on screen when the read fails outright", async () => {
    fake.answers.insert = [ok(), fails()];
    fake.answers.select = [fails("offline")];
    const store = make();

    store.insert({ id: "kept", name: "Tür" });
    await store.settled();
    store.insert({ id: "second", name: "Tor" });
    await store.settled();
    await until(() => (store.getError() ?? "").includes("Could not read"), "the read failure");

    // A failed read is not evidence the list is empty.
    expect(store.items().map((item) => item.id)).toEqual(["second", "kept"]);
  });

  it("drops rows that arrive after the reader has changed", async () => {
    fake.answers.insert = [fails()];
    fake.answers.select = [ok(rows(2))];
    const store = make();
    // A sign-out or account switch while the read is in flight.
    fake.setOnAnswer((call) => {
      if (call.verb === "select") state.userId = "user-2";
    });

    store.insert({ id: "local", name: "Tür" });
    await store.settled();
    await until(() => fake.of("select").length > 0, "the reload");
    await new Promise((resolve) => setTimeout(resolve, 5));

    // Nothing from the other account's read was published.
    expect(store.items().map((item) => item.id)).toEqual(["local"]);
  });
});

describe("replaceAll, which a restore uses", () => {
  it("deletes this reader's rows before inserting the file's", async () => {
    const store = make();
    store.replaceAll([{ id: "a", name: "A" }]);
    await store.settled();

    expect(fake.calls.map((call) => call.verb)).toEqual(["delete", "insert"]);
    expect(fake.of("delete")[0].eq).toEqual({ user_id: "user-1" });
    expect(fake.of("insert")[0].rows?.[0]).toMatchObject({ id: "a", user_id: "user-1" });
  });

  it("sends no insert at all for an empty list", async () => {
    const store = make();
    store.replaceAll([]);
    await store.settled();

    expect(fake.calls.map((call) => call.verb)).toEqual(["delete"]);
    expect(store.items()).toEqual([]);
  });

  it("does not insert when the delete failed", async () => {
    fake.answers.delete = [fails("denied")];
    fake.answers.select = [ok([])];
    const store = make();

    store.replaceAll([{ id: "a", name: "A" }]);
    await store.settled();

    expect(fake.of("insert")).toHaveLength(0);
    expect(store.getError()).toContain("denied");
  });
});

describe("writes stamp the owner from the session", () => {
  /**
   * `rowFor` spreads the item first and sets `user_id` afterwards, so a row
   * that already carries one cannot keep it. Row level security would refuse
   * such a write anyway, but a rejected write is a banner and a lost edit,
   * and this is the line that stops it being sent at all.
   *
   * The store under test hands back a `user_id` of its own on purpose. No real
   * `toRow` does, which is exactly why reversing the spread would otherwise go
   * unnoticed until something did.
   */
  const hostile = () =>
    createRemoteStore<Item>({
      table: "things",
      orderBy: "created_at",
      idOf: (item) => item.id,
      nameOf: (item) => item.name,
      fromRow: (row) => ({ id: String(row.id), name: String(row.name) }),
      toRow: (item) => ({ id: item.id, name: item.name, user_id: "someone-else" }),
    });

  it("overrides an owner the row arrived with, on every kind of write", async () => {
    const store = hostile();
    store.insert({ id: "a", name: "A" });
    store.insertMany([{ id: "b", name: "B" }]);
    store.updateMany([{ id: "b", name: "B2" }]);
    store.replaceAll([{ id: "c", name: "C" }]);
    await store.settled();

    const written = [
      ...fake.of("insert"),
      ...fake.of("upsert"),
      ...fake.of("update"),
    ].flatMap((call) => call.rows ?? []);
    expect(written.length).toBeGreaterThan(0);
    for (const row of written) expect(row.user_id).toBe("user-1");
  });
});

describe("updateMany", () => {
  /*
   * The three lists are views over `learning_items`, not tables, and a view
   * has no index for `on conflict` to infer an arbiter from: PostgREST's
   * upsert is refused with 42P10 before the `instead of` trigger runs. So the
   * bulk path that an import's "overwrite matching rows" mode depends on has
   * to be updates, one per row, however much one round trip would be nicer.
   *
   * Asserting on the verb rather than on the outcome, because the fake answers
   * every call the same way: what broke in production was the shape of the
   * request, and that is the thing this can see.
   */
  it("updates each row by id rather than upserting", async () => {
    const store = make();
    store.updateMany([
      { id: "a", name: "A2" },
      { id: "b", name: "B2" },
    ]);
    await store.settled();

    expect(fake.of("upsert")).toHaveLength(0);

    const updates = fake.of("update");
    expect(updates).toHaveLength(2);
    expect(updates.map((call) => call.eq?.id)).toEqual(["a", "b"]);
    expect(updates.map((call) => call.rows?.[0]?.name)).toEqual(["A2", "B2"]);
  });

  it("reports one failure out of a batch, and reloads once", async () => {
    const store = make();
    fake.answers.update = [fails("no")];

    store.updateMany([
      { id: "a", name: "A2" },
      { id: "b", name: "B2" },
    ]);
    await store.settled();

    expect(store.getError()).toContain("Could not save to the database");
    // One reload for the batch, not one per row.
    expect(fake.of("select")).toHaveLength(1);
  });
});

describe("settled", () => {
  it("waits for every write started so far", async () => {
    const store = make();
    store.insert({ id: "a", name: "A" });
    store.insert({ id: "b", name: "B" });

    expect(fake.of("insert").length).toBeLessThanOrEqual(2);
    await store.settled();

    // The legacy import deletes the only other copy once this resolves, so
    // "resolved" has to mean the writes really answered.
    expect(fake.of("insert")).toHaveLength(2);
  });
});

describe("coming back to the tab", () => {
  /**
   * The catch-up read exists because a database has no `storage` event: a list
   * left open in another tab goes stale, and returning to it is when that
   * would be noticed. What it must not do is re-read a list nobody is showing.
   *
   * The banner is why that is not obvious. It sits in the workspace layout, so
   * it is mounted on every page, and it used to register through the same set
   * as the list itself — which meant the set was never empty and every list
   * started earlier in the session re-read itself on every alt-tab, however
   * far the reader had navigated from it.
   */
  const focus = () => handlers.focus?.();
  let handlers: Record<string, () => void>;

  beforeEach(() => {
    handlers = {};
    vi.stubGlobal("window", {
      addEventListener: (event: string, handler: () => void) => {
        handlers[event] = handler;
      },
    });
    vi.stubGlobal("document", { visibilityState: "visible" });
    // Only `Date` is faked, so the gap can be stepped over while `setTimeout`
    // keeps working for the waiting these tests do.
    vi.useFakeTimers({ toFake: ["Date"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const stepPastTheGap = () => vi.setSystemTime(Date.now() + REFRESH_GAP_MS + 1);

  it("re-reads a list someone is looking at", async () => {
    const store = make();
    const stop = store.subscribe(() => {});
    await until(() => fake.of("select").length === 1, "the first read");

    stepPastTheGap();
    focus();

    await until(() => fake.of("select").length === 2, "the catch-up read");
    stop();
  });

  it("declines while the last read is still recent", async () => {
    const store = make();
    store.subscribe(() => {});
    await until(() => fake.of("select").length === 1, "the first read");

    // `visibilitychange` and `focus` both fire on one return to the tab.
    focus();
    focus();
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(fake.of("select")).toHaveLength(1);
  });

  it("leaves alone a list nobody is showing, banner or no banner", async () => {
    const store = make();
    const stop = store.subscribe(() => {});
    await until(() => fake.of("select").length === 1, "the first read");

    // The reader has navigated to a page that shows something else. The banner
    // goes with them; the list does not.
    stop();
    const stopWatchingErrors = store.subscribeToError(() => {});
    stepPastTheGap();
    focus();
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(fake.of("select")).toHaveLength(1);
    stopWatchingErrors();
  });

  it("still tells the banner about a failure it is not subscribed to the list for", async () => {
    // The other half of splitting the sets: an error-only watcher has to keep
    // hearing about errors, or the banner goes quiet instead of going quiet
    // about fetching.
    fake.answers.insert = [fails("denied")];
    const store = make();
    let told = 0;
    const stop = store.subscribeToError(() => {
      told += 1;
    });

    store.insert({ id: "a", name: "A" });
    await store.settled();

    expect(told).toBeGreaterThan(0);
    expect(store.getError()).toContain("denied");
    stop();
  });
});
