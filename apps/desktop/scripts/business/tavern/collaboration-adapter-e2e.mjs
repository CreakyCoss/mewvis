import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workspaceRoot = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "novel-claw-tavern-collaboration-adapter-"));
const entryPath = join(tempDir, "runner.ts");
const bundledPath = join(tempDir, "runner.mjs");
const adapterPath = resolve(workspaceRoot, "src/features/pages/taverns/tavern/runtime/collaboration/index.ts");
const collaborationTracePath = resolve(workspaceRoot, "src/features/pages/taverns/room/turn/submit-flow/collaboration-trace.ts");
const manualFactoriesPath = resolve(workspaceRoot, "src/features/pages/taverns/tavern/factories/manual-factories.ts");
const messagePath = resolve(workspaceRoot, "src/features/pages/taverns/tavern/message/index.ts");
const corePath = resolve(workspaceRoot, "src/features/pages/taverns/tavern/core/index.ts");

writeFileSync(entryPath, `
  import {
    buildTavernDirectorLoopCollaborationInput,
    buildTavernSpeakerCollaborationInput,
  } from ${JSON.stringify(adapterPath)};
  import {
    applyTavernCollaborationTraceEvent,
  } from ${JSON.stringify(collaborationTracePath)};
  import {
    createTavernCharacter,
    createTavernRoom,
  } from ${JSON.stringify(manualFactoriesPath)};
  import {
    createTavernMessage,
  } from ${JSON.stringify(messagePath)};
  import {
    tavernBridgeSessionRootDir,
    tavernCharacterAgentRoleId,
    tavernDirectorAgentRoleId,
  } from ${JSON.stringify(corePath)};

  const assert = (condition: unknown, message: string, details?: unknown) => {
    if (!condition) {
      const suffix = details === undefined ? "" : "\\n" + JSON.stringify(details, null, 2);
      throw new Error(message + suffix);
    }
  };

  const runtimeModel = {
    provider: "mock-provider",
    apiFormat: "openai-chat",
    catalogModelId: "mock-model",
    modelId: "mock-model",
  };
  const roomBase = createTavernRoom("workspace-collab", 1);
  const activeInstance = roomBase.sceneInstances[0];
  const characterA = {
    ...createTavernCharacter({
      name: "林晏",
      avatar: "cat-lavender",
      description: "谨慎的账房。",
      speakingStyle: "短句，先观察再回答。",
    }),
    id: "char-a",
  };
  const characterB = {
    ...createTavernCharacter({
      name: "谢无声",
      avatar: "cat-graphite",
      description: "沉默的护卫。",
      speakingStyle: "话少，动作明确。",
    }),
    id: "char-b",
  };
  const room = {
    ...roomBase,
    localCharacters: [characterA, characterB],
    characterIds: [characterA.id, characterB.id],
    activeCharacterId: characterA.id,
  };
  const messages = [
    createTavernMessage({
      roomId: room.id,
      sceneId: activeInstance?.sceneId,
      sceneInstanceId: activeInstance?.id,
      role: "user",
      content: "柜台下传来一声轻响。",
      status: "done",
    }),
  ];

  const speakerInput = buildTavernSpeakerCollaborationInput({
    workspacePath: "/tmp/novel-claw-collab",
    runtimeAgentId: "mock",
    runtimeModel,
    room,
    speakers: [characterA, characterB],
    characters: [characterA, characterB],
    messages,
    references: [],
    currentUserText: "柜台下传来一声轻响。",
    turnInstructionByCharacterId: {
      [characterA.id]: "先检查柜台下方，不要直接解释真相。",
    },
    allowNonverbalReplyCharacterIds: [characterB.id],
  });
  assert(speakerInput.type === "collaboration", "角色 adapter 应输出 collaboration input", speakerInput);
  assert(speakerInput.sessionRootDir === tavernBridgeSessionRootDir(room), "角色 workflow 应复用同一 bridge session", speakerInput);
  assert(speakerInput.agents.length === 2 && speakerInput.workflow.steps.length === 2, "角色 workflow 应按 speakers 生成 steps", speakerInput);
  assert(speakerInput.workflow.maxSteps === 8, "角色 workflow 应声明 maxSteps，为后续回环编排预留保险丝", speakerInput.workflow);
  assert(
    speakerInput.agents.map((agent) => agent.id).join(",") ===
      [tavernCharacterAgentRoleId(room, characterA), tavernCharacterAgentRoleId(room, characterB)].join(","),
    "角色 role id 应复用现有规则",
    speakerInput.agents,
  );
  assert(
    speakerInput.workflow.steps[0]?.outputKey === "reply:char-a" &&
      speakerInput.workflow.steps[1]?.outputKey === "reply:char-b",
    "角色 step outputKey 应稳定关联 speaker",
    speakerInput.workflow.steps,
  );
  assert(
    speakerInput.workflow.steps[0]?.requestContext?.includes("<visible_turn_messages>") &&
      speakerInput.workflow.steps[0]?.runtimeInstruction?.includes("先检查柜台下方"),
    "角色 step 应复用现有回复 request 构造",
    speakerInput.workflow.steps[0],
  );
  assert(
    speakerInput.workflow.steps[1]?.runtimeInstruction?.includes("{{ outputs.reply:char-a }}"),
    "串行角色 workflow 的后续 step 应能引用前序角色输出",
    speakerInput.workflow.steps[1],
  );

  const directorLoopInput = buildTavernDirectorLoopCollaborationInput({
    workspacePath: "/tmp/novel-claw-collab",
    runtimeAgentId: "mock",
    runtimeModel,
    room,
    characters: [characterA, characterB],
    speakerInputs: [
      {
        character: characterA,
        runtimeModel,
        turnInstruction: "先确认柜台下方。",
      },
      {
        character: characterB,
        runtimeModel,
        turnInstruction: "承接林晏的发现。",
      },
    ],
    messages,
    references: [],
    currentUserText: "柜台下传来一声轻响。",
    maxSpeakers: 2,
    maxRounds: 2,
  });
  assert(directorLoopInput.type === "collaborationMode", "导演回环 adapter 应输出 collaboration mode input", directorLoopInput);
  assert(directorLoopInput.mode === "supervisor.dispatch-loop", "导演回环应使用通用 supervisor.dispatch-loop mode", directorLoopInput);
  assert(directorLoopInput.options?.maxRounds === 2, "导演回环 mode 应传入最大轮次", directorLoopInput.options);
  assert(
    directorLoopInput.participants.map((participant) => participant.id).join("|") ===
      [
        tavernDirectorAgentRoleId(room),
        tavernCharacterAgentRoleId(room, characterA),
        tavernCharacterAgentRoleId(room, characterB),
      ].join("|"),
    "导演回环 mode 应包含导演和候选角色 participants",
    directorLoopInput.participants,
  );
  assert(
    directorLoopInput.participants[0]?.kind === "supervisor" &&
      directorLoopInput.participants.slice(1).every((participant) => participant.kind === "worker"),
    "导演回环 mode 应使用 supervisor/worker 标准角色类型",
    directorLoopInput.participants,
  );
  assert(
    directorLoopInput.participants[0]?.runtimeInstruction?.includes("supervisor.dispatch-loop") &&
      directorLoopInput.participants[0]?.runtimeInstruction?.includes(tavernCharacterAgentRoleId(room, characterA)),
    "导演回环 supervisor 应收到通用 mode 输出契约和 participantId 映射",
    directorLoopInput.participants[0],
  );
  assert(
    directorLoopInput.participants[1]?.metadata?.characterId === characterA.id &&
      Array.isArray(directorLoopInput.participants[1]?.metadata?.targetAliases),
    "worker participant 应保留 Tavern characterId/alias，供通用调度映射",
    directorLoopInput.participants[1],
  );
  assert(
    directorLoopInput.context?.workerTargets?.length === 2 &&
      directorLoopInput.context.workerTargets[0]?.characterId === characterA.id,
    "导演回环 context 应记录 workerTargets，供 timeline/debug 和 prompt 使用",
    directorLoopInput.context,
  );

  let executionSteps: Array<{ id: string; label: string; status: string; detail?: string }> = [];
  let traceState = {
    version: 4 as const,
    activeRoomId: room.id,
    rooms: [room],
    messagesByInstance: {
      [activeInstance?.id ?? room.id]: messages,
    },
    workflowTracesByInstance: {
      [activeInstance?.id ?? room.id]: [],
    },
  };
  const traceCtx = {
    activeRoom: room,
    executionTraceAnchorMessageId: messages[0]?.id ?? "",
    setState: (updater: typeof traceState | ((current: typeof traceState) => typeof traceState)) => {
      traceState = typeof updater === "function" ? updater(traceState) : updater;
    },
    upsertExecutionStep: (step: { id: string; label: string; status: string; detail?: string }) => {
      executionSteps = executionSteps.some((item) => item.id === step.id)
        ? executionSteps.map((item) => item.id === step.id ? { ...item, ...step } : item)
        : [...executionSteps, step];
    },
    patchExecutionStep: (stepId: string, patch: Partial<{ label: string; status: string; detail?: string }>) => {
      executionSteps = executionSteps.map((item) => item.id === stepId ? { ...item, ...patch } : item);
    },
  } as any;
  const traceWorkflowRunId = "workflow-trace-e2e";
  applyTavernCollaborationTraceEvent(traceCtx, {
    type: "workflow_started",
    taskId: "trace-task",
    workflowRunId: traceWorkflowRunId,
    workflowId: "trace.workflow",
    runtimeId: "langgraph",
  }, { scopeLabel: "Trace" });
  applyTavernCollaborationTraceEvent(traceCtx, {
    type: "step_started",
    taskId: "trace-task",
    workflowRunId: traceWorkflowRunId,
    stepId: "planner",
    stepType: "agent",
    agentRoleId: "planner",
    agentTaskId: "trace-task:planner",
  }, { scopeLabel: "Trace" });
  applyTavernCollaborationTraceEvent(traceCtx, {
    type: "agent_event",
    taskId: "trace-task",
    workflowRunId: traceWorkflowRunId,
    stepId: "planner",
    agentRoleId: "planner",
    agentTaskId: "trace-task:planner",
    event: { type: "text_delta", delta: "token" },
  }, { scopeLabel: "Trace" });
  applyTavernCollaborationTraceEvent(traceCtx, {
    type: "agent_event",
    taskId: "trace-task",
    workflowRunId: traceWorkflowRunId,
    stepId: "planner",
    agentRoleId: "planner",
    agentTaskId: "trace-task:planner",
    event: { type: "tool_start", toolName: "read_file", args: { path: "x" } },
  }, { scopeLabel: "Trace" });
  applyTavernCollaborationTraceEvent(traceCtx, {
    type: "step_done",
    taskId: "trace-task",
    workflowRunId: traceWorkflowRunId,
    step: {
      stepId: "planner",
      stepType: "agent",
      agentRoleId: "planner",
      agentTaskId: "trace-task:planner",
      outputKey: "plan",
      output: "trace result",
      text: "trace result",
    },
  }, { scopeLabel: "Trace" });
  applyTavernCollaborationTraceEvent(traceCtx, {
    type: "workflow_done",
    taskId: "trace-task",
    workflowRunId: traceWorkflowRunId,
    result: {
      workflowRunId: traceWorkflowRunId,
      runtimeId: "langgraph",
      steps: [{
        stepId: "planner",
        stepType: "agent",
        agentRoleId: "planner",
        agentTaskId: "trace-task:planner",
        outputKey: "plan",
        output: "trace result",
        text: "trace result",
      }],
      skippedSteps: [],
      output: { plan: "trace result" },
    },
  }, { scopeLabel: "Trace" });
  const persistedTrace = traceState.workflowTracesByInstance[activeInstance?.id ?? room.id]?.[0];
  assert(persistedTrace?.status === "done", "协作 trace 应持久化为完成状态", persistedTrace);
  assert(persistedTrace?.steps[0]?.status === "done", "协作 trace 应持久化 step 状态", persistedTrace?.steps);
  assert(
    persistedTrace?.events.some((event) => event.type === "agent_event" && event.detail === "tool_start") &&
      !persistedTrace.events.some((event) => event.payload && JSON.stringify(event.payload).includes("text_delta")),
    "协作 trace 应保留关键 agent_event 并跳过 token 级 text_delta",
    persistedTrace?.events,
  );

  console.log(JSON.stringify({
    ok: true,
    speakers: speakerInput.workflow.steps.map((step) => ({
      id: step.id,
      agentRoleId: step.agentRoleId,
      outputKey: step.outputKey,
    })),
    directorLoop: {
      mode: directorLoopInput.mode,
      maxRounds: directorLoopInput.options?.maxRounds,
      participantIds: directorLoopInput.participants.map((participant) => participant.id),
    },
    trace: {
      status: persistedTrace?.status,
      eventCount: persistedTrace?.events.length,
      stepCount: persistedTrace?.steps.length,
    },
  }, null, 2));
`, "utf8");

try {
  await build({
    entryPoints: [entryPath],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    outfile: bundledPath,
    alias: {
      "@": resolve(workspaceRoot, "src"),
      "@engines/native/agent": resolve(workspaceRoot, "agent-runtime/src/engines/drivers/native/agent"),
    },
    loader: {
      ".jpg": "file",
      ".jpeg": "file",
      ".png": "file",
      ".svg": "file",
    },
  });

  await import(pathToFileURL(bundledPath).href);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
