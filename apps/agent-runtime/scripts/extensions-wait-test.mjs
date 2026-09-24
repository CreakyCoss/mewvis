import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

export async function verifyExtensionWait({
  createActiveDeadline,
  withIdleTimeout,
  IdleTimeoutError,
}) {
  const budget = createActiveDeadline(300);
  try {
    await delay(160);
    budget.pause();
    budget.pause();
    await delay(350);
    assert.equal(
      budget.signal.aborted,
      false,
      "checkpoint waits do not consume the budget",
    );
    budget.resume();
    await delay(80);
    budget.resume();
    await delay(120);
    assert.equal(
      budget.signal.aborted,
      true,
      "resume retains the remaining budget instead of resetting it",
    );
  } finally {
    budget.dispose();
  }

  let active = false,
    finish;
  const listeners = new Set();
  const suspension = {
    get active() {
      return active;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const suspend = (value) => {
    active = value;
    for (const listener of listeners) listener();
  };
  let unsubscribed = 0,
    timedOut = 0;
  const options = {
    timeoutMs: 150,
    message: "idle",
    suspension,
    subscribe: () => () => {
      unsubscribed++;
    },
    onTimeout: async () => {
      timedOut++;
    },
  };
  const result = withIdleTimeout(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    options,
  );
  suspend(true);
  await delay(250);
  assert.equal(
    timedOut,
    0,
    "Pi keeps model tool invocation alive during checkpoint wait",
  );
  suspend(false);
  finish("done");
  assert.equal(await result, "done");
  assert.equal(listeners.size, 0);
  assert.equal(unsubscribed, 1);

  suspend(true);
  const idle = withIdleTimeout(() => new Promise(() => {}), options);
  const rejected = assert.rejects(idle, IdleTimeoutError);
  await delay(200);
  assert.equal(timedOut, 0);
  suspend(false);
  await rejected;
  assert.equal(timedOut, 1, "the idle watchdog starts again after resume");
  assert.equal(unsubscribed, 2);
  assert.equal(listeners.size, 0);
}
