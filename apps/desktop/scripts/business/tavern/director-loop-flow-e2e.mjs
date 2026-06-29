import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workspaceRoot = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "novel-claw-tavern-director-loop-flow-"));
const entryPath = join(tempDir, "runner.ts");
const bundledPath = join(tempDir, "runner.mjs");
const mockCollaborationPath = join(tempDir, "mock-collaboration.ts");
const mockConversationPath = join(tempDir, "mock-conversation.ts");
const mockLlmStorePath = join(tempDir, "mock-llm-store.ts");
const mockReplyPath = join(tempDir, "mock-reply.ts");
const adapterPath = resolve(workspaceRoot, "src/features/pages/tavern/runtime/collaboration/adapter.ts");
const directorLoopPath = resolve(workspaceRoot, "src/features/pages/tavern/components/room/turn/submit-flow/director-loop.ts");
const manualFactoriesPath = resolve(workspaceRoot, "src/features/pages/tavern/factories/manual-factories.ts");
const messagePath = resolve(workspaceRoot, "src/features/pages/tavern/message/index.ts");
const corePath = resolve(workspaceRoot, "src/features/pages/tavern/core/index.ts");

writeFileSync(mockLlmStorePath, `
  export const requireRuntimeModelInput = (runtimeModel: any) => ({
    provider: "mock-provider",
    apiFormat: "openai-chat",
    catalogModelId: runtimeModel?.modelId ?? "mock-model",
    modelId: runtimeModel?.modelId ?? "mock-model",
  });
`, "utf8");

writeFileSync(mockReplyPath, `
  export const runTavernInnerThought = async () => "mock inner thought";
`, "utf8");

writeFileSync(mockConversationPath, `
  export const buildTavernBridgeSystemPrompt = () => "mock tavern system prompt";
  export const compactTavernAgentKnowledge = async () => ({ compacted: false });
`, "utf8");

writeFileSync(mockCollaborationPath, `
  import {
    buildTavernDirectorLoopCollaborationInput as realBuildTavernDirectorLoopCollaborationInput,
  } from ${JSON.stringify(adapterPath)};

  const mockRunsKey = "__novelClawTavernDirectorLoopMockRuns";
  const globalMockState = globalThis as typeof globalThis & Record<string, any[] | undefined>;
  export const tavernDirectorLoopMockRuns: any[] = globalMockState[mockRunsKey] ?? [];
  globalMockState[mockRunsKey] = tavernDirectorLoopMockRuns;

  export const buildTavernDirectorLoopCollaborationInput = realBuildTavernDirectorLoopCollaborationInput;

  const participantForCharacter = (input: any, characterId: string) =>
    input.participants.find((participant: any) => participant.metadata?.characterId === characterId);

  const decisionForRound = (input: any, round: number) => {
    const firstTarget = participantForCharacter(input, "char-a");
    const secondTarget = participantForCharacter(input, "char-b");
    const selected = round === 1 ? firstTarget : secondTarget;
    return {
      status: "continue",
      candidates: [
        {
          targetId: firstTarget.id,
          score: round === 1 ? 92 : 45,
          reason: round === 1 ? "林晏最适合先检查柜台。" : "林晏已经完成检查。",
          instruction: "承接现场，给出一句短回应。",
        },
        {
          targetId: secondTarget.id,
          score: round === 1 ? 44 : 88,
          reason: round === 1 ? "谢无声暂时守门即可。" : "第二轮需要谢无声回应门口动静。",
          instruction: "承接现场，给出一句短回应。",
        },
      ],
      selectedTargetId: selected.id,
      selectedInstruction: "承接现场，给出一句短回应。",
      artifacts: [
        {
          type: "narrator",
          content: round === 1
            ? "灯影压低，柜台下传来第二声轻响。"
            : "门口的风铃短促地响了一下。",
        },
      ],
      reason: round === 1 ? "先让林晏检查。" : "再让谢无声守住门口。",
    };
  };

  const outputTextForParticipant = (participant: any) => {
    const characterId = participant?.metadata?.characterId;
    if (characterId === "char-a") {
      return [
        "<inner_thought>我先确认柜台下面。</inner_thought>",
        "<reply>林晏：「我去柜台下看看。」</reply>",
      ].join("\\n");
    }
    if (characterId === "char-b") {
      return [
        "<inner_thought>门口不能没人看。</inner_thought>",
        "<reply>谢无声：「门口交给我。」</reply>",
      ].join("\\n");
    }
    return [
      "<inner_thought>保持现场。</inner_thought>",
      "<reply>角色：「我会跟上。」</reply>",
    ].join("\\n");
  };

  const emitAgentText = ({
    agentRoleId,
    agentTaskId,
    onEvent,
    stepId,
    taskId,
    text,
    workflowRunId,
  }: any) => {
    const splitAt = Math.ceil(text.length / 2);
    for (const delta of [text.slice(0, splitAt), text.slice(splitAt)].filter(Boolean)) {
      onEvent?.({
        type: "agent_event",
        taskId,
        workflowRunId,
        stepId,
        agentRoleId,
        agentTaskId,
        event: {
          type: "text_delta",
          delta,
        },
      });
    }
  };

  const emitStepStarted = ({ onEvent, step, taskId, workflowRunId }: any) => {
    onEvent?.({
      type: "step_started",
      taskId,
      workflowRunId,
      stepId: step.id,
      stepType: step.type,
      agentRoleId: step.agentRoleId,
      agentTaskId: step.agentRoleId ? workflowRunId + ":" + step.id : undefined,
    });
  };

  const emitStepDone = ({
    onEvent,
    output,
    step,
    steps,
    taskId,
    text,
    workflowRunId,
  }: any) => {
    const stepResult = {
      stepId: step.id,
      stepType: step.type,
      agentRoleId: step.agentRoleId,
      agentTaskId: step.agentRoleId ? workflowRunId + ":" + step.id : undefined,
      outputKey: step.outputKey,
      output,
      text: text ?? (typeof output === "string" ? output : JSON.stringify(output)),
    };
    steps.push(stepResult);
    onEvent?.({
      type: "step_done",
      taskId,
      workflowRunId,
      step: stepResult,
    });
  };

  export const runTavernCollaboration = async ({
    onEvent,
    ...input
  }: any) => {
    const runIndex = tavernDirectorLoopMockRuns.length + 1;
    const taskId = "mock-director-loop-task-" + runIndex;
    const workflowRunId = "mock-director-loop-workflow-" + runIndex;
    const steps: any[] = [];
    const output: Record<string, unknown> = {};
    tavernDirectorLoopMockRuns.push(input);
    const supervisor = input.participants.find((participant: any) => participant.kind === "supervisor");
    if (!supervisor) {
      throw new Error("supervisor.dispatch-loop mock requires a supervisor participant");
    }

    onEvent?.({
      type: "workflow_started",
      taskId,
      workflowRunId,
      workflowId: input.mode,
      executorId: "langgraph",
    });

    for (const round of [1, 2]) {
      const decision = decisionForRound(input, round);
      const directorRaw = JSON.stringify(decision);
      const supervisorStep = {
        id: "supervisor",
        type: "agent",
        agentRoleId: supervisor.id,
        outputKey: "supervisorRaw",
      };
      emitStepStarted({ onEvent, step: supervisorStep, taskId, workflowRunId });
      emitAgentText({
        agentRoleId: supervisorStep.agentRoleId,
        agentTaskId: workflowRunId + ":" + supervisorStep.id,
        onEvent,
        stepId: supervisorStep.id,
        taskId,
        text: directorRaw,
        workflowRunId,
      });
      output[supervisorStep.outputKey] = directorRaw;
      emitStepDone({
        onEvent,
        output: directorRaw,
        step: supervisorStep,
        steps,
        taskId,
        text: directorRaw,
        workflowRunId,
      });

      const normalizeStep = {
        id: "normalizeSupervisorDecision",
        type: "transform",
        outputKey: "supervisorDecision",
      };
      output[normalizeStep.outputKey] = decision;
      emitStepDone({
        onEvent,
        output: decision,
        step: normalizeStep,
        steps,
        taskId,
        workflowRunId,
      });

      const selectedParticipant = input.participants.find((participant: any) =>
        participant.id === decision.selectedTargetId
      );
      if (!selectedParticipant) {
        throw new Error("supervisor.dispatch-loop mock selected an unknown participant");
      }
      const selectedInvocation = {
        id: selectedParticipant.id + "-round-" + round,
        agentRoleId: selectedParticipant.id,
        outputKey: "worker:" + selectedParticipant.id + ":round:" + round,
        userMessage: decision.selectedInstruction,
        metadata: {
          round,
          source: "supervisor.dispatch-loop",
        },
      };
      const selectStep = {
        id: "selectDispatchTarget",
        type: "transform",
        outputKey: "supervisorSelection",
      };
      output[selectStep.outputKey] = {
        route: "dispatch",
        decision,
        selected: {
          targetId: selectedParticipant.id,
          score: decision.candidates.find((candidate: any) => candidate.targetId === selectedParticipant.id)?.score ?? 0,
          instruction: decision.selectedInstruction,
        },
        invocations: [selectedInvocation],
      };
      emitStepDone({
        onEvent,
        output: output[selectStep.outputKey],
        step: selectStep,
        steps,
        taskId,
        workflowRunId,
      });

      const routeStep = {
        id: "routeDispatchSelection",
        type: "router",
        outputKey: "supervisorSelectionRoute",
      };
      emitStepDone({
        onEvent,
        output: { route: "dispatch", targetStepId: "dispatchWorker" },
        step: routeStep,
        steps,
        taskId,
        workflowRunId,
      });

      const dispatchStep = {
        id: "dispatchWorker",
        type: "dispatch",
        outputKey: "workerDispatch",
      };
      emitStepStarted({ onEvent, step: dispatchStep, taskId, workflowRunId });
      const dispatchResults = [];
      for (const invocation of [selectedInvocation]) {
        const speakerStep = {
          id: dispatchStep.id + ":" + invocation.id,
          type: "agent",
          agentRoleId: invocation.agentRoleId,
          outputKey: invocation.outputKey,
        };
        const text = outputTextForParticipant(selectedParticipant);
        emitStepStarted({ onEvent, step: speakerStep, taskId, workflowRunId });
        emitAgentText({
          agentRoleId: speakerStep.agentRoleId,
          agentTaskId: workflowRunId + ":" + speakerStep.id,
          onEvent,
          stepId: speakerStep.id,
          taskId,
          text,
          workflowRunId,
        });
        output[speakerStep.outputKey] = text;
        dispatchResults.push({
          stepId: speakerStep.id,
          agentRoleId: speakerStep.agentRoleId,
          outputKey: speakerStep.outputKey,
          text,
        });
        emitStepDone({
          onEvent,
          output: text,
          step: speakerStep,
          steps,
          taskId,
          text,
          workflowRunId,
        });
      }
      output[dispatchStep.outputKey] = {
        count: dispatchResults.length,
        invocations: dispatchResults,
      };
      emitStepDone({
        onEvent,
        output: output[dispatchStep.outputKey],
        step: dispatchStep,
        steps,
        taskId,
        workflowRunId,
      });

      const incrementStep = {
        id: "incrementSupervisorRound",
        type: "transform",
        outputKey: "supervisorRound",
      };
      output[incrementStep.outputKey] = round;
      emitStepDone({
        onEvent,
        output: round,
        step: incrementStep,
        steps,
        taskId,
        workflowRunId,
      });

      const loopRouteStep = {
        id: "routeSupervisorLoop",
        type: "router",
        outputKey: "supervisorLoopRoute",
      };
      output[loopRouteStep.outputKey] = {
        route: round === 1 ? "supervisor" : "end",
        targetStepId: round === 1 ? "supervisor" : "__end__",
      };
      emitStepDone({
        onEvent,
        output: output[loopRouteStep.outputKey],
        step: loopRouteStep,
        steps,
        taskId,
        workflowRunId,
      });
    }

    const result = {
      workflowRunId,
      executorId: "langgraph",
      steps,
      skippedSteps: [],
      output,
    };
    onEvent?.({
      type: "workflow_done",
      taskId,
      workflowRunId,
      result,
    });
    return {
      ...result,
      taskId,
    };
  };
`, "utf8");

writeFileSync(entryPath, `
  import {
    runDirectorLoopTurn,
    shouldRunTavernDirectorLoopWorkflow,
  } from ${JSON.stringify(directorLoopPath)};
  import {
    createTavernCharacter,
    createTavernRoom,
  } from ${JSON.stringify(manualFactoriesPath)};
  import {
    createTavernMessage,
  } from ${JSON.stringify(messagePath)};
  import {
    tavernCharacterAgentRoleId,
    tavernDirectorAgentRoleId,
  } from ${JSON.stringify(corePath)};
  import {
    tavernDirectorLoopMockRuns,
  } from ${JSON.stringify(mockCollaborationPath)};

  const assert = (condition: unknown, message: string, details?: unknown) => {
    if (!condition) {
      const suffix = details === undefined ? "" : "\\n" + JSON.stringify(details, null, 2);
      throw new Error(message + suffix);
    }
  };

  const runtimeModel = {
    id: "mock-model-option",
    provider: {
      id: "mock-provider",
      name: "Mock Provider",
    },
    modelId: "mock-model",
    modelName: "Mock Model",
  };
  const roomBase = createTavernRoom("workspace-director-loop-flow", 1);
  const sceneInstanceId = roomBase.activeSceneInstanceId ?? roomBase.activeSceneId ?? roomBase.id;
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
    replyMode: "director" as const,
    localCharacters: [characterA, characterB],
    characterIds: [characterA.id, characterB.id],
    activeCharacterId: characterA.id,
    settings: {
      ...roomBase.settings,
      continuation: {
        ...roomBase.settings.continuation,
        enabled: false,
      },
      illustrationHints: {
        ...roomBase.settings.illustrationHints,
        enabled: false,
      },
    },
  };
  const directorMode = {
    replyMode: "director",
    isManagedMode: false,
    isSceneDriveMode: false,
    isDirectorLikeMode: true,
  } as const;
  const roomWithDirectorLoopDisabled = {
    ...room,
    settings: {
      ...room.settings,
      directorLoop: {
        ...room.settings.directorLoop,
        enabled: false,
      },
    },
  };
  assert(
    shouldRunTavernDirectorLoopWorkflow({
      availableRoomCharacters: [characterA, characterB],
      mode: directorMode,
      room,
    }),
    "导演回环默认开启时应进入 supervisor.dispatch-loop workflow",
  );
  assert(
    !shouldRunTavernDirectorLoopWorkflow({
      availableRoomCharacters: [characterA, characterB],
      mode: directorMode,
      room: roomWithDirectorLoopDisabled,
    }),
    "房间关闭导演回环时不应进入 supervisor.dispatch-loop workflow",
  );
  const userMessage = createTavernMessage({
    roomId: room.id,
    sceneId: room.activeSceneId,
    sceneInstanceId,
    role: "user",
    content: "柜台下传来一声轻响。",
    status: "done",
  });

  let state: any = {
    version: 4,
    activeRoomId: room.id,
    rooms: [room],
    messagesByInstance: {
      [sceneInstanceId]: [userMessage],
    },
    workflowTracesByInstance: {
      [sceneInstanceId]: [],
    },
  };
  let executionSteps: any[] = [];
  const turnStatusUpdates: string[] = [];
  const errors: string[] = [];
  const applyStateUpdate = (updater: any) => {
    state = typeof updater === "function" ? updater(state) : updater;
  };
  const upsertExecutionStep = (step: any) => {
    executionSteps = executionSteps.some((item) => item.id === step.id)
      ? executionSteps.map((item) => item.id === step.id ? { ...item, ...step } : item)
      : [...executionSteps, step];
  };
  const patchExecutionStep = (stepId: string, patch: any) => {
    executionSteps = executionSteps.map((step) => step.id === stepId ? { ...step, ...patch } : step);
  };
  const appendMessagesToRoom = (roomId: string, messages: any[]) => {
    const targetRoom = state.rooms.find((item: any) => item.id === roomId) ?? room;
    const targetSceneInstanceId = targetRoom.activeSceneInstanceId ?? targetRoom.activeSceneId ?? targetRoom.id;
    const targetSceneId = targetRoom.activeSceneId;
    state = {
      ...state,
      messagesByInstance: {
        ...state.messagesByInstance,
        [targetSceneInstanceId]: [
          ...(state.messagesByInstance[targetSceneInstanceId] ?? []),
          ...messages.map((message) => ({
            ...message,
            sceneId: message.sceneId ?? targetSceneId,
            sceneInstanceId: message.sceneInstanceId ?? targetSceneInstanceId,
          })),
        ],
      },
    };
  };
  const patchMessage = (messageId: string, patch: any) => {
    state = {
      ...state,
      messagesByInstance: Object.fromEntries(
        Object.entries(state.messagesByInstance).map(([instanceId, messages]) => [
          instanceId,
          (messages as any[]).map((message) =>
            message.id === messageId ? { ...message, ...patch } : message
          ),
        ]),
      ),
    };
  };
  const ctx = {
    workspace: {
      id: "workspace-director-loop-flow",
      path: "/tmp/novel-claw-director-loop-flow",
    },
    runtimeAgentId: "mock-agent",
    runtimeModel,
    get state() {
      return state;
    },
    setState: applyStateUpdate,
    error: "",
    setError: (message: string) => {
      errors.push(message);
    },
    turnStatus: "",
    setTurnStatus: (status: string) => {
      turnStatusUpdates.push(status);
    },
    get executionSteps() {
      return executionSteps;
    },
    setExecutionSteps: (updater: any) => {
      executionSteps = typeof updater === "function" ? updater(executionSteps) : updater;
    },
    executionTraceAnchorMessageId: userMessage.id,
    setExecutionTraceAnchorMessageId: () => {},
    get activeRoom() {
      return state.rooms.find((item: any) => item.id === room.id) ?? room;
    },
    characterById: new Map([[characterA.id, characterA], [characterB.id, characterB]]),
    roomCharacters: [characterA, characterB],
    get roomMessages() {
      return state.messagesByInstance[sceneInstanceId] ?? [];
    },
    activeCharacter: characterA,
    resetExecutionTrace: (steps: any[]) => {
      executionSteps = steps;
    },
    patchExecutionStep,
    appendExecutionStep: (step: any) => {
      executionSteps = [...executionSteps, step];
    },
    upsertExecutionStep,
    patchRoom: (roomId: string, patch: any) => {
      state = {
        ...state,
        rooms: state.rooms.map((item: any) => item.id === roomId ? { ...item, ...patch } : item),
      };
    },
    appendMessagesToRoom,
    patchMessage,
    removeMessage: () => {},
    reportError: (message: string) => {
      errors.push(message);
    },
  } as any;

  const activeReplyRef = {
    message: null,
    text: "",
  };
  const result = await runDirectorLoopTurn({
    activeReplyRef,
    availableActiveCharacter: characterA,
    availableRoomCharacters: [characterA, characterB],
    ctx,
    mode: directorMode,
    references: [],
    room,
    runtimeMessages: [userMessage],
    runtimeModel,
    runtimeRoom: room,
    selectedReplyOption: undefined,
    storyContext: undefined as any,
    text: userMessage.content,
    turnMessages: [userMessage],
    userMessage,
  });

  const firstRun = tavernDirectorLoopMockRuns[0];
  const allMessages = state.messagesByInstance[sceneInstanceId] ?? [];
  const characterMessages = allMessages.filter((message: any) => message.role === "character");
  const narratorMessages = allMessages.filter((message: any) => message.role === "narrator");
  const characterMessageIds = new Set(characterMessages.map((message: any) => message.id));
  const persistedTrace = state.workflowTracesByInstance[sceneInstanceId]?.[0];

  assert(tavernDirectorLoopMockRuns.length === 1, "导演回环应合并为一次 collaboration 调用", tavernDirectorLoopMockRuns);
  assert(firstRun.type === "collaborationMode", "导演回环应使用 collaboration mode", firstRun);
  assert(firstRun.mode === "supervisor.dispatch-loop", "应运行 supervisor.dispatch-loop mode", firstRun);
  assert(
    firstRun.participants.map((participant: any) => participant.id).join("|") ===
      [
        tavernDirectorAgentRoleId(room),
        tavernCharacterAgentRoleId(room, characterA),
        tavernCharacterAgentRoleId(room, characterB),
      ].join("|"),
    "supervisor.dispatch-loop mode 应包含监督者和候选角色 participants",
    firstRun.participants,
  );
  assert(characterMessages.length === 2, "两轮回环应每轮落地一个被调度角色且不能重复 append", characterMessages);
  assert(characterMessageIds.size === characterMessages.length, "最终角色消息 id 不应重复", characterMessages);
  assert(narratorMessages.length === 2, "两次导演决策应实时落地旁白消息", narratorMessages);
  assert(characterMessages[0]?.content.includes("柜台下看看"), "第一轮 A 的最终内容应来自流式输出", characterMessages[0]);
  assert(characterMessages[1]?.content.includes("门口交给我"), "第二轮 B 的最终内容应来自流式输出", characterMessages[1]);
  assert(characterMessages[1]?.thought?.includes("门口"), "第二轮 B 的心理内容应被解析落地", characterMessages[1]);
  assert(
    executionSteps.filter((step) => step.label.endsWith("回环回复") && step.status === "done").length === 2,
    "两个回环 speaker 执行步骤都应完成",
    executionSteps,
  );
  assert(
    executionSteps.some((step) => step.id === "director-loop" && step.status === "done"),
    "导演回环总执行步骤应完成",
    executionSteps,
  );
  assert(persistedTrace?.status === "done", "导演回环 workflow trace 应完成", persistedTrace);
  assert(result.turnMessages.filter((message: any) => message.role === "character").length === 2, "返回值应包含两条角色 turnMessages", result.turnMessages);
  assert(result.turnNarratorTexts.length === 2, "返回值应包含两条导演旁白文本", result.turnNarratorTexts);
  assert(result.supervisorDecision?.speakerIds?.[0] === characterB.id, "返回值应保留最后一轮 supervisor 决策", result.supervisorDecision);
  assert(result.directorReason.includes("谢无声"), "返回值应保留最后一轮导演理由", result.directorReason);
  assert(activeReplyRef.message === null && activeReplyRef.text === "", "流程结束后 activeReplyRef 应清空", activeReplyRef);
  assert(errors.length === 0, "测试流程不应产生错误", errors);

  console.log(JSON.stringify({
    ok: true,
    collaborationRuns: tavernDirectorLoopMockRuns.length,
    mode: firstRun.mode,
    participantIds: firstRun.participants.map((participant: any) => participant.id),
    characterMessages: characterMessages.map((message: any) => ({
      characterId: message.characterId,
      status: message.status,
      content: message.content,
      thought: message.thought,
    })),
    narratorMessages: narratorMessages.map((message: any) => message.content),
    executionSteps: executionSteps.map((step) => ({
      id: step.id,
      label: step.label,
      status: step.status,
    })),
    trace: {
      status: persistedTrace?.status,
      stepCount: persistedTrace?.steps.length,
    },
    turnStatusUpdates,
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
    plugins: [
      {
        name: "mock-tavern-director-loop-flow-dependencies",
        setup(build) {
          build.onResolve({ filter: /.*/ }, (args) => {
            if (args.path.includes("runtime/collaboration") && !args.path.endsWith("adapter.ts")) {
              return { path: mockCollaborationPath };
            }
            if (args.path.includes("runtime/conversation")) {
              return { path: mockConversationPath };
            }
            if (args.path.includes("runtime/reply")) {
              return { path: mockReplyPath };
            }
            if (args.path === "@/features/pages/settings/llm/store") {
              return { path: mockLlmStorePath };
            }
            return null;
          });
        },
      },
    ],
  });

  await import(pathToFileURL(bundledPath).href);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
