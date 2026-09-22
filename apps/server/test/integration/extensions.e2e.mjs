import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { once } from "node:events";
import { startServer } from "../../dist/server.js";
import { token, waitFor } from "../support/helpers.mjs";

test(
  "desktop plugin management → approved commands → real Pi → refresh settings in reused worker",
  { timeout: 90_000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), "isle-desktop-plugins-"));
    let releaseModel;
    const model = createServer(async (request, response) => {
      for await (const _chunk of request) {
        /* drain */
      }
      await new Promise((resolve) => {
        releaseModel = resolve;
      });
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(
        `data: ${JSON.stringify({ id: "plugin-model", object: "chat.completion.chunk", created: 1, model: "local", choices: [{ index: 0, delta: { content: "本地模型完成" }, finish_reason: "stop" }] })}\n\n`,
      );
      response.end("data: [DONE]\n\n");
    });
    model.listen(0, "127.0.0.1");
    await once(model, "listening");
    const server = await startServer({
      port: 0,
      token,
      runtime: {
        dataDir: join(root, "data"),
        bundledExtensionsPath: join(root, "no-bundled-extensions"),
        env: { ...process.env, AGENT_RUNTIME_PROFILE_ID: "default" },
      },
    });
    t.after(async () => {
      releaseModel?.();
      await server.close();
      model.closeAllConnections();
      await new Promise((resolve) => model.close(resolve));
      await rm(root, { recursive: true, force: true });
    });
    const raw = async (name, input, bare = false) => {
      const response = await fetch(`${server.url}/api/commands/${name}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify(bare ? input : { input }),
      });
      return { status: response.status, value: await response.json() };
    };
    const call = async (name, input = {}, bare = false) => {
      const response = await raw(name, input, bare);
      assert.equal(response.status, 200, JSON.stringify(response.value));
      return response.value;
    };
    const workspace = await call("create_workspace", {
      name: "插件测试",
      path: join(root, "workspace"),
    });
    const target = { workspacePath: workspace.path, chatId: "plugins-test" };
    const packagePath = fileURLToPath(
      new URL("../../../extensions/tasks/dist/plugin", import.meta.url),
    );
    assert.deepEqual(await call("list_extensions"), []);
    const records = await call("add_extension", { path: packagePath });
    assert.equal(records[0].id, "isle.tasks");
    assert.equal(records[0].enabled, true);
    assert.equal(
      (await raw("add_extension", { path: packagePath })).status,
      400,
    );
    assert.equal(
      (
        await raw("configure_extension", {
          id: "isle.tasks",
          config: { maxTasks: 0 },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await raw("configure_extension", {
          id: "isle.tasks",
          commandRisks: { add: "low" },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await raw("execute_extension_command", {
          ...target,
          taskId: "inject",
          commandId: "isle.tasks/add",
          extensions: [],
        })
      ).status,
      400,
    );
    assert.equal(
      (await raw("list_extension_commands", { ...target, chatId: "../escape" }))
        .status,
      400,
    );
    assert.equal(
      (await call("list_extension_commands", target)).commands.length,
      4,
    );
    let sequence = 0;
    const execute = async (
      name,
      args = {},
      approve = true,
      needsApproval = true,
    ) => {
      const taskId = `extension-${++sequence}`;
      await call("execute_extension_command", {
        ...target,
        taskId,
        commandId: `isle.tasks/${name}`,
        arguments: args,
      });
      if (needsApproval) {
        await waitFor(
          () => server.supervisor.snapshot(taskId)?.pendingInput,
          "plugin approval",
          15_000,
        );
        const approval = server.supervisor.snapshot(taskId).pendingInput;
        assert.equal(approval.taskId, taskId);
        await call("answer_agent_runtime_approval", {
          taskId,
          approvalId: approval.approvalId,
          approved: approve,
        });
      }
      await waitFor(
        () =>
          ["done", "failed"].includes(
            server.supervisor.snapshot(taskId)?.taskState,
          ),
        "plugin result",
        15_000,
      );
      const response = await fetch(`${server.url}/api/tasks/${taskId}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const snapshot = await response.json();
      assert.equal(snapshot.result.type, "extension_command_result");
      return snapshot;
    };
    const added = await execute("add", { title: "桌面闭环" });
    assert.equal(added.result.success, true);
    const id = added.result.value.id;
    const denied = await execute("add", { title: "拒绝执行" }, false);
    assert.equal(denied.result.success, false);
    const listed = await execute("list");
    assert.equal(listed.result.value.items.length, 1);
    assert.equal(listed.workerId, added.workerId);
    await execute("select", { id });

    // Hold a real model response while changing configuration. The active run keeps its plugin snapshot.
    const taskId = "pi-plugin-run";
    await call("run_agent_runtime_agent", {
      workspacePath: workspace.path,
      chatId: target.chatId,
      sessionRootDir: `chats/${target.chatId}/session`,
      taskId,
      agentRoleId: "main",
      userMessage: "完成任务",
      resources: { tools: { allowed: [] }, skills: { enabled: [] } },
      runtimeModel: {
        provider: "openai",
        modelId: "local",
        catalogModelId: "local",
        apiFormat: "openai-completions",
        apiEndpoint: `http://127.0.0.1:${model.address().port}/v1`,
        apiKey: "test-key",
        reasoning: false,
      },
    });
    await waitFor(() => releaseModel, "real model request", 20_000);
    await call("execute_extension_command", {
      ...target,
      taskId: "queued-plugin",
      commandId: "isle.tasks/list",
      arguments: {},
    });
    assert.equal(
      server.supervisor.snapshot("queued-plugin").taskState,
      "queued",
    );
    await call("abort_agent_runtime_agent", { taskId: "queued-plugin" }, true);
    assert.equal(
      server.supervisor.snapshot("queued-plugin").taskState,
      "cancelled",
    );
    await call("configure_extension", { id: "isle.tasks", enabled: false });
    releaseModel();
    await waitFor(
      () =>
        ["done", "failed"].includes(
          server.supervisor.snapshot(taskId)?.taskState,
        ),
      "Pi completion",
      15_000,
    );
    assert.equal(server.supervisor.snapshot(taskId).taskState, "done");
    assert.equal(server.supervisor.snapshot(taskId).workerId, added.workerId);
    assert.deepEqual(
      (await call("list_extension_commands", target)).commands,
      [],
    );
    const disabled = await execute("list", {}, true, false);
    assert.equal(disabled.result.success, false);
    assert.match(disabled.result.message, /未启用/);
    await call("configure_extension", {
      id: "isle.tasks",
      enabled: true,
      config: { maxTasks: 1 },
    });
    const restored = await execute("list");
    assert.equal(restored.result.value.items[0].status, "completed");
    assert.equal(restored.workerId, added.workerId);
    const limited = await execute("add", { title: "超出上限" });
    assert.match(limited.result.message, /maxTasks/);
    await call("execute_extension_command", {
      ...target,
      taskId: "cancel-plugin",
      commandId: "isle.tasks/add",
      arguments: { title: "不应执行" },
    });
    await waitFor(
      () => server.supervisor.snapshot("cancel-plugin")?.pendingInput,
      "cancel approval",
      15_000,
    );
    await call("abort_agent_runtime_agent", { taskId: "cancel-plugin" }, true);
    await waitFor(
      () =>
        server.supervisor.snapshot("cancel-plugin")?.taskState === "cancelled",
      "command cancellation",
      15_000,
    );
    const afterCancel = await execute("list");
    assert.equal(afterCancel.result.value.items.length, 1);
    await call("remove_extension", { id: "isle.tasks" });
    assert.deepEqual(await call("list_extensions"), []);
    const dataFile = join(
      workspace.path,
      server.supervisor.config.appDataDirName,
      `chats/${target.chatId}/session/extensions/isle.tasks.json`,
    );
    assert.match(await readFile(dataFile, "utf8"), /桌面闭环/);
  },
);

test(
  "bundled plugins are discovered without registration and overrides survive restart",
  { timeout: 60_000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), "isle-bundled-plugins-"));
    let server;
    t.after(async () => {
      await server?.close();
      await rm(root, { recursive: true, force: true });
    });
    const start = () =>
      startServer({ port: 0, token, runtime: { dataDir: join(root, "data") } });
    server = await start();
    const raw = async (name, input = {}) => {
      const response = await fetch(`${server.url}/api/commands/${name}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ input }),
      });
      return { status: response.status, value: await response.json() };
    };
    const call = async (name, input) => {
      const result = await raw(name, input);
      assert.equal(result.status, 200, JSON.stringify(result.value));
      return result.value;
    };
    const records = await call("list_extensions");
    assert.deepEqual(records.map((item) => item.id).sort(), [
      "isle.example",
      "isle.session-insights",
      "isle.tasks",
    ]);
    assert.ok(
      records.every(
        (item) => item.source === "bundled" && item.enabled && !item.error,
      ),
    );
    await assert.rejects(readFile(join(root, "data/extensions.json")), {
      code: "ENOENT",
    });
    assert.equal(
      (await raw("remove_extension", { id: "isle.tasks" })).status,
      400,
    );
    const workspace = await call("create_workspace", {
      name: "内置插件测试",
      path: join(root, "workspace"),
    });
    const target = { workspacePath: workspace.path, chatId: "bundled-test" };
    const [panel] = await call("list_extension_ui_contributions");
    assert.equal(panel.extensionId, "isle.session-insights");
    const view = await call("open_extension_view", {
      ...target,
      id: panel.extensionId,
      contributionId: panel.id,
      viewId: panel.view.id,
    });
    assert.match(view.source, /isle.session-insights/);
    const snapshot = await call("query_extension_view", {
      token: view.token,
      method: "session.read",
    });
    assert.deepEqual(snapshot.messages, []);
    assert.deepEqual(snapshot.runs, []);
    assert.equal(snapshot.truncated, false);
    assert.equal(
      (
        await raw("query_extension_view", {
          token: view.token,
          method: "session.read",
          chatId: "other",
        })
      ).status,
      400,
    );
    await call("configure_extension", {
      id: panel.extensionId,
      enabled: false,
    });
    assert.equal(
      (
        await raw("query_extension_view", {
          token: view.token,
          method: "session.read",
        })
      ).status,
      403,
    );
    assert.deepEqual(await call("list_extension_ui_contributions"), []);
    await call("configure_extension", { id: panel.extensionId, enabled: true });
    await call("close_extension_view", { token: view.token });
    assert.equal(
      (await call("list_extension_commands", target)).commands.length,
      4,
    );
    await call("execute_extension_command", {
      ...target,
      taskId: "bundled-command",
      commandId: "isle.tasks/list",
      arguments: {},
    });
    await waitFor(
      () => server.supervisor.snapshot("bundled-command")?.pendingInput,
      "builtin command approval",
      15_000,
    );
    const approval = server.supervisor.snapshot("bundled-command").pendingInput;
    await call("answer_agent_runtime_approval", {
      taskId: "bundled-command",
      approvalId: approval.approvalId,
      approved: true,
    });
    await waitFor(
      () => server.supervisor.snapshot("bundled-command")?.taskState === "done",
      "builtin command result",
      15_000,
    );
    assert.equal(
      server.supervisor.snapshot("bundled-command").result.success,
      true,
    );
    await call("configure_extension", {
      id: "isle.tasks",
      enabled: false,
      config: { maxTasks: 7 },
    });
    assert.deepEqual(
      (await call("list_extension_commands", target)).commands,
      [],
    );
    await server.close();
    server = undefined;
    server = await start();
    const persisted = (await call("list_extensions")).find(
      (item) => item.id === "isle.tasks",
    );
    assert.equal(persisted.enabled, false);
    assert.equal(persisted.config.maxTasks, 7);
    await call("configure_extension", { id: "isle.tasks", enabled: true });
    assert.equal(
      (await call("list_extension_commands", target)).commands.length,
      4,
    );
  },
);
