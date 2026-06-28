import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const desktopRoot = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "novel-claw-agent-runtime-collab-"));
const entryPath = join(tempDir, "collaboration-smoke.ts");
const bundlePath = join(tempDir, "collaboration-smoke.mjs");
const packagePath = join(tempDir, "package.json");
const runtimeEntry = resolve(desktopRoot, "agent-runtime/src/index.ts");

writeFileSync(entryPath, `
  import { mkdtempSync, rmSync } from "node:fs";
  import { tmpdir } from "node:os";
  import { join } from "node:path";
  import {
    CollaborationEventType,
    createCollaborationEngine,
    createAgentRuntime,
  } from ${JSON.stringify(runtimeEntry)};

  const assert = (condition: unknown, message: string, details?: unknown) => {
    if (!condition) {
      const suffix = details === undefined ? "" : "\\n" + JSON.stringify(details, null, 2);
      throw new Error(message + suffix);
    }
  };

  const workspacePath = mkdtempSync(join(tmpdir(), "novel-claw-collab-sdk-"));
  const events: unknown[] = [];

  try {
    const runtime = createAgentRuntime();
    const result = await runtime.runCollaboration({
      workspacePath,
      sessionRootDir: join(workspacePath, "session-store", "collaboration-smoke"),
      workflow: {
        id: "collaboration-smoke",
        steps: [
          {
            id: "planner",
            type: "agent",
            agentRoleId: "planner",
            userMessage: "请生成一个协作 smoke test 的计划。",
            outputKey: "plan",
          },
          {
            id: "writer",
            type: "agent",
            agentRoleId: "writer",
            userMessage: "请基于上一轮计划生成简短结果。",
            outputKey: "draft",
          },
        ],
      },
      agents: [
        {
          id: "planner",
          label: "Planner",
          agentId: "mock",
          systemPrompt: "你是协作 smoke test 的共享系统角色。",
        },
        {
          id: "writer",
          label: "Writer",
          agentId: "mock",
          systemPrompt: "你是协作 smoke test 的共享系统角色。",
        },
      ],
    }, {
      askUser: async () => "",
      emit: (event) => {
        events.push(event);
      },
    });

    assert(result.steps.length === 2, "应执行两个协作 step", result);
    assert(result.executorId === "langgraph", "默认协作 executor 应为 LangGraph", result);
    assert(typeof result.output === "object" && result.output !== null, "应返回对象形式输出", result);
    assert(result.steps.every((step) => step.text.includes("Mock agent 已完成模拟任务。")), "每个 step 应由 mock agent 完成", result.steps);
    const workflowStartedEvent = events.find((event) => event && typeof event === "object" && "type" in event && event.type === CollaborationEventType.WorkflowStarted);
    assert(workflowStartedEvent, "应发出 workflow_started 事件", events);
    assert((workflowStartedEvent as { executorId?: string }).executorId === "langgraph", "workflow_started 应携带 executorId", workflowStartedEvent);
    assert(events.some((event) => event && typeof event === "object" && "type" in event && event.type === CollaborationEventType.AgentEvent), "应包装 agent 事件", events);
    assert(events.some((event) => event && typeof event === "object" && "type" in event && event.type === CollaborationEventType.WorkflowDone), "应发出 workflow_done 事件", events);

    const explicitNativeEvents: unknown[] = [];
    const explicitNativeResult = await runtime.runCollaboration({
      workspacePath,
      sessionRootDir: join(workspacePath, "session-store", "collaboration-explicit-native"),
      workflow: {
        id: "collaboration-explicit-native-smoke",
        executor: "native",
        steps: [
          {
            id: "planner",
            type: "agent",
            agentRoleId: "planner",
            userMessage: "请生成显式 native executor 的计划。",
            outputKey: "plan",
          },
        ],
      },
      agents: [
        {
          id: "planner",
          label: "Planner",
          agentId: "mock",
          systemPrompt: "你是显式 native executor smoke test 的角色。",
        },
      ],
    }, {
      askUser: async () => "",
      emit: (event) => {
        explicitNativeEvents.push(event);
      },
    });
    assert(explicitNativeResult.executorId === "native", "workflow.executor=native 应显式选择 native executor", explicitNativeResult);
    assert(
      explicitNativeEvents.some((event) =>
        event && typeof event === "object" &&
        "type" in event &&
        event.type === CollaborationEventType.WorkflowStarted &&
        (event as { executorId?: string }).executorId === "native"
      ),
      "显式 native workflow 应体现在 workflow_started 事件",
      explicitNativeEvents,
    );

    const nativeDefaultRuntime = createAgentRuntime({
      defaultCollaborationExecutorId: "native",
    });
    const nativeDefaultEvents: unknown[] = [];
    const nativeDefaultResult = await nativeDefaultRuntime.runCollaboration({
      workspacePath,
      sessionRootDir: join(workspacePath, "session-store", "collaboration-default-native"),
      workflow: {
        id: "collaboration-default-native-smoke",
        steps: [
          {
            id: "planner",
            type: "agent",
            agentRoleId: "planner",
            userMessage: "请生成显式 native executor 的计划。",
            outputKey: "plan",
          },
        ],
      },
      agents: [
        {
          id: "planner",
          label: "Planner",
          agentId: "mock",
          systemPrompt: "你是显式 native executor smoke test 的角色。",
        },
      ],
    }, {
      askUser: async () => "",
      emit: (event) => {
        nativeDefaultEvents.push(event);
      },
    });
    assert(nativeDefaultResult.executorId === "native", "SDK option 应能显式设置 native collaboration executor", nativeDefaultResult);
    assert(
      nativeDefaultEvents.some((event) =>
        event && typeof event === "object" &&
        "type" in event &&
        event.type === CollaborationEventType.WorkflowStarted &&
        (event as { executorId?: string }).executorId === "native"
      ),
      "显式 native executor 应体现在 workflow_started 事件",
      nativeDefaultEvents,
    );

    const startedRoleIds: string[] = [];
    const reviewerMessages: string[] = [];
    const attempts = new Map<string, number>();
    const advancedEngine = createCollaborationEngine({
      runAgent: async (command, { emit }) => {
        const roleId = command.agentRoleId ?? "unknown";
        startedRoleIds.push(roleId);
        attempts.set(roleId, (attempts.get(roleId) ?? 0) + 1);
        if (roleId === "reviewer") {
          reviewerMessages.push(command.userMessage);
          if ((attempts.get(roleId) ?? 0) === 1) {
            throw new Error("reviewer retry smoke");
          }
        }
        emit({ type: "text_delta", delta: command.userMessage });
        return {
          text: roleId + ":" + command.userMessage,
        };
      },
    });
    const advancedEvents: unknown[] = [];
    const advancedResult = await advancedEngine.run({
      workspacePath,
      input: {
        topic: "parallel workflow",
        runOptional: false,
      },
      workflow: {
        id: "advanced-collaboration-smoke",
        executionMode: "parallel",
        steps: [
          {
            id: "left",
            type: "agent",
            agentRoleId: "left",
            userMessage: "Left {{ input.topic }}",
            outputKey: "left",
          },
          {
            id: "right",
            type: "agent",
            agentRoleId: "right",
            userMessage: "Right {{ input.topic }}",
            outputKey: "right",
          },
          {
            id: "optional",
            type: "agent",
            agentRoleId: "optional",
            when: {
              ref: "input.runOptional",
              truthy: true,
            },
            userMessage: "Optional branch should be skipped",
            outputKey: "optional",
          },
          {
            id: "reviewer",
            type: "agent",
            agentRoleId: "reviewer",
            dependsOn: ["left", "right"],
            maxRetries: 1,
            userMessage: "Review {{ output.left }} + {{ steps.right.text }} for {{ input.topic }}",
            outputKey: "review",
          },
          {
            id: "afterOptional",
            type: "agent",
            agentRoleId: "afterOptional",
            dependsOn: ["optional"],
            when: {
              ref: "steps.optional.text",
              exists: true,
            },
            userMessage: "This branch should also be skipped",
            outputKey: "afterOptional",
          },
        ],
      },
      agents: [
        { id: "left", label: "Left" },
        { id: "right", label: "Right" },
        { id: "optional", label: "Optional" },
        { id: "reviewer", label: "Reviewer" },
        { id: "afterOptional", label: "After Optional" },
      ],
    }, {
      askUser: async () => "",
      emit: (event) => {
        advancedEvents.push(event);
      },
    });

    assert(startedRoleIds.slice(0, 2).sort().join("|") === "left|right", "parallel 模式应先启动无依赖 step", startedRoleIds);
    assert(attempts.get("reviewer") === 2, "maxRetries 应允许失败 step 重试一次", Array.from(attempts.entries()));
    assert(advancedResult.steps.map((step) => step.stepId).join("|") === "left|right|reviewer", "并行结果应按 workflow step 顺序稳定返回", advancedResult.steps);
    assert(advancedResult.skippedSteps?.map((step) => step.stepId).join("|") === "optional|afterOptional", "when 条件不满足的 step 应稳定进入 skippedSteps", advancedResult.skippedSteps);
    assert(advancedEvents.some((event) => event && typeof event === "object" && "type" in event && event.type === CollaborationEventType.StepSkipped), "when 条件不满足时应发出 step_skipped", advancedEvents);
    assert(reviewerMessages.at(-1)?.includes("left:Left parallel workflow"), "reviewer 应能引用 output.left", reviewerMessages);
    assert(reviewerMessages.at(-1)?.includes("right:Right parallel workflow"), "reviewer 应能引用 steps.right.text", reviewerMessages);
    assert(reviewerMessages.at(-1)?.includes("parallel workflow"), "reviewer 应能引用 input.topic", reviewerMessages);

    const langGraphStartedRoleIds: string[] = [];
    const langGraphReviewerMessages: string[] = [];
    const langGraphAttempts = new Map<string, number>();
    const langGraphEngine = createCollaborationEngine({
      runAgent: async (command, { emit }) => {
        const roleId = command.agentRoleId ?? "unknown";
        langGraphStartedRoleIds.push(roleId);
        langGraphAttempts.set(roleId, (langGraphAttempts.get(roleId) ?? 0) + 1);
        if (roleId === "reviewer") {
          langGraphReviewerMessages.push(command.userMessage);
          if ((langGraphAttempts.get(roleId) ?? 0) === 1) {
            throw new Error("langgraph reviewer retry smoke");
          }
        }
        emit({ type: "text_delta", delta: command.userMessage });
        return {
          text: roleId + ":" + command.userMessage,
        };
      },
    });
    const langGraphEvents: unknown[] = [];
    const langGraphResult = await langGraphEngine.run({
      workspacePath,
      input: {
        topic: "langgraph workflow",
        runOptional: false,
      },
      workflow: {
        id: "langgraph-collaboration-smoke",
        executor: "langgraph",
        executionMode: "parallel",
        steps: [
          {
            id: "left",
            type: "agent",
            agentRoleId: "left",
            userMessage: "Left {{ input.topic }}",
            outputKey: "left",
          },
          {
            id: "right",
            type: "agent",
            agentRoleId: "right",
            userMessage: "Right {{ input.topic }}",
            outputKey: "right",
          },
          {
            id: "optional",
            type: "agent",
            agentRoleId: "optional",
            when: {
              ref: "input.runOptional",
              truthy: true,
            },
            userMessage: "Optional branch should be skipped",
            outputKey: "optional",
          },
          {
            id: "reviewer",
            type: "agent",
            agentRoleId: "reviewer",
            dependsOn: ["left", "right"],
            maxRetries: 1,
            userMessage: "Review {{ output.left }} + {{ steps.right.text }} for {{ input.topic }}",
            outputKey: "review",
          },
          {
            id: "afterOptional",
            type: "agent",
            agentRoleId: "afterOptional",
            dependsOn: ["optional"],
            when: {
              ref: "steps.optional.text",
              exists: true,
            },
            userMessage: "This branch should also be skipped",
            outputKey: "afterOptional",
          },
        ],
      },
      agents: [
        { id: "left", label: "Left" },
        { id: "right", label: "Right" },
        { id: "optional", label: "Optional" },
        { id: "reviewer", label: "Reviewer" },
        { id: "afterOptional", label: "After Optional" },
      ],
    }, {
      askUser: async () => "",
      emit: (event) => {
        langGraphEvents.push(event);
      },
    });

    assert(langGraphResult.executorId === "langgraph", "workflow.executor=langgraph 应选择 LangGraph executor", langGraphResult);
    assert(langGraphStartedRoleIds.slice(0, 2).sort().join("|") === "left|right", "LangGraph parallel 模式应先启动无依赖 step", langGraphStartedRoleIds);
    assert(langGraphAttempts.get("reviewer") === 2, "LangGraph executor 应复用 step maxRetries", Array.from(langGraphAttempts.entries()));
    assert(langGraphResult.steps.map((step) => step.stepId).join("|") === "left|right|reviewer", "LangGraph executor 应按 workflow step 顺序稳定返回", langGraphResult.steps);
    assert(langGraphResult.skippedSteps?.map((step) => step.stepId).join("|") === "optional|afterOptional", "LangGraph executor 应保留 skippedSteps", langGraphResult.skippedSteps);
    assert(langGraphReviewerMessages.at(-1)?.includes("left:Left langgraph workflow"), "LangGraph reviewer 应能引用 output.left", langGraphReviewerMessages);
    assert(langGraphReviewerMessages.at(-1)?.includes("right:Right langgraph workflow"), "LangGraph reviewer 应能引用 steps.right.text", langGraphReviewerMessages);
    assert(
      langGraphEvents.some((event) =>
        event && typeof event === "object" &&
        "type" in event &&
        event.type === CollaborationEventType.WorkflowStarted &&
        (event as { executorId?: string }).executorId === "langgraph"
      ),
      "LangGraph workflow_started 应携带 executorId",
      langGraphEvents,
    );

    let customRunAgentCalled = false;
    const customExecutorEngine = createCollaborationEngine({
      runAgent: async () => {
        customRunAgentCalled = true;
        throw new Error("custom executor should not call runAgent");
      },
      executors: [{
        id: "custom-smoke",
        run: async ({ executorId, workflowRunId }) => ({
          workflowRunId,
          executorId,
          steps: [{
            stepId: "custom",
            agentRoleId: "custom-role",
            agentTaskId: workflowRunId + ":custom",
            outputKey: "custom",
            text: "custom executor result",
          }],
          skippedSteps: [],
          output: {
            selectedExecutorId: executorId,
          },
        }),
      }],
    });
    const customEvents: unknown[] = [];
    const customResult = await customExecutorEngine.run({
      workspacePath,
      workflow: {
        id: "custom-executor-smoke",
        executor: "custom-smoke",
        steps: [{
          id: "custom",
          type: "agent",
          agentRoleId: "custom-role",
          userMessage: "custom",
        }],
      },
      agents: [{ id: "custom-role", label: "Custom Role" }],
    }, {
      emit: (event) => {
        customEvents.push(event);
      },
    });
    assert(customResult.executorId === "custom-smoke", "workflow.executor 应选择注册的自定义 executor", customResult);
    assert(!customRunAgentCalled, "自定义 executor 不应自动调用 native runAgent", customResult);
    assert(
      customEvents.some((event) =>
        event && typeof event === "object" &&
        "type" in event &&
        event.type === CollaborationEventType.WorkflowStarted &&
        (event as { executorId?: string }).executorId === "custom-smoke"
      ),
      "自定义 executor 的 workflow_started 应携带 executorId",
      customEvents,
    );

    console.log(JSON.stringify({
      ok: true,
      workflowRunId: result.workflowRunId,
      executorId: result.executorId,
      steps: result.steps.map((step) => ({
        stepId: step.stepId,
        agentRoleId: step.agentRoleId,
        outputKey: step.outputKey,
      })),
      eventCount: events.length,
      explicitNative: {
        workflowRunId: explicitNativeResult.workflowRunId,
        executorId: explicitNativeResult.executorId,
        eventCount: explicitNativeEvents.length,
      },
      nativeDefault: {
        workflowRunId: nativeDefaultResult.workflowRunId,
        executorId: nativeDefaultResult.executorId,
        eventCount: nativeDefaultEvents.length,
      },
      advanced: {
        workflowRunId: advancedResult.workflowRunId,
        stepIds: advancedResult.steps.map((step) => step.stepId),
        eventCount: advancedEvents.length,
        reviewerAttempts: attempts.get("reviewer"),
        skippedStepIds: advancedResult.skippedSteps?.map((step) => step.stepId) ?? [],
      },
      langGraph: {
        workflowRunId: langGraphResult.workflowRunId,
        stepIds: langGraphResult.steps.map((step) => step.stepId),
        eventCount: langGraphEvents.length,
        reviewerAttempts: langGraphAttempts.get("reviewer"),
        skippedStepIds: langGraphResult.skippedSteps?.map((step) => step.stepId) ?? [],
      },
      custom: {
        workflowRunId: customResult.workflowRunId,
        executorId: customResult.executorId,
        eventCount: customEvents.length,
      },
    }, null, 2));
  } finally {
    rmSync(workspacePath, { recursive: true, force: true });
  }
`, "utf8");

try {
  await build({
    entryPoints: [entryPath],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    outfile: bundlePath,
    banner: {
      js: "import { createRequire as __bridgeCreateRequire } from 'node:module'; const require = __bridgeCreateRequire(import.meta.url);",
    },
  });

  writeFileSync(packagePath, `${JSON.stringify({
    name: "novel-claw-agent-runtime-collaboration-smoke",
    version: "0.0.0",
    type: "module",
  }, null, 2)}\n`, "utf8");

  await import(pathToFileURL(bundlePath).href);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
