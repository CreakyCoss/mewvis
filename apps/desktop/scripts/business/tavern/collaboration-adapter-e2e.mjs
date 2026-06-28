import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workspaceRoot = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "novel-claw-tavern-collaboration-adapter-"));
const entryPath = join(tempDir, "runner.ts");
const bundledPath = join(tempDir, "runner.mjs");
const adapterPath = resolve(workspaceRoot, "src/features/pages/tavern/runtime/collaboration/index.ts");
const collaborationTracePath = resolve(workspaceRoot, "src/features/pages/tavern/components/room/turn/submit-flow/collaboration-trace.ts");
const manualFactoriesPath = resolve(workspaceRoot, "src/features/pages/tavern/factories/manual-factories.ts");
const messagePath = resolve(workspaceRoot, "src/features/pages/tavern/message/index.ts");
const corePath = resolve(workspaceRoot, "src/features/pages/tavern/core/index.ts");

writeFileSync(entryPath, `
  import {
    buildTavernDirectorCollaborationInput,
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

  const directorInput = buildTavernDirectorCollaborationInput({
    workspacePath: "/tmp/novel-claw-collab",
    runtimeAgentId: "mock",
    runtimeModel,
    room,
    characters: [characterA, characterB],
    messages,
    references: [],
    currentUserText: "柜台下传来一声轻响。",
    selectedTargetCharacterIds: [characterA.id],
    maxSpeakers: 2,
  });
  assert(directorInput.type === "collaboration", "导演 adapter 应输出 collaboration input", directorInput);
  assert(directorInput.sessionRootDir === tavernBridgeSessionRootDir(room), "导演 workflow 应复用酒馆 bridge session", directorInput);
  assert(directorInput.agents[0]?.id === tavernDirectorAgentRoleId(room), "导演 role id 应复用现有规则", directorInput.agents);
  assert(
    directorInput.workflow.steps.map((step) => step.id).join("|") ===
      "director|normalizeDirectorDecision|routeDirectorDecision",
    "导演 workflow 应串起 agent/transform/router 三段",
    directorInput.workflow,
  );
  assert(directorInput.workflow.steps[0]?.outputKey === "directorRaw", "导演 agent step 应输出原始 JSON 文本", directorInput.workflow.steps[0]);
  assert(
    directorInput.workflow.steps[1]?.type === "transform" &&
      directorInput.workflow.steps[1]?.transform === "tavern.normalizeDirectorDecision" &&
      directorInput.workflow.steps[1]?.outputKey === "directorDecision",
    "导演 workflow 应在 runtime 内清洗导演输出",
    directorInput.workflow.steps[1],
  );
  assert(
    directorInput.workflow.steps[2]?.type === "router" &&
      directorInput.workflow.steps[2]?.router === "tavern.directorNextRoute" &&
      directorInput.workflow.steps[2]?.routes?.speakers === "__end__" &&
      directorInput.workflow.steps[2]?.outputKey === "directorRoute",
    "导演 workflow 应在 runtime 内产出后续路由",
    directorInput.workflow.steps[2],
  );
  assert(directorInput.workflow.steps[0]?.requestContext?.includes("speakerIds"), "导演 requestContext 应包含现有 JSON contract", directorInput.workflow.steps[0]?.requestContext);
  assert(directorInput.workflow.maxSteps === 8, "导演 workflow 应声明保守 maxSteps", directorInput.workflow);

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

  const directedSpeakerInput = buildTavernSpeakerCollaborationInput({
    workspacePath: "/tmp/novel-claw-collab",
    runtimeAgentId: "mock",
    runtimeModel,
    room,
    speakers: [characterA, characterB],
    characters: [characterA, characterB],
    messages,
    references: [],
    currentUserText: "柜台下传来一声轻响。",
    directorDecision: {
      speakerIds: [characterB.id],
      nonverbalReplyIds: [],
      reason: "谢无声更适合检查声源。",
    },
  });
  assert(
    directedSpeakerInput.input && (directedSpeakerInput.input as any).directorDecision?.speakerIds?.[0] === characterB.id,
    "带 directorDecision 的 speaker workflow 应把决策放入 workflow input",
    directedSpeakerInput.input,
  );
  assert(
    directedSpeakerInput.workflow.steps.every((step) =>
      step.type === "agent" &&
      step.when &&
      "condition" in step.when &&
      step.when.condition === "tavern.shouldRunSpeaker"
    ),
    "带 directorDecision 的 speaker workflow 应给每个角色 step 注入 shouldRunSpeaker 条件",
    directedSpeakerInput.workflow.steps,
  );
  assert(
    directedSpeakerInput.workflow.metadata?.speakerDecisionRef === "input.directorDecision",
    "speaker workflow metadata 应记录决策引用",
    directedSpeakerInput.workflow.metadata,
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
  assert(directorLoopInput.workflow.id === "tavern.director-loop", "导演回环 adapter 应输出独立 workflow", directorLoopInput.workflow);
  assert(directorLoopInput.workflow.maxSteps === 14, "导演回环 workflow 应根据轮次和角色数声明 maxSteps", directorLoopInput.workflow);
  assert(
    directorLoopInput.agents.map((agent) => agent.id).join("|") ===
      [
        tavernDirectorAgentRoleId(room),
        tavernCharacterAgentRoleId(room, characterA),
        tavernCharacterAgentRoleId(room, characterB),
      ].join("|"),
    "导演回环 workflow 应包含导演和候选角色 agents",
    directorLoopInput.agents,
  );
  assert(
    directorLoopInput.workflow.steps.map((step) => step.id).join("|") ===
      "director|normalizeDirectorDecision|routeDirectorDecision|prepareSpeakerDispatches|dispatchSpeakers|incrementDirectorLoopRound|routeDirectorLoop",
    "导演回环 workflow 应串起导演、动态分发和回环路由",
    directorLoopInput.workflow.steps,
  );
  assert(
    directorLoopInput.workflow.steps[2]?.type === "router" &&
      directorLoopInput.workflow.steps[2]?.routes?.speakers === "prepareSpeakerDispatches",
    "导演决策 route=speakers 应进入动态分发准备 step",
    directorLoopInput.workflow.steps[2],
  );
  assert(
    directorLoopInput.workflow.steps[3]?.type === "transform" &&
      directorLoopInput.workflow.steps[3]?.transform === "tavern.createSpeakerDispatches" &&
      directorLoopInput.workflow.steps[4]?.type === "dispatch",
    "导演回环角色应由 transform 生成标准 dispatch invocations 后动态分发",
    directorLoopInput.workflow.steps.slice(3, 5),
  );
  assert(
    directorLoopInput.workflow.steps[5]?.type === "transform" &&
      directorLoopInput.workflow.steps[5]?.transform === "tavern.incrementDirectorLoopRound" &&
      directorLoopInput.workflow.steps[6]?.type === "router" &&
      directorLoopInput.workflow.steps[6]?.router === "tavern.directorLoopRoute" &&
      directorLoopInput.workflow.steps[6]?.routes?.director === "director",
    "导演回环 workflow 应在角色轮后计数并路由回导演",
    directorLoopInput.workflow.steps.slice(5),
  );
  assert(
    directorLoopInput.workflow.steps[0]?.runtimeInstruction?.includes("{{ outputs.reply:char-a }}") &&
      (directorLoopInput.workflow.steps[3] as any)?.input?.candidates?.[1]?.invocation?.runtimeInstruction?.includes("{{ outputs.reply:char-a }}"),
    "导演回环 workflow 应用模板把上一轮角色输出提供给导演和动态角色 invocation",
    directorLoopInput.workflow.steps[3],
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
    executorId: "langgraph",
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
      executorId: "langgraph",
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
    director: {
      workflowId: directorInput.workflow.id,
      roleId: directorInput.agents[0]?.id,
      stepIds: directorInput.workflow.steps.map((step) => step.id),
    },
    speakers: speakerInput.workflow.steps.map((step) => ({
      id: step.id,
      agentRoleId: step.agentRoleId,
      outputKey: step.outputKey,
    })),
    directedSpeakers: directedSpeakerInput.workflow.steps.map((step) => ({
      id: step.id,
      when: step.when,
    })),
    directorLoop: {
      workflowId: directorLoopInput.workflow.id,
      maxSteps: directorLoopInput.workflow.maxSteps,
      stepIds: directorLoopInput.workflow.steps.map((step) => step.id),
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
      "@agent-engine": resolve(workspaceRoot, "agent-runtime/src/agent-engine"),
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
