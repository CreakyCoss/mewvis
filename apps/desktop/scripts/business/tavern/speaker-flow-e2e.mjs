import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workspaceRoot = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "novel-claw-tavern-speaker-flow-"));
const entryPath = join(tempDir, "runner.ts");
const bundledPath = join(tempDir, "runner.mjs");
const mockCollaborationPath = join(tempDir, "mock-collaboration.ts");
const mockConversationPath = join(tempDir, "mock-conversation.ts");
const mockLlmStorePath = join(tempDir, "mock-llm-store.ts");
const mockReplyPath = join(tempDir, "mock-reply.ts");
const adapterPath = resolve(workspaceRoot, "src/features/pages/taverns/tavern/runtime/collaboration/adapter.ts");
const speakersPath = resolve(workspaceRoot, "src/features/pages/taverns/room/turn/submit-flow/speakers.ts");
const manualFactoriesPath = resolve(workspaceRoot, "src/features/pages/taverns/tavern/factories/manual-factories.ts");
const messagePath = resolve(workspaceRoot, "src/features/pages/taverns/tavern/message/index.ts");
const corePath = resolve(workspaceRoot, "src/features/pages/taverns/tavern/core/index.ts");

writeFileSync(
  mockLlmStorePath,
  `
  export const requireRuntimeModelInput = (runtimeModel: any) => ({
    provider: "mock-provider",
    apiFormat: "openai-chat",
    catalogModelId: runtimeModel?.modelId ?? "mock-model",
    modelId: runtimeModel?.modelId ?? "mock-model",
  });
`,
  "utf8",
);

writeFileSync(
  mockReplyPath,
  `
  export const runTavernInnerThought = async () => "mock inner thought";
`,
  "utf8",
);

writeFileSync(
  mockConversationPath,
  `
  export const buildTavernBridgeSystemPrompt = () => "mock tavern system prompt";
`,
  "utf8",
);

writeFileSync(
  mockCollaborationPath,
  `
  import {
    buildTavernSpeakerCollaborationInput as realBuildTavernSpeakerCollaborationInput,
  } from ${JSON.stringify(adapterPath)};

  const mockRunsKey = "__novelClawTavernCollaborationMockRuns";
  const globalMockState = globalThis as typeof globalThis & Record<string, any[] | undefined>;
  export const tavernCollaborationMockRuns: any[] = globalMockState[mockRunsKey] ?? [];
  globalMockState[mockRunsKey] = tavernCollaborationMockRuns;

  export const buildTavernSpeakerCollaborationInput = realBuildTavernSpeakerCollaborationInput;

  const outputTextForStep = (step: any) => {
    if (step.outputKey === "reply:char-a") {
      return [
        "<inner_thought>我先确认声源。</inner_thought>",
        "<reply>林晏：「我去柜台下看看。」</reply>",
      ].join("\\n");
    }
    if (step.outputKey === "reply:char-b") {
      return [
        "<inner_thought>我守住门口，等他查看。</inner_thought>",
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
    onAgentEvent,
    onEvent,
    stepId,
    taskId,
    text,
    workflowRunId,
  }: any) => {
    const chunks = [text.slice(0, Math.ceil(text.length / 2)), text.slice(Math.ceil(text.length / 2))]
      .filter(Boolean);
    for (const delta of chunks) {
      const event = {
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
      };
      onEvent?.(event);
      onAgentEvent?.(event);
    }
  };

  export const runTavernCollaboration = async ({
    onAgentEvent,
    onEvent,
    ...input
  }: any) => {
    const runIndex = tavernCollaborationMockRuns.length + 1;
    const taskId = "mock-collaboration-task-" + runIndex;
    const workflowRunId = "mock-workflow-" + runIndex;
    tavernCollaborationMockRuns.push(input);
    onEvent?.({
      type: "workflow_started",
      taskId,
      workflowRunId,
      workflowId: input.workflow.id,
      runtimeId: "langgraph",
    });

    const steps = [];
    const output: Record<string, unknown> = {};
    for (const step of input.workflow.steps ?? []) {
      if (step.type !== "agent") {
        continue;
      }
      const agentTaskId = workflowRunId + ":" + step.id;
      onEvent?.({
        type: "step_started",
        taskId,
        workflowRunId,
        stepId: step.id,
        stepType: "agent",
        agentRoleId: step.agentRoleId,
        agentTaskId,
      });
      const text = outputTextForStep(step);
      emitAgentText({
        agentRoleId: step.agentRoleId,
        agentTaskId,
        onAgentEvent,
        onEvent,
        stepId: step.id,
        taskId,
        text,
        workflowRunId,
      });
      const stepResult = {
        stepId: step.id,
        stepType: "agent",
        agentRoleId: step.agentRoleId,
        agentTaskId,
        outputKey: step.outputKey,
        output: text,
        text,
      };
      steps.push(stepResult);
      output[step.outputKey] = text;
      onEvent?.({
        type: "step_done",
        taskId,
        workflowRunId,
        step: stepResult,
      });
    }

    const result = {
      workflowRunId,
      runtimeId: "langgraph",
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
`,
  "utf8",
);

writeFileSync(
  entryPath,
  `
  import {
    runSpeakerReplyFlow,
  } from ${JSON.stringify(speakersPath)};
  import {
    createTavernCharacter,
    createTavernRoom,
  } from ${JSON.stringify(manualFactoriesPath)};
  import {
    createTavernMessage,
  } from ${JSON.stringify(messagePath)};
  import {
    tavernCharacterAgentRoleId,
  } from ${JSON.stringify(corePath)};
  import {
    tavernCollaborationMockRuns,
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
  const createRuntimeRoom = (roomBase: any, characters: any[]) => {
    const createdAt = Date.now();
    const sceneId = roomBase.id + "-scene";
    const nodeId = roomBase.id + "-node";
    const sceneInstanceId = roomBase.id + "-scene-instance";
    const characterIds = characters.map((character) => character.id);
    const activeCharacterId = characterIds[0] ?? "";
    const sceneInstance = {
      id: sceneInstanceId,
      sceneId,
      nodeId,
      order: 0,
      title: "测试场景",
      scenePresetId: roomBase.scenePresetId,
      scene: "低灯照着吧台，柜台下方传来轻响。",
      sceneGoal: "确认声响来源。",
      plot: "",
      storyDirection: "",
      transition: "",
      memory: "",
      relationshipOverrides: [],
      sceneStatus: undefined,
      characterPublicStatuses: {},
      characterPrivateStatuses: {},
      pendingInteractions: [],
      replyOptions: [],
      characterConfigs: {},
      characterMemories: {},
      characterIds,
      activeCharacterId,
      runIds: [],
      pathNodeIds: [nodeId],
      pathEdgeIds: [],
      promptOverrides: { version: 1, blocks: [] },
      memoryLayers: {
        required: "",
        private: "",
        public: "",
        directorSecret: "",
      },
      characterMemoryLayers: {},
      secretReveals: [],
      createdAt,
      updatedAt: createdAt,
    };
    return {
      ...roomBase,
      storyOutline: "",
      storyGoal: "",
      storyGraph: {
        version: 1,
        entryNodeId: nodeId,
        activeNodeId: nodeId,
        nodes: [{
          id: nodeId,
          sceneId,
          title: "测试节点",
          type: "normal",
          pathRole: "main",
          position: { x: 0, y: 0 },
          status: "ready",
          createdAt,
          updatedAt: createdAt,
        }],
        edges: [],
      },
      storyRuns: [],
      activeSceneId: sceneId,
      activeSceneInstanceId: sceneInstanceId,
      sceneInstances: [sceneInstance],
      scenes: [sceneInstance],
      scene: sceneInstance.scene,
      sceneGoal: sceneInstance.sceneGoal,
      scenePlot: sceneInstance.plot,
      sceneDirection: sceneInstance.storyDirection,
      sceneTransition: sceneInstance.transition,
      memory: sceneInstance.memory,
      relationshipOverrides: [],
      sceneStatus: undefined,
      characterPublicStatuses: {},
      characterPrivateStatuses: {},
      pendingInteractions: [],
      replyOptions: [],
      characterConfigs: {},
      characterMemories: {},
      localCharacters: characters,
      lorebookEntries: [],
      characterIds,
      activeCharacterId,
      replyMode: "director" as const,
      userPersonaName: "我",
    };
  };
  const roomBase = createTavernRoom("workspace-speaker-flow", 1);
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
  const room = createRuntimeRoom(roomBase, [characterA, characterB]);
  const sceneInstanceId = room.activeSceneInstanceId;
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
  };
  const turnStatusUpdates: string[] = [];
  const errors: string[] = [];
  const applyStateUpdate = (updater: any) => {
    state = typeof updater === "function" ? updater(state) : updater;
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
  const removeMessage = (messageId: string) => {
    state = {
      ...state,
      messagesByInstance: Object.fromEntries(
        Object.entries(state.messagesByInstance).map(([instanceId, messages]) => [
          instanceId,
          (messages as any[]).filter((message) => message.id !== messageId),
        ]),
      ),
    };
  };
  const ctx = {
    workspace: {
      id: "workspace-speaker-flow",
      path: "/tmp/novel-claw-speaker-flow",
    },
    runtimeAgentId: "mock-agent",
    runtimeModel,
    get state() {
      return state;
    },
    setState: applyStateUpdate,
    draft: "",
    setDraft: () => {},
    draftCursor: 0,
    setDraftCursor: () => {},
    error: "",
    setError: (message: string) => {
      errors.push(message);
    },
    busy: { kind: "idle", status: "" },
    setBusy: (nextBusy: any) => {
      ctx.busy = typeof nextBusy === "function" ? nextBusy(ctx.busy) : nextBusy;
      if (ctx.busy?.status) {
        turnStatusUpdates.push(ctx.busy.status);
      }
    },
    setBusyStatus: (status: string) => {
      ctx.busy = { ...ctx.busy, status };
      turnStatusUpdates.push(status);
    },
    isSending: false,
    setIsSending: () => {},
    isGeneratingReplySuggestions: false,
    setIsGeneratingReplySuggestions: () => {},
    replySuggestions: [],
    setReplySuggestions: () => {},
    turnStatus: "",
    setTurnStatus: (status: string) => {
      ctx.setBusyStatus(status);
    },
    get activeRoom() {
      return state.rooms.find((item: any) => item.id === room.id) ?? room;
    },
    visualPreset: {} as any,
    characterById: new Map([[characterA.id, characterA], [characterB.id, characterB]]),
    roomCharacters: [characterA, characterB],
    get roomMessages() {
      return state.messagesByInstance[sceneInstanceId] ?? [];
    },
    activeCharacter: characterA,
    appendProgressCheckpointToRoom: (targetRoom: any) => targetRoom,
    patchRoom: (roomId: string, patch: any) => {
      state = {
        ...state,
        rooms: state.rooms.map((item: any) => item.id === roomId ? { ...item, ...patch } : item),
      };
    },
    appendMessagesToRoom,
    patchMessage,
    removeMessage,
    reportError: (message: string) => {
      errors.push(message);
    },
  } as any;

  const activeReplyRef = {
    message: null,
    text: "",
  };
  const result = await runSpeakerReplyFlow({
    ctx,
    room,
    runtimeRoom: room,
    runtimeMessages: [userMessage],
    turnMessages: [userMessage],
    userMessage,
    text: userMessage.content,
    references: [],
    selectedReplyOption: undefined,
    speakers: [characterA, characterB],
    mode: {
      replyMode: "director",
      isSceneDriveMode: false,
      isDirectorLikeMode: true,
    },
    directorReason: "两人依次处理柜台声响。",
    directorNonverbalReplyIds: [],
    turnNarratorTexts: [],
    requireSpeakerRuntimeModel: () => runtimeModel,
    activeReplyRef,
    storyContext: undefined as any,
  });

  const characterMessages = (state.messagesByInstance[sceneInstanceId] ?? [])
    .filter((message: any) => message.role === "character");
  const firstRun = tavernCollaborationMockRuns[0];
  assert(tavernCollaborationMockRuns.length === 1, "首轮多个 speaker 应合并为一次 collaboration 调用", {
    tavernCollaborationMockRuns,
    characterMessages,
    result,
  });
  assert(firstRun.workflow.id === "tavern.speaker-replies", "应运行 speaker replies workflow", firstRun.workflow);
  assert(firstRun.workflow.steps.length === 2, "speaker workflow 应包含两个角色 step", firstRun.workflow.steps);
  assert(
    firstRun.workflow.steps.map((step: any) => step.agentRoleId).join("|") ===
      [tavernCharacterAgentRoleId(room, characterA), tavernCharacterAgentRoleId(room, characterB)].join("|"),
    "speaker workflow 应按角色 role id 分发",
    firstRun.workflow.steps,
  );
  assert(
    firstRun.workflow.steps[1]?.runtimeInstruction?.includes("{{ outputs.reply:char-a }}"),
    "后续 speaker step 应引用前序输出模板",
    firstRun.workflow.steps[1],
  );
  assert(characterMessages.length === 2, "应落地两条角色消息", characterMessages);
  assert(
    characterMessages.every((message: any) => message.status === "done"),
    "批量 speaker 消息最终应为 done",
    characterMessages,
  );
  assert(characterMessages[0]?.content.includes("柜台下看看"), "A 的最终内容应来自对应流式输出", characterMessages[0]);
  assert(characterMessages[1]?.content.includes("门口交给我"), "B 的最终内容应来自对应流式输出", characterMessages[1]);
  assert(characterMessages[0]?.thought?.includes("确认声源"), "A 的心理内容应被解析落地", characterMessages[0]);
  assert(characterMessages[1]?.thought?.includes("守住门口"), "B 的心理内容应被解析落地", characterMessages[1]);
  assert(activeReplyRef.message === null && activeReplyRef.text === "", "流程结束后 activeReplyRef 应清空", activeReplyRef);
  assert(result.turnMessages.filter((message: any) => message.role === "character").length === 2, "返回值应包含两条角色 turnMessages", result.turnMessages);
  assert(errors.length === 0, "测试流程不应产生错误", errors);

  console.log(JSON.stringify({
    ok: true,
    collaborationRuns: tavernCollaborationMockRuns.length,
    workflowStepIds: firstRun.workflow.steps.map((step: any) => step.id),
    characterMessages: characterMessages.map((message: any) => ({
      characterId: message.characterId,
      status: message.status,
      content: message.content,
      thought: message.thought,
    })),
    turnStatusUpdates,
  }, null, 2));
`,
  "utf8",
);

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
    plugins: [
      {
        name: "mock-tavern-speaker-flow-dependencies",
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
