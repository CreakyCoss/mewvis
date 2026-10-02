import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import { startServer } from "../../dist/server.js";
import { token, waitFor } from "../support/helpers.mjs";

test(
  "ledger plugin summarizes through the real host and Pi without changing session files",
  { timeout: 60_000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), "mewvis-plugin-summary-"));
    const requests = [];
    const model = createServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) body += chunk;
      requests.push(JSON.parse(body));
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(
        `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "local", choices: [{ index: 0, delta: { content: "只读摘要测试完成" }, finish_reason: "stop" }] })}\n\n`,
      );
      response.end("data: [DONE]\n\n");
    });
    model.listen(0, "127.0.0.1");
    await once(model, "listening");
    const server = await startServer({
      port: 0,
      token,
      runtime: { dataDir: join(root, "data") },
    });
    t.after(async () => {
      await server.close();
      model.closeAllConnections();
      await new Promise((resolve) => model.close(resolve));
      await rm(root, { recursive: true, force: true });
    });
    const call = async (name, input = {}) => {
      const response = await fetch(`${server.url}/api/commands/${name}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ input }),
      });
      const value = await response.json();
      assert.equal(response.status, 200, JSON.stringify(value));
      return value;
    };
    const workspace = await call("create_workspace", {
      name: "摘要测试",
      path: join(root, "workspace"),
    });
    const target = { workspacePath: workspace.path, chatId: "summary-test" };
    const endpoint = `http://127.0.0.1:${model.address().port}/v1`;
    const settings = await call("save_llm_settings", {
      providers: [
        {
          name: "Local fixture",
          provider: "openai",
          apiFormat: "openai-completions",
          apiKey: "test",
          apiEndpoint: endpoint,
          isDefault: true,
          models: [
            {
              modelId: "local",
              modelName: "Local",
              isOneMillionContext: false,
            },
          ],
        },
      ],
    });
    await call("save_chat", {
      ...target,
      workspaceId: workspace.id,
      origin: { kind: "builtin", sceneId: "chat" },
      messages: [],
      options: { selectedModelId: settings.providers[0].models[0].id },
    });
    await call("run_agent_runtime_agent", {
      ...target,
      sessionRootDir: `chats/${target.chatId}/session`,
      taskId: "summary-source",
      agentRoleId: "main",
      userMessage: "验证只读摘要",
      resources: { tools: { allowed: [] }, skills: { enabled: [] } },
      runtimeModel: {
        provider: "openai",
        modelId: "local",
        catalogModelId: "local",
        apiFormat: "openai-completions",
        apiEndpoint: endpoint,
        apiKey: "test",
        reasoning: false,
      },
    });
    await waitFor(
      () =>
        ["done", "failed"].includes(
          server.supervisor.snapshot("summary-source")?.taskState,
        ),
      "source session",
      20_000,
    );
    assert.equal(
      server.supervisor.snapshot("summary-source").taskState,
      "done",
    );
    const summaryAction = (await call("list_extension_ui_contributions")).find(
      (item) =>
        item.extensionId === "mewvis.session-ledger" &&
        item.id === "open-summary",
    );
    assert.equal(summaryAction?.slot, "session.header-actions");
    assert.deepEqual(summaryAction?.trigger, { kind: "dialog", id: "summary" });
    const view = await call("open_extension_view", {
      ...target,
      id: "mewvis.session-ledger",
      contributionId: "ledger",
      viewId: "ledger",
    });
    let sequence = 0;
    const query = (method, input = {}) =>
      call("query_extension_view", {
        token: view.token,
        method,
        arguments: input,
        requestId: ++sequence,
      });
    const before = await query("session.ledger.read");
    assert.equal(before.runs.length, 1);
    assert.ok(
      before.messages.some((item) => item.text.includes("验证只读摘要")),
    );
    const directory = join(
      workspace.path,
      server.supervisor.config.appDataDirName,
      `chats/${target.chatId}/session`,
    );
    const files = async () => {
      const result = {};
      for (const entry of await readdir(directory, {
        recursive: true,
        withFileTypes: true,
      })) {
        if (entry.isFile()) {
          const path = join(entry.parentPath, entry.name);
          result[relative(directory, path)] = await readFile(path, "utf8");
        }
      }
      return result;
    };
    const original = await files();
    for (const scope of [
      { kind: "session" },
      { kind: "run", runId: before.runs[0].id },
    ]) {
      const summary = await query("session.summarize", { scope });
      assert.equal(summary.text, "只读摘要测试完成");
      assert.equal(summary.truncated, false);
      assert.ok(summary.generatedAt > 0);
    }
    assert.equal(requests.length, 3);
    assert.match(JSON.stringify(requests[1].messages), /验证只读摘要/);
    assert.deepEqual(await query("session.ledger.read"), before);
    assert.deepEqual(await files(), original);
    await call("close_extension_view", { token: view.token });
  },
);
