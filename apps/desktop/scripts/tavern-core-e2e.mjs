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
const directorDecisionPath = resolve(workspaceRoot, "src/features/pages/tavern/runtime/director-decision.ts");
const importFormatsPath = resolve(workspaceRoot, "src/features/pages/tavern/import-formats.ts");
const promptPath = resolve(workspaceRoot, "src/features/pages/tavern/runtime/prompt.ts");
const replyCleanupPath = resolve(workspaceRoot, "src/features/pages/tavern/runtime/reply-cleanup.ts");
const storagePath = resolve(workspaceRoot, "src/features/pages/tavern/storage.ts");
const turnInstructionPath = resolve(workspaceRoot, "src/features/pages/tavern/runtime/turn-instruction.ts");

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
    canTavernCharacterUseNonverbalReply,
    createEmptyTavernStatusSnapshot,
    createTavernDirectorProfileFromCharacters,
    createTavernProgressCheckpoint,
    createTavernRoleAssignmentFactEvents,
    createTavernRenderableMessages,
    deriveTavernStatusEventsFromFacts,
    evaluateTavernSceneOutcomes,
    extractTavernPendingInteractionsFromMessages,
    filterTavernFactEventsForAudience,
    formatTavernDirectorProfileForPrompt,
    formatTavernSchedulingSignalsForPrompt,
    formatTavernVisibleMessagesForRequestContext,
    getTavernStatusSnapshotValue,
    isGeneratedTavernRoleAssignmentFactEvent,
    canTavernSelectedTargetsStaySilent,
    isTavernDirectorOnlyTurnAllowed,
    isTavernFixedOrderPhase,
    isTavernProgressVisibilityVisibleToUser,
    normalizeTavernMessagesForAudience,
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
    tavernDirectorAgentRoleId,
    tavernManagedUserAgentRoleId,
    tavernRelationshipKey,
    tavernProgressTrackerAgentRoleId,
    tavernQuickNovelAgentRoleId,
    tavernQuickReplyAgentRoleId,
    updateTavernTasks,
  } from ${JSON.stringify(corePath)};
  import {
    createDefaultTavernState,
    createTavernRoom,
    createTavernRoomFromGeneratedPresetJson,
    createTavernRoomFromSystemPreset,
    DEFAULT_TAVERN_PROGRESS_VIEWS,
    DEFAULT_TAVERN_SCENE_OUTCOMES,
    DEFAULT_TAVERN_STATUS_DEFINITIONS,
    DEFAULT_TAVERN_STATUS_RULES,
    DEFAULT_TAVERN_TASK_DEFINITIONS,
    parseTavernGeneratedPresetJsonText,
    saveTavernState,
    syncTavernRoomActiveScene,
    tavernSystemPresets,
  } from ${JSON.stringify(storagePath)};
  import {
    parseTavernDirectorDecision,
    shouldOfferTavernDirectorRandomEvent,
  } from ${JSON.stringify(directorDecisionPath)};
  import {
    parseSillyTavernWorldBookJson,
    parseTavernExternalImportJson,
  } from ${JSON.stringify(importFormatsPath)};
  import {
    buildTavernSystemPrompt,
    tavernMessagesToRuntimeMessages,
  } from ${JSON.stringify(promptPath)};
  import { parseTavernReplyText } from ${JSON.stringify(replyCleanupPath)};
  import { buildTavernCharacterTurnInstruction } from ${JSON.stringify(turnInstructionPath)};

  const now = Date.now();
  const userRef = { type: "user", userId: "user" };
  const charARef = { type: "character", characterId: "char-a" };
  const charBRef = { type: "character", characterId: "char-b" };
  const bossRef = { type: "character", characterId: "boss" };
  const globalRef = { type: "global" };
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
    timelineEvents: [],
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
  const styledCharacter = {
    ...characters[0],
    writingStyle: "用冷峻短句写可观察动作。",
    replyStylePrompt: "每次回复保留江湖身份分寸，不自称旁白。",
  };
  const styledRoom = {
    ...room,
    promptStyleId: "wuxia",
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
  const sillyWorldBookEntries = parseSillyTavernWorldBookJson({
    entries: {
      0: {
        uid: 0,
        key: ["铜牌"],
        keysecondary: ["信使"],
        comment: "信使铜牌",
        content: "铜牌用于确认信使身份。",
        constant: true,
        disable: false,
      },
      1: {
        uid: 1,
        key: ["停用"],
        comment: "停用条目",
        content: "这条应该以禁用状态导入。",
        constant: false,
        disable: true,
      },
    },
  });
  const sillyWorldBookImport = parseTavernExternalImportJson(JSON.stringify({
    entries: {
      0: {
        uid: 0,
        key: ["旧灯"],
        keysecondary: ["雨巷"],
        comment: "旧灯",
        content: "雨巷旧灯只会在子夜前后闪烁。",
        constant: false,
        disable: false,
      },
    },
  }));
  const sillyCharacterImport = parseTavernExternalImportJson(JSON.stringify({
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: "铃央",
      description: "守灯人，记忆力很好。",
      personality: "冷静，先观察再回答。",
      scenario: "雨巷旧灯下，信使失踪。",
      first_mes: "灯刚刚灭过一次。",
      mes_example: "铃央：我先看灯芯。",
      system_prompt: "保持守灯人的谨慎，不替用户行动。",
      post_history_instructions: "只根据可见线索回应。",
      character_book: {
        entries: [
          {
            key: ["灯芯"],
            comment: "灯芯",
            content: "灯芯混入银粉时会发出冷白光。",
            constant: false,
            disable: false,
          },
        ],
      },
    },
  }));
  const interactiveScriptImport = parseTavernExternalImportJson(JSON.stringify({
    type: "novel-claw:tavern-script",
    title: "月下议会",
    mode: "social_deduction",
    premise: "议会中混入了伪装者。",
    background: "月下议会只在钟声第三次响起前投票。",
    userPersonaName: "旅人",
    characters: [
      {
        id: "seer",
        name: "观星者",
        description: "能辨认一次谎言。",
        speakingStyle: "克制而含蓄。",
      },
      {
        id: "guard",
        name: "守卫",
        description: "负责维持秩序。",
        speakingStyle: "短句，直接。",
      },
    ],
    rolePool: [
      { id: "traitor", label: "伪装者", factionId: "traitors", factionLabel: "伪装者", count: 1 },
      { id: "council", label: "议员", factionId: "council", factionLabel: "议会", count: 2 },
    ],
    privateFacts: [
      {
        type: "clue",
        evidence: "你知道钟声第三次响起前必须完成投票。",
        visibleToUser: true,
      },
    ],
    statusDefinitions: [
      {
        id: "suspicion",
        label: "怀疑",
        scope: "scene",
        valueType: "number",
        defaultValue: 0,
        visibility: "public",
        min: 0,
        max: 100,
        updatePolicy: {
          mode: "eventDrivenWithReview",
          requireFactEvent: true,
          allowedEventTypes: ["suspicious"],
        },
      },
    ],
    statusRules: [],
    progressViews: [],
    taskDefinitions: [
      {
        id: "find-traitor",
        title: "找出伪装者",
        scope: "scene",
        owner: { type: "scene", sceneId: "current" },
        visibility: "public",
        required: true,
        optional: false,
        repeatable: false,
        lifecycle: {
          initialStatus: "active",
          completeCondition: {
            factEvent: "traitor_found",
            countGte: 1,
          },
        },
      },
    ],
    outcomes: [
      {
        id: "traitor-found",
        label: "伪装者被找出",
        winner: [{ type: "user", userId: "user" }],
        condition: {
          task: "find-traitor",
          status: "completed",
        },
        priority: 10,
        exclusive: true,
        endScene: "suggest",
        visibility: "public",
      },
    ],
    openingMessage: "第三声钟响前，每个人都必须说出自己的证词。",
  }));
  const interactiveScriptMaterialized = interactiveScriptImport.kind === "generatedPreset"
    ? createTavernRoomFromGeneratedPresetJson(
        "workspace",
        interactiveScriptImport.preset,
        {
          roomId: "interactive-script-room",
          createdAt: now + 60,
        },
      )
    : null;
  const defaultSystemPresetState = createDefaultTavernState("workspace-system-defaults");
  const fogboundMaterialized = createTavernRoomFromSystemPreset(
    "workspace-system",
    "fogbound-archive-inquest",
    {
      roomId: "system-fogbound-room",
      createdAt: now + 70,
      characterIdByPresetId: new Map([
        ["fo-mu-qingyan", "fog-mu"],
        ["fo-luo-yunfan", "fog-luo"],
        ["fo-qin-suye", "fog-qin"],
        ["fo-han-ruosheng", "fog-han"],
      ]),
    },
  );
  const fogboundRoom = fogboundMaterialized.room;
  const fogboundAdvance = advanceTavernProgressFromFactEvents({
    room: fogboundRoom,
    factEvents: [
      {
        id: "system-fogbound-clue",
        turnId: "system-fogbound-turn",
        sourceMessageIds: ["system-fogbound-message"],
        type: "clue_verified",
        target: { type: "scene", sceneId: fogboundRoom.activeSceneId },
        evidence: "调查人把潮汐钟停摆时刻与巡检表缺口对应起来，确认三点十七分不是自然停摆。",
        confidence: 0.96,
        createdAt: now + 71,
      },
      {
        id: "system-fogbound-protect",
        turnId: "system-fogbound-turn",
        sourceMessageIds: ["system-fogbound-message"],
        type: "witness_protected",
        target: { type: "global" },
        evidence: "调查人先转移秦素夜的住客，再让她交出备用齿轮线索。",
        confidence: 0.9,
        createdAt: now + 71,
      },
    ],
    turnId: "system-fogbound-turn",
    createdAt: now + 72,
  });

  const emberMaterialized = createTavernRoomFromSystemPreset(
    "workspace-system",
    "ember-market-alliance",
    {
      roomId: "system-ember-room",
      createdAt: now + 73,
      characterIdByPresetId: new Map([
        ["em-yan-zhuo", "ember-yan"],
        ["em-lian-shuo", "ember-lian"],
        ["em-ke-lin", "ember-ke"],
        ["em-miao-sen", "ember-miao"],
      ]),
    },
  );
  const emberRoom = emberMaterialized.room;
  const emberYanRef = { type: "character", characterId: "ember-yan" };
  const emberAdvance = advanceTavernProgressFromFactEvents({
    room: emberRoom,
    factEvents: [
      {
        id: "system-ember-water-deal",
        turnId: "system-ember-turn",
        sourceMessageIds: ["system-ember-message"],
        type: "water_deal_secured",
        target: { type: "global" },
        evidence: "四方接受诊所保底供水、商会监督账本和守备队夜间通行的临时组合条件。",
        confidence: 0.95,
        createdAt: now + 74,
      },
      {
        id: "system-ember-deal-secured",
        turnId: "system-ember-turn",
        sourceMessageIds: ["system-ember-message"],
        type: "deal_secured",
        target: { type: "scene", sceneId: emberRoom.activeSceneId },
        evidence: "燕灼、连朔和柯临都给出明确让步，苗森同意以赦免换完整暗渠图。",
        confidence: 0.92,
        createdAt: now + 74,
      },
      {
        id: "system-ember-promise-kept",
        turnId: "system-ember-turn",
        sourceMessageIds: ["system-ember-message"],
        type: "promise_kept",
        actor: emberYanRef,
        target: userRef,
        evidence: "用户把监督条款写入协议，兑现了让商会不被单方接管的承诺。",
        confidence: 0.91,
        createdAt: now + 74,
      },
    ],
    turnId: "system-ember-turn",
    createdAt: now + 75,
  });

  const starfallMaterialized = createTavernRoomFromSystemPreset(
    "workspace-system",
    "starfall-opera-rehearsal",
    {
      roomId: "system-starfall-room",
      createdAt: now + 76,
      characterIdByPresetId: new Map([
        ["so-lu-yin", "opera-lu"],
        ["so-shen-wei", "opera-shen"],
        ["so-qi-lan", "opera-qi"],
        ["so-meng-xi", "opera-meng"],
      ]),
    },
  );
  const starfallRoom = starfallMaterialized.room;
  const starfallShenRef = { type: "character", characterId: "opera-shen" };
  const starfallAdvance = advanceTavernProgressFromFactEvents({
    room: starfallRoom,
    factEvents: [
      {
        id: "system-starfall-stage-repaired",
        turnId: "system-starfall-turn",
        sourceMessageIds: ["system-starfall-message"],
        type: "stage_repaired",
        target: { type: "scene", sceneId: starfallRoom.activeSceneId },
        evidence: "祁岚确认升降台滑轮被重新校准，灯控焦痕不再影响第七场走位。",
        confidence: 0.95,
        createdAt: now + 77,
      },
      {
        id: "system-starfall-curse-clue",
        turnId: "system-starfall-turn",
        sourceMessageIds: ["system-starfall-message"],
        type: "curse_clue_resolved",
        target: { type: "global" },
        evidence: "录音蜡筒证明三年前的坠幕声来自绞盘倒转，而不是不可验证的诅咒。",
        confidence: 0.93,
        createdAt: now + 77,
      },
      {
        id: "system-starfall-voice",
        turnId: "system-starfall-turn",
        sourceMessageIds: ["system-starfall-message"],
        type: "voice_recovered",
        target: starfallShenRef,
        evidence: "沈微在旧谱被移出星砂幕布后，能够轻声唱完第七场关键音阶。",
        confidence: 0.9,
        createdAt: now + 77,
      },
    ],
    turnId: "system-starfall-turn",
    createdAt: now + 78,
  });
  const avatarMigrationWorkspaceId = "workspace-avatar-migration";
  const avatarMigrationMaterialized = createTavernRoomFromSystemPreset(
    avatarMigrationWorkspaceId,
    "fogbound-archive-inquest",
    {
      roomId: "system-avatar-migration-room",
      createdAt: now + 79,
    },
  );
  const avatarMigrationPreviousWindow = globalThis.window;
  const avatarMigrationLocalStorageStub = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
  globalThis.window = avatarMigrationPreviousWindow ?? { localStorage: avatarMigrationLocalStorageStub };
  const avatarMigrationState = await saveTavernState("", avatarMigrationWorkspaceId, {
    version: 2,
    activeRoomId: avatarMigrationMaterialized.room.id,
    rooms: [{
      ...avatarMigrationMaterialized.room,
      systemPresetVersion: 1,
      localCharacters: avatarMigrationMaterialized.room.localCharacters.map((character, index) => ({
        ...character,
        avatar: ["📚", "🧭", "🌫️", "✉️"][index] ?? "📚",
        systemPresetCharacterId: undefined,
      })),
    }],
    messagesByScene: {
      [avatarMigrationMaterialized.room.activeSceneId ?? avatarMigrationMaterialized.room.id]:
        avatarMigrationMaterialized.messages,
    },
  });
  if (avatarMigrationPreviousWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = avatarMigrationPreviousWindow;
  }
  const avatarMigrationRoom = avatarMigrationState.rooms.find((room) =>
    room.id === avatarMigrationMaterialized.room.id
  );
  const legacyCleanupWorkspaceId = "workspace-legacy-cleanup";
  const legacyManualRoom = {
    ...createTavernRoom(legacyCleanupWorkspaceId, 1),
    id: "legacy-cleanup-manual",
    title: "手动保留房间",
  };
  const legacySystemRoom = {
    ...createTavernRoom(legacyCleanupWorkspaceId, 2),
    id: "legacy-cleanup-system",
    title: "雾港失物馆",
    systemPresetId: "mist-harbor-lost-and-found",
  };
  const legacyManualizedRoom = {
    ...createTavernRoom(legacyCleanupWorkspaceId, 3),
    id: "legacy-cleanup-manualized",
    title: "竹雨驿馆",
    systemPresetId: undefined,
  };
  const previousWindow = globalThis.window;
  const localStorageStub = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
  globalThis.window = previousWindow ?? { localStorage: localStorageStub };
  const legacyCleanupState = await saveTavernState("", legacyCleanupWorkspaceId, {
    version: 2,
    activeRoomId: legacySystemRoom.id,
    rooms: [legacySystemRoom, legacyManualizedRoom, legacyManualRoom],
    messagesByScene: {
      [legacySystemRoom.activeSceneId ?? legacySystemRoom.id]: [],
      [legacyManualizedRoom.activeSceneId ?? legacyManualizedRoom.id]: [],
      [legacyManualRoom.activeSceneId ?? legacyManualRoom.id]: [],
    },
  });
  if (previousWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = previousWindow;
  }
  let promptPresetImportError = "";
  try {
    parseTavernExternalImportJson(JSON.stringify({
      chat_completion_source: "openai",
      prompts: [{ identifier: "main", content: "提示词预设" }],
    }));
  } catch (error) {
    promptPresetImportError = error instanceof Error ? error.message : String(error);
  }
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
      avatarMigration: {
        avatars: avatarMigrationRoom?.localCharacters.map((character) => character.avatar) ?? [],
        systemPresetCharacterIds:
          avatarMigrationRoom?.localCharacters.map((character) => character.systemPresetCharacterId) ?? [],
      },
      fogbound: {
        room: fogboundRoom,
        avatarIds: fogboundRoom.localCharacters.map((character) => character.avatar),
        characterCount: fogboundMaterialized.characters.length,
        scenesCount: fogboundRoom.scenes?.length ?? 0,
        lorebookCount: fogboundRoom.lorebookEntries.length,
        timelineCount: fogboundRoom.timelineEvents.length,
        messageProfiles: fogboundMaterialized.messages.map((message) => message.presentationProfileId),
        hasMappedCharacterRelationship: fogboundMaterialized.characters.some((character) =>
          character.relationships.some((relationship) =>
            relationship.target.type === "character" &&
            ["fog-mu", "fog-luo", "fog-qin", "fog-han"].includes(relationship.target.characterId)
          )
        ),
        hasUnmappedPresetRelationship: fogboundMaterialized.characters.some((character) =>
          character.relationships.some((relationship) =>
            relationship.target.type === "character" &&
            relationship.target.characterId.startsWith("fo-")
          )
        ),
        caseClarityBefore: getTavernStatusSnapshotValue(
          fogboundRoom.statusSnapshot,
          { type: "scene" },
          "case_clarity",
        ),
        caseClarityAfter: getTavernStatusSnapshotValue(
          fogboundAdvance.statusSnapshot,
          { type: "scene" },
          "case_clarity",
        ),
        witnessSafetyBefore: getTavernStatusSnapshotValue(
          fogboundRoom.statusSnapshot,
          { type: "global" },
          "witness_safety",
        ),
        verifyTaskStatus: fogboundAdvance.taskSnapshot["fo-verify-tide-clock"]?.status,
        outcomeStatus: fogboundAdvance.outcomeEvents.find((event) =>
          event.outcomeId === "fo-truth-reconstructed"
        )?.status,
      },
      ember: {
        room: emberRoom,
        avatarIds: emberRoom.localCharacters.map((character) => character.avatar),
        characterCount: emberMaterialized.characters.length,
        scenesCount: emberRoom.scenes?.length ?? 0,
        lorebookCount: emberRoom.lorebookEntries.length,
        timelineCount: emberRoom.timelineEvents.length,
        allianceBefore: getTavernStatusSnapshotValue(
          emberRoom.statusSnapshot,
          { type: "scene" },
          "alliance_stability",
        ),
        allianceAfter: getTavernStatusSnapshotValue(
          emberAdvance.statusSnapshot,
          { type: "scene" },
          "alliance_stability",
        ),
        waterBefore: getTavernStatusSnapshotValue(
          emberRoom.statusSnapshot,
          { type: "global" },
          "water_security",
        ),
        waterAfter: getTavernStatusSnapshotValue(
          emberAdvance.statusSnapshot,
          { type: "global" },
          "water_security",
        ),
        yanTrustBefore: getTavernStatusSnapshotValue(
          emberRoom.statusSnapshot,
          { type: "relationship", subject: emberYanRef, object: userRef },
          "trust_to_mediator",
        ),
        trustStatusEvent: emberAdvance.statusEvents.find((event) =>
          event.statusId === "trust_to_mediator"
        )?.status,
        waterTaskStatus: emberAdvance.taskSnapshot["em-seal-water-truce"]?.status,
        outcomeStatus: emberAdvance.outcomeEvents.find((event) =>
          event.outcomeId === "em-alliance-formed"
        )?.status,
      },
      starfall: {
        room: starfallRoom,
        avatarIds: starfallRoom.localCharacters.map((character) => character.avatar),
        characterCount: starfallMaterialized.characters.length,
        scenesCount: starfallRoom.scenes?.length ?? 0,
        lorebookCount: starfallRoom.lorebookEntries.length,
        timelineCount: starfallRoom.timelineEvents.length,
        performanceBefore: getTavernStatusSnapshotValue(
          starfallRoom.statusSnapshot,
          { type: "scene" },
          "performance_integrity",
        ),
        performanceAfter: getTavernStatusSnapshotValue(
          starfallAdvance.statusSnapshot,
          { type: "scene" },
          "performance_integrity",
        ),
        cursePressureBefore: getTavernStatusSnapshotValue(
          starfallRoom.statusSnapshot,
          { type: "global" },
          "curse_pressure",
        ),
        voiceBefore: getTavernStatusSnapshotValue(
          starfallRoom.statusSnapshot,
          { type: "character", characterId: "opera-shen" },
          "voice_stability",
        ),
        voiceStatusEvent: starfallAdvance.statusEvents.find((event) =>
          event.statusId === "voice_stability"
        )?.status,
        stageTaskStatus: starfallAdvance.taskSnapshot["so-secure-seventh-scene"]?.status,
        outcomeStatus: starfallAdvance.outcomeEvents.find((event) =>
          event.outcomeId === "so-seventh-scene-saved"
        )?.status,
        replyOptionTargetIds: starfallAdvance.replyOptions.flatMap((option) => option.targetCharacterIds),
      },
      legacyCleanup: {
        activeRoomId: legacyCleanupState.activeRoomId,
        roomTitles: legacyCleanupState.rooms.map((item) => item.title),
        roomIds: legacyCleanupState.rooms.map((item) => item.id),
      },
    },
    imports: {
      sillyWorldBookEntries,
      sillyWorldBookImport,
      sillyCharacterImport,
      interactiveScriptImport,
      interactiveScriptMaterialized,
      promptPresetImportError,
    },
  };
  globalThis.__checks = {
    contextForA,
    currentTurnContextForA,
    promptForA,
    styledPromptForA,
    styledTurnInstructionForA,
    narrativePromptForA,
    narrativeTurnInstructionForA,
    narrativeBeatReply,
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
    directorProfilePrompt,
    schedulingSignalsPrompt,
    randomEventOpportunityChecks,
    progressChecks,
    roleAssignmentChecks,
    progressVisibilityChecks,
    outcomeResolutionChecks,
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
    checks.styledPromptForA.includes("prompt_style id=\"wuxia\"") &&
      checks.styledPromptForA.includes("角色写作风格：用冷峻短句写可观察动作。") &&
      checks.styledPromptForA.includes("角色级回复规则：每次回复保留江湖身份分寸，不自称旁白。") &&
      checks.styledTurnInstructionForA.includes("房间提示词风格：武侠风格") &&
      checks.styledTurnInstructionForA.includes("当前角色回复规则：每次回复保留江湖身份分寸，不自称旁白。"),
    "系统提示词风格和角色级 prompt 必须进入角色请求上下文与 turn instruction",
    {
      prompt: checks.styledPromptForA,
      turnInstruction: checks.styledTurnInstructionForA,
    },
  );
  assert(
    checks.narrativePromptForA.includes("<narrative_beat> 写一段第三人称叙事片段") &&
      checks.narrativeTurnInstructionForA.includes("<narrative_beat> 写一段围绕阿洛的第三人称小说正文") &&
      checks.narrativeBeatReply.contentKind === "narrative_beat" &&
      checks.narrativeBeatReply.content.includes("阿洛把披风拢紧") &&
      checks.narrativeContextForA.includes("<narrative_beat>") &&
      checks.narrativeRuntimeHistory.includes("<history_narrative_beat>"),
    "第三人称/小说呈现模式应使用 narrative_beat 生成合同、解析结果和历史上下文",
    {
      prompt: checks.narrativePromptForA,
      turnInstruction: checks.narrativeTurnInstructionForA,
      parsed: checks.narrativeBeatReply,
      context: checks.narrativeContextForA,
      history: checks.narrativeRuntimeHistory,
    },
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
      checks.progressChecks.generated.room.promptStyleId === "light-novel" &&
      checks.progressChecks.generated.room.creationSource === "quick" &&
      checks.progressChecks.generated.room.settings.randomEvents.enabled &&
      checks.progressChecks.generated.room.settings.randomEvents.probability === 0.25 &&
      checks.progressChecks.generated.room.settings.illustrationHints.enabled,
    "生成 JSON 导入应保留快速创建来源、提示词风格和高级房间设置",
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
      "fogbound-archive-inquest|ember-market-alliance|starfall-opera-rehearsal" &&
      checks.progressChecks.systemPresets.defaultStateRoomCount === 3 &&
      checks.progressChecks.systemPresets.defaultStateRoomTitles.includes("雾港档案馆问询") &&
      checks.progressChecks.systemPresets.defaultStateRoomTitles.includes("余烬集市同盟") &&
      checks.progressChecks.systemPresets.defaultStateRoomTitles.includes("星坠歌剧院彩排") &&
      !checks.progressChecks.systemPresets.defaultStateRoomTitles.includes("雾港失物馆") &&
      !checks.progressChecks.systemPresets.defaultStateRoomTitles.includes("月下圆桌狼人杀"),
    "系统预设应只包含新的三个完整剧本，并移除旧预设房间",
    checks.progressChecks.systemPresets,
  );
  assert(
    checks.progressChecks.systemPresets.invalidAvatarIds.length === 0 &&
      new Set(checks.progressChecks.systemPresets.fogbound.avatarIds).size === 4 &&
      new Set(checks.progressChecks.systemPresets.ember.avatarIds).size === 4 &&
      new Set(checks.progressChecks.systemPresets.starfall.avatarIds).size === 4 &&
      checks.progressChecks.systemPresets.avatarMigration.avatars.join("|") ===
        "tavern-05|tavern-03|tavern-02|tavern-06" &&
      checks.progressChecks.systemPresets.avatarMigration.systemPresetCharacterIds.join("|") ===
        "fo-mu-qingyan|fo-luo-yunfan|fo-qin-suye|fo-han-ruosheng",
    "系统预设角色头像必须使用已注册头像资源，且已保存的旧预设房间应能按当前预设回填头像",
    checks.progressChecks.systemPresets,
  );
  assert(
    checks.progressChecks.systemPresets.legacyCleanup.activeRoomId === "legacy-cleanup-manual" &&
      checks.progressChecks.systemPresets.legacyCleanup.roomTitles.includes("手动保留房间") &&
      !checks.progressChecks.systemPresets.legacyCleanup.roomTitles.includes("雾港失物馆") &&
      !checks.progressChecks.systemPresets.legacyCleanup.roomTitles.includes("竹雨驿馆") &&
      !checks.progressChecks.systemPresets.legacyCleanup.roomTitles.includes("月下圆桌狼人杀") &&
      !checks.progressChecks.systemPresets.legacyCleanup.roomTitles.includes("心动争夺赛：谁先赢得你") &&
      !checks.progressChecks.systemPresets.legacyCleanup.roomTitles.includes("双人攻略：你先打动谁") &&
      !checks.progressChecks.systemPresets.legacyCleanup.roomTitles.includes("刀雨驿站") &&
      checks.progressChecks.systemPresets.legacyCleanup.roomTitles.includes("雾港档案馆问询") &&
      checks.progressChecks.systemPresets.legacyCleanup.roomTitles.includes("余烬集市同盟") &&
      checks.progressChecks.systemPresets.legacyCleanup.roomTitles.includes("星坠歌剧院彩排"),
    "加载旧酒馆状态时应清理旧系统预设残留，同时保留手动房间并补齐新预设",
    checks.progressChecks.systemPresets.legacyCleanup,
  );
  assert(
    checks.progressChecks.systemPresets.fogbound.room.presentation.profileId === "third-person-prose" &&
      checks.progressChecks.systemPresets.fogbound.room.promptStyleId === "grounded" &&
      checks.progressChecks.systemPresets.fogbound.room.settings.informationPolicy.mode === "mystery" &&
      checks.progressChecks.systemPresets.fogbound.room.settings.informationPolicy.hideCharacterThoughts &&
      checks.progressChecks.systemPresets.fogbound.room.settings.informationPolicy.hiddenFacts.enabled &&
      checks.progressChecks.systemPresets.fogbound.characterCount === 4 &&
      checks.progressChecks.systemPresets.fogbound.scenesCount === 3 &&
      checks.progressChecks.systemPresets.fogbound.lorebookCount >= 4 &&
      checks.progressChecks.systemPresets.fogbound.timelineCount >= 4 &&
      checks.progressChecks.systemPresets.fogbound.messageProfiles.every((profileId) =>
        profileId === "third-person-prose"
      ) &&
      checks.progressChecks.systemPresets.fogbound.hasMappedCharacterRelationship &&
      !checks.progressChecks.systemPresets.fogbound.hasUnmappedPresetRelationship &&
      checks.progressChecks.systemPresets.fogbound.caseClarityBefore === 20 &&
      checks.progressChecks.systemPresets.fogbound.caseClarityAfter === 55 &&
      checks.progressChecks.systemPresets.fogbound.witnessSafetyBefore === 55 &&
      checks.progressChecks.systemPresets.fogbound.verifyTaskStatus === "completed" &&
      checks.progressChecks.systemPresets.fogbound.outcomeStatus === "pending",
    "雾港预设应完整映射第三人称旁白、关系、世界书、多场景和调查进度规则",
    checks.progressChecks.systemPresets.fogbound,
  );
  assert(
    checks.progressChecks.systemPresets.ember.room.presentation.profileId === "dialogue-chat" &&
      checks.progressChecks.systemPresets.ember.room.promptStyleId === "dramatic" &&
      checks.progressChecks.systemPresets.ember.room.settings.informationPolicy.mode === "open" &&
      checks.progressChecks.systemPresets.ember.characterCount === 4 &&
      checks.progressChecks.systemPresets.ember.scenesCount === 3 &&
      checks.progressChecks.systemPresets.ember.lorebookCount >= 3 &&
      checks.progressChecks.systemPresets.ember.timelineCount >= 4 &&
      checks.progressChecks.systemPresets.ember.allianceBefore === 30 &&
      checks.progressChecks.systemPresets.ember.allianceAfter === 60 &&
      checks.progressChecks.systemPresets.ember.waterBefore === 35 &&
      checks.progressChecks.systemPresets.ember.waterAfter === 75 &&
      checks.progressChecks.systemPresets.ember.yanTrustBefore === 40 &&
      ["pending", "applied"].includes(checks.progressChecks.systemPresets.ember.trustStatusEvent) &&
      checks.progressChecks.systemPresets.ember.waterTaskStatus === "completed" &&
      checks.progressChecks.systemPresets.ember.outcomeStatus === "pending",
    "余烬集市预设应完整映射对话演绎、关系信任、水塔协议任务和谈判进度规则",
    checks.progressChecks.systemPresets.ember,
  );
  assert(
    checks.progressChecks.systemPresets.starfall.room.presentation.profileId === "novel-prose" &&
      checks.progressChecks.systemPresets.starfall.room.promptStyleId === "novel" &&
      checks.progressChecks.systemPresets.starfall.room.settings.informationPolicy.mode === "mystery" &&
      checks.progressChecks.systemPresets.starfall.characterCount === 4 &&
      checks.progressChecks.systemPresets.starfall.scenesCount === 3 &&
      checks.progressChecks.systemPresets.starfall.lorebookCount >= 4 &&
      checks.progressChecks.systemPresets.starfall.timelineCount >= 4 &&
      checks.progressChecks.systemPresets.starfall.performanceBefore === 55 &&
      checks.progressChecks.systemPresets.starfall.performanceAfter === 80 &&
      checks.progressChecks.systemPresets.starfall.cursePressureBefore === 65 &&
      checks.progressChecks.systemPresets.starfall.voiceBefore === 40 &&
      ["pending", "applied"].includes(checks.progressChecks.systemPresets.starfall.voiceStatusEvent) &&
      checks.progressChecks.systemPresets.starfall.stageTaskStatus === "completed" &&
      checks.progressChecks.systemPresets.starfall.outcomeStatus === "pending" &&
      checks.progressChecks.systemPresets.starfall.replyOptionTargetIds.includes("opera-lu") &&
      checks.progressChecks.systemPresets.starfall.replyOptionTargetIds.includes("opera-shen"),
    "星坠预设应完整映射小说正文、舞台状态、角色行动选项和第七场任务结局",
    checks.progressChecks.systemPresets.starfall,
  );
  assert(
    checks.progressChecks.imports.sillyWorldBookEntries.length === 2 &&
      checks.progressChecks.imports.sillyWorldBookEntries[0].title === "信使铜牌" &&
      checks.progressChecks.imports.sillyWorldBookEntries[0].keywords.includes("铜牌") &&
      checks.progressChecks.imports.sillyWorldBookEntries[0].keywords.includes("信使") &&
      checks.progressChecks.imports.sillyWorldBookEntries[0].alwaysOn &&
      checks.progressChecks.imports.sillyWorldBookEntries[1].enabled === false,
    "SillyTavern 世界书应映射为通用世界书条目，并保留关键词、常驻和禁用状态",
    checks.progressChecks.imports.sillyWorldBookEntries,
  );
  assert(
    checks.progressChecks.imports.sillyWorldBookImport.kind === "worldBook" &&
      checks.progressChecks.imports.sillyWorldBookImport.entries[0].title === "旧灯",
    "外部导入解析器应识别 SillyTavern 世界书",
    checks.progressChecks.imports.sillyWorldBookImport,
  );
  assert(
    checks.progressChecks.imports.sillyCharacterImport.kind === "characterCard" &&
      checks.progressChecks.imports.sillyCharacterImport.preset.characters[0].name === "铃央" &&
      checks.progressChecks.imports.sillyCharacterImport.preset.room.scene.includes("信使失踪") &&
      checks.progressChecks.imports.sillyCharacterImport.preset.room.lorebookEntries[0].title === "灯芯" &&
      checks.progressChecks.imports.sillyCharacterImport.preset.messages[0].role === "character",
    "SillyTavern 角色卡应转换成标准生成预设，包含角色、场景、世界书和开场消息",
    checks.progressChecks.imports.sillyCharacterImport,
  );
  assert(
    checks.progressChecks.imports.interactiveScriptImport.kind === "generatedPreset" &&
      checks.progressChecks.imports.interactiveScriptMaterialized.room.settings.informationPolicy.mode === "social_deduction" &&
      checks.progressChecks.imports.interactiveScriptMaterialized.room.settings.informationPolicy.roleAssignment.rolePool.length === 2 &&
      checks.progressChecks.imports.interactiveScriptMaterialized.room.factEvents.some((event) =>
        event.visibleToUser && event.visibility === "private"
      ) &&
      checks.progressChecks.imports.interactiveScriptMaterialized.room.taskDefinitions.length === 1 &&
      checks.progressChecks.imports.interactiveScriptMaterialized.room.sceneOutcomes.length === 1,
    "互动剧本 JSON 应转换成新酒馆结构，保留身份池、私有事实、状态、任务和结局",
    checks.progressChecks.imports.interactiveScriptMaterialized,
  );
  assert(
    checks.progressChecks.imports.promptPresetImportError.includes("提示词预设"),
    "提示词预设应被明确拒绝，避免误导入为酒馆数据",
    checks.progressChecks.imports.promptPresetImportError,
  );

  console.log(JSON.stringify({ ok: true, checks: checks.roleIds }, null, 2));
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
