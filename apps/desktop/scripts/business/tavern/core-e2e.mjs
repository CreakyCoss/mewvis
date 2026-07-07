import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workspaceRoot = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "novel-claw-tavern-core-e2e-"));
const entryPath = join(tempDir, "runner.ts");
const bundledPath = join(tempDir, "runner.mjs");
const avatarPath = resolve(workspaceRoot, "src/assets/avatars/index.ts");
const activeSceneRuntimePath = resolve(
  workspaceRoot,
  "src/features/pages/taverns/tavern/runtime/active-scene-runtime.ts",
);
const corePath = resolve(workspaceRoot, "src/features/pages/taverns/tavern/core/index.ts");
const directorPromptPath = resolve(workspaceRoot, "src/features/pages/taverns/tavern/runtime/director/prompt.ts");
const manualFactoriesPath = resolve(workspaceRoot, "src/features/pages/taverns/tavern/factories/manual-factories.ts");
const messagePath = resolve(workspaceRoot, "src/features/pages/taverns/tavern/message/index.ts");
const sceneBuilderPath = resolve(workspaceRoot, "src/features/pages/taverns/tavern/story-model/scene-builder.ts");
const stateNormalizerPath = resolve(workspaceRoot, "src/features/pages/taverns/tavern/state/state-normalizer.ts");
const systemPresetRegistryPath = resolve(workspaceRoot, "src/features/pages/taverns/tavern/system-preset-registry.ts");
const systemPresetRoomPath = resolve(
  workspaceRoot,
  "src/features/pages/taverns/tavern/factories/system-preset-room.ts",
);

writeFileSync(
  entryPath,
  `
  import { allAvatarOptions } from ${JSON.stringify(avatarPath)};
  import {
    buildTavernSchedulingSignals,
    canTavernCharacterUseNonverbalReply,
    createTavernDirectorProfileFromCharacters,
    extractTavernPendingInteractionsFromMessages,
    formatTavernDirectorProfileForPrompt,
    formatTavernSchedulingSignalsForPrompt,
    resolveTavernScheduledSpeakers,
    tavernBridgeSessionRootDir,
    tavernCharacterAgentRoleId,
    tavernDirectorAgentRoleId,
    tavernQuickReplyAgentRoleId,
  } from ${JSON.stringify(corePath)};
  import {
    projectTavernSceneOntoRoom,
  } from ${JSON.stringify(activeSceneRuntimePath)};
  import {
    createTavernRenderableMessages,
    parseTavernReplyText,
  } from ${JSON.stringify(messagePath)};
  import {
    createTavernCharacter,
    createTavernRoom,
  } from ${JSON.stringify(manualFactoriesPath)};
  import {
    buildTavernScene,
  } from ${JSON.stringify(sceneBuilderPath)};
  import {
    createDefaultTavernState,
    normalizeTavernState,
  } from ${JSON.stringify(stateNormalizerPath)};
  import {
    tavernSystemPresets,
  } from ${JSON.stringify(systemPresetRegistryPath)};
  import {
    createTavernRoomFromSystemPreset,
  } from ${JSON.stringify(systemPresetRoomPath)};
  import {
    buildTavernDirectorPromptContext,
    buildTavernDirectorRuntimeInstruction,
  } from ${JSON.stringify(directorPromptPath)};

  const assert = (condition: unknown, message: string, details?: unknown) => {
    if (!condition) {
      const suffix = details === undefined ? "" : "\\n" + JSON.stringify(details, null, 2);
      throw new Error(message + suffix);
    }
  };

  const now = Date.now();
  const knownAvatarIds = new Set(allAvatarOptions.map((option) => option.id));
  const roomBase = createTavernRoom("workspace-core", 1);
  const characterA = {
    ...createTavernCharacter({
      name: "阿洛",
      avatar: "cat-lavender",
      description: "谨慎的斥候，关注屋顶和第二道影子。",
      speakingStyle: "短句，谨慎。",
      goals: "守住高处视野。",
    }),
    id: "char-a",
  };
  const characterB = {
    ...createTavernCharacter({
      name: "贝拉",
      avatar: "cat-graphite",
      description: "热情的酒保，对门口、化学气味和旅人信任很敏感。",
      speakingStyle: "轻快。",
      goals: "获得旅人信任和好感。",
    }),
    id: "char-b",
  };
  const characters = [characterA, characterB];
  const scene = buildTavernScene({
    id: "scene-alpha",
    title: "测试节点",
    scenePresetId: roomBase.scenePresetId,
    scene: "一间用于测试的酒馆。",
    sceneGoal: "确认门外铃声来源。",
    plot: "门外传来铃声。",
    storyDirection: "让角色自然分工。",
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
    characterIds: characters.map((character) => character.id),
    activeCharacterId: characterA.id,
    createdAt: now,
    updatedAt: now,
  });
  const sceneInstance = {
    ...scene,
    id: "scene-instance-alpha",
    sceneId: scene.id,
    nodeId: "node-alpha",
    runIds: [],
    pathNodeIds: ["node-alpha"],
    pathEdgeIds: [],
    promptOverrides: { version: 1 as const, blocks: [] },
    memoryLayers: {
      required: "",
      private: "",
      public: "",
      directorSecret: "",
    },
    characterMemoryLayers: {},
    secretReveals: [],
  };
  const room = projectTavernSceneOntoRoom({
    ...roomBase,
    title: "测试酒馆",
    storyOutline: "一间有铃声和阴影的酒馆。",
    storyGoal: "让旅人决定是否开门。",
    storyGraph: {
      version: 1,
      entryNodeId: "node-alpha",
      activeNodeId: "node-alpha",
      nodes: [{
        id: "node-alpha",
        sceneId: scene.id,
        title: scene.title,
        type: "normal",
        pathRole: "main",
        position: { x: 0, y: 0 },
        status: "ready",
        createdAt: now,
        updatedAt: now,
      }],
      edges: [],
    },
    storyRuns: [],
    activeSceneId: scene.id,
    activeSceneInstanceId: sceneInstance.id,
    sceneInstances: [sceneInstance],
    scenes: [scene],
    scene: scene.scene,
    sceneGoal: scene.sceneGoal,
    scenePlot: scene.plot,
    sceneDirection: scene.storyDirection,
    sceneTransition: scene.transition,
    memory: scene.memory,
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
    characterIds: characters.map((character) => character.id),
    activeCharacterId: characterA.id,
    userPersonaName: "旅人",
  });
  const messages = [
    {
      id: "m-user",
      roomId: room.id,
      sceneId: room.activeSceneId,
      sceneInstanceId: room.activeSceneInstanceId,
      role: "user",
      content: "贝拉，你听见门口那声铃了吗？",
      createdAt: now + 1,
      status: "done",
    },
    {
      id: "m-b",
      roomId: room.id,
      sceneId: room.activeSceneId,
      sceneInstanceId: room.activeSceneInstanceId,
      role: "character",
      characterId: characterB.id,
      content: "听见了。阿洛，你听见屋顶那声了吗？",
      thought: "铃声太近了，我得先稳住旅人。",
      createdAt: now + 2,
      status: "done",
    },
  ];

  const parsedReply = parseTavernReplyText({
    text: "<inner_thought>我先确认声源。</inner_thought><reply>我去门边看看。</reply>",
    activeCharacter: characterB,
    characters,
    userPersonaName: room.userPersonaName,
  });
  const interactions = extractTavernPendingInteractionsFromMessages({
    messages,
    characters,
    userPersonaName: room.userPersonaName,
    turnId: "turn-core",
  });
  const schedulingSignals = buildTavernSchedulingSignals({
    room,
    characters,
    messages,
    currentUserText: messages[0].content,
    selectedTargetCharacterIds: [characterB.id],
  });
  const directorProfile = createTavernDirectorProfileFromCharacters({
    room,
    characters,
    source: "manual",
    updatedAt: now,
  });
  const directorProfilePrompt = formatTavernDirectorProfileForPrompt({
    profile: directorProfile,
    characters,
  });
  const schedulingSignalsPrompt = formatTavernSchedulingSignalsForPrompt({
    signals: schedulingSignals,
    characters,
  });
  const scheduledSpeakers = resolveTavernScheduledSpeakers({
    room,
    availableCharacters: characters,
    activeCharacterId: characterA.id,
    directorSpeakerIds: [characterB.id],
    directorNonverbalReplyIds: [],
    selectedTargetCharacterIds: [characterB.id],
    currentUserText: messages[0].content,
    fallbackCharacter: characterA,
  });
  const nonverbalAllowed = canTavernCharacterUseNonverbalReply({
    room,
    characterId: characterB.id,
    selectedTargetCharacterIds: [characterB.id],
    directorNonverbalReplyIds: [characterB.id],
    currentUserText: "贝拉，只用动作回应。",
    directorReason: "用户要求动作回应。",
  });
  const renderable = createTavernRenderableMessages({
    messages,
    characters,
    userPersonaName: room.userPersonaName,
  });
  const directorPromptContext = buildTavernDirectorPromptContext({
    room,
    characters,
    messages,
    references: [],
    currentUserText: messages[0].content,
    turnTrigger: { type: "user" },
    selectedTargetCharacterIds: [characterB.id],
    maxSpeakers: 2,
  });
  const directorRuntimeInstruction = buildTavernDirectorRuntimeInstruction(directorPromptContext);
  const removedArtifactNames = ["random" + "Event", "illustration" + "Hint"];
  const defaultState = createDefaultTavernState("workspace-core");
  const normalizedState = normalizeTavernState("workspace-core", {
    version: 4,
    activeRoomId: "",
    rooms: [],
  });
  const materializedPreset = createTavernRoomFromSystemPreset("workspace-core", tavernSystemPresets[0].id);
  const invalidAvatarIds = tavernSystemPresets.flatMap((preset) =>
    preset.characters
      .map((character) => character.avatar)
      .filter((avatar) => avatar && !knownAvatarIds.has(avatar)),
  );

  const checks = {
    parsedReply,
    interactions,
    schedulingSignals,
    directorProfilePrompt,
    schedulingSignalsPrompt,
    scheduledSpeakers,
    nonverbalAllowed,
    renderable,
    directorRuntimeInstruction,
    defaultState,
    normalizedState,
    materializedPreset,
    invalidAvatarIds,
    roleIds: {
      director: tavernDirectorAgentRoleId(room),
      quickReply: tavernQuickReplyAgentRoleId(room),
      bridge: tavernBridgeSessionRootDir(room),
      charA: tavernCharacterAgentRoleId(room, characterA),
      charB: tavernCharacterAgentRoleId(room, characterB),
    },
  };

  assert(checks.parsedReply.thought === "我先确认声源。", "回复解析应提取 inner_thought", checks.parsedReply);
  assert(checks.parsedReply.content === "我去门边看看。", "回复解析应提取公开 reply", checks.parsedReply);
  assert(
    checks.interactions.length === 1 &&
      checks.interactions[0].target.type === "character" &&
      checks.interactions[0].target.characterIds[0] === characterA.id,
    "角色点名另一角色时应抽取待回应事项",
    checks.interactions,
  );
  assert(
    checks.schedulingSignals[0]?.characterId === characterB.id &&
      checks.schedulingSignals[0]?.matchedRuleIds.includes("direct-target-priority"),
    "调度信号应让被点名角色优先",
    checks.schedulingSignals,
  );
  assert(
    checks.directorProfilePrompt.includes('"characterId": "char-b"') &&
      checks.schedulingSignalsPrompt.includes('"matchedRuleIds"'),
    "导演 prompt 上下文应包含稳定画像和动态调度信号",
    {
      directorProfilePrompt,
      schedulingSignalsPrompt,
    },
  );
  assert(checks.scheduledSpeakers[0]?.id === characterB.id, "导演指定角色应进入发言队列", checks.scheduledSpeakers);
  assert(checks.nonverbalAllowed, "用户要求动作回应时应允许非语言回复", checks.nonverbalAllowed);
  assert(
    checks.renderable.some((message) => message.thought === "铃声太近了，我得先稳住旅人。"),
    "UI 渲染模型应按消息自身 thought 展示角色心理",
    checks.renderable,
  );
  assert(
    checks.directorRuntimeInstruction.includes("supervisor.dispatch-loop") &&
      removedArtifactNames.every((artifactName) => !checks.directorRuntimeInstruction.includes(artifactName)) &&
      removedArtifactNames.every((artifactName) => !checks.directorPromptContext?.requestContext.includes(artifactName)) &&
      checks.directorPromptContext?.requestContext !== "",
    "导演 runtime instruction 应保留回环调度契约，且不暴露已移除 artifact",
    checks.directorRuntimeInstruction,
  );
  assert(defaultState.rooms.length === tavernSystemPresets.length, "默认状态应从系统预设创建房间", defaultState);
  assert(
    normalizedState?.rooms.length === tavernSystemPresets.length,
    "规范化空旧状态时应补齐默认系统预设房间",
    normalizedState,
  );
  assert(checks.invalidAvatarIds.length === 0, "系统预设角色头像必须使用已注册头像资源", checks.invalidAvatarIds);
  assert(
    new Set(Object.values(checks.roleIds)).size === Object.values(checks.roleIds).length,
    "导演、快捷回复、bridge 和角色应拥有不同运行时标识",
    checks.roleIds,
  );

  console.log(JSON.stringify({
    ok: true,
    pendingInteractions: checks.interactions.length,
    scheduledSpeakers: checks.scheduledSpeakers.map((speaker) => speaker.id),
    defaultRoomCount: defaultState.rooms.length,
    presetIds: tavernSystemPresets.map((preset) => preset.id),
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
