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
const manualFactoriesPath = resolve(workspaceRoot, "src/features/pages/taverns/tavern/factories/manual-factories.ts");
const messagePath = resolve(workspaceRoot, "src/features/pages/taverns/room/message/index.ts");
const corePath = resolve(workspaceRoot, "src/features/pages/taverns/tavern/core/index.ts");

writeFileSync(
  entryPath,
  `
  import {
    buildTavernDirectorLoopCollaborationInput,
    buildTavernSpeakerCollaborationInput,
  } from ${JSON.stringify(adapterPath)};
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
      userPersonaName: "我",
    };
  };
  const roomBase = createTavernRoom("workspace-collab", 1);
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
  const activeInstance = room.sceneInstances[0];
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
  assert(speakerInput.workflow?.id === "tavern.speaker-replies", "角色 adapter 应输出 speaker replies workflow", speakerInput);
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
  });

  await import(pathToFileURL(bundledPath).href);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
