import assert from "node:assert/strict";
import {
  IdleTimeoutError,
  withIdleTimeout,
} from "../../agent-runtime/src/engines/drivers/native/agent/runtimes/pi/agent/idle-timeout.ts";
import {
  isPiAbortError,
  normalizePiAbortError,
} from "../../agent-runtime/src/engines/drivers/native/agent/runtimes/pi/agent/abort.ts";

const wait = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs));

const testActivityExtendsLongOperation = async () => {
  let listener = null;
  let didTimeout = false;
  let unsubscribeCount = 0;
  const activity = setInterval(() => listener?.(), 5);

  try {
    const result = await withIdleTimeout(
      async () => {
        await wait(70);
        return "completed";
      },
      {
        timeoutMs: 15,
        message: "should not time out",
        subscribe: (nextListener) => {
          listener = nextListener;
          return () => {
            listener = null;
            unsubscribeCount += 1;
          };
        },
        onTimeout: async () => {
          didTimeout = true;
        },
      },
    );

    assert.equal(result, "completed");
    assert.equal(didTimeout, false);
    assert.equal(unsubscribeCount, 1);
  } finally {
    clearInterval(activity);
  }
};

const testIdleTimeoutAwaitsAbort = async () => {
  let resolveOperation = () => undefined;
  let aborted = false;
  let listener = null;
  const operation = new Promise((resolve) => {
    resolveOperation = resolve;
  });

  await assert.rejects(
    () =>
      withIdleTimeout(() => operation, {
        timeoutMs: 10,
        message: "idle timeout",
        subscribe: (nextListener) => {
          listener = nextListener;
          return () => {
            listener = null;
          };
        },
        onTimeout: async () => {
          await wait(10);
          aborted = true;
          resolveOperation();
        },
      }),
    (error) => error instanceof IdleTimeoutError && error.message === "idle timeout" && aborted,
  );

  assert.equal(aborted, true);
  assert.equal(listener, null);
};

const testPiAbortNormalization = () => {
  const rawAbort = new Error("Unhandled stop reason: abort");
  const normalized = normalizePiAbortError(rawAbort);
  assert.equal(isPiAbortError(rawAbort), true);
  assert.equal(normalized.name, "AbortError");
  assert.equal(normalized.message, "Agent session 已中止");

  const unrelated = new Error("network unavailable");
  assert.equal(isPiAbortError(unrelated), false);
  assert.equal(normalizePiAbortError(unrelated), unrelated);
};

await testActivityExtendsLongOperation();
await testIdleTimeoutAwaitsAbort();
testPiAbortNormalization();
console.log("agent idle timeout e2e passed");
