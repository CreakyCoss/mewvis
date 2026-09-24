import assert from "node:assert/strict";
import { join } from "node:path";
import { buildExtensionPackage } from "@isle/extension-dev";

export async function verifyExtensionCollaboration({
  api,
  root,
  workspace,
  piCommand,
}) {
  const built = await buildExtensionPackage(
    join(root, "../extensions/collaboration"),
    { outputDir: join(workspace, "collaboration-package") },
  );
  const role = {
    id: "reviewer",
    name: "评审者",
    instructions: "插件职责：检查方案",
    avatar: "compass",
  };
  const flow = {
    id: "review",
    name: "评审",
    description: "自定义两步",
    steps: [
      {
        id: "draft",
        name: "初稿",
        roleId: role.id,
        instruction: "设计方案",
        input: "original",
      },
      {
        id: "check",
        name: "检查",
        roleId: role.id,
        instruction: "检查结果",
        input: "previous",
      },
    ],
  };
  const [source] = api.resolveExtensionPackages([
    { path: built.root, config: { roles: [role], workflows: [flow] } },
  ]);
  const mock = api.createScriptedMockRuntime("workflow-mock", [
    {
      type: "tool",
      name: "ext_isle_collaboration__review",
      input: { text: "测试任务" },
    },
  ]);
  const child = api.createScriptedMockRuntime("workflow-child", [
    { type: "text", text: "Mock 步骤完成" },
  ]);
  const children = [];
  const run = mock.agent.run;
  mock.agent.run = (command, context) => {
    if (!command.taskId.startsWith("extension-child-"))
      return run(command, context);
    children.push(command);
    assert.equal(context.extensions, undefined);
    context.emit({ type: "thinking_delta", taskId: command.taskId, delta: "Mock 步骤思考" });
    context.emit({ type: "thinking_end", taskId: command.taskId, content: "Mock 步骤思考" });
    return child.agent.run(command, context);
  };
  const events = [];
  const sdk = api.createAgentRuntime({
    runtimeAgents: [mock],
    extensions: [source],
    callbacks: { onEvent: (event) => events.push(event) },
  });
  const command = {
    ...piCommand,
    runtimeId: mock.id,
    permissions: { mode: "full" },
    resources: undefined,
    sessionRootDir: join(workspace, "workflow-mock-session"),
  };
  try {
    const result = await sdk.agent.run({
      ...command,
      taskId: "workflow-mock-tool",
      userMessage: "启动流程",
    });
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(children.length, 2);
    assert.match(children[0].systemPrompt, /插件职责：检查方案/);
    assert.notEqual(children[0].agentRoleId, role.id);
    assert.match(children[1].userMessage, /Mock 步骤完成/);
    assert.notEqual(children[0].sessionRootDir, children[1].sessionRootDir);
    assert.ok(
      events.some((event) => JSON.stringify(event).includes("Mock 步骤完成")),
    );
    const streamed = events.filter((event) => event.type === "subtask_event");
    assert.equal(new Set(streamed.map((event) => event.subtaskId)).size, 2);
    for (const subtaskId of new Set(streamed.map((event) => event.subtaskId))) {
      const output = streamed.filter((event) => event.subtaskId === subtaskId);
      assert.equal(output[0].event.type, "started");
      assert.equal(output.at(-1).event.type, "done");
      assert.ok(output.some(({ event }) => event.type === "thinking_delta"));
      assert.ok(output.some(({ event }) => event.type === "text_delta"));
      assert.ok(output.every((event) => event.taskId === "workflow-mock-tool"));
      assert.match(output[0].title, /评审者/);
      assert.match(output[0].avatar, /^data:image\/svg\+xml,/);
      assert.ok(output.slice(1).every((event) => event.avatar === undefined));
    }
    const slash = await sdk.agent.run({
      ...command,
      taskId: "workflow-mock-slash",
      userMessage: "/isle.collaboration/review 明确选择流程",
    });
    assert.equal(slash.success, true, JSON.stringify(slash));
    assert.equal(children.length, 4);
    const invalidSdk = api.createAgentRuntime({
      runtimeAgents: [mock],
      extensions: [{ ...source, config: { roles: [], workflows: [flow] } }],
    });
    const missing = await invalidSdk.agent.run({
      ...command,
      taskId: "workflow-mock-missing",
      userMessage: "/isle.collaboration/review 角色已删除",
    });
    await invalidSdk.shutdown();
    assert.equal(missing.success, false);
    assert.match(missing.message, /角色已不存在/);
    assert.equal(
      children.length,
      4,
      "invalid roles must not start a child task",
    );
    console.log(
      "PASS 自定义协作插件 → Mock 工具/斜杠命令 → 插件自有角色任务；子任务隔离与角色失效校验",
    );
  } finally {
    await sdk.shutdown();
  }
}
