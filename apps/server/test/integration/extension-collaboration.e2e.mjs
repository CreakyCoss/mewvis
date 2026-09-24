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
  "collaboration crosses SDK, host and Pi with step-boundary pause, resume and cancellation",
  { timeout: 120000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), "isle-plugin-collaboration-"));
    const requests = [];
    let gateChildren = false;
    const gates = [];
    const model = createServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) body += chunk;
      const input = JSON.parse(body);
      requests.push(input);
      const tool = input.tools?.find(
        (item) => item.function?.name === "ext_isle_collaboration__review",
      );
      if (gateChildren && !tool) {
        await new Promise((resolve) => gates.push(resolve));
        if (response.destroyed) return;
      }
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
      if (!tool) response.write(
        `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "local", choices: [{ index: 0, delta: { role: "assistant", reasoning_content: "步骤思考内容" }, finish_reason: null }] })}\n\n`,
      );
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
      for (const release of gates.splice(0)) release();
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
          [
            "get_ai_agent_settings",
            "delete_ai_agent",
            "resume_agent_runtime_agent",
            "abort_agent_runtime_agent",
          ].includes(name)
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
    const query = (view, method, args = {}, expect = 200) =>
      call(
        "query_extension_view",
        {
          token: view.token,
          method,
          arguments: args,
          requestId: ++sequence,
        },
        expect,
      );
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
    assert.equal(catalog.commands.find((item) => item.id === "isle.collaboration/review").label, flow.name);
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
    const other = await call("open_extension_view", {
      ...target,
      chatId: "another-chat",
      id: "isle.collaboration",
      contributionId: "progress",
    });
    const waitActivity = async (state, view = status) => {
      for (let i = 0; i < 200; i++) {
        const activity = await query(view, "activity.read");
        if (activity?.state === state) return activity;
        await delay(50);
      }
      assert.fail(`activity did not become ${state}`);
    };
    const waitChild = async () => {
      try {
        await waitFor(
          () => gates.length > 0,
          "child request reached model",
          15000,
        );
      } catch (error) {
        throw new Error(
          `${error.message}: ${JSON.stringify(events.slice(-15))}`,
        );
      }
    };
    const run = (taskId, userMessage, runTarget = target) =>
      call("run_agent_runtime_agent", {
        ...runTarget,
        taskId,
        sessionRootDir: `chats/${runTarget.chatId}/session`,
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
    const outputs = events
      .map((event) => event.payload?.event)
      .filter((event) => event?.type === "subtask_event" && event.taskId === "slash-flow");
    assert.equal(new Set(outputs.map((event) => event.subtaskId)).size, 2);
    for (const subtaskId of new Set(outputs.map((event) => event.subtaskId))) {
      const child = outputs.filter((event) => event.subtaskId === subtaskId);
      assert.equal(child[0].event.type, "started");
      assert.match(child[0].avatar, /^data:image\/svg\+xml,/);
      assert.equal(child.at(-1).event.type, "done");
      assert.ok(child.some(({ event }) => event.type === "thinking_delta" && event.delta.includes("步骤思考")));
      assert.ok(child.some(({ event }) => event.type === "text_delta" && event.delta.includes("步骤结果")));
    }
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
    gateChildren = true;
    const modelTarget = { ...target, chatId: "model-pausing" };
    const modelStatus = await call("open_extension_view", {
      ...modelTarget,
      id: "isle.collaboration",
      contributionId: "progress",
    });
    await run("model-pause-flow", "请按自定义评审流程完成任务", modelTarget);
    await waitChild();
    const modelActivity = await query(modelStatus, "activity.read");
    await query(modelStatus, "activity.pause", { id: modelActivity.id });
    gates.shift()();
    await waitActivity("paused", modelStatus);
    const pausedRequestCount = requests.length;
    await delay(250);
    assert.equal(
      requests.length,
      pausedRequestCount,
      "parent Pi waits for its paused plugin tool",
    );
    await query(modelStatus, "activity.resume", { id: modelActivity.id });
    await waitChild();
    gates.shift()();
    await done("model-pause-flow");
    assert.equal(
      (await query(modelStatus, "activity.read")).state,
      "completed",
    );
    const previous = await query(status, "activity.read");
    await run("pause-flow", "/isle.collaboration/review 步骤之间暂停");
    await waitChild();
    const first = await query(status, "activity.read");
    assert.equal(first.pausable, true);
    assert.deepEqual(first.steps.map((step) => step.actor), flow.steps.map(() => ({ name: role.name })));
    await query(status, "activity.pause", { id: previous.id }, 409);
    await query(other, "activity.pause", { id: first.id }, 409);
    await query(status, "activity.pause", { id: first.id });
    await query(status, "activity.pause", { id: first.id });
    const pausing = await query(status, "activity.read");
    assert.equal(pausing.state, "pausing");
    assert.equal(
      pausing.steps[0].state,
      "running",
      "pause never aborts the active step",
    );
    const firstRequestCount = requests.length;
    gates.shift()();
    const paused = await waitActivity("paused");
    assert.deepEqual(
      paused.steps.map((s) => s.state),
      ["completed", "pending"],
    );
    await delay(250);
    assert.equal(
      requests.length,
      firstRequestCount,
      "next step must not start during pause",
    );
    await waitFor(
      () => server.supervisor.snapshot("pause-flow").taskState === "paused",
      "shared paused task state",
    );
    assert.equal(paused.executionId, "pause-flow");
    assert.deepEqual(paused.steps[1].actor, { name: role.name });
    assert.ok(
      events.some(
        (event) =>
          event.payload?.taskId === "pause-flow" &&
          event.payload.event.taskState === "pausing",
      ),
    );
    await call("resume_agent_runtime_agent", { taskId: "pause-flow" });
    await query(status, "activity.resume", { id: first.id });
    await waitChild();
    assert.equal(
      requests.length,
      firstRequestCount + 1,
      "resume starts the next step exactly once",
    );
    assert.match(
      JSON.stringify(requests.at(-1).messages),
      new RegExp(`步骤结果 ${firstRequestCount}`),
    );
    await query(status, "activity.pause", { id: first.id });
    gates.shift()();
    await done("pause-flow");
    assert.equal(
      (await query(status, "activity.read")).state,
      "completed",
      "last-step completion wins over a pending pause",
    );
    await query(status, "activity.resume", { id: first.id }, 409);

    await run("withdraw-pause", "/isle.collaboration/review 撤回暂停");
    await waitChild();
    const withdrawn = await query(status, "activity.read");
    await query(status, "activity.pause", { id: withdrawn.id });
    await query(status, "activity.resume", { id: withdrawn.id });
    assert.equal((await query(status, "activity.read")).state, "running");
    gates.shift()();
    await waitChild();
    gates.shift()();
    await done("withdraw-pause");

    await run("cancel-paused", "/isle.collaboration/review 暂停后取消");
    await waitChild();
    const cancelPaused = await query(status, "activity.read");
    await query(status, "activity.pause", { id: cancelPaused.id });
    gates.shift()();
    await waitActivity("paused");
    const beforeCancel = requests.length;
    await query(status, "activity.cancel", { id: cancelPaused.id });
    assert.equal(
      server.supervisor.snapshot("cancel-paused").taskState,
      "cancelled",
      "cancel acknowledgement confirms termination",
    );
    assert.ok(
      events.some(
        (event) =>
          event.payload?.taskId === "cancel-paused" &&
          event.payload.event.taskState === "cancelling",
      ),
    );
    await waitFor(
      () =>
        server.supervisor.snapshot("cancel-paused")?.taskState === "cancelled",
      "paused task cancelled",
      10000,
    );
    assert.equal((await query(status, "activity.read")).state, "cancelled");
    assert.deepEqual(
      (await query(status, "activity.read")).steps.map((s) => s.state),
      ["completed", "pending"],
    );
    assert.equal(requests.length, beforeCancel);

    await run("cancel-flow", "/isle.collaboration/review 等待取消");
    await waitChild();
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
    assert.equal(await query(other, "activity.read"), null);
  },
);
