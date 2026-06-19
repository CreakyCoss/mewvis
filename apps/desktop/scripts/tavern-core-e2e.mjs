import { build } from "esbuild";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workspaceRoot = process.cwd();
const tempDir = mkdtempSync(join(tmpdir(), "novel-claw-tavern-core-e2e-"));
const entryPath = join(tempDir, "runner.ts");
const bundledPath = join(tempDir, "runner.mjs");
const corePath = resolve(workspaceRoot, "src/features/pages/tavern/core/index.ts");
const directorDecisionPath = resolve(workspaceRoot, "src/features/pages/tavern/runtime/director-decision.ts");
const promptPath = resolve(workspaceRoot, "src/features/pages/tavern/runtime/prompt.ts");
const replyCleanupPath = resolve(workspaceRoot, "src/features/pages/tavern/runtime/reply-cleanup.ts");
const storagePath = resolve(workspaceRoot, "src/features/pages/tavern/storage.ts");

const assert = (condition, message, details) => {
  if (!condition) {
    const suffix = details === undefined ? "" : `\n${JSON.stringify(details, null, 2)}`;
    throw new Error(`${message}${suffix}`);
  }
};

writeFileSync(entryPath, `
  import {
    advanceTavernProgressFromFactEvents,
    applyTavernStatusEventsToSnapshot,
    createEmptyTavernStatusSnapshot,
    createTavernProgressCheckpoint,
    createTavernRenderableMessages,
    deriveTavernStatusEventsFromFacts,
    evaluateTavernSceneOutcomes,
    extractTavernPendingInteractionsFromMessages,
    formatTavernVisibleMessagesForRequestContext,
    getTavernStatusSnapshotValue,
    normalizeTavernMessagesForAudience,
    planTavernContinuation,
    rebuildTavernProgressFromHistory,
    resolveTavernPendingStatusEvent,
    setTavernStatusSnapshotValue,
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
    createTavernRoom,
    DEFAULT_TAVERN_SCENE_OUTCOMES,
    DEFAULT_TAVERN_STATUS_DEFINITIONS,
    DEFAULT_TAVERN_STATUS_RULES,
    DEFAULT_TAVERN_TASK_DEFINITIONS,
    syncTavernRoomActiveScene,
  } from ${JSON.stringify(storagePath)};
  import {
    parseTavernDirectorDecision,
    shouldOfferTavernDirectorRandomEvent,
  } from ${JSON.stringify(directorDecisionPath)};
  import { buildTavernSystemPrompt } from ${JSON.stringify(promptPath)};
  import { parseTavernReplyText } from ${JSON.stringify(replyCleanupPath)};

  const now = Date.now();
  const userRef = { type: "user", userId: "user" };
  const charARef = { type: "character", characterId: "char-a" };
  const charBRef = { type: "character", characterId: "char-b" };
  const bossRef = { type: "character", characterId: "boss" };
  const globalRef = { type: "global" };
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
    },
    createdAt: now,
    updatedAt: now,
  };
  const characters = [
    {
      id: "char-a",
      name: "阿洛",
      avatar: "",
      description: "谨慎的斥候。",
      speakingStyle: "短句，谨慎。",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "char-b",
      name: "贝拉",
      avatar: "",
      description: "热情的酒保。",
      speakingStyle: "轻快。",
      createdAt: now,
      updatedAt: now,
    },
  ];
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
    defaultDefinitions: {
      statusRuleIds: DEFAULT_TAVERN_STATUS_RULES.map((rule) => rule.id),
      statusDefinitionIds: DEFAULT_TAVERN_STATUS_DEFINITIONS.map((definition) => definition.id),
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
  };
  globalThis.__checks = {
    contextForA,
    currentTurnContextForA,
    promptForA,
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
    randomEventOpportunityChecks,
    progressChecks,
    renderable: createTavernRenderableMessages({
      messages,
      characters,
      userPersonaName: room.userPersonaName,
    }),
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
      checks.progressChecks.defaultDefinitions.roomTaskIds.includes("stabilize-scene-threat") &&
      checks.progressChecks.defaultDefinitions.roomOutcomeIds.includes("scene-stabilized-success"),
    "默认酒馆应包含场景威胁规则、任务和结局定义",
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

  console.log(JSON.stringify({ ok: true, checks: checks.roleIds }, null, 2));
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
