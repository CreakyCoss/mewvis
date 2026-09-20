import test from "node:test";
import assert from "node:assert/strict";
import { writeClipboardText } from "../browser/index.js";
test("clipboard copies through the sandbox capability without reading native clipboard state", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "isleApplication");
  const copied = [];
  Object.defineProperty(globalThis, "isleApplication", { configurable: true, value: { version: 1, writeClipboardText: async text => { copied.push(text); } } });
  try {
    await writeClipboardText("原酒馆消息");
    assert.deepEqual(copied, ["原酒馆消息"]);
    await assert.rejects(writeClipboardText({ text: "bad" }), /必须是文本/);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "isleApplication", descriptor);
    else delete globalThis.isleApplication;
  }
});
