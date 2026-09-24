import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import { startServer } from "../../dist/server.js";
import { token, waitFor } from "../support/helpers.mjs";

test(
  "decision templates cross SDK, host and Pi with no tools, strict results and bounded repair",
  { timeout: 120000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), "isle-decisions-"));
    const requests = [],
      replies = [],
      events = [];
    const model = createServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) body += chunk;
      requests.push(JSON.parse(body));
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write(
        `data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", created: 1, model: "local", choices: [{ index: 0, delta: { role: "assistant", content: replies.shift() ?? "invalid" }, finish_reason: "stop" }] })}\n\n`,
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
    server.supervisor.events.subscribe((event) => events.push(event));
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
      name: "判断测试",
      path: join(root, "workspace"),
    });
    const target = { workspacePath: workspace.path, chatId: "decision-test" };
    const settings = await call("open_extension_view", {
      id: "isle.decisions",
      contributionId: "settings",
      viewId: "settings",
    });
    let requestId = 0;
    const query = (method, args = {}) =>
      call("query_extension_view", {
        token: settings.token,
        method,
        arguments: args,
        requestId: ++requestId,
      });
    const defaults = await query("configuration.read");
    assert.equal(defaults.rules.length, 0);
    await query("configuration.write", {
      value: {
        rules: [
          {
            id: "review",
            name: "上线条件判断",
            when: "判断是否满足上线条件",
            enabled: true,
            priority: 10,
            instructions: "判断是否可以上线",
            threshold: 0.8,
          },
        ],
      },
    });
    const catalog = await call("list_extension_commands", target);
    const command = catalog.commands.find(
      (item) => item.id === "isle.decisions/ready",
    );
    assert.equal(command.label, "执行条件判断");
    assert.equal(command.inputMode, "text");
    const run = async (taskId, answers, expectedState = "done") => {
      replies.push(...answers);
      await call("run_agent_runtime_agent", {
        ...target,
        taskId,
        sessionRootDir: `chats/${target.chatId}/session`,
        agentRoleId: "main",
        userMessage: "/isle.decisions/ready 已完成验证，请判断是否可以上线",
        permissions: { mode: "full" },
        resources: {
          tools: { allowed: ["read", "bash", "ask_user"] },
          skills: { enabled: [] },
        },
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
        expectedState,
        JSON.stringify(events.slice(-12)),
      );
      assert.equal(replies.length, 0);
      return events
        .map((event) => event.payload?.event)
        .filter((event) => event?.taskId === taskId);
    };
    const answer = (value, confidence) =>
      JSON.stringify({
        type: "boolean",
        value,
        confidence,
        reason: "根据提供的验证情况判断。",
      });
    const matched = JSON.stringify({
      matches: [{ id: "review", confidence: 0.95 }],
    });
    const accepted = await run("valid", [matched, answer(true, 0.9)]);
    assert.ok(
      accepted.some(
        (event) => event.type === "done" && event.text.includes("已判断"),
      ),
      JSON.stringify(accepted),
    );
    const review = await run("repair", [
      matched,
      "invalid",
      answer(false, 0.4),
    ]);
    assert.ok(
      review.some(
        (event) => event.type === "done" && event.text.includes("需复核"),
      ),
    );
    const abstained = await run("abstain", [matched, answer(null, 0)]);
    assert.ok(
      abstained.some(
        (event) => event.type === "done" && event.text.includes("已弃答"),
      ),
    );
    await run("invalid", [matched, "invalid", "invalid"], "failed");
    assert.equal(
      requests.length,
      10,
      "slash calls bypass parent inference; only invalid output is retried once",
    );
    const collabView = await call("open_extension_view", {
      id: "isle.collaboration",
      contributionId: "settings",
      viewId: "settings",
    });
    await call("query_extension_view", {
      token: collabView.token,
      method: "configuration.write",
      requestId: 1,
      arguments: {
        value: {
          roles: [
            {
              id: "writer",
              name: "方案作者",
              instructions: "写一份方案",
              avatar: "compass",
            },
          ],
          workflows: [
            {
              id: "assess",
              name: "方案与判断",
              description: "检查结果",
              steps: [
                {
                  id: "draft",
                  name: "方案",
                  roleId: "writer",
                  instruction: "写方案",
                  input: "original",
                  judgment: {
                    question: "是否满足上线条件？",
                    output: { type: "boolean" },
                  },
                },
              ],
            },
          ],
        },
      },
    });
    replies.push("方案：已完成测试", matched, answer(false, 0.4));
    await call("run_agent_runtime_agent", {
      ...target,
      taskId: "consumer",
      sessionRootDir: `chats/${target.chatId}/session`,
      agentRoleId: "main",
      userMessage: "/isle.collaboration/assess 准备上线方案",
      permissions: { mode: "full" },
      resources: { tools: { allowed: [] }, skills: { enabled: [] } },
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
    await waitFor(
      () =>
        ["done", "failed"].includes(
          server.supervisor.snapshot("consumer")?.taskState,
        ),
      "consumer",
      40000,
    );
    assert.equal(
      server.supervisor.snapshot("consumer").taskState,
      "done",
      JSON.stringify(events.slice(-12)),
    );
    assert.equal(replies.length, 0);
    const final = events
      .map((event) => event.payload?.event)
      .find((event) => event?.taskId === "consumer" && event.type === "done");
    assert.match(final.text, /review_required/);
    assert.equal(requests.length, 13);
    assert.ok(
      requests.every((request) => !request.tools?.length),
      "evaluation tasks must not expose inherited tools or plugin tools",
    );
    assert.ok(
      requests.every(
        (request) =>
          request.messages.filter((item) => item.role === "user").length === 1,
      ),
      "each evaluation uses an isolated context",
    );
  },
);
