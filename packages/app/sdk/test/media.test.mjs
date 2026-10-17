import test from "node:test";
import assert from "node:assert/strict";
import {
  createApplicationMediaClient,
  getApplicationMediaClient,
} from "../media/index.js";
import { PRODUCT_KEYS } from "@mewvis/product-config";

test("media SDK distinguishes missing capability, malformed results and transport errors", async () => {
  assert.throws(
    () => getApplicationMediaClient(),
    (error) => error.code === "CAPABILITY_UNAVAILABLE",
  );
  const invalid = createApplicationMediaClient({
    version: 1,
    request: async () => ({ ok: true, value: {} }),
  });
  for (const operation of [
    () => invalid.capabilities(),
    () => invalid.probe("/a.png"),
    () => invalid.get("id"),
    () => invalid.list(),
  ])
    await assert.rejects(
      operation,
      (error) => error.code === "INVALID_RESPONSE",
    );
  let calls = 0;
  const denied = createApplicationMediaClient({
    version: 1,
    request: async () => {
      calls++;
      return {
        ok: false,
        error: { code: "PERMISSION_DENIED", message: "denied" },
      };
    },
  });
  await assert.rejects(
    denied.compose({}),
    (error) => error.code === "PERMISSION_DENIED",
  );
  assert.equal(
    calls,
    1,
    "paid or mutating operations are never retried by the SDK",
  );
  const failed = createApplicationMediaClient({
    version: 1,
    request: async () => {
      throw new Error("offline");
    },
  });
  await assert.rejects(
    failed.get("id"),
    (error) => error.code === "TRANSPORT_ERROR",
  );
});

test("browser media clients use the actual sandbox global and follow transport replacement", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    PRODUCT_KEYS.applicationGlobal,
  );
  const output = { format: "mp4", videoCodec: "h264", audioCodec: "aac" };
  const transport = (available) => ({
    version: 1,
    request: async () => ({
      ok: true,
      value: { available, output, inputs: {}, limits: {} },
    }),
  });
  try {
    Object.defineProperty(globalThis, PRODUCT_KEYS.applicationGlobal, {
      configurable: true,
      value: { version: 1, media: transport(true) },
    });
    const first = getApplicationMediaClient();
    assert.equal((await first.capabilities()).available, true);
    Object.defineProperty(globalThis, PRODUCT_KEYS.applicationGlobal, {
      configurable: true,
      value: { version: 1, media: transport(false) },
    });
    const next = getApplicationMediaClient();
    assert.notEqual(first, next);
    assert.equal((await next.capabilities()).available, false);
  } finally {
    if (descriptor)
      Object.defineProperty(
        globalThis,
        PRODUCT_KEYS.applicationGlobal,
        descriptor,
      );
    else delete globalThis[PRODUCT_KEYS.applicationGlobal];
  }
});
