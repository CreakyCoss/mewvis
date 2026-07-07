import { build } from "esbuild";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workspaceRoot = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "novel-claw-tavern-prompt-quality-"));
const entryPath = join(tempDir, "runner.ts");
const bundledPath = join(tempDir, "runner.mjs");
const activeSceneRuntimePath = resolve(
  workspaceRoot,
  "src/features/pages/taverns/tavern/runtime/active-scene-runtime.ts",
);
const directorPromptPath = resolve(workspaceRoot, "src/features/pages/taverns/tavern/runtime/director/prompt.ts");
const manualFactoriesPath = resolve(workspaceRoot, "src/features/pages/taverns/tavern/factories/manual-factories.ts");
const sceneBuilderPath = resolve(workspaceRoot, "src/features/pages/taverns/room/story-model/scene-builder.ts");
const userReplySuggestionPromptPath = resolve(
  workspaceRoot,
  "src/features/pages/taverns/tavern/runtime/assistants/user-reply/suggestion-prompt.ts",
);

writeFileSync(
  entryPath,
  `
  import {
    projectTavernSceneOntoRoom,
  } from ${JSON.stringify(activeSceneRuntimePath)};
  import {
    buildTavernDirectorPromptContext,
    buildTavernDirectorRuntimeInstruction,
  } from ${JSON.stringify(directorPromptPath)};
  import {
    createTavernCharacter,
    createTavernRoom,
  } from ${JSON.stringify(manualFactoriesPath)};
  import {
    buildTavernScene,
  } from ${JSON.stringify(sceneBuilderPath)};
  import {
    buildTavernUserReplySuggestionPrompt,
  } from ${JSON.stringify(userReplySuggestionPromptPath)};

  const assert = (condition: unknown, message: string, details?: unknown) => {
    if (!condition) {
      const suffix = details === undefined ? "" : "\\n" + JSON.stringify(details, null, 2);
      throw new Error(message + suffix);
    }
  };

  const now = Date.now();
  const roomBase = createTavernRoom("workspace-prompt-quality", 1);
  const characterA = {
    ...createTavernCharacter({
      name: "阿洛",
      avatar: "cat-lavender",
      description: "谨慎的斥候。",
      speakingStyle: "短句，谨慎。",
      goals: "守住高处视野。",
    }),
    id: "char-a",
  };
  const characterB = {
    ...createTavernCharacter({
      name: "贝拉",
      avatar: "cat-graphite",
      description: "热情的酒保。",
      speakingStyle: "轻快。",
      goals: "获得旅人信任。",
    }),
    id: "char-b",
  };
  const characters = [characterA, characterB];
  const scene = buildTavernScene({
    id: "scene-prompt",
    title: "门口铃声",
    scenePresetId: roomBase.scenePresetId,
    scene: "低灯下，门口风铃忽然响了一声。",
    sceneGoal: "让旅人决定是否开门。",
    plot: "角色需要分辨铃声来源。",
    storyDirection: "不要替用户打开门。",
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
  const pendingInteraction = {
    id: "pending-user-choice",
    sourceMessageId: "m-b",
    source: { type: "character", characterId: characterB.id },
    target: { type: "user" },
    kind: "question",
    text: "旅人，你要我先去门边吗？",
    requiresResponse: true,
    status: "open",
    createdTurnId: "turn-1",
  };
  const sceneInstance = {
    ...scene,
    id: "scene-instance-prompt",
    sceneId: scene.id,
    nodeId: "node-prompt",
    runIds: [],
    pathNodeIds: ["node-prompt"],
    pathEdgeIds: [],
    pendingInteractions: [pendingInteraction],
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
  const room = {
    ...projectTavernSceneOntoRoom({
      ...roomBase,
      title: "提示词质量酒馆",
      storyOutline: "风铃声让门口变得可疑。",
      storyGoal: "保留用户选择空间。",
      storyGraph: {
        version: 1,
        entryNodeId: "node-prompt",
        activeNodeId: "node-prompt",
        nodes: [{
          id: "node-prompt",
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
      pendingInteractions: [pendingInteraction],
      replyOptions: [],
      characterConfigs: {},
      characterMemories: {},
      localCharacters: characters,
      lorebookEntries: [],
      characterIds: characters.map((character) => character.id),
      activeCharacterId: characterA.id,
      userPersonaName: "旅人",
      settings: {
        ...roomBase.settings,
        directorLoop: {
          enabled: true,
          maxRounds: 2,
        },
        replyOptions: {
          enabled: true,
          count: 3,
        },
      },
    }),
    pendingInteractions: [pendingInteraction],
  };
  const messages = [
    {
      id: "m-user",
      roomId: room.id,
      sceneId: room.activeSceneId,
      sceneInstanceId: room.activeSceneInstanceId,
      role: "user",
      content: "先别开门，贝拉你听听外面。",
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
      content: "旅人，你要我先去门边吗？",
      createdAt: now + 2,
      status: "done",
    },
  ];
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
  const directorInstruction = buildTavernDirectorRuntimeInstruction(directorPromptContext);
  const suggestionPrompt = buildTavernUserReplySuggestionPrompt({
    room,
    characters,
    messages,
    currentDraft: "先等一下",
  });
  const removedArtifactNames = ["random" + "Event", "illustration" + "Hint"];

  assert(
    directorPromptContext.requestContext.includes("narrator|ambientAction") &&
      removedArtifactNames.every((artifactName) => !directorPromptContext.requestContext.includes(artifactName)),
    "导演输出契约应只开放旁白和在场动作 artifact",
    directorPromptContext.requestContext,
  );
  assert(
    directorInstruction.includes("supervisor.dispatch-loop") &&
      removedArtifactNames.every((artifactName) => !directorInstruction.includes(artifactName)),
    "导演运行指令应保留回环调度，且不暴露已移除 artifact",
    directorInstruction,
  );
  assert(
    suggestionPrompt.suggestionCount === 3 &&
      suggestionPrompt.prompt.includes("pending-user-choice") &&
      suggestionPrompt.prompt.includes("respondsToInteractionId") &&
      suggestionPrompt.prompt.includes("已有用户草稿"),
    "候选回复 prompt 应保留 pending interaction、响应 id 和草稿补全能力",
    suggestionPrompt,
  );

  console.log(JSON.stringify({
    ok: true,
    directorPromptChars: directorPromptContext.requestContext.length,
    suggestionCount: suggestionPrompt.suggestionCount,
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
