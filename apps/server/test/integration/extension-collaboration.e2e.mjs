import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { startServer } from "../../dist/server.js";
import { token, waitFor } from "../support/helpers.mjs";

test(
  "configurable collaboration crosses SDK, host, Pi, slash command, model tool and activity cancellation",
  { timeout: 120000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), "isle-plugin-collaboration-"));
    const requests = [];
    let hold = false;
    const model = createServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) body += chunk;
      const input = JSON.parse(body);
      requests.push(input);
      if (hold) {
        await delay(15000);
        if (response.destroyed) return;
      }
      const tool = input.tools?.find(
        (item) => item.function?.name === "ext_isle_collaboration__review",
      );
      const toolReply = input.messages?.some((item) => item.role === "tool");
      const delta =
        tool && !toolReply
          ? {
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id: "flow-call",
                  type: "function",
                  function: {
                    name: tool.function.name,
                    arguments: JSON.stringify({ text: "模型选择流程" }),
                  },
                },
              ],
            }
          : { role: "assistant", content: `步骤结果 ${requests.length}` };
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(
        `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "local", choices: [{ index: 0, delta, finish_reason: tool && !toolReply ? "tool_calls" : "stop" }] })}\n\n`,
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
    const events = [];
    server.supervisor.events.subscribe((event) => events.push(event));
    t.after(async () => {
      await server.close();
      model.closeAllConnections();
      await new Promise((r) => model.close(r));
      await rm(root, { recursive: true, force: true });
    });
    const call = async (name, input = {}, expect = 200) => {
      const response = await fetch(`${server.url}/api/commands/${name}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify(
          name === "get_ai_agent_settings" || name === "delete_ai_agent"
            ? input
            : { input },
        ),
      });
      const result = await response.json();
      assert.equal(response.status, expect, JSON.stringify(result));
      return result;
    };
    const workspace = await call("create_workspace", {
      name: "协作测试",
      path: join(root, "workspace"),
    });
    const target = {
      workspacePath: workspace.path,
      chatId: "collaboration-test",
    };
    const hostSettings = await call("save_ai_agent", {
      name: "分析师",
      avatar: "cat-sky",
      description: "宿主角色独有指令，不应注入插件任务",
    });
    const settings = await call("open_extension_view", {
      id: "isle.collaboration",
      contributionId: "settings",
      viewId: "settings",
    });
    let sequence = 0;
    const query = (view, method, args = {}) =>
      call("query_extension_view", {
        token: view.token,
        method,
        arguments: args,
        requestId: ++sequence,
      });
    await call(
      "query_extension_view",
      {
        token: settings.token,
        method: "roles.list",
        arguments: {},
        requestId: ++sequence,
      },
      403,
    );
    await call(
      "query_extension_view",
      {
        token: settings.token,
        method: "activity.read",
        arguments: {},
        requestId: ++sequence,
      },
      403,
    );
    const roleId = "plugin_analyst";
    const role = {
      id: roleId,
      name: "分析师",
      instructions: "插件独立角色指令：请分析需求并输出结论",
      avatar: "prism",
    };
    const flow = {
      id: "review",
      name: "自定义评审",
      description: "分析后复核",
      steps: [
        {
          id: "draft",
          name: "分析",
          roleId,
          instruction: "请分析任务",
          input: "original",
        },
        {
          id: "review",
          name: "复核",
          roleId,
          instruction: "请复核上一步",
          input: "previous",
        },
      ],
    };
    await query(settings, "configuration.write", {
      value: { roles: [role], workflows: [flow] },
    });
    assert.deepEqual((await query(settings, "configuration.read")).workflows, [
      flow,
    ]);
    assert.deepEqual((await query(settings, "configuration.read")).roles, [
      role,
    ]);
    assert.deepEqual(
      await call("get_ai_agent_settings"),
      hostSettings,
      "插件配置不能改动宿主角色",
    );
    const catalog = await call("list_extension_commands", target);
    assert.ok(
      catalog.commands.some(
        (item) =>
          item.id === "isle.collaboration/review" && item.inputMode === "text",
      ),
    );
    const status = await call("open_extension_view", {
      ...target,
      id: "isle.collaboration",
      contributionId: "progress",
    });
    const run = (taskId, userMessage) =>
      call("run_agent_runtime_agent", {
        ...target,
        taskId,
        sessionRootDir: `chats/${target.chatId}/session`,
        agentRoleId: "main",
        userMessage,
        permissions: { mode: "full" },
        runtimeModel: {
          provider: "openai",
          modelId: "local",
          catalogModelId: "local",
          apiFormat: "openai-completions",
          apiEndpoint: `http://127.0.0.1:${model.address().port}/v1`,
          apiKey: "test",
          reasoning: false,
        },
      });
    const done = async (taskId) => {
      await waitFor(
        () =>
          ["done", "failed", "cancelled"].includes(
            server.supervisor.snapshot(taskId)?.taskState,
          ),
        taskId,
        40000,
      );
      assert.equal(
        server.supervisor.snapshot(taskId).taskState,
        "done",
        JSON.stringify(
          events.filter((event) => JSON.stringify(event).includes("error")),
        ),
      );
    };
    await run("slash-flow", "/isle.collaboration/review 设计一个任务方案");
    await done("slash-flow");
    assert.equal(
      requests.length,
      2,
      "slash commands bypass parent model selection",
    );
    assert.match(JSON.stringify(requests[0].messages), /插件独立角色指令/);
    assert.doesNotMatch(
      JSON.stringify(requests[0].messages),
      /宿主角色独有指令/,
    );
    assert.match(JSON.stringify(requests[1].messages), /步骤结果 1/);
    assert.ok(
      !requests[0].tools?.some((item) =>
        item.function?.name.startsWith("ext_"),
      ),
      "child tasks cannot recursively activate orchestration plugins",
    );
    assert.equal((await query(status, "activity.read")).state, "completed");
    const ledger = await call("read_agent_runtime_session", {
      workspacePath: workspace.path,
      sessionRootDir: `chats/${target.chatId}/session`,
    });
    assert.ok(
      ledger.messages.some((message) =>
        JSON.stringify(message).includes("步骤结果 2"),
      ),
    );
    await call("delete_ai_agent", {
      id: hostSettings.agents.find((r) => r.name === "分析师").id,
    });
    assert.deepEqual((await call("get_ai_agent_settings")).agents, []);
    await run("model-flow", "请按自定义评审流程完成任务");
    await done("model-flow");
    assert.ok(
      requests.some((r) =>
        r.tools?.some(
          (item) => item.function?.name === "ext_isle_collaboration__review",
        ),
      ),
    );
    assert.equal((await query(status, "activity.read")).state, "completed");
    hold = true;
    const before = requests.length;
    await run("cancel-flow", "/isle.collaboration/review 等待取消");
    await waitFor(() => requests.length > before, "child started", 15000);
    const running = await query(status, "activity.read");
    assert.equal(running.state, "running");
    assert.equal(running.steps[0].state, "running");
    await query(status, "activity.cancel", { id: running.id });
    await waitFor(
      () =>
        server.supervisor.snapshot("cancel-flow")?.taskState === "cancelled",
      "cancelled",
      10000,
    );
    const cancelled = await query(status, "activity.read");
    assert.equal(cancelled.state, "cancelled");
    assert.equal(cancelled.steps[0].state, "cancelled");
    const other = await call("open_extension_view", {
      ...target,
      chatId: "another-chat",
      id: "isle.collaboration",
      contributionId: "progress",
    });
    assert.equal(await query(other, "activity.read"), null);
  },
);
