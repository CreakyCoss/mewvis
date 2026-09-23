import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";
const { code } = await transform(
  await readFile(new URL("../ui/runtime/catalog.ts", import.meta.url), "utf8"),
  { loader: "ts", format: "esm" },
);
const { observeUICatalog } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);
const settle = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

test("catalog refreshes after subscription readiness and ignores out-of-order results", async () => {
  const pending = [];
  const states = [];
  let changed;
  let stops = 0;
  const observer = observeUICatalog(
    {
      list() {
        const result = deferred();
        pending.push(result);
        return result.promise;
      },
      subscribe(callback) {
        changed = callback;
        return () => {
          stops++;
        };
      },
    },
    (state) => states.push(state),
  );
  await settle();
  assert.equal(pending.length, 2);
  pending[1].resolve([{ id: "new" }]);
  await settle();
  pending[0].resolve([{ id: "old" }]);
  await settle();
  assert.deepEqual(states, [{ contributions: [{ id: "new" }], error: "" }]);
  changed();
  pending[2].resolve([]);
  await settle();
  assert.deepEqual(states.at(-1), { contributions: [], error: "" });
  observer.dispose();
  observer.dispose();
  assert.equal(stops, 1);
});

test("disposing a catalog suppresses pending reads and releases late subscriptions", async () => {
  const subscription = deferred();
  const read = deferred();
  const states = [];
  let stops = 0;
  const observer = observeUICatalog(
    { list: () => read.promise, subscribe: () => subscription.promise },
    (state) => states.push(state),
  );
  await settle();
  observer.dispose();
  subscription.resolve(() => {
    stops++;
  });
  read.resolve([{ id: "late" }]);
  await settle();
  assert.equal(stops, 1);
  assert.deepEqual(states, []);
});

test("failed reads clear stale contributions and subsequent invalidation recovers", async () => {
  let changed;
  let fail = true;
  const states = [];
  const observer = observeUICatalog(
    {
      async list() {
        if (fail) throw new Error("offline");
        return [{ id: "recovered" }];
      },
      subscribe(callback) {
        changed = callback;
        return () => {};
      },
    },
    (state) => states.push(state),
  );
  await settle();
  assert.deepEqual(states.at(-1), {
    contributions: [],
    error: "Error: offline",
  });
  fail = false;
  changed();
  await settle();
  assert.deepEqual(states.at(-1), {
    contributions: [{ id: "recovered" }],
    error: "",
  });
  observer.dispose();
});
