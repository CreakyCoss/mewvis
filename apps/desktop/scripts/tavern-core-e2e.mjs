import { build } from "esbuild";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workspaceRoot = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "novel-claw-tavern-core-e2e-"));
const entryPath = join(tempDir, "runner.ts");
const bundledPath = join(tempDir, "runner.mjs");
const avatarPath = resolve(workspaceRoot, "src/assets/agent-avatars/index.ts");
const corePath = resolve(workspaceRoot, "src/features/pages/tavern/core/index.ts");
const directorDecisionPath = resolve(workspaceRoot, "src/features/pages/tavern/runtime/director/decision.ts");
const directorPromptPath = resolve(workspaceRoot, "src/features/pages/tavern/runtime/director/prompt.ts");
const messagePath = resolve(workspaceRoot, "src/features/pages/tavern/message/index.ts");
const promptPath = resolve(workspaceRoot, "src/features/pages/tavern/runtime/prompt/index.ts");
const promptTextBlocksPath = resolve(workspaceRoot, "src/features/pages/tavern/prompt-registry/text-blocks.ts");
const sceneNovelizerPath = resolve(workspaceRoot, "src/features/scene-novelizer/adapters/tavern/collect-tavern-scene-source.ts");
const activeSceneRuntimePath = resolve(workspaceRoot, "src/features/pages/tavern/runtime/active-scene-runtime.ts");
const branchMemoryRuntimePath = resolve(workspaceRoot, "src/features/pages/tavern/runtime/branch-memory-runtime.ts");
const assetFactoriesPath = resolve(workspaceRoot, "src/features/pages/tavern/factories/asset-factories.ts");
const defaultsPath = resolve(workspaceRoot, "src/features/pages/tavern/defaults.ts");
const generatedPresetParserPath = resolve(workspaceRoot, "src/features/pages/tavern/importers/generated-preset-parser.ts");
const generatedPresetRoomPath = resolve(workspaceRoot, "src/features/pages/tavern/factories/generated-preset-room.ts");
const manualFactoriesPath = resolve(workspaceRoot, "src/features/pages/tavern/factories/manual-factories.ts");
const stateNormalizerPath = resolve(workspaceRoot, "src/features/pages/tavern/state/state-normalizer.ts");
const storagePath = resolve(workspaceRoot, "src/features/pages/tavern/state/storage.ts");
const systemPresetRegistryPath = resolve(workspaceRoot, "src/features/pages/tavern/system-preset-registry.ts");
const systemPresetRoomPath = resolve(workspaceRoot, "src/features/pages/tavern/factories/system-preset-room.ts");
const assetExtractorParsingPath = resolve(workspaceRoot, "src/features/pages/tavern/runtime/assistants/asset-extractor/parsing.ts");

const assert = (condition, message, details) => {
  if (!condition) {
    const suffix = details === undefined ? "" : `\n${JSON.stringify(details, null, 2)}`;
    throw new Error(`${message}${suffix}`);
  }
};

writeFileSync(entryPath, `
  import { allAgentAvatarOptions } from ${JSON.stringify(avatarPath)};
  import {
    advanceTavernProgressFromFactEvents,
    applyTavernStatusEventsToSnapshot,
    assignTavernRoleFacts,
    buildTavernSchedulingSignals,
    buildTavernSceneDriveGuidance,
    canTavernCharacterUseNonverbalReply,
    createEmptyTavernStatusSnapshot,
    createTavernDirectorProfileFromCharacters,
    createTavernProgressCheckpoint,
    createTavernRoleAssignmentFactEvents,
    deriveTavernStatusEventsFromFacts,
    evaluateTavernSceneOutcomes,
    extractTavernPendingInteractionsFromMessages,
    filterTavernFactEventsForAudience,
    formatTavernDirectorProfileForPrompt,
    formatTavernSchedulingSignalsForPrompt,
    getTavernStatusSnapshotValue,
    isGeneratedTavernRoleAssignmentFactEvent,
    canTavernSelectedTargetsStaySilent,
    isTavernDirectorOnlyTurnAllowed,
    isTavernFixedOrderPhase,
    isTavernProgressVisibilityVisibleToUser,
    normalizeTavernDirectorProfile,
    orderTavernRoundParticipants,
    orderTavernRoundSpeakers,
    planTavernContinuation,
    rebuildTavernProgressFromHistory,
    resolveTavernInformationView,
    resolveTavernScheduledSpeakers,
    resolveTavernPendingOutcomeEvent,
    resolveTavernPendingStatusEvent,
    setTavernStatusSnapshotValue,
    shouldSuppressTavernAutoContinuation,
    tavernCharacterAgentRoleId,
    tavernArchivistAgentRoleId,
    tavernBridgeSessionRootDir,
    tavernDirectorAgentRoleId,
    tavernManagedUserAgentRoleId,
    tavernRelationshipKey,
    tavernProgressTrackerAgentRoleId,
    tavernQuickNovelAgentRoleId,
    tavernQuickReplyAgentRoleId,
    updateTavernTasks,
  } from ${JSON.stringify(corePath)};
  import {
    createTavernRenderableMessages,
    formatTavernVisibleMessagesForRequestContext,
    normalizeTavernMessagesForAudience,
    parseTavernReplyText,
    TAVERN_PROTOCOL_FIELDS,
  } from ${JSON.stringify(messagePath)};
  import {
    createDefaultTavernState,
  } from ${JSON.stringify(stateNormalizerPath)};
  import {
    createTavernRoom,
  } from ${JSON.stringify(manualFactoriesPath)};
  import {
    createTavernRoomFromGeneratedPresetJson,
  } from ${JSON.stringify(generatedPresetRoomPath)};
  import {
    createTavernRoomFromSystemPreset,
  } from ${JSON.stringify(systemPresetRoomPath)};
  import {
    DEFAULT_TAVERN_PROGRESS_VIEWS,
    DEFAULT_TAVERN_SCENE_OUTCOMES,
    DEFAULT_TAVERN_STATUS_DEFINITIONS,
    DEFAULT_TAVERN_STATUS_RULES,
    DEFAULT_TAVERN_TASK_DEFINITIONS,
  } from ${JSON.stringify(defaultsPath)};
  import {
    addTavernSecretMemoryEntry,
    listTavernBranchSecretMemoryEntries,
    loadTavernBranchUpstreamMemory,
    revealTavernSecretMemory,
  } from ${JSON.stringify(branchMemoryRuntimePath)};
  import {
    projectTavernSceneOntoRoom,
    syncTavernRoomActiveScene,
    switchTavernRoomSceneInstance,
  } from ${JSON.stringify(activeSceneRuntimePath)};
  import {
    createTavernAssetDraft,
  } from ${JSON.stringify(assetFactoriesPath)};
  import {
    parseTavernGeneratedPresetJsonText,
  } from ${JSON.stringify(generatedPresetParserPath)};
  import {
    saveTavernState,
  } from ${JSON.stringify(storagePath)};
  import {
    tavernSystemPresets,
  } from ${JSON.stringify(systemPresetRegistryPath)};
  import {
    parseTavernDirectorDecision,
    shouldOfferTavernDirectorRandomEvent,
  } from ${JSON.stringify(directorDecisionPath)};
  import {
    buildTavernDirectorPromptContext,
  } from ${JSON.stringify(directorPromptPath)};
  import {
    buildTavernBridgeSystemPrompt,
    buildTavernCharacterTurnInstruction,
    buildTavernSystemPrompt,
    tavernMessagesToRuntimeMessages,
  } from ${JSON.stringify(promptPath)};
  import {
    createDefaultTavernPromptSettings,
  } from ${JSON.stringify(promptTextBlocksPath)};
  import {
    collectTavernSceneNovelSource,
  } from ${JSON.stringify(sceneNovelizerPath)};
  import {
    parseTavernAssetDraft,
  } from ${JSON.stringify(assetExtractorParsingPath)};
  const now = Date.now();
  const userRef = { type: "user", userId: "user" };
  const charARef = { type: "character", characterId: "char-a" };
  const charBRef = { type: "character", characterId: "char-b" };
  const bossRef = { type: "character", characterId: "boss" };
  const globalRef = { type: "global" };
  const activeSceneInstanceIdForRoom = (targetRoom) =>
    targetRoom.activeSceneInstanceId ?? targetRoom.activeSceneId ?? targetRoom.id;
  const knownAvatarIds = new Set(allAgentAvatarOptions.map((option) => option.id));
  const statusDefinitions = [
    {
      id: "health",
      label: "健康",
      scope: "character",
      valueType: "number",
      defaultValue: 100,
      visibility: "public",
      min: 0,
      max: 100,
      updatePolicy: {
        mode: "eventDriven",
        requireFactEvent: true,
        allowedEventTypes: ["damage", "healing"],
        maxDeltaPerTurn: 40,
        confidenceThreshold: 0.7,
      },
    },
    {
      id: "favorability",
      label: "好感",
      scope: "relationship",
      valueType: "number",
      defaultValue: 0,
      visibility: "private",
      min: -100,
      max: 100,
      relationship: {
        directed: true,
        allowedSubjectTypes: ["character", "user"],
        allowedObjectTypes: ["character", "user"],
      },
      updatePolicy: {
        mode: "eventDriven",
        requireFactEvent: true,
        allowedEventTypes: ["help"],
        maxDeltaPerTurn: 10,
        confidenceThreshold: 0.7,
      },
    },
  ];
  const statusRules = [
    {
      id: "damage-to-health",
      label: "伤害降低健康",
      when: { eventType: "damage", targetScope: "character" },
      apply: {
        statusId: "health",
        target: "eventTarget",
        op: "add",
        valueByIntensity: { moderate: -15, major: -30 },
        clamp: [0, 100],
      },
      safeguards: {
        maxDeltaPerTurn: 40,
        requireExplicitEvidence: true,
      },
    },
    {
      id: "help-to-favorability",
      label: "帮助提升被帮助者对行动者的好感",
      when: { eventType: "help", targetScope: "relationship" },
      apply: {
        statusId: "favorability",
        target: "relationshipTargetToActor",
        op: "add",
        valueByIntensity: { moderate: 3, major: 5 },
        clamp: [-100, 100],
      },
      safeguards: {
        maxDeltaPerTurn: 10,
        requireExplicitEvidence: true,
      },
    },
  ];
  const initialProgressSnapshot = [
    { target: { type: "character", characterId: "boss" }, statusId: "health", value: 25 },
    {
      target: { type: "relationship", subject: charARef, object: userRef },
      statusId: "favorability",
      value: 55,
    },
  ].reduce(
    (snapshot, patch) => setTavernStatusSnapshotValue(snapshot, patch.target, patch.statusId, patch.value),
    createEmptyTavernStatusSnapshot("turn-0", now),
  );
  const room = {
    id: "room-alpha",
    workspaceId: "workspace",
    locked: false,
    title: "测试酒馆",
    storyOutline: "",
    storyGoal: "",
    storyGraph: {
      version: 1,
      entryNodeId: "node-alpha",
      activeNodeId: "node-alpha",
      stages: [{ id: "stage-alpha", title: "测试阶段", order: 0 }],
      nodes: [{
        id: "node-alpha",
        stageId: "stage-alpha",
        sceneId: "scene-alpha",
        title: "测试节点",
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
    activeSceneInstanceId: "scene-instance-alpha",
    sceneInstances: [{ id: "scene-instance-alpha", sceneId: "scene-alpha" }],
    activeSceneId: "scene-alpha",
    scenes: [],
    scenePresetId: "tavern",
    scene: "一间用于测试的酒馆。",
    sceneGoal: "",
    scenePlot: "",
    sceneDirection: "",
    sceneTransition: "",
    memory: "",
    sceneStatus: undefined,
    characterPublicStatuses: {},
    characterPrivateStatuses: {},
    pendingInteractions: [],
    replyOptions: [],
    statusDefinitions,
    statusRules,
    progressViews: [],
    progressTracker: {
      enabled: true,
      mode: "afterTurn",
      intervalTurns: 1,
      applyMode: "auto",
      factConfidenceThreshold: 0.7,
      generateCheckpointBeforeContextTrim: true,
    },
    factEvents: [],
    statusEvents: [],
    statusSnapshot: initialProgressSnapshot,
    statusCheckpoints: [],
    taskDefinitions: [],
    taskEvents: [],
    taskSnapshot: {},
    sceneOutcomes: [],
    outcomeEvents: [],
    characterConfigs: {},
    characterMemories: {},
    localCharacters: [],
    lorebookEntries: [],
    assetDrafts: [],
    characterIds: ["char-a", "char-b"],
    activeCharacterId: "char-a",
    replyMode: "director",
    userPersonaName: "旅人",
    settings: {
      immersiveDescriptionEnabled: true,
      showExecutionTrace: false,
      autoAssetExtractionEnabled: false,
      assetExtractionIntervalTurns: 3,
      agentKnowledgeCompactIntervalTurns: 0,
      maxAssetDrafts: 5,
      directorMaxSpeakers: 3,
      interactionQualityRuleIds: [
        "anti-ai-natural",
        "natural-dialogue",
        "concise-no-summary",
        "reduce-empty-ambience",
      ],
      directorNarrativeControl: {
        agencyMode: "player_protagonist",
        responseScale: "balanced",
        narratorPressure: "balanced",
        eventInterruption: "auto",
        userActionConsequence: "visible",
        mainHook: "auto",
        qnaBreak: "auto",
      },
      directorScheduling: {
        targetedReplyPolicy: "prefer",
        maxExtraSpeakersOnTargetedReply: 2,
        allowDirectorOnly: false,
        directorOnlyPhaseStatusId: "",
        directorOnlyPhaseValues: [],
        speakerMotivation: {
          enabled: true,
          maxMotivatedSpeakers: 2,
          rules: [
            {
              id: "direct-target-priority",
              label: "直接目标优先",
              when: "用户明确询问、点名或选择候选回复目标。",
              priority: 100,
              instruction: "被直接指向的角色优先被导演评估。",
            },
            {
              id: "goal-competes-for-user-attention",
              label: "目标竞争用户注意",
              when: "角色目标与用户注意或好感相关。",
              priority: 72,
              instruction: "强目标角色可以主动发言，但不要每轮抢话。",
            },
            {
              id: "knowledge-holder-helps-or-misdirects",
              label: "知情者介入",
              when: "角色掌握与当前问题相关的事实。",
              priority: 68,
              instruction: "知情角色可补充、误导或转移焦点。",
            },
            {
              id: "relationship-stakes",
              label: "关系利益相关",
              when: "当前发言会影响关系状态。",
              priority: 58,
              instruction: "关系利益越高，说话欲望越高。",
            },
            {
              id: "quiet-temperament-brake",
              label: "沉默人设刹车",
              when: "角色寡言且无强动机。",
              priority: 25,
              instruction: "弱动机时优先 ambient action。",
            },
          ],
        },
        fixedOrder: {
          enabled: false,
          phaseStatusId: "",
          phaseValues: [],
          stopAfterRound: false,
          includeUser: false,
          userPosition: "first",
        },
        autoContinuation: "enabled",
        instruction: "",
      },
      continuation: {
        enabled: true,
        maxAutoContinuationRounds: 1,
        maxSpeakersPerContinuation: 1,
        stopWhenUserTargeted: true,
      },
      replyOptions: {
        enabled: true,
        count: 3,
      },
      statusTracking: {
        enabled: true,
        visibleToUser: true,
      },
      randomEvents: {
        enabled: false,
        probability: 0.15,
      },
      illustrationHints: {
        enabled: false,
      },
      informationPolicy: {
        mode: "open",
        uiDefaultView: "public",
        hideCharacterThoughts: false,
        revealThoughts: "manual",
        hiddenFacts: {
          enabled: false,
          defaultVisibility: "director",
          reveal: "manual",
        },
        roleAssignment: {
          enabled: false,
          strategy: "manual",
          includeUser: false,
          revealToAssignedCharacter: true,
          revealFactionMembers: true,
          opening: {
            autoStart: false,
            publicEventType: "",
            globalStatusPatches: [],
          },
          rolePool: [],
        },
      },
    },
    createdAt: now,
    updatedAt: now,
  };
  const characters = [
    {
      id: "char-a",
      name: "阿洛",
      avatar: "",
      description: "谨慎的斥候，沉默寡言，关注屋顶和第二道影子。",
      speakingStyle: "短句，谨慎。",
      goals: "守住高处视野。",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "char-b",
      name: "贝拉",
      avatar: "",
      description: "热情的酒保，对门口、化学气味和旅人信任很敏感。",
      speakingStyle: "轻快。",
      goals: "获得旅人信任和好感。",
      createdAt: now,
      updatedAt: now,
    },
  ];
  const schedulingProfile = createTavernDirectorProfileFromCharacters({
    room,
    characters,
    source: "manual",
    updatedAt: now,
  });
  schedulingProfile.characterProfiles["char-a"] = {
    ...schedulingProfile.characterProfiles["char-a"],
    speechBias: "low",
    nonverbalBias: "high",
    interestTags: ["屋顶", "第二道影子"],
    goalTags: ["高处视野"],
    silenceTriggers: ["未被点名", "无关键事实"],
  };
  schedulingProfile.characterProfiles["char-b"] = {
    ...schedulingProfile.characterProfiles["char-b"],
    speechBias: "high",
    nonverbalBias: "balanced",
    interestTags: ["门口", "化学气味"],
    goalTags: ["旅人信任", "好感"],
    speechTriggers: ["被点名", "有人谈到门口"],
  };
  room.settings.directorScheduling.profile = schedulingProfile;
  const normalizedMappedProfile = normalizeTavernDirectorProfile({
    version: 1,
    source: "generated",
    globalGoals: ["测试调度"],
    globalRules: ["保持角色动机稳定"],
    characterProfiles: {
      "seed-b": {
        characterId: "seed-b",
        temperament: "热情主动",
        speechBias: "very_high",
        nonverbalBias: "balanced",
        interestTags: ["化学"],
        goalTags: ["信任"],
        knowledgeTags: ["门口"],
        conflictStyle: "主动补充",
        socialStrategy: "吸引用户注意",
        speechTriggers: ["被问到气味"],
        silenceTriggers: [],
        notes: "测试映射",
      },
    },
  }, {
    characters,
    mapCharacterId: (characterId) => characterId === "seed-b" ? "char-b" : undefined,
  });
  const branchBaseRoom = createTavernRoom("workspace", 42);
  const branchSceneTemplate = branchBaseRoom.scenes[0];
  const makeBranchScene = (id, title, order) => ({
    ...branchSceneTemplate,
    id,
    title,
    order,
    scene: \`节点 \${title} 的场景。\`,
    sceneGoal: \`完成节点 \${title}。\`,
    createdAt: now,
    updatedAt: now,
  });
  const branchScenes = [
    makeBranchScene("scene-1", "1", 0),
    makeBranchScene("scene-1-5", "1.5", 1),
    makeBranchScene("scene-2", "2", 2),
    makeBranchScene("scene-3", "3", 3),
  ];
  const convergedBranchRoom = projectTavernSceneOntoRoom({
    ...branchBaseRoom,
    id: "room-converged-branch",
    activeSceneId: "scene-1",
    scenes: branchScenes,
    storyRuns: [],
    activeRunId: undefined,
    activeSceneInstanceId: undefined,
    sceneInstances: [],
    storyGraph: {
      version: 1,
      entryNodeId: "node-1",
      activeNodeId: "node-1",
      stages: [{ id: "stage-1", title: "测试分支", order: 0 }],
      nodes: [
        { id: "node-1", stageId: "stage-1", sceneId: "scene-1", title: "1", type: "normal", pathRole: "main", position: { x: 0, y: 0 }, status: "ready", createdAt: now, updatedAt: now },
        { id: "node-1-5", stageId: "stage-1", sceneId: "scene-1-5", title: "1.5", type: "normal", pathRole: "branch", position: { x: 120, y: 80 }, status: "ready", createdAt: now, updatedAt: now },
        { id: "node-2", stageId: "stage-1", sceneId: "scene-2", title: "2", type: "normal", pathRole: "main", position: { x: 240, y: 0 }, status: "ready", createdAt: now, updatedAt: now },
        { id: "node-3", stageId: "stage-1", sceneId: "scene-3", title: "3", type: "ending", pathRole: "main", position: { x: 360, y: 0 }, status: "ready", createdAt: now, updatedAt: now },
      ],
      edges: [
        { id: "edge-1-2", fromNodeId: "node-1", toNodeId: "node-2", label: "直接进入 2", isDefault: true, priority: 0, createdAt: now, updatedAt: now },
        { id: "edge-1-1-5", fromNodeId: "node-1", toNodeId: "node-1-5", label: "插入 1.5", isDefault: false, priority: 1, createdAt: now, updatedAt: now },
        { id: "edge-1-5-2", fromNodeId: "node-1-5", toNodeId: "node-2", label: "汇入 2", isDefault: true, priority: 0, createdAt: now, updatedAt: now },
        { id: "edge-2-3", fromNodeId: "node-2", toNodeId: "node-3", label: "继续到 3", isDefault: true, priority: 0, createdAt: now, updatedAt: now },
      ],
    },
  });
  const convergedNodeOneInstances = convergedBranchRoom.sceneInstances.filter((instance) =>
    instance.nodeId === "node-1"
  );
  const convergedNodeTwoInstances = convergedBranchRoom.sceneInstances.filter((instance) =>
    instance.nodeId === "node-2"
  );
  const switchedConvergedBranchRoom = switchTavernRoomSceneInstance(
    convergedBranchRoom,
    convergedNodeTwoInstances[1]?.id ?? "",
  );
  const branchInstanceChecks = {
    nodeOneInstanceCount: convergedNodeOneInstances.length,
    nodeTwoInstanceCount: convergedNodeTwoInstances.length,
    nodeTwoInstanceIds: convergedNodeTwoInstances.map((instance) => instance.id),
    nodeTwoPathSignatures: convergedNodeTwoInstances.map((instance) => instance.pathNodeIds.join(">")),
    switchedInstanceId: switchedConvergedBranchRoom.activeSceneInstanceId,
    switchedActiveNodeId: switchedConvergedBranchRoom.storyGraph.activeNodeId,
    switchedPath: switchedConvergedBranchRoom.sceneInstances.find((instance) =>
      instance.id === switchedConvergedBranchRoom.activeSceneInstanceId
    )?.pathNodeIds.join(">"),
  };
  const branchMemorySeedRoom = projectTavernSceneOntoRoom({
    ...switchedConvergedBranchRoom,
    sceneInstances: switchedConvergedBranchRoom.sceneInstances.map((instance) => {
      if (instance.nodeId === "node-1") {
        return {
          ...instance,
          memoryLayers: {
            ...instance.memoryLayers,
            required: "入口共通知识：旅人已经拿到铜钥匙。",
            private: "入口分支私有：旅人答应不惊动柜台。",
          },
          characterMemoryLayers: {
            ...instance.characterMemoryLayers,
            "char-a": {
              ...(instance.characterMemoryLayers["char-a"] ?? {
                required: "",
                public: "",
                known: "",
                privateSelf: "",
                directorSecret: "",
              }),
              public: "阿洛知道旅人拿过铜钥匙。",
            },
          },
        };
      }
      if (instance.nodeId === "node-1-5") {
        return {
          ...instance,
          memoryLayers: {
            ...instance.memoryLayers,
            private: "1.5分支私有：旅人绕路检查了后门。",
            entries: [{
              id: "entry-hidden-door",
              text: "公开解密秘密：后门的铁铃被提前剪断。",
              visibility: "hidden",
              secretId: "secret-hidden-door",
              createdAt: now,
              updatedAt: now,
            }],
          },
          characterMemoryLayers: {
            ...instance.characterMemoryLayers,
            "char-a": {
              ...(instance.characterMemoryLayers["char-a"] ?? {
                required: "",
                public: "",
                known: "",
                privateSelf: "",
                directorSecret: "",
              }),
              entries: [{
                id: "entry-ally-code",
                text: "阿洛专属解密：旅人说出了屋顶暗号。",
                visibility: "hidden",
                secretId: "secret-ally-code",
                ownerCharacterId: "char-a",
                createdAt: now,
                updatedAt: now,
              }],
            },
          },
          secretReveals: [{
            id: "reveal-hidden-door",
            secretId: "secret-hidden-door",
            scope: { type: "node", nodeId: "node-1-5" },
            visibility: "public",
            targetCharacterIds: [],
            sourceMessageIds: [],
            revealedAt: now,
          }],
        };
      }
      if (instance.id === switchedConvergedBranchRoom.activeSceneInstanceId) {
        return {
          ...instance,
          secretReveals: [{
            id: "reveal-ally-code",
            secretId: "secret-ally-code",
            scope: { type: "sceneInstance", sceneInstanceId: instance.id },
            visibility: "character",
            targetCharacterIds: ["char-a"],
            sourceMessageIds: [],
            revealedAt: now,
          }],
        };
      }
      return instance;
    }),
  });
  const branchMemoryLoadResult = loadTavernBranchUpstreamMemory(branchMemorySeedRoom);
  const branchMemoryLoadedInstance = branchMemoryLoadResult.room.sceneInstances.find((instance) =>
    instance.id === branchMemoryLoadResult.room.activeSceneInstanceId
  );
  const branchMemoryChecks = {
    sourceCount: branchMemoryLoadResult.sourceInstanceIds.length,
    sceneMemory: branchMemoryLoadedInstance?.memoryLayers.upstream ?? "",
    charAMemory: branchMemoryLoadedInstance?.characterMemoryLayers["char-a"]?.known ?? "",
    charBMemory: branchMemoryLoadedInstance?.characterMemoryLayers["char-b"]?.known ?? "",
    revealedSecretIds: branchMemoryLoadResult.revealedSecretIds,
  };
  const addedSecretResult = addTavernSecretMemoryEntry(switchedConvergedBranchRoom, {
    target: { type: "character", characterId: "char-a" },
    text: "helper新增秘密：阿洛知道镜框背后有夹层。",
    secretId: "secret-helper-added",
  });
  const helperSecretOptions = listTavernBranchSecretMemoryEntries(addedSecretResult.room);
  const helperRevealResult = revealTavernSecretMemory(addedSecretResult.room, {
    secretId: "secret-helper-added",
    visibility: "character",
    targetCharacterIds: ["char-a"],
  });
  const helperRevealInstance = helperRevealResult.room.sceneInstances.find((instance) =>
    instance.id === helperRevealResult.room.activeSceneInstanceId
  );
  const secretMemoryHelperChecks = {
    hasAddedSecret: helperSecretOptions.some((option) =>
      option.secretId === "secret-helper-added" &&
      option.characterId === "char-a" &&
      option.text.includes("镜框背后有夹层")
    ),
    revealVisibility: helperRevealResult.reveal?.visibility,
    revealTargetIds: helperRevealResult.reveal?.targetCharacterIds ?? [],
    persistedRevealCount: helperRevealInstance?.secretReveals.filter((reveal) =>
      reveal.secretId === "secret-helper-added"
    ).length ?? 0,
  };
  const parsedDirectorRandomEvent = parseTavernDirectorDecision(JSON.stringify({
    speakerIds: ["char-a", "missing-character"],
    ambientActions: [{ characterId: "char-b", action: "擦亮杯沿，望向门口。" }],
    narrator: "灯影往门边偏了一寸。",
    randomEvent: "门外传来两下克制的敲门声。",
    illustrationHints: [
      "昏黄灯光下，阿洛站在门边，贝拉在吧台后方擦亮杯沿，构图偏向门口。",
      "阿洛内心怀疑门外的人在撒谎。",
    ],
    reason: "门口变化需要阿洛回应。",
  }), characters, 2, true);
  const parsedDirectorRandomEventDisabled = parseTavernDirectorDecision(JSON.stringify({
    speakerIds: ["char-a"],
    randomEvent: "门外传来两下克制的敲门声。",
  }), characters, 2, false);
  const parsedDirectorIllustrationHintsDisabled = parseTavernDirectorDecision(JSON.stringify({
    speakerIds: ["char-a"],
    illustrationHints: ["昏黄灯光下，阿洛站在门边。"],
  }), characters, 2, true, false);
  const parsedDirectorIllustrationHintsLoose = parseTavernDirectorDecision(
    '{"speakerIds":["char-a"],"illustrationHints":["吧台上的铜杯映出门口灯影，阿洛的披风停在画面左侧。"],"reason":"镜头明确"}',
    characters,
    2,
    true,
    true,
  );
  const parsedDirectorNonverbalReply = parseTavernDirectorDecision(JSON.stringify({
    speakerIds: [],
    nonverbalReplyIds: ["char-b", "missing-character"],
    ambientActions: [{ characterId: "char-b", action: "擦亮杯沿。" }],
    reason: "贝拉只用动作回应。",
  }), characters, 2, true, true);
  const parsedDirectorNonverbalCap = parseTavernDirectorDecision(JSON.stringify({
    speakerIds: ["char-a"],
    nonverbalReplyIds: ["char-b"],
    reason: "贝拉被要求只用动作回应，阿洛也想插话。",
  }), characters, 1, true, true);
  const randomEventOpportunityChecks = {
    enabledHit: shouldOfferTavernDirectorRandomEvent({
      settings: {
        ...room.settings,
        randomEvents: { enabled: true, probability: 0.5 },
      },
    }, () => 0.1),
    enabledMiss: shouldOfferTavernDirectorRandomEvent({
      settings: {
        ...room.settings,
        randomEvents: { enabled: true, probability: 0.5 },
      },
    }, () => 0.9),
    disabled: shouldOfferTavernDirectorRandomEvent({
      settings: {
        ...room.settings,
        randomEvents: { enabled: false, probability: 1 },
      },
    }, () => 0),
  };
  const bSecret = "B_PRIVATE_SECRET_SHOULD_NOT_LEAK";
  const bSecondSecret = "B_SECOND_PRIVATE_SECRET_SHOULD_NOT_LEAK";
  const aSecret = "A_PRIVATE_SECRET_VISIBLE_TO_A";
  const aSecondSecret = "A_SECOND_PRIVATE_SECRET_VISIBLE_TO_A";
  const messages = [
    {
      id: "m-user",
      roomId: room.id,
      role: "user",
      content: "今晚谁守门？",
      createdAt: now,
      status: "done",
    },
    {
      id: "m-b",
      roomId: room.id,
      role: "character",
      characterId: "char-b",
      content: "<inner_thought>" + bSecret + "</inner_thought><reply>我去吧，门口的风我熟。</reply>",
      thought: bSecret,
      createdAt: now + 1,
      status: "done",
    },
    {
      id: "m-a",
      roomId: room.id,
      role: "character",
      characterId: "char-a",
      content: "<inner_thought>" + aSecret + "</inner_thought><reply>我在屋顶看第二道影子。</reply>",
      thought: aSecret,
      createdAt: now + 2,
      status: "done",
    },
    {
      id: "m-user-2",
      roomId: room.id,
      role: "user",
      content: "第二轮，先确认各自位置。",
      createdAt: now + 3,
      status: "done",
    },
    {
      id: "m-b-2",
      roomId: room.id,
      role: "character",
      characterId: "char-b",
      content: "<inner_thought>" + bSecondSecret + "</inner_thought><reply>我还在门口，能看见灯影。</reply>",
      thought: bSecondSecret,
      createdAt: now + 4,
      status: "done",
    },
    {
      id: "m-a-2",
      roomId: room.id,
      role: "character",
      characterId: "char-a",
      content: "<inner_thought>" + aSecondSecret + "</inner_thought><reply>屋顶安全，我继续盯着第二道影子。</reply>",
      thought: aSecondSecret,
      createdAt: now + 5,
      status: "done",
    },
  ];
  const parsedAssetDraft = parseTavernAssetDraft({
    text: JSON.stringify({
      sceneMemories: [
        {
          note: "场景公开记忆：门口风铃已经断线。",
          visibility: "public",
        },
        {
          note: "场景隐藏记忆：井盖下有逃生绳。",
          visibility: "hidden",
          secretId: "secret-well-rope",
        },
        {
          note: "导演场景记忆：追兵会在三轮后抵达。",
          visibility: "director",
        },
      ],
      characterMemories: [
        {
          characterId: "char-a",
          note: "阿洛确认旅人已经掌握屋顶暗号。",
          visibility: "character",
          secretId: "secret-rooftop-code",
          revealToCharacterIds: ["char-a"],
        },
        {
          characterId: "char-b",
          note: "贝拉记得旅人公开答应守住门口。",
          visibility: "public",
          revealToCharacterIds: [],
        },
        {
          characterId: "char-b",
          note: "贝拉隐瞒自己听过追兵口令。",
          visibility: "hidden",
          secretId: "secret-bella-password",
          revealToCharacterIds: [],
        },
        {
          characterId: "char-a",
          note: "缺少可见性应被丢弃。",
        },
      ],
      lorebookEntries: [],
    }),
    room,
    characters,
    sourceMessages: messages.slice(-2),
  });
  const createdAssetDraft = createTavernAssetDraft(parsedAssetDraft);
  const assetExtractionMemoryChecks = {
    parsedSceneCount: parsedAssetDraft.sceneMemories.length,
    createdSceneVisibilities: createdAssetDraft.sceneMemories.map((memory) => memory.visibility),
    sceneHiddenSecretId: createdAssetDraft.sceneMemories.find((memory) =>
      memory.visibility === "hidden"
    )?.secretId,
    parsedCount: parsedAssetDraft.characterMemories.length,
    createdVisibilities: createdAssetDraft.characterMemories.map((memory) => memory.visibility),
    characterRevealTargets: createdAssetDraft.characterMemories.find((memory) =>
      memory.visibility === "character"
    )?.revealToCharacterIds ?? [],
    hiddenSecretId: createdAssetDraft.characterMemories.find((memory) =>
      memory.visibility === "hidden"
    )?.secretId,
  };
  const currentTurnMessages = messages.slice(3, 5);
  const schedulingSignalRoom = {
    ...room,
    factEvents: [
      {
        id: "fact-chemical-door",
        turnId: "turn-scheduling",
        sourceMessageIds: ["m-user"],
        type: "clue_found",
        actor: { type: "character", characterId: "char-b" },
        target: { type: "character", characterId: "char-b" },
        evidence: "贝拉注意到门口残留一丝化学气味。",
        confidence: 1,
        visibility: "public",
        createdAt: now + 10,
      },
    ],
  };
  const directTargetSignals = buildTavernSchedulingSignals({
    room: schedulingSignalRoom,
    characters,
    messages,
    currentUserText: "贝拉，你觉得门口的化学气味是谁留下的？",
    selectedTargetCharacterIds: ["char-b"],
  });
  const quietSignals = buildTavernSchedulingSignals({
    room: schedulingSignalRoom,
    characters,
    messages,
    currentUserText: "先继续观察。",
    selectedTargetCharacterIds: [],
  });
  const directorProfilePrompt = formatTavernDirectorProfileForPrompt({
    profile: room.settings.directorScheduling.profile,
    characters,
  });
  const schedulingSignalsPrompt = formatTavernSchedulingSignalsForPrompt({
    signals: directTargetSignals,
    characters,
  });
  const driveGuidanceRoom = {
    ...schedulingSignalRoom,
    storyGoal: "找到追兵封锁东口前离开酒馆。",
    sceneGoal: "查明门口化学气味和铜牌来源，决定是否从后厨绕路。",
    scenePlot: "追兵正在缩小包围，后门钥匙和铜牌可能牵出更大的势力。",
    sceneStatus: {
      location: "雨夜酒馆",
      timeLabel: "午夜前一刻",
      weather: "大雨",
      atmosphere: "门闩发紧，灯火忽明忽暗",
      scenePhase: "调查转入逃离决策",
      immediateThreat: "东口可能已有追兵等候",
      updatedAt: now + 11,
    },
  };
  const qnaDriveGuidance = buildTavernSceneDriveGuidance({
    room: driveGuidanceRoom,
    messages: [
      ...messages,
      {
        id: "m-user-q1",
        roomId: room.id,
        role: "user",
        content: "贝拉，门口的化学气味是谁留下的？",
        createdAt: now + 6,
        status: "done",
      },
      {
        id: "m-b-q1",
        roomId: room.id,
        role: "character",
        characterId: "char-b",
        content: "我只知道味道是从门缝外飘进来的。",
        createdAt: now + 7,
        status: "done",
      },
      {
        id: "m-user-q2",
        roomId: room.id,
        role: "user",
        content: "莫尔，这个味道说明什么？",
        createdAt: now + 8,
        status: "done",
      },
    ],
    currentUserText: "阿洛，这个气味说明什么？",
  });
  const actionDriveGuidance = buildTavernSceneDriveGuidance({
    room: driveGuidanceRoom,
    messages,
    currentUserText: "我从后厨绕到窗外，推开后门查看泥印。",
  });
  const sceneDriveAgencyGuidance = buildTavernSceneDriveGuidance({
    room: {
      ...driveGuidanceRoom,
      settings: {
        ...driveGuidanceRoom.settings,
        directorNarrativeControl: {
          ...driveGuidanceRoom.settings.directorNarrativeControl,
          agencyMode: "scene_drive",
        },
      },
    },
    messages,
    currentUserText: "继续",
  });
  const disabledDriveGuidance = buildTavernSceneDriveGuidance({
    room: {
      ...driveGuidanceRoom,
      settings: {
        ...driveGuidanceRoom.settings,
        directorNarrativeControl: {
          ...driveGuidanceRoom.settings.directorNarrativeControl,
          eventInterruption: "off",
          mainHook: "off",
          qnaBreak: "off",
        },
      },
    },
    messages: [
      ...messages,
      {
        id: "m-user-q3",
        roomId: room.id,
        role: "user",
        content: "贝拉，这个味道说明什么？",
        createdAt: now + 9,
        status: "done",
      },
    ],
    currentUserText: "阿洛，这个味道说明什么？",
  });
  const sceneNovelSource = collectTavernSceneNovelSource({
    room: schedulingSignalRoom,
    messages,
    characters,
    platformStyleId: "qidian",
  });

  const visibleToA = normalizeTavernMessagesForAudience({
    messages,
    characters,
    userPersonaName: room.userPersonaName,
    audience: { type: "character", characterId: "char-a" },
  });
  const contextForA = formatTavernVisibleMessagesForRequestContext(visibleToA);
  const currentTurnContextForA = formatTavernVisibleMessagesForRequestContext(
    normalizeTavernMessagesForAudience({
      messages: currentTurnMessages,
      characters,
      userPersonaName: room.userPersonaName,
      audience: { type: "character", characterId: "char-a" },
    }),
  );
  const promptForA = buildTavernSystemPrompt({
    room,
    activeCharacter: characters[0],
    characters,
    references: [],
    currentUserText: "第二轮，先确认各自位置。",
    turnInstruction: "本轮只测试身份约束。",
  });
  const unrevealedHiddenMemoryText = "未公开秘密：地下室有第二把钥匙。";
  const directorOnlySceneMemoryText = "导演秘密：钟下藏着钥匙。";
  const directorOnlyCharacterMemoryText = "贝拉导演秘密：她已经认出访客。";
  const characterKnownMemoryText = "阿洛已知：铜牌有裂纹。";
  const publicSceneMemoryText = "公开线索：灯芯被人换过。";
  const secretPolicyBaseRoom = projectTavernSceneOntoRoom(room);
  const secretPolicyRoom = projectTavernSceneOntoRoom({
    ...secretPolicyBaseRoom,
    sceneInstances: secretPolicyBaseRoom.sceneInstances.map((instance) => {
      if (instance.id !== activeSceneInstanceIdForRoom(secretPolicyBaseRoom)) {
        return instance;
      }

      return {
        ...instance,
        memoryLayers: {
          ...instance.memoryLayers,
          public: publicSceneMemoryText,
          directorSecret: directorOnlySceneMemoryText,
          entries: [
            ...(instance.memoryLayers?.entries ?? []),
            {
              id: "entry-unrevealed-basement-key",
              text: unrevealedHiddenMemoryText,
              visibility: "hidden",
              secretId: "secret-basement-key",
              createdAt: now,
              updatedAt: now,
            },
          ],
        },
        characterMemoryLayers: {
          ...instance.characterMemoryLayers,
          "char-a": {
            ...(instance.characterMemoryLayers?.["char-a"] ?? {
              required: "",
              public: "",
              known: "",
              privateSelf: "",
              directorSecret: "",
            }),
            known: characterKnownMemoryText,
          },
          "char-b": {
            ...(instance.characterMemoryLayers?.["char-b"] ?? {
              required: "",
              public: "",
              known: "",
              privateSelf: "",
              directorSecret: "",
            }),
            directorSecret: directorOnlyCharacterMemoryText,
          },
        },
      };
    }),
  });
  const secretPolicyPromptForA = buildTavernSystemPrompt({
    room: secretPolicyRoom,
    activeCharacter: characters[0],
    characters,
    references: [],
    currentUserText: "检查灯芯。",
  });
  const secretPolicyDirectorPrompt = buildTavernDirectorPromptContext({
    room: secretPolicyRoom,
    characters,
    messages,
    references: [],
    currentUserText: "检查灯芯。",
    turnTrigger: { type: "user" },
    selectedTargetCharacterIds: ["char-a"],
    maxSpeakers: 2,
  }).requestContext;
  const nodeBridgePromptOverrideText = "节点 Bridge 补充：摘要保持雨夜口吻。";
  const nodeDirectorPromptOverrideText = "节点导演补充：优先让门口压力进入下一轮调度。";
  const nodeCharacterPromptOverrideText = "节点角色补充：公开对白压低声音，动作更克制。";
  const nodePromptOverrideBaseRoom = projectTavernSceneOntoRoom(room);
  const nodePromptOverrideRoom = projectTavernSceneOntoRoom({
    ...nodePromptOverrideBaseRoom,
    sceneInstances: nodePromptOverrideBaseRoom.sceneInstances.map((instance) => {
      if (instance.id !== activeSceneInstanceIdForRoom(nodePromptOverrideBaseRoom)) {
        return instance;
      }

      return {
        ...instance,
        promptOverrides: {
          version: 1,
          blocks: [
            {
              id: "node-prompt-override:bridge",
              target: "bridge",
              label: "节点风格补充：底层会话",
              text: nodeBridgePromptOverrideText,
              enabled: true,
              order: 9000,
            },
            {
              id: "node-prompt-override:director",
              target: "director",
              label: "节点风格补充：导演",
              text: nodeDirectorPromptOverrideText,
              enabled: true,
              order: 9001,
            },
            {
              id: "node-prompt-override:character",
              target: "character",
              label: "节点风格补充：角色",
              text: nodeCharacterPromptOverrideText,
              enabled: true,
              order: 9002,
            },
          ],
        },
      };
    }),
  });
  const nodePromptOverrideForA = buildTavernSystemPrompt({
    room: nodePromptOverrideRoom,
    activeCharacter: characters[0],
    characters,
    references: [],
    currentUserText: "门口是谁？",
  });
  const nodePromptOverrideDirectorPrompt = buildTavernDirectorPromptContext({
    room: nodePromptOverrideRoom,
    characters,
    messages,
    references: [],
    currentUserText: "门口是谁？",
    turnTrigger: { type: "user" },
    selectedTargetCharacterIds: ["char-a"],
    maxSpeakers: 2,
  }).requestContext;
  const nodePromptOverrideBridgePrompt = buildTavernBridgeSystemPrompt(nodePromptOverrideRoom);
  const styledCharacter = {
    ...characters[0],
    writingStyle: "用冷峻短句写可观察动作。",
    replyStylePrompt: "每次回复保留江湖身份分寸，不自称旁白。",
  };
  const styledPrompt = createDefaultTavernPromptSettings({
    presentationProfileId: room.presentation?.profileId ?? "dialogue-chat",
    promptStyleId: "wuxia",
    systemNarrativePresetId: "dramatic",
    immersiveDescriptionEnabled: true,
  });
  const styledRoom = {
    ...room,
    prompt: {
      ...styledPrompt,
      blocks: styledPrompt.blocks.map((block) => block.source?.type === "system_narrative"
        ? {
            ...block,
            text: [
              block.text,
              "系统叙事层保持雨夜压迫感，但不要覆盖武侠房间风格和角色口吻。",
            ].join("\\n"),
          }
        : block),
    },
    localCharacters: [styledCharacter, characters[1]],
  };
  const styledPromptForA = buildTavernSystemPrompt({
    room: styledRoom,
    activeCharacter: styledCharacter,
    characters: [styledCharacter, characters[1]],
    references: [],
    currentUserText: "山雨要来了。",
  });
  const styledTurnInstructionForA = buildTavernCharacterTurnInstruction({
    room: styledRoom,
    speaker: styledCharacter,
    speakerIndex: 0,
    speakerCount: 1,
    replyMode: "director",
    isDirectorLikeMode: true,
    isManagedMode: false,
    directorReason: "测试武侠风格。",
  });
  const narrativeRoom = {
    ...styledRoom,
    presentation: {
      profileId: "third-person-prose",
      lockedAt: null,
      lockedSceneId: null,
    },
  };
  const narrativePromptForA = buildTavernSystemPrompt({
    room: narrativeRoom,
    activeCharacter: styledCharacter,
    characters: [styledCharacter, characters[1]],
    references: [],
    currentUserText: "山雨要来了。",
  });
  const narrativeTurnInstructionForA = buildTavernCharacterTurnInstruction({
    room: narrativeRoom,
    speaker: styledCharacter,
    speakerIndex: 0,
    speakerCount: 1,
    replyMode: "director",
    isDirectorLikeMode: true,
    isManagedMode: false,
    directorReason: "测试第三人称叙事。",
  });
  const narrativeBeatReply = parseTavernReplyText({
    text: "<inner_thought>他不能先露怯。</inner_thought><narrative_beat>阿洛把披风拢紧，目光停在檐下那串雨珠上，没有急着开口。</narrative_beat>",
    activeCharacter: characters[0],
    characters,
    userPersonaName: room.userPersonaName,
  });
  const schemaAliasReply = parseTavernReplyText({
    text: [
      "<" + TAVERN_PROTOCOL_FIELDS.privateThought.visibleTag + ">我不能乱。</" + TAVERN_PROTOCOL_FIELDS.privateThought.visibleTag + ">",
      "<" + TAVERN_PROTOCOL_FIELDS.publicReply.visibleTag + ">我没事，继续看东边。</" + TAVERN_PROTOCOL_FIELDS.publicReply.visibleTag + ">",
    ].join(""),
    activeCharacter: characters[0],
    characters,
    userPersonaName: room.userPersonaName,
  });
  const narrativeMessage = {
    id: "m-narrative",
    roomId: room.id,
    role: "character",
    characterId: "char-a",
    kind: "narrative_beat",
    presentationProfileId: "third-person-prose",
    content: "阿洛把杯沿转向灯影，像是把一句没出口的话压了回去。",
    createdAt: now,
  };
  const narrativeContextForA = formatTavernVisibleMessagesForRequestContext(
    normalizeTavernMessagesForAudience({
      messages: [narrativeMessage],
      characters,
      userPersonaName: room.userPersonaName,
      audience: { type: "character", characterId: "char-a" },
    }),
  );
  const narrativeRuntimeHistory = tavernMessagesToRuntimeMessages({
    messages: [narrativeMessage],
    characters,
    userPersonaName: room.userPersonaName,
  })[0]?.content ?? "";
  const mixedSpeakerReply = parseTavernReplyText({
    text: "<inner_thought>我得继续盯住高处。</inner_thought><reply>我先留在屋顶。\\n贝拉：门口交给我。</reply>",
    activeCharacter: characters[0],
    characters,
    userPersonaName: room.userPersonaName,
  });
  const activeSegmentReply = parseTavernReplyText({
    text: "贝拉：门口的风我熟。\\n阿洛：我守屋顶。\\n旁白：灯暗下来。",
    activeCharacter: characters[0],
    characters,
    userPersonaName: room.userPersonaName,
  });
  const wrongRoleReply = parseTavernReplyText({
    text: "<inner_thought>我好像是贝拉。</inner_thought><reply>贝拉：门口交给我。</reply>",
    activeCharacter: characters[0],
    characters,
    userPersonaName: room.userPersonaName,
  });
  const directAddressReply = parseTavernReplyText({
    text: "<inner_thought>我替阿洛顶一会儿。</inner_thought><reply>阿洛你安心歇着，门闩我压着呢。</reply>",
    activeCharacter: characters[1],
    characters,
    userPersonaName: room.userPersonaName,
  });
  const missingReplyWrapper = parseTavernReplyText({
    text: "<inner_thought>我得留意东边。</inner_thought>\\n\\n*阿洛压低身形。*\\n\\n东边灯影在动，我继续盯着。",
    activeCharacter: characters[0],
    characters,
    userPersonaName: room.userPersonaName,
  });
  const unclosedThoughtWithReply = parseTavernReplyText({
    text: "<inner_thought>我得留意东边。\\n<reply>东边灯影在动，我继续盯着。</reply>",
    activeCharacter: characters[0],
    characters,
    userPersonaName: room.userPersonaName,
  });
  const unclosedThoughtWithLooseContent = parseTavernReplyText({
    text: "<inner_thought>我得留意东边。\\n\\n东边灯影在动，我继续盯着。",
    activeCharacter: characters[0],
    characters,
    userPersonaName: room.userPersonaName,
  });
  const unclosedActionMarkdown = parseTavernReplyText({
    text: "<inner_thought>我得留意东边。</inner_thought><reply>东边灯影还亮着。*阿洛把披风拢紧。</reply>",
    activeCharacter: characters[0],
    characters,
    userPersonaName: room.userPersonaName,
  });
  const malformedNarrativeTagReply = parseTavernReplyText({
    text: "<inner_thought>我得留意东边。</inner_thought><narrative_beat>东边灯影还亮着。\\n\\n<narrativebeat\\\">阿洛把披风拢紧。</narrative_beat>",
    activeCharacter: characters[0],
    characters,
    userPersonaName: room.userPersonaName,
  });
  const mysteryInformationPolicy = {
    mode: "social_deduction",
    uiDefaultView: "public",
    hideCharacterThoughts: true,
    revealThoughts: "sceneOutcome",
    hiddenFacts: {
      enabled: true,
      defaultVisibility: "director",
      reveal: "sceneOutcome",
    },
    roleAssignment: {
      enabled: true,
      strategy: "director_random",
      revealToAssignedCharacter: true,
      revealFactionMembers: true,
    },
  };
  const privateFactEvents = [
    {
      id: "fact-public",
      turnId: "turn-private",
      sourceMessageIds: ["m-user-1"],
      type: "public_observation",
      evidence: "门口有两道脚印。",
      confidence: 1,
      visibility: "public",
      createdAt: now + 20,
    },
    {
      id: "fact-user-only",
      turnId: "turn-private",
      sourceMessageIds: ["m-b", "m-a"],
      type: "user_secret_note",
      actor: charARef,
      evidence: "USER_ONLY_SECRET_SHOULD_SHOW_IN_MY_INTEL",
      confidence: 1,
      visibility: "private",
      visibleToUser: true,
      revealWhen: "sceneOutcome",
      createdAt: now + 21,
    },
    {
      id: "fact-a-only",
      turnId: "turn-private",
      sourceMessageIds: ["m-a-1"],
      type: "role_assignment",
      target: charARef,
      evidence: "A_ONLY_SECRET_SHOULD_SHOW_TO_A",
      confidence: 1,
      visibility: "private",
      visibleToCharacterIds: ["char-a"],
      revealWhen: "sceneOutcome",
      createdAt: now + 22,
    },
    {
      id: "fact-wolves",
      turnId: "turn-private",
      sourceMessageIds: ["m-b-1"],
      type: "faction_knowledge",
      target: charBRef,
      evidence: "WOLF_FACTION_SECRET_SHOULD_SHOW_TO_WOLVES",
      confidence: 1,
      visibility: "private",
      visibleToFactionIds: ["wolves"],
      revealWhen: "sceneOutcome",
      createdAt: now + 23,
    },
    {
      id: "fact-director",
      turnId: "turn-private",
      sourceMessageIds: ["m-b-1"],
      type: "director_hidden_truth",
      evidence: "DIRECTOR_SECRET_SHOULD_ONLY_REVEAL_AT_END",
      confidence: 1,
      visibility: "director",
      revealWhen: "sceneOutcome",
      createdAt: now + 24,
    },
  ];
  const mysteryRoom = {
    ...room,
    settings: {
      ...room.settings,
      informationPolicy: mysteryInformationPolicy,
    },
    factEvents: privateFactEvents,
    outcomeEvents: [],
  };
  const revealedMysteryRoom = {
    ...mysteryRoom,
    outcomeEvents: [{
      id: "outcome-private",
      turnId: "turn-private",
      outcomeId: "game-over",
      winners: [],
      losers: [],
      sourceTaskEventIds: [],
      sourceStatusEventIds: [],
      status: "applied",
      createdAt: now + 25,
    }],
  };
  const mysteryRenderable = createTavernRenderableMessages({
    messages,
    characters,
    userPersonaName: room.userPersonaName,
    room: mysteryRoom,
  });
  const revealedMysteryRenderable = createTavernRenderableMessages({
    messages,
    characters,
    userPersonaName: room.userPersonaName,
    room: revealedMysteryRoom,
  });
  const directorMysteryRoom = {
    ...mysteryRoom,
    settings: {
      ...mysteryRoom.settings,
      informationPolicy: {
        ...mysteryRoom.settings.informationPolicy,
        uiDefaultView: "director",
      },
    },
  };
  const messageIntelById = Object.fromEntries(
    mysteryRenderable.map((message) => [
      message.id,
      message.userVisibleFactEvents?.map((event) => event.id) ?? [],
    ]),
  );
  const privateFactVisibilityChecks = {
    publicFacts: filterTavernFactEventsForAudience({
      factEvents: privateFactEvents,
      room: mysteryRoom,
      audience: { type: "ui" },
    }).map((event) => event.id),
    userFacts: filterTavernFactEventsForAudience({
      factEvents: privateFactEvents,
      room: mysteryRoom,
      audience: { type: "user" },
    }).map((event) => event.id),
    characterAFacts: filterTavernFactEventsForAudience({
      factEvents: privateFactEvents,
      room: mysteryRoom,
      audience: { type: "character", characterId: "char-a" },
    }).map((event) => event.id),
    wolfFacts: filterTavernFactEventsForAudience({
      factEvents: privateFactEvents,
      room: mysteryRoom,
      audience: { type: "character", characterId: "char-b", factionIds: ["wolves"] },
    }).map((event) => event.id),
    directorFacts: filterTavernFactEventsForAudience({
      factEvents: privateFactEvents,
      room: mysteryRoom,
      audience: { type: "director" },
    }).map((event) => event.id),
    revealedUserFacts: filterTavernFactEventsForAudience({
      factEvents: privateFactEvents,
      room: revealedMysteryRoom,
      audience: { type: "user" },
    }).map((event) => event.id),
    publicInformationView: resolveTavernInformationView({
      policy: mysteryRoom.settings.informationPolicy,
      outcomeEvents: mysteryRoom.outcomeEvents,
    }),
    revealedInformationView: resolveTavernInformationView({
      policy: revealedMysteryRoom.settings.informationPolicy,
      outcomeEvents: revealedMysteryRoom.outcomeEvents,
    }),
    directorInformationView: resolveTavernInformationView({
      policy: directorMysteryRoom.settings.informationPolicy,
      outcomeEvents: directorMysteryRoom.outcomeEvents,
    }),
    messageIntelById,
  };
  const roleAssignmentRoom = {
    ...mysteryRoom,
    userPersonaName: "来客",
    settings: {
      ...mysteryRoom.settings,
      informationPolicy: {
        ...mysteryRoom.settings.informationPolicy,
        roleAssignment: {
          ...mysteryRoom.settings.informationPolicy.roleAssignment,
          enabled: true,
          strategy: "director_random",
          includeUser: true,
          revealToAssignedCharacter: true,
          revealFactionMembers: true,
          rolePool: [
            {
              id: "wolf",
              label: "狼人",
              factionId: "wolves",
              factionLabel: "狼人阵营",
              count: 1,
            },
            {
              id: "villager",
              label: "村民",
              factionId: "village",
              factionLabel: "村民阵营",
              count: 2,
            },
          ],
        },
      },
    },
  };
  const assignedRoleFacts = assignTavernRoleFacts({
    room: roleAssignmentRoom,
    characters,
    random: () => 0,
    turnId: "role-test",
    createdAt: now + 30,
  });
  const roleAssignmentChecks = {
    count: assignedRoleFacts.length,
    generated: assignedRoleFacts.every(isGeneratedTavernRoleAssignmentFactEvent),
    userFacts: assignedRoleFacts.filter((event) =>
      event.target?.type === "user" && event.visibleToUser
    ).map((event) => event.id),
    characterFacts: assignedRoleFacts.filter((event) =>
      event.target?.type === "character" &&
        event.visibleToCharacterIds?.includes(event.target.characterId)
    ).map((event) => event.id),
    privateFacts: assignedRoleFacts.every((event) =>
      event.type === "role_assignment" &&
        event.visibility === "private" &&
      event.revealWhen === "sceneOutcome"
    ),
  };
  const progressVisibilityChecks = {
    public: isTavernProgressVisibilityVisibleToUser("public"),
    private: isTavernProgressVisibilityVisibleToUser("private"),
    owner: isTavernProgressVisibilityVisibleToUser("owner"),
    director: isTavernProgressVisibilityVisibleToUser("director"),
    hidden: isTavernProgressVisibilityVisibleToUser("hidden"),
    debug: isTavernProgressVisibilityVisibleToUser("debug"),
  };
  const pendingOutcomeRoom = {
    ...mysteryRoom,
    outcomeEvents: [{
      id: "pending-outcome",
      turnId: "turn-private",
      outcomeId: "scene-end",
      winners: [userRef],
      losers: [],
      sourceTaskEventIds: [],
      sourceStatusEventIds: [],
      status: "pending",
      createdAt: now + 40,
    }],
  };
  const appliedOutcomePatch = resolveTavernPendingOutcomeEvent({
    room: pendingOutcomeRoom,
    outcomeEventId: "pending-outcome",
    resolution: "applied",
  });
  const dismissedOutcomePatch = resolveTavernPendingOutcomeEvent({
    room: pendingOutcomeRoom,
    outcomeEventId: "pending-outcome",
    resolution: "dismissed",
  });
  const outcomeResolutionChecks = {
    appliedStatus: appliedOutcomePatch?.outcomeEvents[0]?.status,
    dismissedStatus: dismissedOutcomePatch?.outcomeEvents[0]?.status,
    appliedInformationView: resolveTavernInformationView({
      policy: mysteryRoom.settings.informationPolicy,
      outcomeEvents: appliedOutcomePatch?.outcomeEvents ?? [],
    }),
    dismissedInformationView: resolveTavernInformationView({
      policy: mysteryRoom.settings.informationPolicy,
      outcomeEvents: dismissedOutcomePatch?.outcomeEvents ?? [],
    }),
  };
  const bAsksA = {
    id: "m-b-asks-a",
    roomId: room.id,
    role: "character",
    characterId: "char-b",
    content: "阿洛，你听见门外那声铃了吗？",
    createdAt: now + 6,
    status: "done",
  };
  const bAsksUser = {
    id: "m-b-asks-user",
    roomId: room.id,
    role: "character",
    characterId: "char-b",
    content: "来客，你要先查怀表吗？",
    createdAt: now + 7,
    status: "done",
  };
  const aAnswersB = {
    id: "m-a-answers-b",
    roomId: room.id,
    role: "character",
    characterId: "char-a",
    content: "我听见了，铃声从门外左侧传来。",
    createdAt: now + 8,
    status: "done",
  };
  const userAsksGroup = {
    id: "m-user-asks-group",
    roomId: room.id,
    role: "user",
    content: "你们谁能先确认门外情况？",
    createdAt: now + 9,
    status: "done",
  };
  const interactionsForA = extractTavernPendingInteractionsFromMessages({
    messages: [bAsksA],
    characters,
    userPersonaName: room.userPersonaName,
    turnId: "turn-a",
  });
  const continuationForA = planTavernContinuation({
    pendingInteractions: interactionsForA,
    characters,
    continuationRound: 0,
    maxAutoContinuationRounds: 1,
    maxSpeakersPerContinuation: 1,
    stopWhenUserTargeted: true,
  });
  const interactionsForUser = extractTavernPendingInteractionsFromMessages({
    messages: [bAsksUser],
    characters,
    userPersonaName: room.userPersonaName,
    turnId: "turn-user",
  });
  const continuationForUser = planTavernContinuation({
    pendingInteractions: interactionsForUser,
    characters,
    continuationRound: 0,
    maxAutoContinuationRounds: 1,
    maxSpeakersPerContinuation: 1,
    stopWhenUserTargeted: true,
  });
  const interactionsForAnsweredA = extractTavernPendingInteractionsFromMessages({
    messages: [bAsksA, aAnswersB],
    characters,
    userPersonaName: room.userPersonaName,
    turnId: "turn-a-answered",
  });
  const interactionsForAnsweredGroup = extractTavernPendingInteractionsFromMessages({
    messages: [userAsksGroup, aAnswersB],
    characters,
    userPersonaName: room.userPersonaName,
    turnId: "turn-group-answered",
  });
  const progressFactEvents = [
    {
      id: "fact-boss-damage",
      turnId: "turn-progress",
      sourceMessageIds: ["m-user-progress"],
      type: "damage",
      actor: userRef,
      target: bossRef,
      intensity: "major",
      evidence: "旅人明确击中 Boss，使其退到墙边。",
      confidence: 0.96,
      createdAt: now + 10,
    },
    {
      id: "fact-help-a",
      turnId: "turn-progress",
      sourceMessageIds: ["m-user-progress"],
      type: "help",
      actor: userRef,
      target: charARef,
      intensity: "major",
      evidence: "旅人为阿洛挡下致命一击。",
      confidence: 0.95,
      createdAt: now + 11,
    },
  ];
  const statusEvents = deriveTavernStatusEventsFromFacts({
    factEvents: progressFactEvents,
    rules: statusRules,
    definitions: statusDefinitions,
    snapshot: initialProgressSnapshot,
    turnId: "turn-progress",
    createdAt: now + 12,
  });
  const nextProgressSnapshot = applyTavernStatusEventsToSnapshot({
    snapshot: initialProgressSnapshot,
    events: statusEvents,
  });
  const progressTaskDefinitions = [
    {
      id: "defeat-boss",
      title: "击败 Boss",
      scope: "scene",
      owner: globalRef,
      visibility: "public",
      required: true,
      optional: false,
      repeatable: false,
      lifecycle: {
        initialStatus: "active",
        completeCondition: {
          status: "health",
          target: { type: "character", characterId: "boss" },
          lte: 0,
        },
      },
      onComplete: [
        {
          type: "statusPatch",
          statusEvents: [{
            id: "action-status-trust-after-boss",
            turnId: "turn-progress",
            sourceFactEventIds: [],
            sourceMessageIds: [],
            target: { type: "relationship", subject: charARef, object: userRef },
            statusId: "favorability",
            before: 55,
            after: 58,
            delta: 3,
            reason: "击败 Boss 后阿洛短暂信任旅人。",
            confidence: 1,
            visibility: "private",
            status: "applied",
            createdBy: "system",
            createdAt: now + 13,
          }],
        },
        {
          type: "replyOptions",
          options: [{
            id: "reply-after-boss",
            text: "先确认大家是否受伤。",
            targetCharacterIds: [],
            intent: "inspect",
          }],
        },
        {
          type: "messageInline",
          visibility: "public",
          text: "Boss 被击倒，酒馆里短暂安静下来。",
        },
        {
          type: "directorDirective",
          instruction: "下一轮优先处理战后检查和角色反应，不要直接跳到庆功。",
        },
      ],
    },
    {
      id: "earn-a-trust",
      title: "获得阿洛信任",
      scope: "personal",
      owner: userRef,
      participants: [charARef],
      visibility: "private",
      required: false,
      optional: true,
      repeatable: false,
      lifecycle: {
        initialStatus: "active",
        completeCondition: {
          status: "favorability",
          target: { type: "relationship", subject: charARef, object: userRef },
          gte: 60,
        },
      },
    },
  ];
  const taskResult = updateTavernTasks({
    taskDefinitions: progressTaskDefinitions,
    taskSnapshot: {},
    snapshot: nextProgressSnapshot,
    previousSnapshot: initialProgressSnapshot,
    factEvents: progressFactEvents,
    sourceStatusEventIds: statusEvents.map((event) => event.id),
    turnId: "turn-progress",
    createdAt: now + 13,
  });
  const progressSceneOutcomes = [
    {
      id: "boss-defeated-victory",
      label: "Boss 被击败",
      winner: [userRef, charARef, charBRef],
      loser: [bossRef],
      condition: {
        task: "defeat-boss",
        owner: globalRef,
        status: "completed",
      },
      priority: 100,
      exclusive: true,
      endScene: "auto",
      visibility: "public",
      onAchieved: [
        {
          type: "sceneTransitionSuggestion",
          targetSceneId: "scene-next",
          requiresUserConfirm: true,
        },
      ],
    },
  ];
  const outcomeEvents = evaluateTavernSceneOutcomes({
    outcomes: progressSceneOutcomes,
    snapshot: nextProgressSnapshot,
    previousSnapshot: initialProgressSnapshot,
    factEvents: progressFactEvents,
    taskSnapshot: taskResult.taskSnapshot,
    sourceTaskEventIds: taskResult.taskEvents.map((event) => event.id),
    sourceStatusEventIds: statusEvents.map((event) => event.id),
    existingOutcomeEvents: [],
    turnId: "turn-progress",
    createdAt: now + 14,
  });
  const checkpointRoom = {
    ...room,
    factEvents: [],
    statusEvents: [],
    statusSnapshot: initialProgressSnapshot,
    previousStatusSnapshot: undefined,
    statusCheckpoints: [],
    taskDefinitions: progressTaskDefinitions,
    taskEvents: [],
    taskSnapshot: {},
    sceneOutcomes: [],
    outcomeEvents: [],
  };
  const progressCheckpoint = createTavernProgressCheckpoint({
    room: checkpointRoom,
    turnId: "turn-0",
    reason: "initial",
    createdAt: now + 15,
  });
  const rebuiltProgress = rebuildTavernProgressFromHistory({
    room: {
      ...checkpointRoom,
      factEvents: progressFactEvents,
      statusEvents,
      statusSnapshot: createEmptyTavernStatusSnapshot("lost-current", now + 16),
      previousStatusSnapshot: undefined,
      statusCheckpoints: [progressCheckpoint],
      taskEvents: taskResult.taskEvents,
      taskSnapshot: {},
      outcomeEvents,
    },
    createdAt: now + 17,
  });
  const trimCheckpoint = createTavernProgressCheckpoint({
    room: {
      ...checkpointRoom,
      factEvents: progressFactEvents,
      statusEvents,
      statusSnapshot: nextProgressSnapshot,
      previousStatusSnapshot: initialProgressSnapshot,
      statusCheckpoints: [progressCheckpoint],
      taskEvents: taskResult.taskEvents,
      taskSnapshot: taskResult.taskSnapshot,
      outcomeEvents,
    },
    turnId: "trim-before-clear",
    reason: "before_context_trim",
    createdAt: now + 18,
  });
  const syncedTrimCheckpointRoom = syncTavernRoomActiveScene({
    ...checkpointRoom,
    statusCheckpoints: [trimCheckpoint],
    updatedAt: now + 19,
  });
  const rebuiltFromTrimCheckpoint = rebuildTavernProgressFromHistory({
    room: {
      ...checkpointRoom,
      factEvents: progressFactEvents,
      statusEvents,
      statusSnapshot: createEmptyTavernStatusSnapshot("lost-after-trim", now + 19),
      previousStatusSnapshot: undefined,
      statusCheckpoints: [trimCheckpoint],
      taskEvents: taskResult.taskEvents,
      taskSnapshot: {},
      outcomeEvents,
    },
    createdAt: now + 20,
  });
  const pendingDamageStatusEvent = {
    ...statusEvents.find((event) => event.statusId === "health"),
    id: "pending-damage-status",
    status: "pending",
  };
  const reviewRoom = {
    ...checkpointRoom,
    factEvents: progressFactEvents,
    statusEvents: [pendingDamageStatusEvent],
    statusSnapshot: initialProgressSnapshot,
    taskDefinitions: progressTaskDefinitions,
    sceneOutcomes: progressSceneOutcomes,
    progressTracker: {
      ...room.progressTracker,
      applyMode: "review",
    },
  };
  const reviewApplied = resolveTavernPendingStatusEvent({
    room: reviewRoom,
    statusEventId: pendingDamageStatusEvent.id,
    resolution: "applied",
    createdAt: now + 18,
  });
  const reviewRejected = resolveTavernPendingStatusEvent({
    room: reviewRoom,
    statusEventId: pendingDamageStatusEvent.id,
    resolution: "rejected",
    createdAt: now + 19,
  });
  const rawDefaultRoom = createTavernRoom("workspace-default", 1);
  const defaultRoom = {
    ...rawDefaultRoom,
    progressTracker: {
      ...rawDefaultRoom.progressTracker,
      applyMode: "auto",
    },
  };
  const defaultThreatFact = {
    id: "default-fact-threat",
    turnId: "default-turn-threat",
    sourceMessageIds: ["default-message-threat"],
    type: "threat",
    target: { type: "scene", sceneId: "current" },
    intensity: "major",
    evidence: "场景中出现公开可观察的重大威胁。",
    confidence: 0.95,
    createdAt: now + 20,
  };
  const defaultThreatAdvance = advanceTavernProgressFromFactEvents({
    room: defaultRoom,
    factEvents: [defaultThreatFact],
    turnId: "default-turn-threat",
    createdAt: now + 21,
  });
  const defaultRoomAfterThreat = {
    ...defaultRoom,
    ...defaultThreatAdvance,
  };
  const defaultStabilizeFact = {
    id: "default-fact-stabilize",
    turnId: "default-turn-stabilize",
    sourceMessageIds: ["default-message-stabilize"],
    type: "stabilize",
    target: { type: "scene", sceneId: "current" },
    intensity: "major",
    evidence: "角色合力控制局势，威胁被公开压制。",
    confidence: 0.95,
    createdAt: now + 22,
  };
  const defaultStabilizeAdvance = advanceTavernProgressFromFactEvents({
    room: defaultRoomAfterThreat,
    factEvents: [defaultStabilizeFact],
    turnId: "default-turn-stabilize",
    createdAt: now + 23,
  });
  const generatedFence = String.fromCharCode(96, 96, 96);
  const generatedPreset = parseTavernGeneratedPresetJsonText([
    "生成结果如下：",
    generatedFence + "json",
    JSON.stringify({
    version: 1,
    label: "雨巷旧灯",
    room: {
      title: "雨巷旧灯",
      promptStyleId: "light-novel",
      storyOutline: "雨夜里，旧灯会照出每个人隐瞒的目的。",
      storyGoal: "确认失踪信使留下的线索。",
      scene: "细雨敲着瓦檐，巷口的旧灯忽明忽暗。",
      sceneGoal: "确认谁拿走了信使的铜牌。",
      userPersonaName: "旅人",
      settings: {
        directorMaxSpeakers: 4,
        directorNarrativeControl: {
          agencyMode: "story_directive",
          responseScale: "balanced",
          narratorPressure: "high",
          eventInterruption: "auto",
          userActionConsequence: "visible",
          mainHook: "auto",
          qnaBreak: "auto",
        },
        randomEvents: { enabled: true, probability: 0.25 },
        illustrationHints: { enabled: true },
      },
      characterIds: ["a", "b"],
      activeCharacterId: "a",
      characterMemories: {
        a: "阿洛记得铜牌最后一次出现的位置。",
      },
      characterPublicStatuses: {
        a: { visibleMood: "警惕" },
      },
      statusSnapshot: {
        turnId: "generated-initial",
        characters: {
          a: { health: 88 },
        },
      },
      lorebookEntries: [
        {
          title: "铜牌",
          content: "信使铜牌用于证明身份，丢失会引发误判。",
          keywords: ["铜牌"],
        },
      ],
    },
    characters: [
      {
        id: "a",
        name: "阿洛",
        description: "谨慎的巡夜人，讨厌凭空猜测。",
        speakingStyle: "短句，先确认事实。",
        writingStyle: "动作简洁，雨声作衬。",
        replyStylePrompt: "不要自称旁白，不替旅人决定行动。",
        memory: "阿洛只知道铜牌在雨停前还在桌上。",
        publicStatus: { posture: "靠在门边" },
      },
      {
        id: "b",
        name: "贝拉",
        description: "热心的灯匠，熟悉巷道。",
        speakingStyle: "轻快但不轻浮。",
      },
    ],
    messages: [
      { role: "narrator", content: "旧灯在雨里亮了一下。" },
      { role: "character", characterId: "a", content: "铜牌不该离开这张桌。" },
    ],
    }),
    generatedFence,
  ].join("\\n"));
  const generatedMaterialized = createTavernRoomFromGeneratedPresetJson(
    "workspace-generated",
    generatedPreset,
    {
      creationSource: "quick",
      createdAt: now + 24,
    },
  );
  const generatedA = generatedMaterialized.characters.find((character) =>
    character.name === "阿洛"
  );
  const generatedRoom = generatedMaterialized.room;
  const generatedScene = generatedRoom.scenes[0];
  const defaultSystemPresetState = createDefaultTavernState("workspace-system-defaults");
  const raincityMaterialized = createTavernRoomFromSystemPreset(
    "workspace-system",
    "raincity-silent-manuscript",
    {
      roomId: "system-raincity-room",
      createdAt: now + 70,
      characterIdByPresetId: new Map([
        ["rc-ji-ling", "rain-ji"],
        ["rc-yuan-ci", "rain-yuan"],
        ["rc-su-yan", "rain-su"],
        ["rc-he-mu", "rain-he"],
      ]),
    },
  );
  const raincityRoom = raincityMaterialized.room;
  const rainYuanRef = { type: "character", characterId: "rain-yuan" };
  const raincityAdvance = advanceTavernProgressFromFactEvents({
    room: raincityRoom,
    factEvents: [
      {
        id: "system-raincity-fragment",
        turnId: "system-raincity-turn",
        sourceMessageIds: ["system-raincity-message"],
        type: "fragment_found",
        target: { type: "scene", sceneId: raincityRoom.activeSceneId },
        evidence: "用户把灰蓝装订线与复印稿页边批注对应起来，确认第一章缺页被修进旧书封底。",
        confidence: 0.96,
        createdAt: now + 71,
      },
      {
        id: "system-raincity-shelter",
        turnId: "system-raincity-turn",
        sourceMessageIds: ["system-raincity-message"],
        type: "author_sheltered",
        target: { type: "global" },
        evidence: "用户阻止众人朗读新章节，让袁辞只用便签指出下一处线索。",
        confidence: 0.9,
        createdAt: now + 71,
      },
      {
        id: "system-raincity-voice",
        turnId: "system-raincity-turn",
        sourceMessageIds: ["system-raincity-message"],
        type: "voice_fragment",
        target: rainYuanRef,
        evidence: "袁辞在安全距离外写下完整短句，并用敲击确认录音时间。",
        confidence: 0.88,
        createdAt: now + 71,
      },
    ],
    turnId: "system-raincity-turn",
    createdAt: now + 72,
  });

  const snowridgeMaterialized = createTavernRoomFromSystemPreset(
    "workspace-system",
    "snowridge-sword-oath",
    {
      roomId: "system-snowridge-room",
      createdAt: now + 73,
      characterIdByPresetId: new Map([
        ["sx-lin-zhaoye", "snow-lin"],
        ["sx-gu-tingxue", "snow-gu"],
        ["sx-qiu-heng", "snow-qiu"],
        ["sx-jingchen", "snow-jing"],
      ]),
    },
  );
  const snowridgeRoom = snowridgeMaterialized.room;
  const snowLinRef = { type: "character", characterId: "snow-lin" };
  const snowridgeAdvance = advanceTavernProgressFromFactEvents({
    room: snowridgeRoom,
    factEvents: [
      {
        id: "system-snowridge-oath",
        turnId: "system-snowridge-turn",
        sourceMessageIds: ["system-snowridge-message"],
        type: "oath_verified",
        target: { type: "scene", sceneId: snowridgeRoom.activeSceneId },
        evidence: "用户把剑书暗纹与旧碑林拓片对应起来，证明旧誓原文不是追杀令。",
        confidence: 0.95,
        createdAt: now + 74,
      },
      {
        id: "system-snowridge-ambush",
        turnId: "system-snowridge-turn",
        sourceMessageIds: ["system-snowridge-message"],
        type: "ambush_deflected",
        target: { type: "global" },
        evidence: "众人在不让林照夜强行出剑的情况下，用断桥雪雾挡住第一波追兵。",
        confidence: 0.92,
        createdAt: now + 74,
      },
      {
        id: "system-snowridge-wound",
        turnId: "system-snowridge-turn",
        sourceMessageIds: ["system-snowridge-message"],
        type: "wound_treated",
        target: snowLinRef,
        evidence: "顾听雪用药方残页反证毒案，同时稳住林照夜右手旧伤。",
        confidence: 0.91,
        createdAt: now + 74,
      },
    ],
    turnId: "system-snowridge-turn",
    createdAt: now + 75,
  });

  const orbitalMaterialized = createTavernRoomFromSystemPreset(
    "workspace-system",
    "orbital-ashes-letter",
    {
      roomId: "system-orbital-room",
      createdAt: now + 76,
      characterIdByPresetId: new Map([
        ["oa-lan-qiao", "orbit-lan"],
        ["oa-mira", "orbit-mira"],
        ["oa-ren-ke", "orbit-ren"],
        ["oa-yi-sen", "orbit-yi"],
      ]),
    },
  );
  const orbitalRoom = orbitalMaterialized.room;
  const orbitalRenRef = { type: "character", characterId: "orbit-ren" };
  const orbitalAdvance = advanceTavernProgressFromFactEvents({
    room: orbitalRoom,
    factEvents: [
      {
        id: "system-orbital-signal",
        turnId: "system-orbital-turn",
        sourceMessageIds: ["system-orbital-message"],
        type: "signal_decoded",
        target: { type: "scene", sceneId: orbitalRoom.activeSceneId },
        evidence: "米拉把余烬信第一段与实体信纸校验一致，确认信号来自旧核心。",
        confidence: 0.95,
        createdAt: now + 77,
      },
      {
        id: "system-orbital-stabilize",
        turnId: "system-orbital-turn",
        sourceMessageIds: ["system-orbital-message"],
        type: "orbit_stabilized",
        target: { type: "global" },
        evidence: "伊森和任珂手动重启推进环，让环轨站获得转存档案的时间。",
        confidence: 0.93,
        createdAt: now + 77,
      },
      {
        id: "system-orbital-oxygen",
        turnId: "system-orbital-turn",
        sourceMessageIds: ["system-orbital-message"],
        type: "oxygen_restored",
        target: orbitalRenRef,
        evidence: "任珂在外舱走廊接回氧气旁路，能继续携带信袋行动。",
        confidence: 0.9,
        createdAt: now + 77,
      },
    ],
    turnId: "system-orbital-turn",
    createdAt: now + 78,
  });
  const progressChecks = {
    statusEvents,
    nextProgressSnapshot,
    bossHealth: getTavernStatusSnapshotValue(
      nextProgressSnapshot,
      { type: "character", characterId: "boss" },
      "health",
    ),
    aToUserFavorability: getTavernStatusSnapshotValue(
      nextProgressSnapshot,
      { type: "relationship", subject: charARef, object: userRef },
      "favorability",
    ),
    relationshipKey: tavernRelationshipKey(charARef, userRef),
    taskResult,
    outcomeEvents,
    rebuiltBossHealth: getTavernStatusSnapshotValue(
      rebuiltProgress.statusSnapshot,
      { type: "character", characterId: "boss" },
      "health",
    ),
    rebuiltTaskStatus: rebuiltProgress.taskSnapshot["defeat-boss"]?.status,
    reviewInitialBossHealth: getTavernStatusSnapshotValue(
      reviewRoom.statusSnapshot,
      { type: "character", characterId: "boss" },
      "health",
    ),
    reviewAppliedBossHealth: reviewApplied
      ? getTavernStatusSnapshotValue(
          reviewApplied.statusSnapshot,
          { type: "character", characterId: "boss" },
          "health",
        )
      : null,
    reviewAppliedTaskStatus: reviewApplied?.taskSnapshot["defeat-boss"]?.status,
    reviewAppliedOutcomeStatus: reviewApplied?.outcomeEvents[0]?.status,
    reviewAppliedActionMessages: reviewApplied?.actionMessages.map((message) => message.content) ?? [],
    reviewAppliedReplyOptions: reviewApplied?.replyOptions.map((option) => option.text) ?? [],
    reviewAppliedSceneDirection: reviewApplied?.sceneDirection ?? "",
    reviewAppliedSceneTransition: reviewApplied?.sceneTransition ?? "",
    reviewAppliedActionFavorability: reviewApplied
      ? getTavernStatusSnapshotValue(
          reviewApplied.statusSnapshot,
          { type: "relationship", subject: charARef, object: userRef },
          "favorability",
        )
      : null,
    reviewRejectedStatus: reviewRejected?.statusEvents[0]?.status,
    reviewRejectedBossHealth: reviewRejected
      ? getTavernStatusSnapshotValue(
          reviewRejected.statusSnapshot,
          { type: "character", characterId: "boss" },
          "health",
        )
      : null,
    progressCheckpoint,
    trimCheckpoint,
    syncedTrimSceneCheckpointIds:
      syncedTrimCheckpointRoom.scenes?.find((scene) =>
        scene.id === syncedTrimCheckpointRoom.activeSceneId
      )?.statusCheckpoints.map((checkpoint) => checkpoint.id) ?? [],
    rebuiltFromTrimBossHealth: getTavernStatusSnapshotValue(
      rebuiltFromTrimCheckpoint.statusSnapshot,
      { type: "character", characterId: "boss" },
      "health",
    ),
    rebuiltFromTrimTaskStatus: rebuiltFromTrimCheckpoint.taskSnapshot["defeat-boss"]?.status,
    roleAssignmentChecks,
    defaultDefinitions: {
      statusRuleIds: DEFAULT_TAVERN_STATUS_RULES.map((rule) => rule.id),
      statusDefinitionIds: DEFAULT_TAVERN_STATUS_DEFINITIONS.map((definition) => definition.id),
      relationshipViewOwnerBinding: DEFAULT_TAVERN_PROGRESS_VIEWS.find((view) =>
        view.id === "relationship-to-user"
      )?.ownerBinding,
      taskIds: DEFAULT_TAVERN_TASK_DEFINITIONS.map((task) => task.id),
      outcomeIds: DEFAULT_TAVERN_SCENE_OUTCOMES.map((outcome) => outcome.id),
      roomTaskIds: defaultRoom.taskDefinitions.map((task) => task.id),
      roomOutcomeIds: defaultRoom.sceneOutcomes.map((outcome) => outcome.id),
    },
    defaultThreatLevelAfterThreat: getTavernStatusSnapshotValue(
      defaultThreatAdvance.statusSnapshot,
      { type: "scene" },
      "threat_level",
    ),
    defaultThreatTaskAfterThreat: defaultThreatAdvance.taskSnapshot["stabilize-scene-threat"]?.status,
    defaultTrustTaskInitialStatus: defaultThreatAdvance.taskSnapshot["earn-trust-through-help"]?.status,
    defaultThreatLevelAfterStabilize: getTavernStatusSnapshotValue(
      defaultStabilizeAdvance.statusSnapshot,
      { type: "scene" },
      "threat_level",
    ),
    defaultThreatTaskAfterStabilize:
      defaultStabilizeAdvance.taskSnapshot["stabilize-scene-threat"]?.status,
    defaultOutcomeAfterStabilize: defaultStabilizeAdvance.outcomeEvents.find((event) =>
      event.outcomeId === "scene-stabilized-success"
    )?.status,
    generated: {
      room: generatedRoom,
      scene: generatedScene,
      a: generatedA,
      messages: generatedMaterialized.messages,
      aHealth: generatedA
        ? getTavernStatusSnapshotValue(
            generatedScene.statusSnapshot,
            { type: "character", characterId: generatedA.id },
            "health",
          )
        : null,
    },
    systemPresets: {
      presetIds: tavernSystemPresets.map((preset) => preset.id),
      invalidAvatarIds: tavernSystemPresets.flatMap((preset) =>
        preset.characters.flatMap((character) =>
          knownAvatarIds.has(character.avatar)
            ? []
            : [preset.id + ":" + character.id + ":" + character.avatar]
        )
      ),
      defaultStateRoomTitles: defaultSystemPresetState.rooms.map((item) => item.title),
      defaultStateRoomCount: defaultSystemPresetState.rooms.length,
      raincity: {
        room: raincityRoom,
        avatarIds: raincityRoom.localCharacters.map((character) => character.avatar),
        characterCount: raincityMaterialized.characters.length,
        scenesCount: raincityRoom.scenes?.length ?? 0,
        lorebookCount: raincityRoom.lorebookEntries.length,
        storyNodeCount: raincityRoom.storyGraph.nodes.length,
        storyEdgeCount: raincityRoom.storyGraph.edges.length,
        messageProfiles: raincityMaterialized.messages.map((message) => message.presentationProfileId),
        hasMappedCharacterRelationship: raincityMaterialized.characters.some((character) =>
          character.relationships.some((relationship) =>
            relationship.target.type === "character" &&
            ["rain-ji", "rain-yuan", "rain-su", "rain-he"].includes(relationship.target.characterId)
          )
        ),
        hasUnmappedPresetRelationship: raincityMaterialized.characters.some((character) =>
          character.relationships.some((relationship) =>
            relationship.target.type === "character" &&
            relationship.target.characterId.startsWith("rc-")
          )
        ),
        manuscriptIntegrityBefore: getTavernStatusSnapshotValue(
          raincityRoom.statusSnapshot,
          { type: "scene" },
          "manuscript_integrity",
        ),
        manuscriptIntegrityAfter: getTavernStatusSnapshotValue(
          raincityAdvance.statusSnapshot,
          { type: "scene" },
          "manuscript_integrity",
        ),
        authorSafetyBefore: getTavernStatusSnapshotValue(
          raincityRoom.statusSnapshot,
          { type: "global" },
          "author_safety",
        ),
        authorSafetyAfter: getTavernStatusSnapshotValue(
          raincityAdvance.statusSnapshot,
          { type: "global" },
          "author_safety",
        ),
        voiceBefore: getTavernStatusSnapshotValue(
          raincityRoom.statusSnapshot,
          rainYuanRef,
          "voice_recovery",
        ),
        voiceStatusEvent: raincityAdvance.statusEvents.find((event) =>
          event.statusId === "voice_recovery"
        )?.status,
        firstChapterTaskStatus: raincityAdvance.taskSnapshot["rc-recover-first-chapter"]?.status,
        outcomeStatus: raincityAdvance.outcomeEvents.find((event) =>
          event.outcomeId === "rc-manuscript-remembers"
        )?.status,
      },
      snowridge: {
        room: snowridgeRoom,
        avatarIds: snowridgeRoom.localCharacters.map((character) => character.avatar),
        characterCount: snowridgeMaterialized.characters.length,
        scenesCount: snowridgeRoom.scenes?.length ?? 0,
        lorebookCount: snowridgeRoom.lorebookEntries.length,
        storyNodeCount: snowridgeRoom.storyGraph.nodes.length,
        storyEdgeCount: snowridgeRoom.storyGraph.edges.length,
        oathBefore: getTavernStatusSnapshotValue(
          snowridgeRoom.statusSnapshot,
          { type: "scene" },
          "oath_clarity",
        ),
        oathAfter: getTavernStatusSnapshotValue(
          snowridgeAdvance.statusSnapshot,
          { type: "scene" },
          "oath_clarity",
        ),
        sectPressureBefore: getTavernStatusSnapshotValue(
          snowridgeRoom.statusSnapshot,
          { type: "global" },
          "sect_pressure",
        ),
        sectPressureAfter: getTavernStatusSnapshotValue(
          snowridgeAdvance.statusSnapshot,
          { type: "global" },
          "sect_pressure",
        ),
        woundRiskBefore: getTavernStatusSnapshotValue(
          snowridgeRoom.statusSnapshot,
          snowLinRef,
          "wound_risk",
        ),
        woundStatusEvent: snowridgeAdvance.statusEvents.find((event) =>
          event.statusId === "wound_risk"
        )?.status,
        oathTaskStatus: snowridgeAdvance.taskSnapshot["sx-read-oath-stone"]?.status,
        outcomeStatus: snowridgeAdvance.outcomeEvents.find((event) =>
          event.outcomeId === "sx-oath-restored"
        )?.status,
      },
      orbital: {
        room: orbitalRoom,
        avatarIds: orbitalRoom.localCharacters.map((character) => character.avatar),
        characterCount: orbitalMaterialized.characters.length,
        scenesCount: orbitalRoom.scenes?.length ?? 0,
        lorebookCount: orbitalRoom.lorebookEntries.length,
        storyNodeCount: orbitalRoom.storyGraph.nodes.length,
        storyEdgeCount: orbitalRoom.storyGraph.edges.length,
        signalBefore: getTavernStatusSnapshotValue(
          orbitalRoom.statusSnapshot,
          { type: "scene" },
          "signal_integrity",
        ),
        signalAfter: getTavernStatusSnapshotValue(
          orbitalAdvance.statusSnapshot,
          { type: "scene" },
          "signal_integrity",
        ),
        stationDecayBefore: getTavernStatusSnapshotValue(
          orbitalRoom.statusSnapshot,
          { type: "global" },
          "station_decay",
        ),
        stationDecayAfter: getTavernStatusSnapshotValue(
          orbitalAdvance.statusSnapshot,
          { type: "global" },
          "station_decay",
        ),
        oxygenBefore: getTavernStatusSnapshotValue(
          orbitalRoom.statusSnapshot,
          orbitalRenRef,
          "oxygen_margin",
        ),
        oxygenStatusEvent: orbitalAdvance.statusEvents.find((event) =>
          event.statusId === "oxygen_margin"
        )?.status,
        signalTaskStatus: orbitalAdvance.taskSnapshot["oa-decode-ember-letter"]?.status,
        outcomeStatus: orbitalAdvance.outcomeEvents.find((event) =>
          event.outcomeId === "oa-letter-opened"
        )?.status,
        replyOptionTargetIds: orbitalAdvance.replyOptions.flatMap((option) => option.targetCharacterIds),
      },
    },
  };
  globalThis.__checks = {
    contextForA,
    currentTurnContextForA,
    promptForA,
    secretPolicyPromptForA,
    secretPolicyDirectorPrompt,
    secretPolicyTexts: {
      unrevealedHiddenMemoryText,
      directorOnlySceneMemoryText,
      directorOnlyCharacterMemoryText,
      characterKnownMemoryText,
      publicSceneMemoryText,
    },
    nodePromptOverrideChecks: {
      characterPrompt: nodePromptOverrideForA,
      directorPrompt: nodePromptOverrideDirectorPrompt,
      bridgePrompt: nodePromptOverrideBridgePrompt,
      bridgeText: nodeBridgePromptOverrideText,
      directorText: nodeDirectorPromptOverrideText,
      characterText: nodeCharacterPromptOverrideText,
    },
    styledPromptForA,
    styledTurnInstructionForA,
    narrativePromptForA,
    narrativeTurnInstructionForA,
    narrativeBeatReply,
    schemaAliasReply,
    narrativeContextForA,
    narrativeRuntimeHistory,
    mixedSpeakerReply,
    activeSegmentReply,
    wrongRoleReply,
    directAddressReply,
    missingReplyWrapper,
    unclosedThoughtWithReply,
    unclosedThoughtWithLooseContent,
    unclosedActionMarkdown,
    malformedNarrativeTagReply,
    interactionsForA,
    continuationForA,
    interactionsForUser,
    continuationForUser,
    interactionsForAnsweredA,
    interactionsForAnsweredGroup,
    parsedDirectorRandomEvent,
    parsedDirectorRandomEventDisabled,
    parsedDirectorIllustrationHintsDisabled,
    parsedDirectorIllustrationHintsLoose,
    parsedDirectorNonverbalReply,
    parsedDirectorNonverbalCap,
    normalizedMappedProfile,
    directTargetSignals,
    quietSignals,
    qnaDriveGuidance,
    actionDriveGuidance,
    sceneDriveAgencyGuidance,
    disabledDriveGuidance,
    sceneNovelSource,
    directorProfilePrompt,
    schedulingSignalsPrompt,
    randomEventOpportunityChecks,
    progressChecks,
    roleAssignmentChecks,
    progressVisibilityChecks,
    outcomeResolutionChecks,
    branchInstanceChecks,
    branchMemoryChecks,
    secretMemoryHelperChecks,
    assetExtractionMemoryChecks,
    renderable: createTavernRenderableMessages({
      messages,
      characters,
      userPersonaName: room.userPersonaName,
    }),
    mysteryRenderable,
    revealedMysteryRenderable,
    privateFactVisibilityChecks,
    roleIds: {
      a: tavernCharacterAgentRoleId(room, characters[0]),
      b: tavernCharacterAgentRoleId(room, characters[1]),
      director: tavernDirectorAgentRoleId(room),
      managed: tavernManagedUserAgentRoleId(room),
      quick: tavernQuickReplyAgentRoleId(room),
      novel: tavernQuickNovelAgentRoleId(room),
      archivist: tavernArchivistAgentRoleId(room),
      progress: tavernProgressTrackerAgentRoleId(room),
    },
    bridgeSessionRootDirs: {
      active: tavernBridgeSessionRootDir(room),
      otherScene: tavernBridgeSessionRootDir({
        ...room,
        activeSceneId: "scene-beta",
        activeSceneInstanceId: "scene-instance-beta",
      }),
    },
    bSecret,
    bSecondSecret,
    aSecret,
    aSecondSecret,
  };
`, "utf8");

try {
  await build({
    entryPoints: [entryPath],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    outfile: bundledPath,
    external: ["react", "react-dom"],
    alias: {
      "@": resolve(workspaceRoot, "src"),
    },
    loader: {
      ".jpg": "dataurl",
      ".jpeg": "dataurl",
      ".png": "dataurl",
      ".webp": "dataurl",
    },
    logLevel: "silent",
  });

  await import(pathToFileURL(bundledPath).href);
  const checks = globalThis.__checks;

  assert(
    checks.bridgeSessionRootDirs.active === "tavern/room-alpha/scene-instances/scene-instance-alpha/bridge" &&
      checks.bridgeSessionRootDirs.otherScene === "tavern/room-alpha/scene-instances/scene-instance-beta/bridge",
    "酒馆 bridge session 必须按当前节点场景实例隔离",
    checks.bridgeSessionRootDirs,
  );
  assert(
    checks.branchInstanceChecks.nodeOneInstanceCount === 1 &&
      checks.branchInstanceChecks.nodeTwoInstanceCount === 2 &&
      new Set(checks.branchInstanceChecks.nodeTwoInstanceIds).size === 2 &&
      checks.branchInstanceChecks.nodeTwoPathSignatures.includes("node-1>node-2") &&
      checks.branchInstanceChecks.nodeTwoPathSignatures.includes("node-1>node-1-5>node-2") &&
      checks.branchInstanceChecks.switchedActiveNodeId === "node-2" &&
      checks.branchInstanceChecks.switchedPath === "node-1>node-1-5>node-2",
    "分支汇合节点必须按路径前缀生成不同 sceneInstance，入口节点仍复用同一个实例",
    checks.branchInstanceChecks,
  );
  assert(
    checks.branchMemoryChecks.sourceCount === 2 &&
      checks.branchMemoryChecks.sceneMemory.includes("入口共通知识：旅人已经拿到铜钥匙。") &&
      checks.branchMemoryChecks.sceneMemory.includes("1.5分支私有：旅人绕路检查了后门。") &&
      checks.branchMemoryChecks.sceneMemory.includes("公开解密秘密：后门的铁铃被提前剪断。") &&
      checks.branchMemoryChecks.charAMemory.includes("阿洛知道旅人拿过铜钥匙。") &&
      checks.branchMemoryChecks.charAMemory.includes("阿洛专属解密：旅人说出了屋顶暗号。") &&
      !checks.branchMemoryChecks.charBMemory.includes("阿洛专属解密") &&
      checks.branchMemoryChecks.revealedSecretIds.includes("secret-hidden-door") &&
      checks.branchMemoryChecks.revealedSecretIds.includes("secret-ally-code"),
    "加载上游记忆必须只汇总当前分支路径，并按公开/指定角色解密规则过滤秘密",
    checks.branchMemoryChecks,
  );
  assert(
    checks.secretMemoryHelperChecks.hasAddedSecret &&
      checks.secretMemoryHelperChecks.revealVisibility === "character" &&
      checks.secretMemoryHelperChecks.revealTargetIds.includes("char-a") &&
      checks.secretMemoryHelperChecks.persistedRevealCount === 1,
    "秘密记忆 helper 必须能在当前节点记录隐藏记忆并写入指定角色解密标记",
    checks.secretMemoryHelperChecks,
  );
  assert(
    checks.assetExtractionMemoryChecks.parsedSceneCount === 3 &&
      checks.assetExtractionMemoryChecks.createdSceneVisibilities.includes("public") &&
      checks.assetExtractionMemoryChecks.createdSceneVisibilities.includes("hidden") &&
      checks.assetExtractionMemoryChecks.createdSceneVisibilities.includes("director") &&
      checks.assetExtractionMemoryChecks.sceneHiddenSecretId === "secret-well-rope" &&
    checks.assetExtractionMemoryChecks.parsedCount === 3 &&
      checks.assetExtractionMemoryChecks.createdVisibilities.includes("public") &&
      checks.assetExtractionMemoryChecks.createdVisibilities.includes("hidden") &&
      checks.assetExtractionMemoryChecks.createdVisibilities.includes("character") &&
      checks.assetExtractionMemoryChecks.characterRevealTargets.includes("char-a") &&
      checks.assetExtractionMemoryChecks.hiddenSecretId === "secret-bella-password",
    "资产抽取草稿必须强制 scene/character visibility，并保留隐藏/指定角色可见记忆协议字段",
    checks.assetExtractionMemoryChecks,
  );
  assert(checks.contextForA.includes(checks.aSecret), "A 应能看到自己的心理");
  assert(checks.contextForA.includes(checks.aSecondSecret), "多轮后 A 仍应能看到自己的心理");
  assert(!checks.contextForA.includes(checks.bSecret), "A 的 request_context 不应包含 B 的心理");
  assert(!checks.contextForA.includes(checks.bSecondSecret), "多轮后 A 的 request_context 不应包含 B 的心理");
  assert(
    checks.contextForA.includes("我去吧，门口的风我熟。"),
    "A 应能看到 B 的公开发言",
    checks.contextForA,
  );
  assert(
    checks.currentTurnContextForA.includes("我还在门口，能看见灯影。"),
    "A 本轮 request_context 应包含前序角色的公开发言",
    checks.currentTurnContextForA,
  );
  assert(
    !checks.currentTurnContextForA.includes(checks.bSecondSecret),
    "A 本轮 request_context 不应包含前序角色的心理",
    checks.currentTurnContextForA,
  );
  assert(
    checks.promptForA.includes("这轮只允许以「阿洛」的身份发言") &&
      !checks.promptForA.includes("这轮只允许以「贝拉」的身份发言"),
    "A 的角色 prompt 必须锁定 A 身份",
    checks.promptForA,
	  );
  assert(
    checks.promptForA.includes("interaction_quality_rule id=\"anti-ai-natural\"") &&
      checks.promptForA.includes("interaction_quality_rule id=\"natural-dialogue\""),
    "酒馆互动质量护栏应由设置实时注入角色 prompt，而不是依赖提示词编辑页文本块",
    checks.promptForA,
  );
  assert(
    checks.secretPolicyPromptForA.includes("secret_memory_protocol") &&
      checks.secretPolicyPromptForA.includes(checks.secretPolicyTexts.publicSceneMemoryText) &&
      checks.secretPolicyPromptForA.includes(checks.secretPolicyTexts.characterKnownMemoryText) &&
      !checks.secretPolicyPromptForA.includes(checks.secretPolicyTexts.unrevealedHiddenMemoryText) &&
      !checks.secretPolicyPromptForA.includes(checks.secretPolicyTexts.directorOnlySceneMemoryText) &&
      !checks.secretPolicyPromptForA.includes(checks.secretPolicyTexts.directorOnlyCharacterMemoryText),
    "角色 prompt 必须注入秘密协议，只包含公开/该角色已知记忆，不泄露未公开或导演秘密",
    checks.secretPolicyPromptForA,
  );
  assert(
    checks.secretPolicyDirectorPrompt.includes("secret_memory_protocol") &&
      checks.secretPolicyDirectorPrompt.includes("director_secret_memory") &&
      checks.secretPolicyDirectorPrompt.includes(checks.secretPolicyTexts.directorOnlySceneMemoryText) &&
      checks.secretPolicyDirectorPrompt.includes(checks.secretPolicyTexts.directorOnlyCharacterMemoryText) &&
      !checks.secretPolicyDirectorPrompt.includes(checks.secretPolicyTexts.unrevealedHiddenMemoryText) &&
      checks.secretPolicyDirectorPrompt.includes("never_leak_to_public_output"),
    "导演 prompt 必须注入秘密协议和 directorSecret 上下文，但不直接注入未解密 hidden entry",
    checks.secretPolicyDirectorPrompt,
  );
  assert(
    checks.nodePromptOverrideChecks.characterPrompt.includes(checks.nodePromptOverrideChecks.characterText) &&
      !checks.nodePromptOverrideChecks.characterPrompt.includes(checks.nodePromptOverrideChecks.directorText) &&
      checks.nodePromptOverrideChecks.directorPrompt.includes(checks.nodePromptOverrideChecks.directorText) &&
      !checks.nodePromptOverrideChecks.directorPrompt.includes(checks.nodePromptOverrideChecks.characterText) &&
      checks.nodePromptOverrideChecks.bridgePrompt.includes(checks.nodePromptOverrideChecks.bridgeText),
    "节点级提示词补充必须按 bridge/director/character 目标分别注入，并继承酒馆级提示词",
    checks.nodePromptOverrideChecks,
  );
	  assert(
	    checks.styledPromptForA.includes("prompt_block id=\"system_narrative:dramatic:character\"") &&
	      checks.styledPromptForA.includes("prompt_block id=\"room_style:wuxia:character\"") &&
	      checks.styledPromptForA.includes("系统叙事层保持雨夜压迫感") &&
	      checks.styledPromptForA.includes("角色写作风格：用冷峻短句写可观察动作。") &&
	      checks.styledPromptForA.includes("角色级回复规则：每次回复保留江湖身份分寸，不自称旁白。") &&
	      !checks.styledTurnInstructionForA.includes("prompt_block id=\"system_narrative:dramatic:character\"") &&
	      !checks.styledTurnInstructionForA.includes("prompt_block id=\"room_style:wuxia:character\"") &&
	      checks.styledTurnInstructionForA.includes("当前角色回复规则：每次回复保留江湖身份分寸，不自称旁白。"),
	    "已保存提示词文本块只进入角色 prompt 一次；turn instruction 只保留本轮和角色局部规则",
    {
      prompt: checks.styledPromptForA,
      turnInstruction: checks.styledTurnInstructionForA,
    },
  );
  assert(
    checks.sceneNovelSource.platformStyleId === "qidian" &&
      checks.sceneNovelSource.ruleOptionIds.includes("webnovel-high-density") &&
      checks.sceneNovelSource.ruleOptionIds.includes("promise-mismatch") &&
      checks.sceneNovelSource.stats.userActionCount >= 2 &&
      checks.sceneNovelSource.materials.some((material) =>
        material.kind === "dialogue" && material.text.includes("第二道影子")
      ) &&
      checks.sceneNovelSource.confirmedFacts.some((fact) => fact.includes("化学气味")) &&
      checks.sceneNovelSource.constraints.paragraphMaxChars === 180,
    "场景小说编写器 tavern adapter 应抽取用户行动、角色公开话语和公开事实",
    checks.sceneNovelSource,
  );
  assert(
    checks.qnaDriveGuidance.qnaChainRisk &&
      checks.qnaDriveGuidance.controls.agencyMode === "player_protagonist" &&
      checks.qnaDriveGuidance.needsEventInterruption &&
      checks.qnaDriveGuidance.needsMainHook &&
      checks.qnaDriveGuidance.requiredMoves.length >= 2,
    "连续问询场景应触发事件打断和主线钩子诊断",
    checks.qnaDriveGuidance,
  );
  assert(
    checks.actionDriveGuidance.currentMove === "action" &&
      checks.actionDriveGuidance.needsUserActionConsequence,
    "用户具体行动应触发公开行动后果诊断",
    checks.actionDriveGuidance,
  );
  assert(
    checks.sceneDriveAgencyGuidance.currentMove === "scene_drive" &&
      checks.sceneDriveAgencyGuidance.needsSceneDriveProgression &&
      checks.sceneDriveAgencyGuidance.needsEventInterruption &&
      checks.sceneDriveAgencyGuidance.needsMainHook &&
      checks.sceneDriveAgencyGuidance.requiredMoves.some((move) => move.includes("场景自推动")),
    "场景自推模式下短确认应触发主动推进诊断",
    checks.sceneDriveAgencyGuidance,
  );
  assert(
    !checks.disabledDriveGuidance.qnaChainRisk &&
      !checks.disabledDriveGuidance.needsEventInterruption &&
      !checks.disabledDriveGuidance.needsMainHook,
    "导演操作策略关闭后不应强制问答打断、事件打断或主线钩子",
    checks.disabledDriveGuidance,
  );
  assert(
    checks.narrativePromptForA.includes("<narrative_beat> 写 1 到 3 个自然段的第三人称小说片段") &&
      checks.narrativeTurnInstructionForA.includes("<narrative_beat> 写 1 到 3 个自然段，围绕阿洛形成") &&
      checks.narrativeBeatReply.contentKind === "narrative_beat" &&
      checks.narrativeBeatReply.content.includes("阿洛把披风拢紧") &&
      checks.narrativeContextForA.includes("<narrative_beat>") &&
      checks.narrativeRuntimeHistory.includes("<history_narrative_beat>"),
    "第三人称/小说呈现规则应使用 narrative_beat 生成合同、解析结果和历史上下文",
    {
      prompt: checks.narrativePromptForA,
      turnInstruction: checks.narrativeTurnInstructionForA,
      parsed: checks.narrativeBeatReply,
      context: checks.narrativeContextForA,
      history: checks.narrativeRuntimeHistory,
    },
  );
  assert(
    checks.schemaAliasReply.contentKind === "reply" &&
      checks.schemaAliasReply.content === "我没事，继续看东边。" &&
      checks.schemaAliasReply.thought === "我不能乱。",
    "协议 schema 中定义的 visible/private 别名应能被解析层统一识别",
    checks.schemaAliasReply,
  );
  assert(
    checks.promptForA.includes("不要代替用户说话") &&
      checks.promptForA.includes("不要替其他角色完整发言"),
    "A 的角色 prompt 必须约束不得替他人发言",
    checks.promptForA,
  );
  assert(
    checks.mixedSpeakerReply.content === "我先留在屋顶。" &&
      checks.mixedSpeakerReply.thought === "我得继续盯住高处。",
    "解析器应剥离同一段内混入的 B 角色发言",
    checks.mixedSpeakerReply,
  );
  assert(
    checks.activeSegmentReply.content === "我守屋顶。",
    "解析器应只保留 A 的发言片段",
    checks.activeSegmentReply,
  );
  assert(
    checks.wrongRoleReply.content === "",
    "解析器遇到纯 B 角色发言时不应把它当成 A 的回复",
    checks.wrongRoleReply,
  );
  assert(
    checks.directAddressReply.content === "阿洛你安心歇着，门闩我压着呢。",
    "解析器应保留对其他角色的正常直接称呼",
    checks.directAddressReply,
  );
  assert(
    checks.missingReplyWrapper.content.includes("东边灯影在动") &&
      !checks.missingReplyWrapper.content.includes("我得留意东边"),
    "解析器应能处理缺失 reply 标签但有 thought 标签的输出",
    checks.missingReplyWrapper,
  );
  assert(
    checks.unclosedThoughtWithReply.thought === "我得留意东边。" &&
      checks.unclosedThoughtWithReply.content === "东边灯影在动，我继续盯着。",
    "解析器应能处理未闭合 thought 后接 reply 的输出",
    checks.unclosedThoughtWithReply,
  );
  assert(
    checks.unclosedThoughtWithLooseContent.thought === "我得留意东边。" &&
      checks.unclosedThoughtWithLooseContent.content === "东边灯影在动，我继续盯着。",
    "解析器应能处理未闭合 thought 后直接接正文的输出",
    checks.unclosedThoughtWithLooseContent,
  );
  assert(
    checks.unclosedActionMarkdown.content === "东边灯影还亮着。阿洛把披风拢紧。",
    "解析器应移除未配对的动作 Markdown 标记",
    checks.unclosedActionMarkdown,
  );
  assert(
    checks.malformedNarrativeTagReply.content === "东边灯影还亮着。\n\n阿洛把披风拢紧。",
    "解析器应移除正文里混入的畸形协议标签残留，并保留后续正文",
    checks.malformedNarrativeTagReply,
  );
  assert(
    checks.interactionsForA.length === 1 &&
      checks.interactionsForA[0].target.type === "character" &&
      checks.interactionsForA[0].target.characterIds[0] === "char-a",
    "B 问 A 时应抽取为指向 A 的待回应事项",
    checks.interactionsForA,
  );
  assert(
    checks.continuationForA.shouldContinue &&
      checks.continuationForA.speakerIds[0] === "char-a" &&
      checks.continuationForA.reason === "character_targeted",
    "B 问 A 后应自动续调度 A 回应",
    checks.continuationForA,
  );
  assert(
    checks.interactionsForUser.length === 1 &&
      checks.interactionsForUser[0].target.type === "user",
    "角色问用户时应抽取为指向用户的待回应事项",
    checks.interactionsForUser,
  );
  assert(
    !checks.continuationForUser.shouldContinue &&
      checks.continuationForUser.reason === "user_targeted",
    "角色问用户时应停止自动续调度并等待用户",
    checks.continuationForUser,
  );
  assert(
    checks.interactionsForAnsweredA.length === 0,
    "B 问 A 后如果 A 已在同轮后续回应，不应残留 pending",
    checks.interactionsForAnsweredA,
  );
  assert(
    checks.interactionsForAnsweredGroup.length === 0,
    "用户面向全场提问后如果已有角色回应，不应残留 pending",
    checks.interactionsForAnsweredGroup,
  );
  assert(
    checks.renderable.some((message) => message.thought === checks.bSecret),
    "UI 渲染模型应保留角色心理用于展示",
    checks.renderable,
  );
  assert(
    checks.mysteryRenderable.every((message) => !message.thought),
    "推理/狼人杀公开视角不应在公共界面展示角色心理",
    checks.mysteryRenderable,
  );
  assert(
    checks.revealedMysteryRenderable.some((message) => message.thought === checks.bSecret),
    "结局揭示后应恢复展示隐藏心理",
    checks.revealedMysteryRenderable,
  );
  assert(
    checks.privateFactVisibilityChecks.publicInformationView === "public" &&
      checks.privateFactVisibilityChecks.revealedInformationView === "reveal" &&
      checks.privateFactVisibilityChecks.directorInformationView === "director",
    "互动剧本视角应能区分公开、复盘和导演模式",
    checks.privateFactVisibilityChecks,
  );
  assert(
    checks.privateFactVisibilityChecks.publicFacts.join("|") === "fact-public",
    "公共界面只能看到 public 事实，不能展示仅我或部分角色可知的私有事实",
    checks.privateFactVisibilityChecks,
  );
  assert(
    checks.privateFactVisibilityChecks.userFacts.includes("fact-user-only") &&
      !checks.privateFactVisibilityChecks.userFacts.includes("fact-a-only") &&
      !checks.privateFactVisibilityChecks.userFacts.includes("fact-wolves"),
    "我的情报只能展示 visibleToUser 命中的私有事实",
    checks.privateFactVisibilityChecks,
  );
  assert(
    checks.privateFactVisibilityChecks.messageIntelById["m-a"]?.join("|") === "fact-user-only" &&
      (checks.privateFactVisibilityChecks.messageIntelById["m-b"]?.length ?? 0) === 0,
    "visibleToUser 私有事实应只挂到最相关的来源消息下，不应在同轮其他消息重复展示",
    checks.privateFactVisibilityChecks.messageIntelById,
  );
  assert(
    checks.privateFactVisibilityChecks.characterAFacts.includes("fact-a-only") &&
      !checks.privateFactVisibilityChecks.characterAFacts.includes("fact-user-only"),
    "角色上下文只能看到分配给该角色的私有事实",
    checks.privateFactVisibilityChecks,
  );
  assert(
    checks.privateFactVisibilityChecks.wolfFacts.includes("fact-wolves") &&
      !checks.privateFactVisibilityChecks.wolfFacts.includes("fact-a-only"),
    "阵营事实只应给对应阵营上下文",
    checks.privateFactVisibilityChecks,
  );
  assert(
    checks.privateFactVisibilityChecks.directorFacts.length === 5 &&
      checks.privateFactVisibilityChecks.revealedUserFacts.includes("fact-director"),
    "导演应全知，结局揭示后隐藏事实可进入复盘视角",
    checks.privateFactVisibilityChecks,
  );
  assert(
    checks.roleAssignmentChecks.count === 3 &&
      checks.roleAssignmentChecks.generated &&
      checks.roleAssignmentChecks.userFacts.length === 1 &&
      checks.roleAssignmentChecks.characterFacts.length === 2 &&
      checks.roleAssignmentChecks.privateFacts,
    "身份池应能为用户和角色生成私有身份事实，并可被运行时识别为可替换的本局分配",
    checks.roleAssignmentChecks,
  );
  assert(
    checks.progressVisibilityChecks.public &&
      checks.progressVisibilityChecks.private &&
      checks.progressVisibilityChecks.owner &&
      !checks.progressVisibilityChecks.director &&
      !checks.progressVisibilityChecks.hidden &&
      !checks.progressVisibilityChecks.debug,
    "状态面板可见性应隐藏 director/hidden/debug，并允许公开或用户相关状态展示",
    checks.progressVisibilityChecks,
  );
  assert(
    checks.outcomeResolutionChecks.appliedStatus === "applied" &&
      checks.outcomeResolutionChecks.dismissedStatus === "dismissed" &&
      checks.outcomeResolutionChecks.appliedInformationView === "reveal" &&
      checks.outcomeResolutionChecks.dismissedInformationView === "public",
    "待确认结局应支持应用或忽略，只有应用结局会进入复盘视角",
    checks.outcomeResolutionChecks,
  );
  assert(
    new Set(Object.values(checks.roleIds)).size === Object.values(checks.roleIds).length,
    "导演、角色、快捷回复、托管用户、小说写作、资产整理都应有独立 agentRoleId",
    checks.roleIds,
  );
  assert(
    checks.parsedDirectorRandomEvent.speakerIds.length === 1 &&
      checks.parsedDirectorRandomEvent.speakerIds[0] === "char-a" &&
      checks.parsedDirectorRandomEvent.ambientActions[0]?.characterId === "char-b" &&
      checks.parsedDirectorRandomEvent.randomEvent === "门外传来两下克制的敲门声。" &&
      checks.parsedDirectorRandomEvent.illustrationHints.length === 1 &&
      !checks.parsedDirectorRandomEventDisabled.randomEvent,
    "导演随机事件应只在机会开启时被解析，并保留公开可观察事件",
    {
      parsed: checks.parsedDirectorRandomEvent,
      disabled: checks.parsedDirectorRandomEventDisabled,
    },
  );
  assert(
    checks.parsedDirectorRandomEvent.illustrationHints[0] ===
      "昏黄灯光下，阿洛站在门边，贝拉在吧台后方擦亮杯沿，构图偏向门口。" &&
      checks.parsedDirectorIllustrationHintsDisabled.illustrationHints.length === 0 &&
      checks.parsedDirectorIllustrationHintsLoose.illustrationHints[0] ===
        "吧台上的铜杯映出门口灯影，阿洛的披风停在画面左侧。",
    "导演插图提示应只在开关开启时保留公开可见画面，并过滤心理与秘密信息",
    {
      parsed: checks.parsedDirectorRandomEvent,
      disabled: checks.parsedDirectorIllustrationHintsDisabled,
      loose: checks.parsedDirectorIllustrationHintsLoose,
    },
  );
  assert(
    checks.parsedDirectorNonverbalReply.nonverbalReplyIds.join("|") === "char-b" &&
      checks.parsedDirectorNonverbalReply.ambientActions.length === 0,
    "导演 nonverbalReplyIds 应被解析为角色调用计划，并避免同角色重复进入 ambientActions",
    checks.parsedDirectorNonverbalReply,
  );
  assert(
    checks.parsedDirectorNonverbalCap.speakerIds.length === 0 &&
      checks.parsedDirectorNonverbalCap.nonverbalReplyIds.join("|") === "char-b",
    "导演同时返回 speakerIds/nonverbalReplyIds 时，应按合并角色数限制本轮调度并优先保留非语言角色回复",
    checks.parsedDirectorNonverbalCap,
  );
  assert(
    checks.normalizedMappedProfile?.characterProfiles["char-b"]?.speechBias === "very_high" &&
      !checks.normalizedMappedProfile?.characterProfiles["seed-b"],
    "稳定调度画像应能在导入/生成时把临时角色 id 映射到真实角色 id",
    checks.normalizedMappedProfile,
  );
  assert(
    checks.directTargetSignals[0]?.characterId === "char-b" &&
      checks.directTargetSignals[0]?.matchedRuleIds.includes("direct-target-priority") &&
      checks.directTargetSignals[0]?.matchedRuleIds.includes("knowledge-holder-helps-or-misdirects") &&
      checks.directTargetSignals[0]?.suggestedModes.includes("speech"),
    "动态调度信号应让被点名且掌握相关事实的角色优先发言",
    checks.directTargetSignals,
  );
  assert(
    checks.quietSignals.find((signal) => signal.characterId === "char-a")?.matchedRuleIds.includes("quiet-temperament-brake") &&
      checks.quietSignals.find((signal) => signal.characterId === "char-a")?.suggestedModes.includes("ambient"),
    "动态调度信号应对沉默人设且无强动机的角色降权并建议弱在场动作",
    checks.quietSignals,
  );
  assert(
    checks.directorProfilePrompt.includes('"characterId": "char-b"') &&
      checks.directorProfilePrompt.includes('"speechBias": "high"') &&
      checks.schedulingSignalsPrompt.includes('"matchedRuleIds"') &&
      checks.schedulingSignalsPrompt.includes('"direct-target-priority"'),
    "导演 prompt 上下文应包含稳定画像和每轮动态调度信号",
    {
      profile: checks.directorProfilePrompt,
      signals: checks.schedulingSignalsPrompt,
    },
  );
  assert(
    checks.randomEventOpportunityChecks.enabledHit &&
      !checks.randomEventOpportunityChecks.enabledMiss &&
      !checks.randomEventOpportunityChecks.disabled,
    "导演随机事件概率开关应只提供机会，不直接生成事件",
    checks.randomEventOpportunityChecks,
  );
  assert(
    checks.progressChecks.statusEvents.length === 2 &&
      checks.progressChecks.statusEvents.every((event) => event.status === "applied"),
    "规则引擎应从明确事实事件生成可应用的状态事件",
    checks.progressChecks.statusEvents,
  );
  assert(
    checks.progressChecks.bossHealth === 0,
    "Boss 受到明确 major damage 后健康应被扣到 0",
    checks.progressChecks,
  );
  assert(
    checks.progressChecks.aToUserFavorability === 60 &&
      checks.progressChecks.relationshipKey === "relationship:character:char-a->user:user",
    "有向关系状态应正确维护阿洛对用户的好感",
    checks.progressChecks,
  );
  assert(
    checks.progressChecks.taskResult.taskSnapshot["defeat-boss"]?.status === "completed" &&
      checks.progressChecks.taskResult.taskSnapshot["earn-a-trust"]?.status === "completed",
    "任务引擎应根据状态快照完成场景任务和个人任务",
    checks.progressChecks.taskResult,
  );
  assert(
    checks.progressChecks.outcomeEvents.length === 1 &&
      checks.progressChecks.outcomeEvents[0].outcomeId === "boss-defeated-victory" &&
      checks.progressChecks.outcomeEvents[0].status === "applied",
    "场景胜负引擎应在任务完成后触发自动结局",
    checks.progressChecks.outcomeEvents,
  );
  assert(
    checks.progressChecks.progressCheckpoint.includedStatusEventIds.length === 0 &&
      checks.progressChecks.rebuiltBossHealth === 0 &&
      checks.progressChecks.rebuiltTaskStatus === "completed",
    "状态面板应能从 checkpoint 和后续事件历史重建",
    checks.progressChecks,
  );
  assert(
    checks.progressChecks.trimCheckpoint.reason === "before_context_trim" &&
      checks.progressChecks.trimCheckpoint.includedStatusEventIds.length ===
        checks.progressChecks.statusEvents.length &&
      checks.progressChecks.syncedTrimSceneCheckpointIds.includes(
        checks.progressChecks.trimCheckpoint.id,
      ) &&
      checks.progressChecks.rebuiltFromTrimBossHealth === 0 &&
      checks.progressChecks.rebuiltFromTrimTaskStatus === "completed",
    "裁切前检查点应包含当前状态历史，并可作为清空对话后的重建基线",
    checks.progressChecks,
  );
  assert(
    checks.progressChecks.reviewInitialBossHealth === 25 &&
      checks.progressChecks.reviewAppliedBossHealth === 0 &&
      checks.progressChecks.reviewAppliedTaskStatus === "completed" &&
      checks.progressChecks.reviewAppliedOutcomeStatus === "applied",
    "review 模式下确认 pending 状态事件后才应推进快照、任务和结局",
    checks.progressChecks,
  );
  assert(
    checks.progressChecks.reviewAppliedActionFavorability === 58 &&
      checks.progressChecks.reviewAppliedReplyOptions.includes("先确认大家是否受伤。") &&
      checks.progressChecks.reviewAppliedReplyOptions.includes("确认进入「scene-next」") &&
      checks.progressChecks.reviewAppliedActionMessages.some((text) => text.includes("Boss 被击倒")) &&
      checks.progressChecks.reviewAppliedActionMessages.some((text) => text.includes("阶段转换建议")) &&
      checks.progressChecks.reviewAppliedSceneDirection.includes("战后检查") &&
      checks.progressChecks.reviewAppliedSceneTransition.includes("scene-next"),
    "任务和结局动作应落地为状态补丁、候选回复、内联消息、导演指令和阶段建议",
    checks.progressChecks,
  );
  assert(
    checks.progressChecks.reviewRejectedStatus === "rejected" &&
      checks.progressChecks.reviewRejectedBossHealth === 25,
    "review 模式下拒绝 pending 状态事件不应改变快照",
    checks.progressChecks,
  );
  assert(
    checks.progressChecks.defaultDefinitions.statusRuleIds.includes("threat-to-scene-threat") &&
      checks.progressChecks.defaultDefinitions.statusRuleIds.includes("stabilize-to-scene-threat") &&
      checks.progressChecks.defaultDefinitions.relationshipViewOwnerBinding === "allCharactersToUser" &&
      checks.progressChecks.defaultDefinitions.roomTaskIds.includes("stabilize-scene-threat") &&
      checks.progressChecks.defaultDefinitions.roomOutcomeIds.includes("scene-stabilized-success"),
    "默认酒馆应包含场景威胁规则、所有角色对用户态度、任务和结局定义",
    checks.progressChecks.defaultDefinitions,
  );
  assert(
    checks.progressChecks.defaultThreatLevelAfterThreat === 40 &&
      checks.progressChecks.defaultThreatTaskAfterThreat === "active" &&
      checks.progressChecks.defaultTrustTaskInitialStatus === "active",
    "默认规则应能把威胁事实推进为任务激活，并保留初始 active 的个人任务",
    checks.progressChecks,
  );
  assert(
    checks.progressChecks.defaultThreatLevelAfterStabilize === 5 &&
      checks.progressChecks.defaultThreatTaskAfterStabilize === "completed" &&
      checks.progressChecks.defaultOutcomeAfterStabilize === "pending",
    "默认稳定行动应能完成场景任务并触发待确认结局建议",
    checks.progressChecks,
  );
  assert(
    checks.progressChecks.generated.room.title === "雨巷旧灯" &&
      checks.progressChecks.generated.room.prompt.blocks.some((block) =>
        block.source?.type === "room_style" && block.source.id === "light-novel"
      ) &&
      checks.progressChecks.generated.room.creationSource === "quick" &&
      checks.progressChecks.generated.room.settings.randomEvents.enabled &&
      checks.progressChecks.generated.room.settings.randomEvents.probability === 0.25 &&
      checks.progressChecks.generated.room.settings.illustrationHints.enabled,
	    "生成 JSON 导入应保留快速创建来源、酒馆风格文本块和高级房间设置",
    checks.progressChecks.generated.room,
  );
  assert(
    checks.progressChecks.generated.a?.writingStyle === "动作简洁，雨声作衬。" &&
      checks.progressChecks.generated.a?.replyStylePrompt ===
        "不要自称旁白，不替旅人决定行动。" &&
      checks.progressChecks.generated.scene.characterMemories[checks.progressChecks.generated.a.id]
        .includes("铜牌") &&
      checks.progressChecks.generated.scene.characterPublicStatuses[
        checks.progressChecks.generated.a.id
      ]?.visibleMood === "警惕" &&
      checks.progressChecks.generated.aHealth === 88,
    "生成 JSON 导入应把临时角色 id/name 映射到真实角色 id，并保留角色级 prompt、记忆和状态快照",
    checks.progressChecks.generated,
  );
  assert(
    checks.progressChecks.generated.room.lorebookEntries[0]?.title === "铜牌" &&
      checks.progressChecks.generated.messages.some((message) =>
        message.role === "character" &&
        message.characterId === checks.progressChecks.generated.a.id
      ),
    "生成 JSON 导入应创建世界书和映射后的初始角色消息",
    checks.progressChecks.generated,
  );
  assert(
    checks.progressChecks.systemPresets.presetIds.join("|") ===
      "raincity-silent-manuscript|snowridge-sword-oath|orbital-ashes-letter" &&
      checks.progressChecks.systemPresets.defaultStateRoomCount === 3 &&
      checks.progressChecks.systemPresets.defaultStateRoomTitles.includes("雨城失语书") &&
      checks.progressChecks.systemPresets.defaultStateRoomTitles.includes("雪岭照夜剑") &&
      checks.progressChecks.systemPresets.defaultStateRoomTitles.includes("环轨余烬信") &&
      !checks.progressChecks.systemPresets.defaultStateRoomTitles.includes("雾港档案馆问询") &&
      !checks.progressChecks.systemPresets.defaultStateRoomTitles.includes("余烬集市同盟") &&
      !checks.progressChecks.systemPresets.defaultStateRoomTitles.includes("星坠歌剧院彩排"),
    "系统预设应只包含当前三个小说风格故事",
    checks.progressChecks.systemPresets,
  );
  assert(
    checks.progressChecks.systemPresets.invalidAvatarIds.length === 0 &&
      new Set(checks.progressChecks.systemPresets.raincity.avatarIds).size === 4 &&
      new Set(checks.progressChecks.systemPresets.snowridge.avatarIds).size === 4 &&
      new Set(checks.progressChecks.systemPresets.orbital.avatarIds).size === 4,
    "系统预设角色头像必须使用已注册头像资源",
    checks.progressChecks.systemPresets,
  );
  assert(
    checks.progressChecks.systemPresets.raincity.room.presentation.profileId === "novel-prose" &&
      checks.progressChecks.systemPresets.raincity.room.prompt.blocks.some((block) =>
        block.source?.type === "room_style" && block.source.id === "novel"
      ) &&
      checks.progressChecks.systemPresets.raincity.room.settings.informationPolicy.mode === "mystery" &&
      checks.progressChecks.systemPresets.raincity.room.settings.informationPolicy.hideCharacterThoughts &&
      checks.progressChecks.systemPresets.raincity.room.settings.informationPolicy.hiddenFacts.enabled &&
      checks.progressChecks.systemPresets.raincity.characterCount === 4 &&
      checks.progressChecks.systemPresets.raincity.scenesCount === 3 &&
      checks.progressChecks.systemPresets.raincity.lorebookCount >= 4 &&
      checks.progressChecks.systemPresets.raincity.storyNodeCount >= 3 &&
      checks.progressChecks.systemPresets.raincity.storyEdgeCount >= 2 &&
      checks.progressChecks.systemPresets.raincity.messageProfiles.every((profileId) =>
        profileId === "novel-prose"
      ) &&
      checks.progressChecks.systemPresets.raincity.hasMappedCharacterRelationship &&
      !checks.progressChecks.systemPresets.raincity.hasUnmappedPresetRelationship &&
      checks.progressChecks.systemPresets.raincity.manuscriptIntegrityBefore === 35 &&
      checks.progressChecks.systemPresets.raincity.manuscriptIntegrityAfter === 60 &&
      checks.progressChecks.systemPresets.raincity.authorSafetyBefore === 45 &&
      checks.progressChecks.systemPresets.raincity.authorSafetyAfter === 70 &&
      checks.progressChecks.systemPresets.raincity.voiceBefore === 20 &&
      ["pending", "applied"].includes(checks.progressChecks.systemPresets.raincity.voiceStatusEvent) &&
      checks.progressChecks.systemPresets.raincity.firstChapterTaskStatus === "completed" &&
      checks.progressChecks.systemPresets.raincity.outcomeStatus === "pending",
    "雨城预设应完整映射小说正文、角色关系、世界书、多场景和手稿进度规则",
    checks.progressChecks.systemPresets.raincity,
  );
  assert(
    checks.progressChecks.systemPresets.snowridge.room.presentation.profileId === "novel-prose" &&
      checks.progressChecks.systemPresets.snowridge.room.prompt.blocks.some((block) =>
        block.source?.type === "room_style" && block.source.id === "wuxia"
      ) &&
      checks.progressChecks.systemPresets.snowridge.room.settings.informationPolicy.mode === "open" &&
      checks.progressChecks.systemPresets.snowridge.characterCount === 4 &&
      checks.progressChecks.systemPresets.snowridge.scenesCount === 3 &&
      checks.progressChecks.systemPresets.snowridge.lorebookCount >= 4 &&
      checks.progressChecks.systemPresets.snowridge.storyNodeCount >= 3 &&
      checks.progressChecks.systemPresets.snowridge.storyEdgeCount >= 2 &&
      checks.progressChecks.systemPresets.snowridge.oathBefore === 25 &&
      checks.progressChecks.systemPresets.snowridge.oathAfter === 55 &&
      checks.progressChecks.systemPresets.snowridge.sectPressureBefore === 65 &&
      checks.progressChecks.systemPresets.snowridge.sectPressureAfter === 45 &&
      checks.progressChecks.systemPresets.snowridge.woundRiskBefore === 60 &&
      ["pending", "applied"].includes(checks.progressChecks.systemPresets.snowridge.woundStatusEvent) &&
      checks.progressChecks.systemPresets.snowridge.oathTaskStatus === "completed" &&
      checks.progressChecks.systemPresets.snowridge.outcomeStatus === "pending",
    "雪岭预设应完整映射武侠小说正文、剑书任务和旧誓进度规则",
    checks.progressChecks.systemPresets.snowridge,
  );
  assert(
    checks.progressChecks.systemPresets.orbital.room.presentation.profileId === "novel-prose" &&
      checks.progressChecks.systemPresets.orbital.room.prompt.blocks.some((block) =>
        block.source?.type === "room_style" && block.source.id === "light-novel"
      ) &&
      checks.progressChecks.systemPresets.orbital.room.settings.informationPolicy.mode === "mystery" &&
      checks.progressChecks.systemPresets.orbital.characterCount === 4 &&
      checks.progressChecks.systemPresets.orbital.scenesCount === 3 &&
      checks.progressChecks.systemPresets.orbital.lorebookCount >= 4 &&
      checks.progressChecks.systemPresets.orbital.storyNodeCount >= 3 &&
      checks.progressChecks.systemPresets.orbital.storyEdgeCount >= 2 &&
      checks.progressChecks.systemPresets.orbital.signalBefore === 30 &&
      checks.progressChecks.systemPresets.orbital.signalAfter === 65 &&
      checks.progressChecks.systemPresets.orbital.stationDecayBefore === 72 &&
      checks.progressChecks.systemPresets.orbital.stationDecayAfter === 47 &&
      checks.progressChecks.systemPresets.orbital.oxygenBefore === 55 &&
      ["pending", "applied"].includes(checks.progressChecks.systemPresets.orbital.oxygenStatusEvent) &&
      checks.progressChecks.systemPresets.orbital.signalTaskStatus === "completed" &&
      checks.progressChecks.systemPresets.orbital.outcomeStatus === "pending" &&
      checks.progressChecks.systemPresets.orbital.replyOptionTargetIds.length > 0,
    "环轨预设应完整映射科幻小说正文、信号解码、轨道压力和任务结局",
    checks.progressChecks.systemPresets.orbital,
  );
  console.log(JSON.stringify({ ok: true, checks: checks.roleIds }, null, 2));
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
