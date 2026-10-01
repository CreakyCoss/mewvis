import assert from "node:assert/strict";
import test from "node:test";
import {
  getApplicationViewClient,
  mountApplicationView,
} from "../views/index.js";

test("owner mount requires an explicit host capability; child client never falls back to the application bridge", () => {
  const original = Object.getOwnPropertyDescriptor(
    globalThis,
    "isleApplication",
  );
  const child = Object.getOwnPropertyDescriptor(globalThis, "isleEmbeddedView");
  try {
    Object.defineProperty(globalThis, "isleApplication", {
      configurable: true,
      value: { version: 1 },
    });
    assert.throws(() => mountApplicationView({}, {}), /embedded-views/);
    assert.throws(() => getApplicationViewClient(), /内嵌视图宿主/);
    const calls = [];
    const view = { id: "fixture" };
    globalThis.isleApplication.views = {
      version: 1,
      mount: (...args) => {
        calls.push(args);
        return view;
      },
    };
    const container = {};
    const options = { id: "fixture", title: "Fixture", script: "" };
    assert.equal(mountApplicationView(container, options), view);
    assert.deepEqual(calls, [[container, options]]);
    Object.defineProperty(globalThis, "isleEmbeddedView", {
      configurable: true,
      value: { version: 1, request() {} },
    });
    assert.equal(getApplicationViewClient(), globalThis.isleEmbeddedView);
  } finally {
    if (original)
      Object.defineProperty(globalThis, "isleApplication", original);
    else delete globalThis.isleApplication;
    if (child) Object.defineProperty(globalThis, "isleEmbeddedView", child);
    else delete globalThis.isleEmbeddedView;
  }
});
