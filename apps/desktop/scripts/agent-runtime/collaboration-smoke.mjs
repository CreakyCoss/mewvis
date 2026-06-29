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
  import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
  import { tmpdir } from "node:os";
  import { join } from "node:path";
  import {
    CollaborationEventType,
    createCollaborationEngine,
    createAgentRuntime,
    getCollaborationTimeline,
    getRuntimeSessionSnapshot,
    listRuntimeSessions,
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

    const modeEngine = createCollaborationEngine({
      runAgent: async (command) => {
        if (command.agentRoleId === "supervisor") {
          return {
            text: JSON.stringify({
              status: "continue",
              candidates: [
                {
                  targetId: "worker-a",
                  score: 91,
                  reason: "worker-a 最适合继续",
                  instruction: "请 worker-a 给出一句结果",
                },
                {
                  targetId: "worker-b",
                  score: 12,
                  reason: "worker-b 暂不需要",
                },
              ],
              selectedTargetId: "worker-a",
              selectedInstruction: "请 worker-a 给出一句结果",
              reason: "选择最高分 worker",
            }),
          };
        }
        return {
          text: "worker-output:" + command.agentRoleId + ":" + command.userMessage,
        };
      },
    });
    const modeSummaries = modeEngine.listModes();
    assert(
      modeSummaries.some((mode) => mode.id === "supervisor.dispatch-loop") &&
        modeSummaries.some((mode) => mode.id === "producer.review-rewrite-loop"),
      "应默认注册两个 collaboration mode",
      modeSummaries,
    );
    const supervisorModeSessionRoot = join(workspacePath, "session-store", "supervisor-mode");
    const supervisorModeResult = await modeEngine.runMode({
      mode: "supervisor.dispatch-loop",
      requestId: "supervisor-mode-smoke",
      workspacePath,
      sessionRootDir: supervisorModeSessionRoot,
      participants: [
        {
          id: "supervisor",
          kind: "supervisor",
          label: "Supervisor",
          agentId: "mock",
          instruction: "负责调度 worker。",
        },
        {
          id: "worker-a",
          kind: "worker",
          label: "Worker A",
          agentId: "mock",
          instruction: "负责输出 A。",
        },
        {
          id: "worker-b",
          kind: "worker",
          label: "Worker B",
          agentId: "mock",
          instruction: "负责输出 B。",
        },
      ],
      context: {
        userText: "mode smoke",
      },
      options: {
        maxRounds: 1,
      },
    });
    assert(supervisorModeResult.mode === "supervisor.dispatch-loop", "runMode 应返回 mode id", supervisorModeResult);
    assert(
      supervisorModeResult.steps.some((step) => step.stepId === "dispatchWorker:worker-a-round-1"),
      "supervisor.dispatch-loop 应只调度选中的 worker",
      supervisorModeResult.steps,
    );
    assert(
      !supervisorModeResult.steps.some((step) => step.stepId === "dispatchWorker:worker-b-round-1"),
      "supervisor.dispatch-loop 不应调度低分 worker",
      supervisorModeResult.steps,
    );
    const supervisorTracePath = join(supervisorModeSessionRoot, "trace.jsonl");
    const supervisorManifestPath = join(supervisorModeSessionRoot, "session.json");
    assert(existsSync(supervisorTracePath), "runMode 应写入 runtime trace", supervisorTracePath);
    assert(
      readFileSync(supervisorTracePath, "utf8").includes("collaboration_event"),
      "runtime trace 应包含 collaboration timeline",
      readFileSync(supervisorTracePath, "utf8"),
    );
    assert(existsSync(supervisorManifestPath), "runMode 应写入 runtime session manifest", supervisorManifestPath);
    const supervisorManifest = JSON.parse(readFileSync(supervisorManifestPath, "utf8"));
    assert(
      supervisorManifest.type === "runtime_session_manifest" &&
        supervisorManifest.workflowRunIds.includes(supervisorModeResult.workflowRunId) &&
        supervisorManifest.modeIds.includes("supervisor.dispatch-loop") &&
        supervisorManifest.traceCount > 0,
      "runtime session manifest 应记录协作 workflow 摘要",
      supervisorManifest,
    );
    const supervisorSessionSnapshot = await getRuntimeSessionSnapshot({
      workspacePath,
      sessionRootDir: supervisorModeSessionRoot,
    }, {
      includeTimeline: true,
      timelineLimit: 20,
    });
    assert(
      supervisorSessionSnapshot.session.traceCount > 0 &&
        supervisorSessionSnapshot.timeline?.some((item) => item.type === "workflow_started"),
      "runtime session query 应返回 timeline",
      supervisorSessionSnapshot,
    );
    const supervisorTimeline = await getCollaborationTimeline({
      workspacePath,
      sessionRootDir: supervisorModeSessionRoot,
    });
    assert(
      supervisorTimeline.events.some((item) => item.workflowRunId === supervisorModeResult.workflowRunId),
      "collaboration timeline query 应按 session 返回协作事件",
      supervisorTimeline,
    );
    const sessionSummaries = await listRuntimeSessions({
      workspacePath,
      rootDir: join(workspacePath, "session-store"),
    });
    assert(
      sessionSummaries.some((session) => session.sessionRootDir === supervisorModeSessionRoot),
      "listRuntimeSessions 应枚举已写入的 runtime session",
      sessionSummaries,
    );

    const selectedOnlyEngine = createCollaborationEngine({
      runAgent: async (command) => {
        if (command.agentRoleId === "supervisor") {
          return {
            text: JSON.stringify({
              status: "continue",
              selectedTargetId: "worker-b",
              selectedInstruction: "只调度 worker-b。",
              reason: "显式选择 worker-b。",
            }),
          };
        }
        return {
          text: "selected-only-output:" + command.agentRoleId,
        };
      },
    });
    const selectedOnlyResult = await selectedOnlyEngine.runMode({
      mode: "supervisor.dispatch-loop",
      requestId: "supervisor-selected-only-smoke",
      workspacePath,
      participants: [
        { id: "supervisor", kind: "supervisor", label: "Supervisor", agentId: "mock" },
        { id: "worker-a", kind: "worker", label: "Worker A", agentId: "mock" },
        { id: "worker-b", kind: "worker", label: "Worker B", agentId: "mock" },
      ],
      options: {
        maxRounds: 1,
      },
    });
    assert(
      selectedOnlyResult.steps.some((step) => step.stepId === "dispatchWorker:worker-b-round-1") &&
        !selectedOnlyResult.steps.some((step) => step.stepId === "dispatchWorker:worker-a-round-1"),
      "supervisor.dispatch-loop 应支持无 candidates 时按 selectedTargetId 分发",
      selectedOnlyResult.steps,
    );

    const completeArtifactsEngine = createCollaborationEngine({
      runAgent: async (command) => {
        if (command.agentRoleId !== "supervisor") {
          throw new Error("complete supervisor decision should not dispatch workers");
        }
        return {
          text: JSON.stringify({
            status: "complete",
            reason: "只需要产出 artifacts。",
            artifacts: [{ type: "note", content: "无需 worker 继续。" }],
          }),
        };
      },
    });
    const completeArtifactsResult = await completeArtifactsEngine.runMode({
      mode: "supervisor.dispatch-loop",
      requestId: "supervisor-complete-artifacts-smoke",
      workspacePath,
      participants: [
        { id: "supervisor", kind: "supervisor", label: "Supervisor", agentId: "mock" },
        { id: "worker-a", kind: "worker", label: "Worker A", agentId: "mock" },
      ],
      options: {
        maxRounds: 2,
      },
    });
    assert(
      !completeArtifactsResult.steps.some((step) => step.stepId.startsWith("dispatchWorker:")) &&
        completeArtifactsResult.output?.supervisorSelection?.decision?.artifacts?.[0]?.content === "无需 worker 继续。",
      "supervisor.dispatch-loop 应支持 complete/artifacts 且不分发 worker",
      completeArtifactsResult,
    );

    let reviewCount = 0;
    const reviewModeEngine = createCollaborationEngine({
      runAgent: async (command) => {
        if (command.agentRoleId === "reviewer") {
          reviewCount += 1;
          return {
            text: JSON.stringify(reviewCount === 1
              ? {
                  status: "revise",
                  score: 62,
                  reason: "需要重写",
                  revisionInstruction: "补强冲突。",
                }
              : {
                  status: "approved",
                  score: 93,
                  reason: "已通过。",
                }),
          };
        }
        return {
          text: "draft-round-" + (reviewCount + 1),
        };
      },
    });
    const reviewModeResult = await reviewModeEngine.runMode({
      mode: "producer.review-rewrite-loop",
      requestId: "review-mode-smoke",
      workspacePath,
      sessionRootDir: join(workspacePath, "session-store", "review-mode"),
      participants: [
        {
          id: "producer",
          kind: "producer",
          label: "Producer",
          agentId: "mock",
        },
        {
          id: "reviewer",
          kind: "reviewer",
          label: "Reviewer",
          agentId: "mock",
        },
      ],
      context: {
        artifactType: "test",
      },
      options: {
        maxRounds: 2,
      },
    });
    assert(reviewModeResult.mode === "producer.review-rewrite-loop", "review-rewrite 应返回 mode id", reviewModeResult);
    assert(reviewCount === 2, "review-rewrite 应在 revise 后再次审阅", {
      reviewCount,
      steps: reviewModeResult.steps.map((step) => step.stepId),
    });

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

    const extensionEvents: unknown[] = [];
    const extensionEngine = createCollaborationEngine({
      runAgent: async (command, { emit }) => {
        emit({ type: "text_delta", delta: command.userMessage });
        return {
          text: "agent:" + command.userMessage,
        };
      },
      extensions: [{
        namespace: "demo",
        transforms: {
          normalizePlan: (value) => {
            const inputValue = value as { topic?: unknown; speaker?: unknown };
            return {
              topic: String(inputValue.topic ?? "").trim().toUpperCase(),
              speaker: String(inputValue.speaker ?? "").trim(),
            };
          },
          incrementCounter: (value) => {
            const inputValue = value as { current?: unknown };
            const current = typeof inputValue.current === "number"
              ? inputValue.current
              : Number(inputValue.current ?? 0);
            return Number.isFinite(current) ? current + 1 : 1;
          },
        },
        conditions: {
          hasTopic: (value) => {
            const inputValue = value as { topic?: unknown };
            return typeof inputValue.topic === "string" && inputValue.topic.length > 0;
          },
          isTruthy: (value) => Boolean(value),
        },
        routers: {
          chooseNext: (value) => {
            const inputValue = value as { speaker?: unknown };
            return {
              route: String(inputValue.speaker || "speaker"),
              output: {
                route: String(inputValue.speaker || "speaker"),
                reason: "extension smoke",
              },
            };
          },
          loopUntilThree: (value) => {
            const current = typeof value === "number" ? value : Number(value ?? 0);
            return {
              route: current < 3 ? "again" : "end",
              output: {
                route: current < 3 ? "again" : "end",
                current,
              },
            };
          },
        },
      }],
    });
    const extensionResult = await extensionEngine.run({
      workspacePath,
      input: {
        topic: " extension workflow ",
        speaker: "speaker-a",
      },
      workflow: {
        id: "extension-collaboration-smoke",
        steps: [
          {
            id: "normalize",
            type: "transform",
            transform: "demo.normalizePlan",
            input: {
              topic: { $ref: "input.topic" },
              speaker: "{{ input.speaker }}",
            },
            outputKey: "normalized",
          },
          {
            id: "hasTopic",
            type: "condition",
            condition: "demo.hasTopic",
            dependsOn: ["normalize"],
            input: { $ref: "outputs.normalized" },
            outputKey: "shouldSpeak",
          },
          {
            id: "next",
            type: "router",
            router: "demo.chooseNext",
            dependsOn: ["hasTopic"],
            input: { $ref: "outputs.normalized" },
            routes: {
              "speaker-a": "speaker",
              end: "__end__",
            },
            outputKey: "nextRoute",
          },
          {
            id: "speaker",
            type: "agent",
            agentRoleId: "speaker",
            dependsOn: ["next"],
            when: {
              condition: "demo.isTruthy",
              input: { $ref: "outputs.shouldSpeak" },
            },
            userMessage: "Speak {{ outputs.normalized.topic }} via {{ outputs.nextRoute.route }}",
            outputKey: "speakerReply",
          },
        ],
      },
      agents: [
        { id: "speaker", label: "Speaker" },
      ],
    }, {
      askUser: async () => "",
      emit: (event) => {
        extensionEvents.push(event);
      },
    });

    assert(extensionResult.executorId === "langgraph", "extension smoke 默认应走 LangGraph executor", extensionResult);
    assert(extensionResult.steps.map((step) => step.stepId).join("|") === "normalize|hasTopic|next|speaker", "extension steps 应稳定执行", extensionResult.steps);
    assert((extensionResult.output as { normalized?: { topic?: string } }).normalized?.topic === "EXTENSION WORKFLOW", "transform step 应写入结构化 output", extensionResult.output);
    assert((extensionResult.output as { shouldSpeak?: boolean }).shouldSpeak === true, "condition step 应写入布尔 output", extensionResult.output);
    assert((extensionResult.output as { nextRoute?: { route?: string } }).nextRoute?.route === "speaker-a", "router step 应写入 route output", extensionResult.output);
    assert(extensionResult.steps.find((step) => step.stepId === "next")?.route === "speaker-a", "router result 应保留 route 字段", extensionResult.steps);
    assert(extensionResult.steps.find((step) => step.stepId === "speaker")?.text.includes("EXTENSION WORKFLOW via speaker-a"), "agent step 应能读取 transform/router output", extensionResult.steps);
    assert(
      extensionEvents.some((event) =>
        event && typeof event === "object" &&
        "type" in event &&
        event.type === CollaborationEventType.StepStarted &&
        (event as { stepType?: string }).stepType === "transform"
      ),
      "extension workflow 应发出 transform step_started",
      extensionEvents,
    );

    const extensionRouteEndResult = await extensionEngine.run({
      workspacePath,
      input: {
        topic: "route end workflow",
        speaker: "end",
      },
      workflow: {
        id: "extension-route-end-smoke",
        steps: [
          {
            id: "normalize",
            type: "transform",
            transform: "demo.normalizePlan",
            input: {
              topic: { $ref: "input.topic" },
              speaker: "{{ input.speaker }}",
            },
            outputKey: "normalized",
          },
          {
            id: "next",
            type: "router",
            router: "demo.chooseNext",
            dependsOn: ["normalize"],
            input: { $ref: "outputs.normalized" },
            routes: {
              "speaker-a": "speaker",
              end: "__end__",
            },
            outputKey: "nextRoute",
          },
          {
            id: "speaker",
            type: "agent",
            agentRoleId: "speaker",
            dependsOn: ["next"],
            userMessage: "This step should not run",
            outputKey: "speakerReply",
          },
        ],
      },
      agents: [
        { id: "speaker", label: "Speaker" },
      ],
    }, {
      askUser: async () => "",
    });
    assert(extensionRouteEndResult.steps.map((step) => step.stepId).join("|") === "normalize|next", "router route=end 应结束 workflow 并跳过后续 step", extensionRouteEndResult.steps);
    assert(extensionRouteEndResult.steps.find((step) => step.stepId === "next")?.route === "end", "route=end 应保留 router route", extensionRouteEndResult.steps);

    const nativeExtensionRouteEndResult = await extensionEngine.run({
      workspacePath,
      input: {
        topic: "native route end workflow",
        speaker: "end",
      },
      workflow: {
        id: "native-extension-route-end-smoke",
        executor: "native",
        steps: [
          {
            id: "normalize",
            type: "transform",
            transform: "demo.normalizePlan",
            input: {
              topic: { $ref: "input.topic" },
              speaker: "{{ input.speaker }}",
            },
            outputKey: "normalized",
          },
          {
            id: "next",
            type: "router",
            router: "demo.chooseNext",
            dependsOn: ["normalize"],
            input: { $ref: "outputs.normalized" },
            routes: {
              "speaker-a": "speaker",
              end: "__end__",
            },
            outputKey: "nextRoute",
          },
          {
            id: "speaker",
            type: "agent",
            agentRoleId: "speaker",
            dependsOn: ["next"],
            userMessage: "This native step should not run",
            outputKey: "speakerReply",
          },
        ],
      },
      agents: [
        { id: "speaker", label: "Speaker" },
      ],
    }, {
      askUser: async () => "",
    });
    assert(nativeExtensionRouteEndResult.executorId === "native", "native router smoke 应走 native executor", nativeExtensionRouteEndResult);
    assert(nativeExtensionRouteEndResult.steps.map((step) => step.stepId).join("|") === "normalize|next", "native router route=end 应结束 workflow 并跳过后续 step", nativeExtensionRouteEndResult.steps);

    const loopAgentMessages: string[] = [];
    const loopEngine = createCollaborationEngine({
      runAgent: async (command, { emit }) => {
        loopAgentMessages.push(command.userMessage);
        emit({ type: "text_delta", delta: command.userMessage });
        return {
          text: "loop:" + command.userMessage,
        };
      },
      extensions: [{
        namespace: "loop",
        transforms: {
          increment: (value) => {
            const inputValue = value as { current?: unknown };
            const current = typeof inputValue.current === "number"
              ? inputValue.current
              : Number(inputValue.current ?? 0);
            return Number.isFinite(current) ? current + 1 : 1;
          },
        },
        routers: {
          next: (value) => {
            const current = typeof value === "number" ? value : Number(value ?? 0);
            return {
              route: current < 3 ? "again" : "end",
              output: {
                route: current < 3 ? "again" : "end",
                current,
              },
            };
          },
        },
      }],
    });
    const loopWorkflow = {
      id: "router-loop-smoke",
      maxSteps: 12,
      steps: [
        {
          id: "increment",
          type: "transform" as const,
          transform: "loop.increment",
          input: {
            current: { $ref: "outputs.count" },
          },
          outputKey: "count",
        },
        {
          id: "speaker",
          type: "agent" as const,
          agentRoleId: "speaker",
          userMessage: "Round {{ outputs.count }}",
          outputKey: "speakerReply",
        },
        {
          id: "next",
          type: "router" as const,
          router: "loop.next",
          input: { $ref: "outputs.count" },
          routes: {
            again: "increment",
            end: "__end__",
          },
          outputKey: "nextRoute",
        },
      ],
    };
    const loopResult = await loopEngine.run({
      workspacePath,
      workflow: loopWorkflow,
      agents: [
        { id: "speaker", label: "Loop Speaker" },
      ],
    }, {
      askUser: async () => "",
    });
    assert(loopResult.executorId === "langgraph", "router 回环默认应走 LangGraph", loopResult);
    assert(loopAgentMessages.join("|") === "Round 1|Round 2|Round 3", "router 回环应按路由重复执行 step 直到 end", loopAgentMessages);
    assert((loopResult.output as { count?: number }).count === 3, "router 回环应保留最后一轮 output", loopResult.output);
    assert(loopResult.steps.find((step) => step.stepId === "next")?.route === "end", "router 回环最后一次 route 应为 end", loopResult.steps);

    loopAgentMessages.length = 0;
    const nativeLoopResult = await loopEngine.run({
      workspacePath,
      workflow: {
        ...loopWorkflow,
        id: "native-router-loop-smoke",
        executor: "native",
      },
      agents: [
        { id: "speaker", label: "Loop Speaker" },
      ],
    }, {
      askUser: async () => "",
    });
    assert(nativeLoopResult.executorId === "native", "显式 native router 回环应走 native executor", nativeLoopResult);
    assert(loopAgentMessages.join("|") === "Round 1|Round 2|Round 3", "native router 回环应按路由重复执行 step 直到 end", loopAgentMessages);
    assert((nativeLoopResult.output as { count?: number }).count === 3, "native router 回环应保留最后一轮 output", nativeLoopResult.output);

    let nativeMaxStepsError: unknown;
    try {
      await loopEngine.run({
        workspacePath,
        workflow: {
          ...loopWorkflow,
          id: "native-router-loop-max-steps-smoke",
          executor: "native",
          maxSteps: 2,
        },
        agents: [
          { id: "speaker", label: "Loop Speaker" },
        ],
      }, {
        askUser: async () => "",
      });
    } catch (error) {
      nativeMaxStepsError = error;
    }
    assert(nativeMaxStepsError instanceof Error, "native router 回环超过 maxSteps 时应失败", nativeMaxStepsError);

    let maxStepsError: unknown;
    try {
      await loopEngine.run({
        workspacePath,
        workflow: {
          ...loopWorkflow,
          id: "router-loop-max-steps-smoke",
          maxSteps: 2,
        },
        agents: [
          { id: "speaker", label: "Loop Speaker" },
        ],
      }, {
        askUser: async () => "",
      });
    } catch (error) {
      maxStepsError = error;
    }
    assert(maxStepsError instanceof Error, "router 回环超过 maxSteps 时应失败", maxStepsError);

    const dispatchCommands: Array<{ roleId: string; userMessage: string }> = [];
    const dispatchEngine = createCollaborationEngine({
      runAgent: async (command, { emit }) => {
        const roleId = command.agentRoleId ?? "unknown";
        dispatchCommands.push({
          roleId,
          userMessage: command.userMessage,
        });
        emit({ type: "text_delta", delta: command.userMessage });
        return {
          text: roleId + ":" + command.userMessage,
        };
      },
    });
    const dispatchWorkflow = {
      id: "dispatch-smoke",
      steps: [
        {
          id: "dispatch",
          type: "dispatch" as const,
          input: {
            invocations: [
              {
                id: "writer",
                agentRoleId: "writer",
                outputKey: "writerOut",
                userMessage: "Write {{ input.topic }}",
              },
              {
                id: "reviewer",
                agentRoleId: "reviewer",
                outputKey: "reviewerOut",
                userMessage: "Review {{ input.topic }}",
              },
            ],
          },
          outputKey: "dispatchOut",
        },
      ],
    };
    const dispatchResult = await dispatchEngine.run({
      workspacePath,
      input: {
        topic: "dynamic dispatch",
      },
      workflow: dispatchWorkflow,
      agents: [
        { id: "writer", label: "Writer" },
        { id: "reviewer", label: "Reviewer" },
      ],
    }, {
      askUser: async () => "",
    });
    assert(dispatchResult.executorId === "langgraph", "dispatch 默认应走 LangGraph", dispatchResult);
    assert(
      dispatchCommands.map((command) => command.roleId + ":" + command.userMessage).join("|") ===
        "writer:Write dynamic dispatch|reviewer:Review dynamic dispatch",
      "dispatch 应按标准 invocation 动态执行多个 agent",
      dispatchCommands,
    );
    assert((dispatchResult.output as { writerOut?: string }).writerOut === "writer:Write dynamic dispatch", "dispatch 应写回动态 agent outputKey", dispatchResult.output);
    assert(dispatchResult.steps.some((step) => step.stepId === "dispatch:writer"), "dispatch 结果应包含动态 writer step", dispatchResult.steps);
    assert(dispatchResult.steps.some((step) => step.stepId === "dispatch:reviewer"), "dispatch 结果应包含动态 reviewer step", dispatchResult.steps);

    dispatchCommands.length = 0;
    const nativeDispatchResult = await dispatchEngine.run({
      workspacePath,
      input: {
        topic: "native dispatch",
      },
      workflow: {
        ...dispatchWorkflow,
        id: "native-dispatch-smoke",
        executor: "native" as const,
      },
      agents: [
        { id: "writer", label: "Writer" },
        { id: "reviewer", label: "Reviewer" },
      ],
    }, {
      askUser: async () => "",
    });
    assert(nativeDispatchResult.executorId === "native", "显式 native dispatch 应走 native executor", nativeDispatchResult);
    assert(
      dispatchCommands.map((command) => command.roleId + ":" + command.userMessage).join("|") ===
        "writer:Write native dispatch|reviewer:Review native dispatch",
      "native dispatch 应按标准 invocation 动态执行多个 agent",
      dispatchCommands,
    );
    assert((nativeDispatchResult.output as { reviewerOut?: string }).reviewerOut === "reviewer:Review native dispatch", "native dispatch 应写回动态 agent outputKey", nativeDispatchResult.output);

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
            stepType: "agent",
            agentRoleId: "custom-role",
            agentTaskId: workflowRunId + ":custom",
            outputKey: "custom",
            output: "custom executor result",
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
      extension: {
        workflowRunId: extensionResult.workflowRunId,
        stepIds: extensionResult.steps.map((step) => step.stepId),
        routeEndStepIds: extensionRouteEndResult.steps.map((step) => step.stepId),
        nativeRouteEndStepIds: nativeExtensionRouteEndResult.steps.map((step) => step.stepId),
        eventCount: extensionEvents.length,
      },
      loop: {
        workflowRunId: loopResult.workflowRunId,
        stepIds: loopResult.steps.map((step) => step.stepId),
        finalCount: (loopResult.output as { count?: number }).count,
        nativeWorkflowRunId: nativeLoopResult.workflowRunId,
        nativeMaxStepsError: nativeMaxStepsError instanceof Error ? nativeMaxStepsError.name : String(nativeMaxStepsError),
        maxStepsError: maxStepsError instanceof Error ? maxStepsError.name : String(maxStepsError),
      },
      dispatch: {
        workflowRunId: dispatchResult.workflowRunId,
        stepIds: dispatchResult.steps.map((step) => step.stepId),
        nativeWorkflowRunId: nativeDispatchResult.workflowRunId,
        nativeStepIds: nativeDispatchResult.steps.map((step) => step.stepId),
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
