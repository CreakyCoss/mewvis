import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createExtensionHostClient } from "@isle/extension-host/services";
import { ExtensionHost } from "@isle/extension-host/services/runtime";
import { createSessionHostAdapter } from "@isle/extension-host/services/session";
import { createDesktopExtensionAdapter } from "../../dist/bootstrap/extensions.js";
import { Extensions } from "../../dist/modules/extensions/service.js";

const ledger = {
  sessionRootDir: "/private/path",
  messages: [
    {
      messageRecordId: "u",
      role: "user",
      content: "目标：修复插件",
      timestamp: 1,
    },
    {
      messageRecordId: "a",
      role: "assistant",
      content: "已完成适配",
      timestamp: 2,
      metadata: { thinking: "检查协议", credential: "secret" },
    },
    { messageRecordId: "b", role: "user", content: "另一轮消息", timestamp: 3 },
  ],
  runtimeLinks: [
    {
      linkId: "run",
      messageRecordIds: ["u", "a"],
      runtimeInstructionRecordIds: ["i"],
      requestContextRecordIds: ["c"],
      status: "done",
      startedAt: 1,
      endedAt: 2,
    },
  ],
  runtimeInstructions: [{ recordId: "i", content: "instruction" }],
  requestContexts: [{ recordId: "c", content: "context" }],
};
const requirements = {
  required: ["session.ledger.read"],
  optional: ["session.summarize"],
};
const context = () => ({
  target: { workspacePath: "/test", chatId: "bound" },
  signal: new AbortController().signal,
});

test("one protocol client works with different host implementations and reports unsupported capabilities", async () => {
  for (const label of ["local", "remote", "mock"]) {
    const host = new ExtensionHost({
      "session.summarize": async () => ({
        text: label,
        generatedAt: 1,
        truncated: false,
      }),
    });
    const client = createExtensionHostClient(
      (method, input) =>
        host.invoke(
          method,
          input,
          { required: ["session.summarize"] },
          context(),
        ),
      host.check({ required: ["session.summarize"] }),
    );
    assert.equal(
      (await client.session.summarize({ scope: { kind: "session" } })).text,
      label,
    );
    assert.equal(client.supports("session.read"), false);
    await assert.rejects(client.session.read(), { code: "HOST_DENIED" });
  }
  const host = new ExtensionHost();
  assert.throws(() => host.check(requirements), { code: "HOST_UNSUPPORTED" });
  const support = host.check({ optional: ["session.summarize"] });
  assert.equal(
    support.find((item) => item.capability === "session.summarize").status,
    "unsupported",
  );
  await assert.rejects(
    host.invoke(
      "session.summarize",
      { scope: { kind: "session" } },
      { optional: ["session.summarize"] },
      context(),
    ),
    { code: "HOST_UNSUPPORTED" },
  );
});

test("read-only ledger projection and transient summaries leave source bytes unchanged", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "isle-summary-contract-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, "ledger.json");
  const original = JSON.stringify(ledger);
  await writeFile(file, original);
  const inputs = [];
  const host = new ExtensionHost(
    createSessionHostAdapter({
      readSession: async (target) => {
        assert.equal(target.chatId, "bound");
        return JSON.parse(await readFile(file, "utf8"));
      },
      summarizeText: async (text) => {
        inputs.push(text);
        return "临时结果";
      },
    }),
  );
  const client = createExtensionHostClient(
    (method, input) => host.invoke(method, input, requirements, context()),
    host.check(requirements),
  );
  const snapshot = await client.session.ledger.read();
  assert.equal(snapshot.messages[1].thinking, "检查协议");
  assert.equal(snapshot.contexts[0].text, "context");
  assert.doesNotMatch(
    JSON.stringify(snapshot),
    /private\/path|credential|secret/,
  );
  const result = await client.session.summarize({
    scope: { kind: "run", runId: "run" },
  });
  assert.equal(result.text, "临时结果");
  assert.match(inputs[0], /修复插件/);
  assert.doesNotMatch(inputs[0], /另一轮|instruction|检查协议/);
  await client.session.summarize({ scope: { kind: "session" } });
  assert.match(inputs[1], /另一轮/);
  assert.equal(await readFile(file, "utf8"), original);
  await assert.rejects(
    client.session.summarize({ scope: { kind: "run", runId: "missing" } }),
    { code: "HOST_UNAVAILABLE" },
  );
  await assert.rejects(
    host.invoke(
      "session.summarize",
      { scope: { kind: "session" }, workspacePath: "/other" },
      requirements,
      context(),
    ),
    { code: "HOST_INVALID_REQUEST" },
  );
  await assert.rejects(host.invoke("session.ledger.read", {}, {}, context()), {
    code: "HOST_DENIED",
  });
});

test("desktop adapter uses stateless chat with host-resolved credentials, never a session mutation", async () => {
  const calls = [];
  const dir = await mkdtemp(join(tmpdir(), "isle-desktop-summary-"));
  try {
    const actual = createDesktopExtensionAdapter({
      config: { appDataDirName: ".isle" },
      agent: {
        invoke: async (name) => {
          assert.equal(name, "read_agent_runtime_session");
          return ledger;
        },
      },
      chats: { load: async () => ({ options: { selectedModelId: "chosen" } }) },
      llm: {
        read: () => ({
          providers: [
            {
              provider: "test",
              apiFormat: "openai-completions",
              apiKey: "secret",
              models: [{ id: "chosen", modelId: "model" }],
            },
          ],
        }),
      },
      supervisor: {
        call: async (...args) => {
          calls.push(args);
          return { text: "summary" };
        },
      },
    });
    const result = await actual["session.summarize"](
      { scope: { kind: "session" } },
      { ...context(), target: { workspacePath: dir, chatId: "a" } },
    );
    assert.equal(result.text, "summary");
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "agent/chat");
    assert.equal(calls[0][1].stream, false);
    assert.equal(calls[0][1].sessionRootDir, undefined);
    assert.equal(calls[0][1].resources, undefined);
    assert.equal(calls[0][1].runtimeModel.apiKey, "secret");
    assert.doesNotMatch(JSON.stringify(result), /secret/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("view cancellation, closure and disable abort host services and discard pending summaries", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "isle-summary-cancel-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, "ui.js"), "export default {};");
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({
      name: "test.view",
      version: "1.0.0",
      type: "module",
      "isle.plugin": {
        id: "test.view",
        schemaVersion: 1,
        protocolVersion: 1,
        host: { required: ["session.summarize"] },
        modules: {
          ui: {
            entry: "ui.js",
            contributions: [
              {
                id: "v",
                slot: "session.sidebar",
                type: "sidebar",
                title: "Test",
                icon: "chart",
                view: { id: "v" },
              },
            ],
          },
        },
      },
    }),
  );
  let onStart;
  const host = {
    "session.summarize": async (_input, { signal }) => {
      onStart();
      return new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        }),
      );
    },
  };
  const commands = new Extensions(join(dir, "data"), undefined, {
    host,
    changed() {},
  }).commands();
  await commands.add_extension({ path: dir });
  const open = () =>
    commands.open_extension_view({
      id: "test.view",
      contributionId: "v",
      viewId: "v",
      workspacePath: dir,
      chatId: "a",
    });
  const earlyView = await open();
  await commands.cancel_extension_view_request({
    token: earlyView.token,
    requestId: 1,
  });
  await assert.rejects(
    commands.query_extension_view({
      token: earlyView.token,
      method: "session.summarize",
      arguments: { scope: { kind: "session" } },
      requestId: 1,
    }),
    { code: "HOST_CANCELLED" },
  );
  await commands.close_extension_view({ token: earlyView.token });
  for (const action of ["cancel", "close", "disable"]) {
    const view = await open();
    const started = new Promise((resolve) => {
      onStart = resolve;
    });
    const pending = commands.query_extension_view({
      token: view.token,
      method: "session.summarize",
      arguments: { scope: { kind: "session" } },
      requestId: 1,
    });
    const rejected = assert.rejects(pending, { code: "HOST_CANCELLED" });
    await started;
    if (action === "cancel")
      await commands.cancel_extension_view_request({
        token: view.token,
        requestId: 1,
      });
    if (action === "close")
      await commands.close_extension_view({ token: view.token });
    if (action === "disable")
      await commands.configure_extension({ id: "test.view", enabled: false });
    await rejected;
    await commands.close_extension_view({ token: view.token });
  }
});
