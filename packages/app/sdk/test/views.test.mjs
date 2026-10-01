import assert from "node:assert/strict";
import test from "node:test";
import {
  getApplicationViewClient,
  mountApplicationView,
} from "../views/index.js";
import { createApplicationViewHost } from "../views/runtime.js";

test("view host starts before the document root exists and releases its observer", () => {
  const keys = [
    "document",
    "MutationObserver",
    "addEventListener",
    "removeEventListener",
  ];
  const originals = new Map(
    keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  const subscriptions = new Map();
  let disconnected = false;
  const values = {
    document: { nodeType: 9, documentElement: null },
    MutationObserver: class {
      observe(target) {
        if (!target)
          throw new TypeError("The observation target must be a Node");
      }
      disconnect() {
        disconnected = true;
      }
    },
    addEventListener(type, listener) {
      subscriptions.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (subscriptions.get(type) === listener) subscriptions.delete(type);
    },
  };
  try {
    for (const key of keys)
      Object.defineProperty(globalThis, key, {
        configurable: true,
        value: values[key],
      });
    const host = createApplicationViewHost({ getTheme: () => ({}) });
    assert.equal(host.version, 1);
    assert.ok(subscriptions.size > 0);
    host.dispose();
    assert.equal(disconnected, true);
    assert.equal(subscriptions.size, 0);
  } finally {
    for (const [key, original] of originals) {
      if (original) Object.defineProperty(globalThis, key, original);
      else delete globalThis[key];
    }
  }
});

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
