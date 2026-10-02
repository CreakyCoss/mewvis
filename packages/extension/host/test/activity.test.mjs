import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  createActivityStore,
  createActivityExecution,
} from "../dist/services/activity.js";

test("reading an absent activity does not create a new chat directory", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mewvis-activity-read-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const chat = join(root, "chats", "new-chat");
  const store = createActivityStore(join(chat, "session"), "test.flow");
  assert.equal(await store.read(), null);
  assert.equal(await store.read(), null);
  await assert.rejects(stat(chat), { code: "ENOENT" });
});

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "mewvis-checkpoint-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const writer = createActivityStore(root, "test.flow");
  const control = createActivityStore(root, "test.flow");
  const controller = new AbortController();
  const waits = [];
  const execution = createActivityExecution(
    writer,
    "task",
    controller.signal,
    (active) => waits.push(active),
  );
  const value = {
    id: "flow",
    title: "Flow",
    pausable: true,
    state: "running",
    steps: [
      { id: "one", title: "One", state: "running" },
      { id: "two", title: "Two", state: "pending" },
    ],
  };
  await execution.publish(value);
  return { control, controller, execution, value, waits };
}
async function waitPaused(control) {
  for (let i = 0; i < 100; i++) {
    if ((await control.read()).state === "paused") return;
    await delay(10);
  }
  assert.fail("checkpoint did not pause");
}

test("pause survives progress updates; checkpoints retain results and can pause again after resume", async (t) => {
  const { control, execution, value, waits } = await fixture(t);
  for (let round = 0; round < 2; round++) {
    await control.update((record) => ({ ...record, state: "pausing" }));
    value.steps[0].state = "completed";
    await execution.publish(value);
    assert.equal((await control.read()).state, "pausing");
    let released = false;
    const checkpoint = execution.checkpoint(value.id).then(() => {
      released = true;
    });
    await waitPaused(control);
    await delay(150);
    assert.equal(released, false);
    assert.deepEqual(
      (await control.read()).steps.map((step) => step.state),
      ["completed", "pending"],
    );
    await control.update((record) => ({ ...record, state: "running" }));
    await checkpoint;
  }
  assert.deepEqual(waits, [true, false, true, false]);
});

test("cancelling a paused checkpoint releases its waiter and preserves completed steps", async (t) => {
  const { control, controller, execution, value, waits } = await fixture(t);
  value.steps[0].state = "completed";
  await execution.publish(value);
  await control.update((record) => ({ ...record, state: "pausing" }));
  const checkpoint = execution.checkpoint(value.id);
  const rejected = assert.rejects(checkpoint, { name: "AbortError" });
  await waitPaused(control);
  controller.abort();
  await rejected;
  await execution.finish("cancelled");
  assert.equal((await control.read()).state, "cancelled");
  assert.deepEqual(
    (await control.read()).steps.map((step) => step.state),
    ["completed", "pending"],
  );
  assert.deepEqual(waits, [true, false]);
});

test("last-step completion wins over pause and stale checkpoints cannot control another activity", async (t) => {
  const { control, execution, value } = await fixture(t);
  await control.update((record) => ({ ...record, state: "pausing" }));
  await execution.publish({ ...value, state: "completed" });
  await execution.finish("failed");
  assert.equal((await control.read()).state, "completed");
  await assert.rejects(execution.checkpoint(value.id), {
    code: "HOST_UNAVAILABLE",
  });
  await execution.publish({ ...value, id: "new" });
  await assert.rejects(execution.checkpoint(value.id), {
    code: "HOST_UNAVAILABLE",
  });
  const oldExecution = createActivityExecution(
    control,
    "old-task",
    new AbortController().signal,
    () => {},
  );
  await oldExecution.finish("cancelled");
  assert.equal((await control.read()).state, "running");
});
