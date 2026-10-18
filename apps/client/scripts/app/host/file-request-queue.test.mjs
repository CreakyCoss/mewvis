import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { build } from "esbuild";

const compiled = await build({
  entryPoints: [new URL("../../../src/workbench/pages/applications/file-request-queue.ts", import.meta.url).pathname],
  bundle: true,
  write: false,
  format: "esm",
});
const { createFileRequestQueue } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`
);
const ok = (value) => ({ ok: true, value });
function gate() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test("a preview burst waits in FIFO order and never executes more than four requests", async () => {
  const queue = createFileRequestQueue(),
    gates = Array.from({ length: 25 }, gate),
    started = [];
  let running = 0,
    maximum = 0;
  const requests = gates.map((g, index) =>
    queue.request(String(index), async () => {
      running++;
      maximum = Math.max(maximum, running);
      started.push(index);
      await g.promise;
      running--;
      return ok(index);
    }),
  );
  await setImmediate();
  assert.deepEqual(started, [0, 1, 2, 3]);
  for (const g of gates) {
    g.release();
    await setImmediate();
  }
  assert.deepEqual(
    await Promise.all(requests),
    gates.map((_, i) => ok(i)),
  );
  assert.deepEqual(
    started,
    gates.map((_, i) => i),
  );
  assert.equal(maximum, 4);
  queue.dispose();
});

test("active and waiting request IDs are protected, and failures release their slots", async () => {
  const queue = createFileRequestQueue(),
    hold = gate();
  const requests = [0, 1, 2, 3].map((i) => queue.request(String(i), () => hold.promise.then(() => ok(i))));
  const queued = queue.request("queued", async () => ({
    ok: false,
    error: { code: "PERMISSION_DENIED", message: "denied" },
  }));
  await assert.rejects(
    queue.request("0", async () => ok("duplicate")),
    { code: "INVALID_ARGUMENT" },
  );
  await assert.rejects(
    queue.request("queued", async () => ok("duplicate")),
    { code: "INVALID_ARGUMENT" },
  );
  const failed = queue.request("failed", () => {
    throw new Error("transport failure");
  });
  const failure = assert.rejects(failed, /transport failure/);
  const after = queue.request("after", async () => ok("after"));
  hold.release();
  await Promise.all(requests);
  assert.deepEqual(await queued, { ok: false, error: { code: "PERMISSION_DENIED", message: "denied" } });
  await failure;
  assert.deepEqual(await after, ok("after"));
  assert.deepEqual(await queue.request("queued", async () => ok("reused")), ok("reused"));
  queue.dispose();
});

test("the waiting queue is bounded, and disposal prevents pending operations from reaching the host", async () => {
  const queue = createFileRequestQueue(),
    hold = gate();
  let started = 0;
  const requests = Array.from({ length: 68 }, (_, i) =>
    queue.request(String(i), async () => {
      started++;
      await hold.promise;
      return ok(i);
    }),
  );
  const settled = Promise.allSettled(requests);
  await setImmediate();
  assert.equal(started, 4);
  await assert.rejects(
    queue.request("overflow", async () => ok(0)),
    { code: "LIMIT_EXCEEDED" },
  );
  queue.dispose();
  queue.dispose();
  hold.release();
  const results = await settled;
  assert.equal(started, 4);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 4);
  assert.equal(results.filter((r) => r.status === "rejected" && r.reason.code === "CONNECTION_CLOSED").length, 64);
  await assert.rejects(
    queue.request("closed", async () => ok(0)),
    { code: "CONNECTION_CLOSED" },
  );
});

test("disposing before dispatch also prevents scheduled work from starting", async () => {
  const queue = createFileRequestQueue();
  let writes = 0;
  const result = queue.request("write", async () => {
    writes++;
    return ok(null);
  });
  const rejected = assert.rejects(result, { code: "CONNECTION_CLOSED" });
  queue.dispose();
  await rejected;
  assert.equal(writes, 0);
});

test("expired waiting writes are removed and never execute after a slot becomes available", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const queue = createFileRequestQueue(),
    hold = gate();
  const active = [0, 1, 2, 3].map((i) => queue.request(String(i), () => hold.promise.then(() => ok(i))));
  let writes = 0;
  const waiting = queue.request("write", async () => {
    writes++;
    return ok(null);
  });
  const timedOut = assert.rejects(waiting, { code: "TIMEOUT" });
  t.mock.timers.tick(20_000);
  await timedOut;
  hold.release();
  await Promise.all(active);
  assert.equal(writes, 0);
  assert.deepEqual(await queue.request("write", async () => ok("new request")), ok("new request"));
  queue.dispose();
});

test("expired work cannot dispatch even when a background tab delays its timeout callback", async (t) => {
  const now = Date.now();
  const clock = t.mock.method(Date, "now", () => now);
  const queue = createFileRequestQueue(),
    hold = gate();
  const active = [0, 1, 2, 3].map((i) => queue.request(String(i), () => hold.promise.then(() => ok(i))));
  let writes = 0;
  const waiting = queue.request("write", async () => {
    writes++;
    return ok(null);
  });
  const timedOut = assert.rejects(waiting, { code: "TIMEOUT" });
  await setImmediate();
  clock.mock.mockImplementation(() => now + 25_000);
  hold.release();
  await Promise.all(active);
  await timedOut;
  assert.equal(writes, 0);
  queue.dispose();
});
