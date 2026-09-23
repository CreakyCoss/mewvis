import test from "node:test";
import assert from "node:assert/strict";
import { adaptAgentExtension, adaptUIExtension } from "../index.js";
import { adaptIslePackage } from "../package.js";
import { definePlugin } from "@isle/extension-host";
import { createExtensionHostClient } from "@isle/extension-host/services";

test("SDK callbacks cross a real native registration boundary, retaining lifecycle and cancellation", async () => {
  const registrations = {},
    lifecycle = [];
  const source = {
    id: "test.sdk",
    apiVersion: 1,
    setup(ctx) {
      ctx.registerTool({
        name: "echo",
        label: "Echo",
        description: "Echo",
        parameters: { type: "object" },
        async execute(input, { signal, progress }) {
          signal.throwIfAborted();
          progress({ content: [], details: input });
          return {
            content: [{ type: "text", text: input.text }],
            details: input,
          };
        },
      });
      ctx.on("run_started", (event, { signal }) => {
        assert.ok(signal);
        lifecycle.push(event.type);
      });
      ctx.onActivate(() => lifecycle.push("activate"));
      ctx.own(() => lifecycle.push("dispose"));
    },
  };
  const native = definePlugin(adaptAgentExtension(source));
  assert.equal(native.protocolVersion, 1);
  assert.equal(native.apiVersion, undefined);
  native.setup({
    config: {},
    workspacePath: "/test",
    registerTool: (tool) => (registrations.tool = tool),
    on: (_type, handler) => (registrations.event = handler),
    own: (cb) => (registrations.dispose = cb),
    onActivate: (cb) => (registrations.activate = cb),
  });
  await registrations.activate();
  const controller = new AbortController();
  const input = { text: "native" },
    progress = [];
  const result = await registrations.tool.execute(input, {
    callId: "call",
    signal: controller.signal,
    progress: (value) => progress.push(value),
  });
  assert.deepEqual(result.details, input);
  assert.notEqual(result.details, input);
  assert.equal(progress.length, 1);
  await registrations.event(
    { type: "run_started" },
    { signal: controller.signal },
  );
  controller.abort();
  await assert.rejects(
    registrations.tool.execute(input, { signal: controller.signal }),
  );
  await registrations.dispose();
  assert.deepEqual(lifecycle, ["activate", "run_started", "dispose"]);
});

test("SDK UI receives its own host context while native UI consumes native services", async () => {
  const signal = new AbortController().signal;
  const calls = [];
  const services = createExtensionHostClient(
    async (method, input, options) => {
      calls.push({ method, input });
      assert.equal(options.signal, signal);
      return { text: "transient", generatedAt: 1, truncated: false };
    },
    [{ capability: "session.summarize", status: "available" }],
  );
  let disposed = false;
  const adapted = adaptUIExtension({
    id: "test.ui",
    apiVersion: 1,
    async mount(_root, ctx) {
      assert.equal(ctx.services, undefined);
      assert.equal(ctx.host.supports("session.read"), false);
      const result = await ctx.host.session.summarize(
        { scope: { kind: "session" } },
        { signal },
      );
      assert.equal(result.text, "transient");
      return () => {
        disposed = true;
      };
    },
  });
  const dispose = await adapted.mount(
    {},
    { config: {}, contributionId: "view", viewId: "view", signal, services },
  );
  dispose();
  assert.ok(disposed);
  assert.deepEqual(calls, [
    { method: "session.summarize", input: { scope: { kind: "session" } } },
  ]);
});

test("SDK package conversion produces a native manifest, and rejects unsupported SDK versions", () => {
  const source = {
    name: "test.sdk",
    version: "1.0.0",
    type: "module",
    "isle.extension": {
      id: "test.sdk",
      schemaVersion: 2,
      apiVersion: 1,
      modules: { agent: { entry: "index.js", capabilities: ["tools"] } },
    },
  };
  const native = adaptIslePackage(source);
  assert.equal(native["isle.extension"], undefined);
  assert.equal(native["isle.plugin"].protocolVersion, 1);
  assert.notEqual(
    native["isle.plugin"].modules.agent.capabilities,
    source["isle.extension"].modules.agent.capabilities,
  );
  source["isle.extension"].apiVersion = 999;
  assert.throws(() => adaptIslePackage(source), /无效/);
});
