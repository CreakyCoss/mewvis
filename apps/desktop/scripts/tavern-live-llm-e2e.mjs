import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const workspaceRoot = process.cwd();
const bridgePath = join(workspaceRoot, "agent-bridge/dist/index.js");
const configDbPath = process.env.NOVEL_CLAW_CONFIG_DB?.trim()
  || join(homedir(), ".novel-claw", "config.db");
const workspacePath = mkdtempSync(join(tmpdir(), "novel-claw-tavern-live-llm-e2e-"));
const helperEntryPath = join(workspacePath, "tavern-live-helper.ts");
const helperBundlePath = join(workspacePath, "tavern-live-helper.mjs");
const runMarker = `TAVERN_LIVE_${Date.now()}`;

const SPEED_MODEL_IDS = [
  "MiniMax-M3-highspeed",
  "MiniMax-M2.7-highspeed",
];
const LIVE_TIMEOUT_MS = Number(process.env.NOVEL_CLAW_TAVERN_LIVE_TIMEOUT_MS ?? 10 * 60 * 1000);
const SPEED_TIMEOUT_MS = Number(process.env.NOVEL_CLAW_TAVERN_SPEED_TIMEOUT_MS ?? 90 * 1000);
const FLOW_TIMEOUT_MS = Number(process.env.NOVEL_CLAW_TAVERN_FLOW_TIMEOUT_MS ?? 10 * 60 * 1000);
const FLOW_ROUNDS = Number(process.env.NOVEL_CLAW_TAVERN_LIVE_ROUNDS ?? 5);
const PROMPT_VARIANT = process.env.NOVEL_CLAW_TAVERN_PROMPT_VARIANT?.trim() || "xml_contract";
const PRESENTATION_PROFILE_ID = process.env.NOVEL_CLAW_TAVERN_PRESENTATION_PROFILE?.trim() ||
  "dialogue-chat";
const THINKING_LEVEL = process.env.NOVEL_CLAW_LIVE_THINKING?.trim() || "off";
const TARGET_SILENCE_CASE = process.env.NOVEL_CLAW_TAVERN_TARGET_SILENCE_CASE === "1";
const DIRECT_USER_INPUT = process.env.NOVEL_CLAW_TAVERN_DIRECT_USER_INPUT === "1";
const ASSERT_GAME_VICTORY = process.env.NOVEL_CLAW_TAVERN_ASSERT_VICTORY === "1";
const LIVE_PROGRESS_VALUE = Number(process.env.NOVEL_CLAW_TAVERN_PROGRESS_VALUE ?? 4);
const SUMMARY_ONLY = process.env.NOVEL_CLAW_TAVERN_SUMMARY_ONLY === "1";

const MODEL_DEFAULTS = {
  "MiniMax-M3-highspeed": {
    provider: "minimax-cn",
    apiFormat: "anthropic-messages",
    catalogModelId: "MiniMax-M3",
    modelId: "MiniMax-M3-highspeed",
    apiEndpoint: "https://api.minimaxi.com/anthropic",
    reasoning: true,
    input: ["text", "image"],
    cost: {
      input: 0.6,
      output: 2.4,
      cacheRead: 0.12,
      cacheWrite: 0,
    },
    contextWindow: 1_000_000,
    maxTokens: 128_000,
  },
  "MiniMax-M2.7-highspeed": {
    provider: "minimax-cn",
    apiFormat: "anthropic-messages",
    catalogModelId: "MiniMax-M2.7-highspeed",
    modelId: "MiniMax-M2.7-highspeed",
    apiEndpoint: "https://api.minimaxi.com/anthropic",
    reasoning: true,
    input: ["text"],
    cost: {
      input: 0.6,
      output: 2.4,
      cacheRead: 0.06,
      cacheWrite: 0.375,
    },
    contextWindow: 204_800,
    maxTokens: 131_072,
  },
};

if (!existsSync(bridgePath)) {
  throw new Error("agent-bridge/dist/index.js 不存在，请先运行 pnpm build:agent-bridge");
}
if (!existsSync(configDbPath)) {
  throw new Error(`配置库不存在：${configDbPath}`);
}

const safeDetails = (value) =>
  JSON.parse(JSON.stringify(value, (key, item) => {
    if (key === "apiKey" || key === "api_key") {
      return item ? "<redacted>" : item;
    }
    return item;
  }));

const assert = (condition, message, details) => {
  if (!condition) {
    const suffix = details === undefined ? "" : `\n${JSON.stringify(safeDetails(details), null, 2)}`;
    throw new Error(`${message}${suffix}`);
  }
};

const log = (...args) => {
  console.error("[tavern-live]", ...args);
};

const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;

const queryConfigDb = (query) => {
  const output = execFileSync("sqlite3", ["-json", configDbPath, query], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(output || "[]");
};

const loadMiniMaxProvider = () => {
  const [row] = queryConfigDb([
    "select",
    "id, provider, api_format as apiFormat, api_key as apiKey, api_endpoint as apiEndpoint",
    "from llm_providers",
    "where provider = 'minimax-cn'",
    "and coalesce(api_key, '') <> ''",
    "order by is_default desc",
    "limit 1",
  ].join(" "));
  assert(row, "未在 ~/.novel-claw/config.db 中找到已配置 API Key 的 minimax-cn provider");
  return row;
};

const loadProviderModelRow = (providerId, modelId) => {
  const [row] = queryConfigDb([
    "select",
    "model_id as modelId, model_name as modelName, is_one_million_context as isOneMillionContext",
    "from provider_models",
    `where provider_id = ${sqlString(providerId)}`,
    `and model_id = ${sqlString(modelId)}`,
    "limit 1",
  ].join(" "));
  return row ?? null;
};

const miniMaxProvider = loadMiniMaxProvider();

const runtimeModelFor = (modelId) => {
  const defaults = MODEL_DEFAULTS[modelId];
  assert(defaults, `未知测速模型：${modelId}`);
  const modelRow = loadProviderModelRow(miniMaxProvider.id, modelId);

  return {
    ...defaults,
    provider: miniMaxProvider.provider || defaults.provider,
    apiFormat: miniMaxProvider.apiFormat || defaults.apiFormat,
    apiEndpoint: miniMaxProvider.apiEndpoint || defaults.apiEndpoint,
    apiKey: miniMaxProvider.apiKey,
    modelId,
    modelName: modelRow?.modelName || defaults.modelId,
    thinkingLevel: THINKING_LEVEL,
    contextWindow: Number(modelRow?.isOneMillionContext) === 1
      ? 1_000_000
      : defaults.contextWindow,
  };
};

writeFileSync(helperEntryPath, `
  import { buildTavernReplyAgentRequest } from ${JSON.stringify(resolve(workspaceRoot, "src/features/pages/tavern/runtime/reply-request.ts"))};
  import { buildTavernCharacterTurnInstruction } from ${JSON.stringify(resolve(workspaceRoot, "src/features/pages/tavern/runtime/turn-instruction.ts"))};
  import { buildTavernBridgeSystemPrompt } from ${JSON.stringify(resolve(workspaceRoot, "src/features/pages/tavern/runtime/bridge-prompt.ts"))};
  import {
    hasTavernReplyDialogueText,
    parseTavernReplyText,
  } from ${JSON.stringify(resolve(workspaceRoot, "src/features/pages/tavern/runtime/reply-cleanup.ts"))};
  import {
    advanceTavernProgressFromFactEvents,
    canTavernCharacterUseNonverbalReply,
    canTavernSelectedTargetsStaySilent,
    createTavernRoleAssignmentFactEvents,
    extractTavernPendingInteractionsFromMessages,
    filterTavernFactEventsForAudience,
    formatTavernDirectorSchedulingInstruction,
    formatTavernVisibleMessagesForRequestContext,
    isTavernDirectorOnlyTurnAllowed,
    isTavernFixedOrderPhase,
    normalizeTavernMessagesForAudience,
    planTavernContinuation,
    resolveTavernScheduledSpeakers,
    setTavernStatusSnapshotValue,
    shouldSuppressTavernAutoContinuation,
    tavernBridgeSessionRootDir,
    tavernDirectorAgentRoleId,
    tavernManagedUserAgentRoleId,
  } from ${JSON.stringify(resolve(workspaceRoot, "src/features/pages/tavern/core/index.ts"))};
  import {
    createTavernRoomFromSystemPreset,
  } from ${JSON.stringify(resolve(workspaceRoot, "src/features/pages/tavern/storage.ts"))};
  import { getTavernPresentationProfile } from ${JSON.stringify(resolve(workspaceRoot, "src/features/pages/tavern/presentation-profiles.ts"))};
  import { getTavernPresentationContract } from ${JSON.stringify(resolve(workspaceRoot, "src/features/pages/tavern/presentation-contracts.ts"))};
  import {
    formatTavernLorebookEntries,
    formatTavernStoryGraphContext,
    selectTavernLorebookEntries,
    tavernMessagesToRuntimeMessages,
  } from ${JSON.stringify(resolve(workspaceRoot, "src/features/pages/tavern/runtime/prompt.ts"))};
  import { formatTavernRuntimeMessagesForSummary } from ${JSON.stringify(resolve(workspaceRoot, "src/features/pages/tavern/runtime/conversation.ts"))};

  const now = Date.now();
  const livePresentationProfile = getTavernPresentationProfile(
    process.env.NOVEL_CLAW_TAVERN_PRESENTATION_PROFILE?.trim() || "dialogue-chat",
  );
  const livePresentationContract = getTavernPresentationContract(livePresentationProfile);

  const applyLivePresentation = (room) => ({
    ...room,
    presentation: {
      profileId: livePresentationProfile.id,
      profileVersion: 1,
    },
  });

  export const canSelectedTargetsStaySilent = canTavernSelectedTargetsStaySilent;
  export const canCharacterUseNonverbalReply = canTavernCharacterUseNonverbalReply;
  export const advanceProgressFromFacts = advanceTavernProgressFromFactEvents;
  export const livePresentation = {
    profileId: livePresentationProfile.id,
    label: livePresentationProfile.label,
    publicContentTag: livePresentationContract.publicContentTag,
    characterMessageKind: livePresentationContract.characterMessageKind,
    allowsContentOnlyReply: livePresentationContract.allowsContentOnlyReply,
  };

  export const createFixture = () => {
    const fixtureMode = process.env.NOVEL_CLAW_TAVERN_LIVE_FIXTURE?.trim() || "custom";
    if (fixtureMode === "werewolf") {
      const materialized = createTavernRoomFromSystemPreset("live-workspace", "moonlit-werewolf-table", {
        roomId: "live-werewolf-room",
        createdAt: now,
        characterIdByPresetId: new Map([
          ["qiao-yu", "wolf-qiao"],
          ["shen-mo", "wolf-shen"],
          ["tan-luo", "wolf-tan"],
          ["lin-yao", "wolf-lin"],
          ["bai-shan", "wolf-bai"],
        ]),
        markAsSystemPreset: false,
      });
      return {
        scenario: "werewolf",
        room: applyLivePresentation(materialized.room),
        characters: materialized.characters,
        messages: materialized.messages,
      };
    }

    if (fixtureMode === "win-hearts") {
      const materialized = createTavernRoomFromSystemPreset("live-workspace", "win-their-hearts-duel", {
        roomId: "live-win-hearts-room",
        createdAt: now,
        characterIdByPresetId: new Map([
          ["ye-xiaoman", "route-ye"],
          ["liu-qingshuang", "route-liu"],
        ]),
        markAsSystemPreset: false,
      });
      return {
        scenario: "win-hearts",
        room: applyLivePresentation(materialized.room),
        characters: materialized.characters,
        messages: materialized.messages,
      };
    }

    const room = {
      id: "live-room-alpha",
      workspaceId: "live-workspace",
      locked: false,
      title: "身份边界测试酒馆",
      presentation: {
        profileId: livePresentationProfile.id,
        profileVersion: 1,
      },
      storyOutline: "五名角色在风雨夜的酒馆分工守望，必须保持各自身份、岗位和发言边界。",
      storyGoal: "确认多轮多角色调度后不会串角色、不会泄露心理。",
      storyGraph: {
        version: 1,
        entryNodeId: "live-node-alpha",
        activeNodeId: "live-node-alpha",
        stages: [{
          id: "live-stage-alpha",
          title: "第一阶段",
          order: 0,
        }],
        nodes: [{
          id: "live-node-alpha",
          stageId: "live-stage-alpha",
          title: "风雨夜分工",
          summary: "五名角色在酒馆内分工守望。",
          type: "scene",
          pathRole: "main",
          position: { x: 120, y: 160 },
          status: "ready",
          createdAt: now,
          updatedAt: now,
        }],
        edges: [],
      },
      activeSceneId: "live-scene-alpha",
      scenes: [],
      scenePresetId: "tavern",
      scene: "屋内有旧木桌、吧台、炉火和窗边地图，门外有风，屋顶能看见远处灯影。",
      sceneGoal: "完成守门、屋顶观察、吧台照应、地图记录和炉火维护的分工。",
      scenePlot: "贝拉负责门口，阿洛负责屋顶，琪拉负责吧台物资，莫尔负责地图和路线，赛恩负责炉火与灯。",
      sceneDirection: "角色只说自己的公开发言，不替别人说话；未发言角色可以被导演安排公开动作描写。",
      sceneTransition: "",
      memory: "",
      sceneStatus: undefined,
      characterPublicStatuses: {},
      characterPrivateStatuses: {},
      pendingInteractions: [],
      replyOptions: [],
      statusDefinitions: [],
      statusRules: [],
      progressViews: [],
      progressTracker: {
        enabled: false,
        mode: "afterTurn",
        intervalTurns: 1,
        applyMode: "auto",
        factConfidenceThreshold: 0.75,
        generateCheckpointBeforeContextTrim: false,
      },
      factEvents: [],
      statusEvents: [],
      statusSnapshot: {
        turnId: "initial",
        global: {},
        scene: {},
        parties: {},
        characters: {},
        relationships: {},
        updatedAt: now,
      },
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
      illustrationHints: [],
      assetDrafts: [],
      characterIds: ["char-a", "char-b", "char-c", "char-d", "char-e"],
      activeCharacterId: "char-a",
      replyMode: "round",
      userPersonaName: "旅人",
      settings: {
        immersiveDescriptionEnabled: true,
        showExecutionTrace: false,
        autoAssetExtractionEnabled: false,
        assetExtractionIntervalTurns: 3,
        agentKnowledgeCompactIntervalTurns: 0,
        maxAssetDrafts: 5,
        directorMaxSpeakers: 4,
        directorScheduling: {
          targetedReplyPolicy: "prefer",
          maxExtraSpeakersOnTargetedReply: 2,
          allowDirectorOnly: false,
          directorOnlyPhaseStatusId: "",
          directorOnlyPhaseValues: [],
          fixedOrder: {
            enabled: false,
            phaseStatusId: "",
            phaseValues: [],
            stopAfterRound: false,
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
          uiDefaultView: "reveal",
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
            includeUser: true,
            revealToAssignedCharacter: true,
            revealFactionMembers: true,
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
        description: "谨慎的屋顶斥候，只汇报自己看见的高处动静。",
        speakingStyle: "短句，谨慎，不替别人说话。",
        goals: "守住屋顶观察点。",
        relationships: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "char-b",
        name: "贝拉",
        avatar: "",
        description: "热情的酒馆守门人，只汇报门口情况。",
        speakingStyle: "轻快直接，不替阿洛判断屋顶。",
        goals: "守住门口。",
        relationships: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "char-c",
        name: "琪拉",
        avatar: "",
        description: "细心的吧台照应者，只汇报酒馆内部、热汤和物资情况。",
        speakingStyle: "温和利落，常用短句确认物资和客人状态。",
        goals: "照看吧台、热汤和应急物资。",
        relationships: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "char-d",
        name: "莫尔",
        avatar: "",
        description: "沉稳的地图记录员，只根据地图和旅人路线发言。",
        speakingStyle: "克制、清楚，喜欢用方位和距离描述。",
        goals: "记录灯影、路线和风雨变化。",
        relationships: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "char-e",
        name: "赛恩",
        avatar: "",
        description: "寡言的炉火看守，只汇报炉火、灯光和室内安全。",
        speakingStyle: "简短稳定，很少主动扩展话题。",
        goals: "维持炉火、灯光和屋内安全。",
        relationships: [],
        createdAt: now,
        updatedAt: now,
      },
    ];
    return { scenario: "custom", room: applyLivePresentation(room), characters, messages: [] };
  };

  const expandRolePool = (rolePool) => rolePool.flatMap((role) =>
    Array.from({ length: Math.max(1, Math.round(role.count || 1)) }, () => role)
  );

  const roleAssignmentParticipants = (room, characters) => [
    ...(room.settings.informationPolicy.roleAssignment.includeUser
      ? [{
          entity: { type: "user", userId: "user" },
          label: room.userPersonaName?.trim() || "你",
          isUser: true,
        }]
      : []),
    ...characters.map((character) => ({
      entity: { type: "character", characterId: character.id },
      label: character.name,
      characterId: character.id,
      isUser: false,
    })),
  ];

  const participantKey = (participant) =>
    participant.isUser ? "user:user" : "character:" + participant.characterId;

  export const buildRoleAssignmentRequest = ({ room, characters }) => {
    const roleAssignment = room.settings.informationPolicy.roleAssignment;
    const participants = roleAssignmentParticipants(room, characters);
    const rolePool = expandRolePool(roleAssignment.rolePool);
    const prompt = [
      "<output_schema>",
      "{\\"assignments\\":[{\\"targetType\\":\\"user\\",\\"characterId\\":\\"\\",\\"roleId\\":\\"role-id\\"},{\\"targetType\\":\\"character\\",\\"characterId\\":\\"character-id\\",\\"roleId\\":\\"role-id\\"}],\\"openingNarrator\\":\\"公开开场，不泄露身份\\",\\"dayAnnouncement\\":\\"第二天清晨公布的公开事实，不泄露隐藏身份\\",\\"publicFact\\":\\"一句可记录的首夜公开事实\\"}",
      "</output_schema>",
      "",
      "<constraints>",
      "实时生成本局身份分配；assignments 必须覆盖每个参与者一次且仅一次。",
      "roleId 必须来自 role_pool，并严格满足每个角色 count 展开后的数量。",
      "公开字段 openingNarrator/dayAnnouncement/publicFact 禁止写出任何人的身份、阵营、夜间私密行动、验人结果或心理。",
      "dayAnnouncement 应表现为首夜已经发生并进入第二天的公开结果；不要直接解决主线。",
      "只输出严格合法 JSON 对象，不要 Markdown。",
      "</constraints>",
      "",
      "<participants>",
      participants.map((participant) => participant.isUser
        ? "targetType: user\\ncharacterId: \\nname: " + participant.label
        : "targetType: character\\ncharacterId: " + participant.characterId + "\\nname: " + participant.label
      ).join("\\n\\n---\\n\\n"),
      "</participants>",
      "",
      "<role_pool>",
      roleAssignment.rolePool.map((role) => [
        "roleId: " + role.id,
        "label: " + role.label,
        "count: " + Math.max(1, Math.round(role.count || 1)),
        role.factionId ? "factionId: " + role.factionId : "",
        role.factionLabel ? "factionLabel: " + role.factionLabel : "",
        role.description ? "description: " + role.description : "",
      ].filter(Boolean).join("\\n")).join("\\n\\n---\\n\\n"),
      "</role_pool>",
      "",
      "<expanded_role_count>" + rolePool.length + "</expanded_role_count>",
    ].join("\\n");

    return {
      sessionRootDir: tavernBridgeSessionRootDir(room.id),
      agentRoleId: tavernDirectorAgentRoleId(room),
      systemPrompt: buildTavernBridgeSystemPrompt(room),
      userMessage: "请为本局实时分配身份，并输出严格合法 JSON。",
      requestContext: prompt,
      runtimeInstruction: [
        "你是酒馆主持制剧本的导演 Agent。",
        "本轮只做开局身份分配和首夜公开结果生成，不安排角色公开发言。",
        "身份和阵营只写入 assignments 结构，不得出现在公开旁白字段。",
        "必须严格按 schema 输出 JSON。",
      ].join("\\n"),
    };
  };

  export const parseRoleAssignment = ({ text, room, characters, turnId, createdAt }) => {
    const parsed = JSON.parse(extractJsonObject(text));
    const participants = roleAssignmentParticipants(room, characters);
    const roleAssignment = room.settings.informationPolicy.roleAssignment;
    const participantByKey = new Map(participants.map((participant) => [participantKey(participant), participant]));
    const roleById = new Map(roleAssignment.rolePool.map((role) => [role.id, role]));
    const roleLimits = new Map(roleAssignment.rolePool.map((role) => [role.id, Math.max(1, Math.round(role.count || 1))]));
    const roleCounts = new Map();
    const seenParticipants = new Set();
    const selections = [];

    for (const candidate of Array.isArray(parsed.assignments) ? parsed.assignments : []) {
      const targetType = candidate?.targetType === "user" ? "user" : candidate?.targetType === "character" ? "character" : "";
      const characterId = typeof candidate?.characterId === "string" ? candidate.characterId.trim() : "";
      const key = targetType === "user" ? "user:user" : targetType === "character" ? "character:" + characterId : "";
      const roleId = typeof candidate?.roleId === "string" ? candidate.roleId.trim() : "";
      const participant = participantByKey.get(key);
      const role = roleById.get(roleId);
      if (!participant || !role || seenParticipants.has(key)) {
        continue;
      }
      const nextRoleCount = (roleCounts.get(role.id) ?? 0) + 1;
      if (nextRoleCount > (roleLimits.get(role.id) ?? 0)) {
        continue;
      }
      roleCounts.set(role.id, nextRoleCount);
      seenParticipants.add(key);
      selections.push({ participant, role });
    }

    const missingParticipants = participants.filter((participant) => !seenParticipants.has(participantKey(participant)));
    const invalidRoleCounts = roleAssignment.rolePool.filter((role) =>
      (roleCounts.get(role.id) ?? 0) !== Math.max(1, Math.round(role.count || 1))
    );
    if (missingParticipants.length || invalidRoleCounts.length || selections.length !== participants.length) {
      throw new Error("导演身份分配不完整：" + JSON.stringify({
        missing: missingParticipants.map((item) => item.label),
        invalidRoles: invalidRoleCounts.map((role) => role.id),
      }));
    }

    return {
      factEvents: createTavernRoleAssignmentFactEvents({
        room,
        assignments: selections,
        turnId,
        createdAt,
      }),
      openingNarrator: typeof parsed.openingNarrator === "string" ? parsed.openingNarrator.trim().slice(0, 240) : "",
      dayAnnouncement: typeof parsed.dayAnnouncement === "string" ? parsed.dayAnnouncement.trim().slice(0, 360) : "",
      publicFact: typeof parsed.publicFact === "string" ? parsed.publicFact.trim().slice(0, 240) : "",
    };
  };

  export const applyRoleAssignmentOpening = ({ room, assignment, createdAt }) => {
    const opening = room.settings.informationPolicy.roleAssignment.opening;
    const openingEventType = opening.publicEventType?.trim() || "";
    const openingFactEvent = openingEventType
      ? {
          id: "live-opening-event-" + createdAt.toString(36),
          turnId: assignment.factEvents[0]?.turnId ?? "live-opening-" + createdAt.toString(36),
          sourceMessageIds: [],
          type: openingEventType,
          target: { type: "global" },
          ...(opening.publicEventValue !== undefined ? { value: opening.publicEventValue } : {}),
          evidence: assignment.publicFact || assignment.dayAnnouncement || "身份分配完成，公开流程进入下一阶段。",
          confidence: 1,
          visibility: "public",
          createdAt,
        }
      : null;
    const progressPatch = advanceTavernProgressFromFactEvents({
      room,
      factEvents: [
        ...assignment.factEvents,
        ...(openingFactEvent ? [openingFactEvent] : []),
      ],
      turnId: openingFactEvent?.turnId ?? assignment.factEvents[0]?.turnId ?? "live-opening-" + createdAt.toString(36),
      createdAt,
    });
    const statusSnapshot = (opening.globalStatusPatches ?? []).reduce(
      (snapshot, patch) => setTavernStatusSnapshotValue(snapshot, { type: "global" }, patch.statusId, patch.value),
      progressPatch.statusSnapshot,
    );
    return {
      ...room,
      ...progressPatch,
      statusSnapshot,
    };
  };

  export const setGlobalStatus = (room, statusId, value) => ({
    ...room,
    statusSnapshot: setTavernStatusSnapshotValue(
      room.statusSnapshot,
      { type: "global" },
      statusId,
      value,
    ),
  });

  export const directorOnlyAllowed = (room) => isTavernDirectorOnlyTurnAllowed(room);
  export const fixedOrderPhase = (room) => isTavernFixedOrderPhase(room);
  export const suppressContinuation = (room) => shouldSuppressTavernAutoContinuation(room);
  export const resolveScheduledSpeakerIds = ({
    room,
    characters,
    directorSpeakerIds,
    directorNonverbalReplyIds,
    selectedTargetCharacterIds,
    currentUserText,
  }) => resolveTavernScheduledSpeakers({
    room,
    availableCharacters: characters,
    activeCharacterId: room.activeCharacterId,
    directorSpeakerIds,
    directorNonverbalReplyIds,
    selectedTargetCharacterIds,
    currentUserText,
    fallbackCharacter: characters[0] ?? null,
  }).map((character) => character.id);

  export const bridgeSystemPrompt = (room) => buildTavernBridgeSystemPrompt(room);

  const characterById = (characters, characterId) => {
    const character = characters.find((item) => item.id === characterId);
    if (!character) {
      throw new Error("missing character " + characterId);
    }
    return character;
  };

  const extractJsonObject = (text) => {
    const trimmed = text.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return trimmed;
    }
    const match = trimmed.match(/\\{[\\s\\S]*\\}/);
    return match?.[0] ?? "{}";
  };

  const cleanLooseJsonString = (value) => value.trim();

  const extractLooseJsonStringArray = (text, fieldName) => {
    const fieldPattern = new RegExp('"' + fieldName + '"\\\\s*:\\\\s*\\\\[([\\\\s\\\\S]*?)\\\\]', "i");
    const fieldMatch = fieldPattern.exec(text);
    if (!fieldMatch) {
      return [];
    }

    return [...(fieldMatch[1] ?? "").matchAll(/"([^"]+)"/g)]
      .map((match) => cleanLooseJsonString(match[1] ?? ""))
      .filter(Boolean);
  };

  const extractLooseJsonStringField = (text, fieldName) => {
    const fieldPattern = new RegExp(
      '"' + fieldName + '"\\\\s*:\\\\s*"([\\\\s\\\\S]*?)"\\\\s*(?=,\\\\s*"(?:speakerIds|nonverbalReplyIds|ambientActions|narrator|reason)"\\\\s*:|\\\\s*}\\\\s*$)',
      "i",
    );
    const fieldMatch = fieldPattern.exec(text);

    return fieldMatch ? cleanLooseJsonString(fieldMatch[1] ?? "") : "";
  };

  const stripUserLabel = (text, userPersonaName) => {
    const labels = [userPersonaName, "我", "用户", "玩家"]
      .map((label) => label.trim())
      .filter(Boolean);
    let cleaned = text.trim();
    for (const label of labels) {
      if (cleaned.startsWith(label + ":") || cleaned.startsWith(label + "：")) {
        cleaned = cleaned.slice(label.length + 1).trim();
      }
    }
    return cleaned;
  };

  const cleanManagedReply = (text, userPersonaName) => stripUserLabel(text, userPersonaName)
    .replace(/^\\\`\\\`\\\`(?:json)?\\s*/i, "")
    .replace(/\\s*\\\`\\\`\\\`$/i, "")
    .replace(/^[\\"“”]+|[\\"“”]+$/g, "")
    .trim();

  export const parseManagedReply = (text, userPersonaName) => {
    try {
      const parsed = JSON.parse(extractJsonObject(text));
      const candidates = [
        parsed.reply,
        parsed.userReply,
        parsed.user_reply,
        parsed.content,
        parsed.message,
        parsed.text,
      ];
      const reply = candidates.find((candidate) => typeof candidate === "string" && candidate.trim());
      if (typeof reply === "string") {
        return cleanManagedReply(reply, userPersonaName);
      }
    } catch {
      // Fall through.
    }
    return cleanManagedReply(text.split(/\\n+/).find((line) => line.trim()) ?? "", userPersonaName);
  };

  export const buildManagedUserRequest = ({
    room,
    characters,
    messages,
    currentDraft,
  }) => {
    const runtimeMessages = tavernMessagesToRuntimeMessages({
      messages,
      characters,
      userPersonaName: room.userPersonaName,
    });
    const recentConversation = formatTavernRuntimeMessagesForSummary(runtimeMessages.slice(-12));
    const characterList = characters.map((character) =>
      character.name + ": " + character.description
    ).join("\\n");
    const prompt = [
      "<task>",
      "以导演身份，为酒馆用户「" + (room.userPersonaName || "我") + "」调度并生成本轮要发送的回复。",
      "</task>",
      "",
      "<rules>",
      "reply 必须是用户可以直接发送的一句话或一小段话。",
      "reply 不可为空，也不可只输出 reason；即使信息不足，也要生成一句谨慎的追问或推进决定。",
      "reply 绝对不能包含 <function_calls>、<tool_calls>、XML/HTML 标签、工具调用、JSON 代码块或系统标记。",
      "只替用户说话，不要替酒馆角色说话，不要写角色动作，不要输出角色名加冒号。",
      "回复需要承接当前对话和场景目标，能自然推动下一轮角色回应。",
      "避免连续输出“嗯”“好”“继续守着”这类低信息短句；等待场景里也要给出一个具体观察点、轮报要求或下一步检查指令。",
      "可以包含用户的行动决定、追问、试探或态度，但不要越过当前剧情直接解决核心谜题。",
      "建议 20 到 120 个中文字符；内容不要自带引号、编号或列表符号。",
      currentDraft?.trim()
        ? "用户输入框里的文字是托管方向提示，请吸收其意图；如果其中明确点名角色、发言顺序、人数或限制，必须保留这些硬约束，但不要机械照抄措辞。"
        : "没有方向提示时，根据当前剧情自动选择最合理、最有戏剧张力的一句回复。",
      "只输出严格合法 JSON 对象，不要 Markdown、代码块或解释。",
      "</rules>",
      "",
      "<output_schema>",
      "{\\"reply\\":\\"用户本轮要发送的回复\\",\\"reason\\":\\"可选简短调度原因\\"}",
      "</output_schema>",
      "",
      room.storyOutline.trim() || room.storyGoal.trim()
        ? "<story_arc>\\n" + [room.storyOutline.trim(), room.storyGoal.trim() ? "终局目标：" + room.storyGoal.trim() : ""].filter(Boolean).join("\\n\\n") + "\\n</story_arc>"
        : "<story_arc>（无）</story_arc>",
      "",
      "<room title=\\"" + room.title + "\\">",
      room.scene,
      "</room>",
      "",
      room.scenePlot.trim() ? "<scene_plot>\\n" + room.scenePlot.trim() + "\\n</scene_plot>" : "<scene_plot>（无）</scene_plot>",
      "",
      room.sceneGoal.trim() ? "<scene_goal>\\n" + room.sceneGoal.trim() + "\\n</scene_goal>" : "<scene_goal>（无）</scene_goal>",
      "",
      room.sceneDirection.trim() ? "<scene_direction>\\n" + room.sceneDirection.trim() + "\\n</scene_direction>" : "<scene_direction>（无）</scene_direction>",
      "",
      "<characters>",
      characterList,
      "</characters>",
      "",
      currentDraft?.trim() ? "<managed_direction_hint>\\n" + currentDraft.trim() + "\\n</managed_direction_hint>" : "",
      "",
      "<recent_conversation>",
      recentConversation || "（无）",
      "</recent_conversation>",
      "",
      "<public_visible_messages>",
      formatTavernVisibleMessagesForRequestContext(
        normalizeTavernMessagesForAudience({
          messages,
          characters,
          userPersonaName: room.userPersonaName,
          audience: { type: "user_proxy" },
        }).slice(-12),
      ) || "（无）",
      "</public_visible_messages>",
    ].filter(Boolean).join("\\n");
    return {
      sessionRootDir: tavernBridgeSessionRootDir(room.id),
      agentRoleId: tavernManagedUserAgentRoleId(room),
      systemPrompt: buildTavernBridgeSystemPrompt(room),
      userMessage: "以导演身份，为酒馆用户「" + (room.userPersonaName || "我") + "」生成本轮要发送的回复。",
      requestContext: prompt,
      runtimeInstruction: [
        "你是酒馆模式的全托管导演。",
        "你负责代用户生成下一句可发送回复，让剧情自然继续。",
        "reply 字段必须非空，且不得包含工具调用、函数调用、XML/HTML 标签或系统标记。",
        "只输出符合 schema 的严格合法 JSON 对象，不要代码块。",
      ].join("\\n"),
    };
  };

  export const parseDirectorDecision = (text, characters, maxSpeakers) => {
    const ids = new Set(characters.map((character) => character.id));
    const nameById = new Map(characters.map((character) => [character.id, character.name]));
    const jsonText = extractJsonObject(text);
    let parsed = null;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      parsed = null;
    }
    const parsedSpeakerIds = Array.isArray(parsed?.speakerIds) ? parsed.speakerIds : null;
    const speakerIds = (parsedSpeakerIds
      ? parsedSpeakerIds.filter((id) => typeof id === "string" && ids.has(id))
      : extractLooseJsonStringArray(jsonText, "speakerIds").filter((id) => ids.has(id))
    );
    const parsedNonverbalReplyIds = Array.isArray(parsed?.nonverbalReplyIds) ? parsed.nonverbalReplyIds : null;
    const nonverbalReplyIdsRaw = (parsedNonverbalReplyIds
      ? parsedNonverbalReplyIds.filter((id) => typeof id === "string" && ids.has(id))
      : extractLooseJsonStringArray(jsonText, "nonverbalReplyIds").filter((id) => ids.has(id))
    );
    const scheduledIdSet = new Set([...new Set(nonverbalReplyIdsRaw), ...new Set(speakerIds)].slice(0, maxSpeakers));
    const uniqueSpeakerIds = [...new Set(speakerIds)].filter((id) => scheduledIdSet.has(id));
    const nonverbalReplyIds = [...new Set(nonverbalReplyIdsRaw)].filter((id) => scheduledIdSet.has(id));
    const speakerIdSet = new Set([...uniqueSpeakerIds, ...nonverbalReplyIds]);
    const narrator = typeof parsed?.narrator === "string"
      ? parsed.narrator.trim()
      : extractLooseJsonStringField(jsonText, "narrator");
    const reason = typeof parsed?.reason === "string"
      ? parsed.reason.trim()
      : extractLooseJsonStringField(jsonText, "reason");
    const ambientActions = Array.isArray(parsed?.ambientActions)
      ? parsed.ambientActions.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") {
          return [];
        }
        const characterId = typeof candidate.characterId === "string" ? candidate.characterId.trim() : "";
        const rawAction = typeof candidate.action === "string" ? candidate.action.trim() : "";
        const characterName = nameById.get(characterId);
        if (!ids.has(characterId) || speakerIdSet.has(characterId) || !characterName || !rawAction) {
          return [];
        }
        const action = rawAction.includes(characterName)
          ? rawAction
          : characterName + rawAction.replace(/^他(?:们)?|^她(?:们)?|^它(?:们)?/, "");

        return [{
          characterId,
          action: action.replace(/^[*_\\s]+|[*_\\s]+$/g, "").slice(0, 120),
        }];
      }).slice(0, 2)
      : [];

    return {
      speakerIds: uniqueSpeakerIds,
      nonverbalReplyIds,
      narrator: narrator ? narrator.slice(0, 280) : undefined,
      ambientActions,
      reason: reason ? reason.slice(0, 180) : undefined,
    };
  };

  export const buildDirectorRequest = ({
    room,
    characters,
    messages,
    currentUserText,
    selectedTargetCharacterIds = [],
    maxSpeakers,
  }) => {
    const runtimeMessages = tavernMessagesToRuntimeMessages({
      messages,
      characters,
      userPersonaName: room.userPersonaName,
    });
    const lorebookText = formatTavernLorebookEntries(selectTavernLorebookEntries({
      room,
      characters,
      currentUserText,
    }));
    const characterList = characters.map((character) => [
      "id: " + character.id,
      "name: " + character.name,
      "description: " + character.description,
      character.goals ? "goals: " + character.goals : "",
      Array.isArray(character.relationships) && character.relationships.length
        ? "relationships: " + character.relationships.map((relationship) =>
            [relationship.label, relationship.publicNote].filter(Boolean).join(" ")
          ).filter(Boolean).join("；")
        : "",
      room.characterMemories[character.id]?.trim()
        ? "memory: " + room.characterMemories[character.id].trim()
        : "",
    ].filter(Boolean).join("\\n")).join("\\n\\n---\\n\\n");
    const ambientActionMax = Math.min(2, Math.max(0, characters.length - 1));
    const directorOnlyAllowed = isTavernDirectorOnlyTurnAllowed(room);
    const schedulingInstruction = formatTavernDirectorSchedulingInstruction(room);
    const selectedTargetsCanStaySilent = canTavernSelectedTargetsStaySilent(room, selectedTargetCharacterIds);
    const selectedTargetCharacters = selectedTargetCharacterIds
      .map((characterId) => characters.find((character) => character.id === characterId))
      .filter(Boolean);
    const progressContext = JSON.stringify({
      statusSnapshot: room.statusSnapshot,
      tasks: room.taskDefinitions.map((task) => ({
        id: task.id,
        title: task.title,
        owner: task.owner,
        participants: task.participants ?? [],
        visibility: task.visibility,
        lifecycle: task.lifecycle,
        currentStatus: room.taskSnapshot[task.id]?.status ?? task.lifecycle.initialStatus,
      })),
      outcomes: room.sceneOutcomes.map((outcome) => ({
        id: outcome.id,
        label: outcome.label,
        condition: outcome.condition,
        winner: outcome.winner ?? [],
        loser: outcome.loser ?? [],
        priority: outcome.priority,
      })),
      recentFacts: filterTavernFactEventsForAudience({
        factEvents: room.factEvents,
        room,
        audience: { type: "director" },
      }).slice(-16).map((fact) => ({
        id: fact.id,
        type: fact.type,
        actor: fact.actor,
        target: fact.target,
        evidence: fact.evidence,
        visibility: fact.visibility,
        visibleToUser: fact.visibleToUser,
        visibleToCharacterIds: fact.visibleToCharacterIds ?? [],
        visibleToFactionIds: fact.visibleToFactionIds ?? [],
      })),
    }, null, 2).slice(0, 6000);
    const prompt = [
      "<output_schema>",
      "{\\"speakerIds\\":[\\"character-id\\"],\\"nonverbalReplyIds\\":[\\"character-id\\"],\\"ambientActions\\":[{\\"characterId\\":\\"未发言角色 id\\",\\"action\\":\\"一句可观察动作\\"}],\\"narrator\\":\\"可选旁白\\",\\"reason\\":\\"可选简短原因\\"}",
      "</output_schema>",
      "",
      "<constraints maxSpeakers=\\"" + maxSpeakers + "\\">",
      "speakerIds 和 nonverbalReplyIds 只能使用下方角色 id；如果需要多人发言，按发言顺序排列。",
      directorOnlyAllowed
        ? "当前阶段允许导演只推进公开流程；如果不应有角色公开发言，可以返回空 speakerIds，并用 narrator 交代公开阶段/结算。"
        : selectedTargetsCanStaySilent
        ? "speakerIds 是本轮角色调用计划，不是氛围描述；若用户明确要求被指定目标只用动作/神态回应，应把该目标放入 nonverbalReplyIds，让角色 Agent 生成自己的心理和动作；若只是弱在场感或无需角色近景反应，才可返回空 speakerIds 并用 ambientActions/narrator 处理。"
        : "speakerIds/nonverbalReplyIds 是本轮角色调用计划，不是氛围描述；只要 characters 非空，二者合计必须至少包含 1 个角色 id。",
      directorOnlyAllowed
        ? "不要为了满足格式硬塞角色发言；夜晚、投票结算、公开结果公布等阶段可只写 narrator。"
        : selectedTargetsCanStaySilent
        ? "不要用空数组表达无事发生；如果目标被明确要求做动作/神态回应，不要把目标写进 ambientActions，而应调度该目标到 nonverbalReplyIds。"
        : "不要用空 speakerIds 和 nonverbalReplyIds 表示沉默、留白、等待或用户要求少说；这种情况选择 1 个最相关角色承接。",
      directorOnlyAllowed
        ? "当用户输入是“嗯”“好”“继续”等短确认时，若当前阶段只需要主持推进，可以返回空 speakerIds。"
        : "当用户输入是“嗯”“好”“继续”等短确认时，也必须选择 1 个角色承接当前岗位状态，不要让 speakerIds 和 nonverbalReplyIds 同时为空。",
      "每轮在 speakerIds/nonverbalReplyIds 中自主选择 1 到 " + maxSpeakers + " 个角色，不要为了凑人数而加入无必要发言者。",
      "如果用户明确点名多个角色发言或给出发言顺序，在 " + maxSpeakers + " 人上限内优先按用户点名安排。",
      "nonverbalReplyIds 可选，只能填写也应被角色 Agent 调用的角色 id；它表示该角色本轮只输出心理和可观察动作，直接对白可以为空。nonverbalReplyIds 中的角色不需要重复写进 speakerIds。",
      "如果用户以某个角色的全名、昵称或可唯一识别称呼开头发出指令/询问，该角色是本轮被点名目标，优先安排其公开回应或行动；除非用户明确要求不用回答/只动作/保持沉默，否则不要放入 nonverbalReplyIds。",
      "普通承接轮次优先选择 1-2 个角色；冲突、会议、多人相关场景可选择最多 " + maxSpeakers + " 个角色。",
      "优先选择最能推进场景目标、回应用户、制造承接关系的角色。",
      "ambientActions 可选，最多 " + ambientActionMax + " 条，只能选择未出现在 speakerIds 和 nonverbalReplyIds 里的角色；只写可被观察到的动作/状态，不写对白、心理、意图或新剧情结果。",
      "ambientActions 用来让未发言角色保持在场感，例如“琪拉把托盘放回吧台”“莫尔侧身让开门口”；不要为了凑数而生成。",
      "narrator 只能写已发生状态、环境过渡或镜头提示，不要新增关键事实、行动结果或替角色做决定；可为空，建议 40 字内。",
      "reason 只能写公开调度理由，不得包含隐藏身份、阵营、未公开心理、夜间私密行动或验人结果。",
      "如果已经输出 narrator，后续 speakerIds/nonverbalReplyIds 应选择会对旁白产生角色回应的人；不要安排角色复述 narrator。",
      "输出必须是严格合法 JSON 对象，以 { 开头，以 } 结尾；不要代码块。",
      "</constraints>",
      schedulingInstruction ? "\\n<director_scheduling_rules>\\n" + schedulingInstruction + "\\n</director_scheduling_rules>" : "",
      "",
      room.storyOutline.trim() || room.storyGoal.trim()
        ? "<story_arc>\\n" + [room.storyOutline.trim(), room.storyGoal.trim() ? "终局目标：" + room.storyGoal.trim() : ""].filter(Boolean).join("\\n\\n") + "\\n</story_arc>"
        : "<story_arc>（无）</story_arc>",
      "",
      "<room title=\\"" + room.title + "\\">",
      room.scene,
      "</room>",
      "",
      room.scenePlot.trim() ? "<scene_plot>\\n" + room.scenePlot.trim() + "\\n</scene_plot>" : "<scene_plot>（无）</scene_plot>",
      "",
      room.sceneGoal.trim() ? "<scene_goal>\\n" + room.sceneGoal.trim() + "\\n</scene_goal>" : "<scene_goal>（无）</scene_goal>",
      "",
      room.sceneDirection.trim() ? "<scene_direction>\\n" + room.sceneDirection.trim() + "\\n</scene_direction>" : "<scene_direction>（无）</scene_direction>",
      "",
      "<story_graph>",
      formatTavernStoryGraphContext(room) || "（无）",
      "</story_graph>",
      "",
      "<lorebook>",
      lorebookText || "（无）",
      "</lorebook>",
      "",
      "<characters>",
      characterList,
      "</characters>",
      "",
      "<selected_reply_targets instruction=\\"targets_addressed_by_user_or_reply_option; may_speak_or_react_nonverbally_depending_on_relationship_and_context\\">",
      selectedTargetCharacters.length > 0
        ? selectedTargetCharacters.map((character) => "id: " + character.id + "\\nname: " + character.name).join("\\n\\n---\\n\\n")
        : "（无）",
      "</selected_reply_targets>",
      "",
      "<progress_context instruction=\\"director_only; use_for_scheduling_motivation_without_leaking_hidden_facts\\">",
      progressContext,
      "</progress_context>",
      "",
      "<current_user_input>",
      currentUserText,
      "</current_user_input>",
      "",
      "<recent_conversation>",
      formatTavernRuntimeMessagesForSummary(runtimeMessages.slice(-10)),
      "</recent_conversation>",
      "",
      "<public_visible_messages>",
      formatTavernVisibleMessagesForRequestContext(
        normalizeTavernMessagesForAudience({
          messages,
          characters,
          userPersonaName: room.userPersonaName,
          audience: { type: "director" },
        }).slice(-10),
      ) || "（无）",
      "</public_visible_messages>",
    ].join("\\n");
    return {
      sessionRootDir: tavernBridgeSessionRootDir(room.id),
      agentRoleId: tavernDirectorAgentRoleId(room),
      systemPrompt: buildTavernBridgeSystemPrompt(room),
      userMessage: "请决定本轮酒馆对话的发言顺序和可选在场动作，并只输出严格合法 JSON。",
      requestContext: prompt,
      runtimeInstruction: [
        "你是酒馆模式的导演 Agent。",
        "你的职责是根据用户输入、场景目标、剧情结构和角色状态，决定下一轮谁应该发言。",
        "可以插入一条简短旁白来做环境过渡，但不要新增关键事实，不要代替角色行动或长篇发言。",
        "ambientActions 只用于未发言角色的公开可观察动作，不是角色对白，也不要写心理。",
        directorOnlyAllowed
          ? "当前阶段允许 speakerIds/nonverbalReplyIds 为空；只有确实需要公开角色发言或非语言近景反应时才安排角色。"
          : selectedTargetsCanStaySilent
          ? "当前候选回复/点名目标可以选择不开口；若用户要求目标只动作/神态回应，仍应安排该目标 nonverbalReplyIds，由角色 Agent 输出动作和心理。"
          : "只要有可用角色，就必须在 speakerIds 或 nonverbalReplyIds 中返回至少一个角色 id；不要用空数组表达沉默。",
        schedulingInstruction,
        "JSON 字符串内不要使用未转义英文双引号；引用用户短句时改用中文引号。",
        "只输出严格合法 JSON，不要输出 Markdown、代码块或解释。",
      ].filter(Boolean).join("\\n"),
    };
  };

  export const buildCharacterRequest = ({
    room,
    characters,
    activeCharacterId,
    messages,
    currentUserText,
    speakerIndex,
    speakerCount,
    replyMode = room.replyMode,
    isDirectorLikeMode = false,
    isManagedMode = false,
    directorReason = "",
    promptVariant,
    allowNonverbalReply = false,
  }) => {
    const activeCharacter = characterById(characters, activeCharacterId);
    const turnInstruction = buildTavernCharacterTurnInstruction({
      room,
      speaker: activeCharacter,
      speakerIndex,
      speakerCount,
      replyMode,
      isDirectorLikeMode,
      isManagedMode,
      directorReason,
      promptVariant,
      allowNonverbalReply,
    });
    return buildTavernReplyAgentRequest({
      room,
      activeCharacter,
      characters,
      messages,
      references: [],
      currentUserText,
      turnInstruction,
      allowNonverbalReply,
    });
  };

  export const parseCharacterReply = ({
    text,
    room,
    characters,
    activeCharacterId,
  }) => parseTavernReplyText({
    text,
    activeCharacter: characterById(characters, activeCharacterId),
    characters,
    userPersonaName: room.userPersonaName,
  });

  export const hasCharacterDialogueText = hasTavernReplyDialogueText;
  export const isContentOnlyReplyAllowed = () => livePresentationContract.allowsContentOnlyReply;
  export const hasRecognizableCharacterReplyStructure = (text) => {
    const publicContentTag = livePresentationContract.publicContentTag;
    return new RegExp("<\\\\s*inner_thought(?:\\\\s+[^>]*)?\\\\s*>", "i").test(text) &&
      new RegExp("<\\\\s*" + publicContentTag + "(?:\\\\s+[^>]*)?\\\\s*>", "i").test(text);
  };

  export const extractPendingInteractions = ({
    room,
    characters,
    messages,
    turnId,
  }) => extractTavernPendingInteractionsFromMessages({
    messages,
    characters,
    userPersonaName: room.userPersonaName,
    turnId,
  });

  export const planContinuation = ({
    room,
    characters,
    pendingInteractions,
    continuationRound,
  }) => planTavernContinuation({
    pendingInteractions,
    characters,
    continuationRound,
    maxAutoContinuationRounds: room.settings.continuation.maxAutoContinuationRounds,
    maxSpeakersPerContinuation: room.settings.continuation.maxSpeakersPerContinuation,
    stopWhenUserTargeted: room.settings.continuation.stopWhenUserTargeted,
  });
`, "utf8");

await build({
  entryPoints: [helperEntryPath],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: helperBundlePath,
  external: ["react", "react-dom"],
  alias: {
    "@": resolve(workspaceRoot, "src"),
  },
  loader: {
    ".css": "empty",
    ".png": "file",
    ".jpg": "file",
    ".jpeg": "file",
    ".svg": "file",
    ".webp": "file",
  },
  logLevel: "silent",
});

const helper = await import(pathToFileURL(helperBundlePath).href);

const bridge = spawn(process.execPath, [bridgePath], {
  cwd: workspaceRoot,
  stdio: ["pipe", "pipe", "pipe"],
});
const seen = [];
const waiters = [];
const runs = new Map();
let stdoutBuffer = "";
let stderrBuffer = "";

const handleLine = (line) => {
  if (!line.trim()) {
    return;
  }
  const parsed = JSON.parse(line);
  seen.push(parsed);

  if (parsed.taskId && runs.has(parsed.taskId)) {
    const run = runs.get(parsed.taskId);
    const nowMs = performance.now();
    if (
      !run.firstDeltaAt &&
      (parsed.type === "text_delta" || parsed.type === "thinking_delta")
    ) {
      run.firstDeltaAt = nowMs;
      log(`${run.label} first_delta ${Math.round(nowMs - run.startedAt)}ms`);
    }
    if (!run.firstTextAt && parsed.type === "text_delta") {
      run.firstTextAt = nowMs;
      log(`${run.label} first_text ${Math.round(nowMs - run.startedAt)}ms`);
    }
  }

  for (const waiter of [...waiters]) {
    if (waiter.predicate(parsed)) {
      clearTimeout(waiter.timer);
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve(parsed);
    }
  }
};

bridge.stdout.on("data", (chunk) => {
  stdoutBuffer += chunk.toString("utf8");
  let newlineIndex;
  while ((newlineIndex = stdoutBuffer.indexOf("\n")) >= 0) {
    handleLine(stdoutBuffer.slice(0, newlineIndex));
    stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
  }
});

bridge.stderr.on("data", (chunk) => {
  stderrBuffer += chunk.toString("utf8");
});

const waitFor = (predicate, label, timeoutMs = LIVE_TIMEOUT_MS) =>
  new Promise((resolvePromise, reject) => {
    for (const item of seen) {
      if (predicate(item)) {
        resolvePromise(item);
        return;
      }
    }
    const waiter = {
      predicate,
      resolve: resolvePromise,
      timer: setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) {
          waiters.splice(index, 1);
        }
        reject(new Error([
          `等待 ${label} 超时`,
          stderrBuffer ? `stderr:\\n${stderrBuffer}` : "",
          `recent events:\\n${JSON.stringify(seen.slice(-12).map(safeDetails), null, 2)}`,
        ].filter(Boolean).join("\\n\\n")));
      }, timeoutMs),
    };
    waiters.push(waiter);
  });

const send = (command) => {
  bridge.stdin.write(`${JSON.stringify(command)}\n`);
};

const request = async (command, resultType, timeoutMs = LIVE_TIMEOUT_MS) => {
  send(command);
  return waitFor(
    (item) => item.requestId === command.requestId && item.type === resultType,
    `${command.type}:${command.requestId}:${resultType}`,
    timeoutMs,
  );
};

const bridgeResources = () => ({
  tools: { allowed: [] },
  skills: { enabled: [] },
});

const createSession = (sessionRootDir, systemPrompt, metadata = {}) =>
  request({
    type: "create_session",
    requestId: `create-${metadata.label ?? Date.now()}-${Math.random().toString(36).slice(2)}`,
    workspacePath,
    sessionRootDir,
    systemPrompt,
    metadata,
  }, "session_mutation_result", 10_000);

const runAgent = async ({
  label,
  sessionRootDir,
  agentRoleId,
  runtimeModel,
  systemPrompt,
  userMessage,
  requestContext,
  runtimeInstruction,
  timeoutMs = FLOW_TIMEOUT_MS,
}) => {
  const taskId = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const requestId = taskId;
  const startedAt = performance.now();
  runs.set(taskId, {
    label,
    startedAt,
    firstDeltaAt: null,
    firstTextAt: null,
  });
  log(`${label} start model=${runtimeModel.modelId}`);
  send({
    type: "send_message",
    requestId,
    session: {
      workspacePath,
      sessionRootDir,
    },
    agent: {
      agentId: "pi",
      agentRoleId,
    },
    input: {
      systemPrompt,
      userMessage,
      requestContext,
      runtimeInstruction,
    },
    runtime: {
      mode: "agent",
      taskId,
      stream: true,
      streamId: taskId,
      model: runtimeModel,
      resources: bridgeResources(),
    },
  });

  const terminal = await waitFor(
    (item) =>
      (item.type === "done" && item.taskId === taskId) ||
      (item.type === "error" && (item.taskId === taskId || item.requestId === requestId)) ||
      (item.type === "task_result" && item.requestId === requestId && item.taskId === taskId && item.success === false),
    `${label} terminal event`,
    timeoutMs,
  );
  if (terminal.type === "error" || terminal.success === false) {
    runs.delete(taskId);
    throw new Error(`${label} 执行失败：${terminal.message ?? JSON.stringify(safeDetails(terminal))}`);
  }
  const result = await waitFor(
    (item) => item.type === "task_result" && item.requestId === requestId && item.taskId === taskId,
    `${label} task_result`,
    30_000,
  );
  const run = runs.get(taskId);
  runs.delete(taskId);
  assert(result.success === true, `${label} 应成功`, result);
  log(`${label} done ${Math.round(performance.now() - startedAt)}ms`);

  return {
    label,
    taskId,
    text: terminal.text ?? "",
    firstDeltaMs: run?.firstDeltaAt ? Math.round(run.firstDeltaAt - startedAt) : null,
    firstTextMs: run?.firstTextAt ? Math.round(run.firstTextAt - startedAt) : null,
    doneMs: Math.round(performance.now() - startedAt),
  };
};

const hasRecognizableReplyStructure = (text) =>
  helper.hasRecognizableCharacterReplyStructure(text);

const foreignSpeakerLinePattern = (activeName, characterNames) => {
  const names = [...characterNames, "旅人", "旁白", "用户"]
    .filter((name) => name !== activeName)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(^|\\n)\\s*(?:${names.join("|")})\\s*[:：]`);
};

const formatWarnings = [];

const stripItalicActionBlocks = (text) =>
  text.replace(/(^|\n)\s*\*[^*\n]+\*\s*(?=\n|$)/g, "\n").trim();

const hasUnbalancedMarkdownMarkers = (text, marker) =>
  (text.split(marker).length - 1) % 2 !== 0;

const assertCharacterReply = ({
  label,
  raw,
  parsed,
  forbiddenMarkers = [],
  forbiddenSecrets = [],
  forbiddenContentFragments = [],
  activeName,
  characterNames,
  allowNonverbalReply = false,
}) => {
  if (!hasRecognizableReplyStructure(raw)) {
    formatWarnings.push({
      label,
      issue: "raw_reply_structure_not_strict",
      raw,
    });
  }
  assert(parsed.content.trim(), `${label} 解析后公开回复不能为空`, { raw, parsed });
  assert(!/<\/?(?:inner_thought|reply|public_reply|narrative_beat|public_narrative_beat|private_thought|thought)[^>]*>/i.test(parsed.content), `${label} 解析后公开回复不应残留格式标签`, {
    raw,
    parsed,
  });
  assert(
    !hasUnbalancedMarkdownMarkers(parsed.content, "*") &&
      !hasUnbalancedMarkdownMarkers(parsed.content, "_"),
    `${label} 解析后公开回复不应残留悬挂 Markdown 标记`,
    {
    raw,
    parsed,
    },
  );
  if (!allowNonverbalReply && !helper.isContentOnlyReplyAllowed()) {
    assert(stripItalicActionBlocks(parsed.content).trim(), `${label} 不应只输出动作标注，必须包含直接对白`, {
      raw,
      parsed,
    });
  }
  assert(!foreignSpeakerLinePattern(activeName, characterNames).test(parsed.content), `${label} 不应包含其他说话人标签`, parsed);
  for (const forbidden of forbiddenMarkers) {
    assert(!parsed.content.includes(forbidden), `${label} 不应复述其他角色 marker`, { forbidden, parsed });
  }
  const normalizedContent = parsed.content.replace(/\s+/g, "");
  for (const fragment of forbiddenContentFragments) {
    const normalizedFragment = fragment.replace(/\s+/g, "").slice(0, 24);
    if (!normalizedFragment) {
      continue;
    }
    assert(!normalizedContent.includes(normalizedFragment), `${label} 不应夹带前序角色回复`, {
      forbiddenFragment: fragment,
      parsed,
    });
  }
  for (const secret of forbiddenSecrets) {
    assert(!raw.includes(secret) && !parsed.content.includes(secret) && !String(parsed.thought ?? "").includes(secret), `${label} 不应泄露其他角色心理`, {
      secret,
      raw,
      parsed,
    });
  }
  for (const otherName of characterNames.filter((name) => name !== activeName)) {
    assert(
      !(new RegExp("(我是|作为|身为)\\\\s*" + otherName).test(raw)),
      `${label} 不应漂移成${otherName}身份`,
      raw,
    );
  }
};

const shutdown = async () => {
  try {
    await request({ type: "shutdown", requestId: "shutdown" }, "shutdown_ack", 5_000);
  } catch {
    bridge.kill();
  }
};

const cleanup = async () => {
  bridge.stdin.end();
  await new Promise((resolvePromise) => {
    bridge.once("close", resolvePromise);
  });
  if (process.env.NOVEL_CLAW_KEEP_TAVERN_LIVE_WORKSPACE !== "1") {
    rmSync(workspacePath, { recursive: true, force: true });
  }
};

try {
  log("checking bridge agents");
  const list = await request({ type: "list_agents", requestId: "list" }, "agent_definitions", 10_000);
  assert(list.agents.some((agent) => agent.id === "pi" && agent.capabilities.includes("agent")), "pi agent 应可用", list);

  const speedResults = [];
  const speedSystemPrompt = "你是 Novel Claw 真实模型测速助手。不要调用工具。";
  for (const modelId of SPEED_MODEL_IDS) {
    const runtimeModel = runtimeModelFor(modelId);
    const sessionRootDir = join(workspacePath, "speed", modelId, "session");
    log(`speed test prepare ${modelId}`);
    await createSession(sessionRootDir, speedSystemPrompt, {
      label: `speed-${modelId}`,
      modelId,
    });
    const marker = `${runMarker}_SPEED_${modelId.replace(/[^a-z0-9]+/gi, "_")}`;
    try {
      const speed = await runAgent({
        label: `speed-${modelId}`,
        sessionRootDir,
        agentRoleId: `speed-${modelId.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        runtimeModel,
        systemPrompt: speedSystemPrompt,
        userMessage: `只输出一行 JSON：{"marker":"${marker}","ok":true}`,
        requestContext: `speed_test_model=${modelId}`,
        runtimeInstruction: "只输出 JSON，不要 Markdown，不要解释。",
        timeoutMs: SPEED_TIMEOUT_MS,
      });
      assert(speed.text.includes(marker), `${modelId} 测速输出应包含 marker`, speed);
      speedResults.push({
        modelId,
        ok: true,
        firstDeltaMs: speed.firstDeltaMs,
        firstTextMs: speed.firstTextMs,
        doneMs: speed.doneMs,
        text: speed.text.trim().slice(0, 180),
      });
      log(`speed test ${modelId} ok doneMs=${speed.doneMs}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      speedResults.push({
        modelId,
        ok: false,
        error: message,
      });
      log(`speed test ${modelId} failed ${message}`);
    }
  }

  const selectedSpeed = [...speedResults]
    .filter((item) => item.ok)
    .sort((first, second) => first.doneMs - second.doneMs)[0];
  assert(selectedSpeed, "两个 MiniMax highspeed 模型测速均失败", speedResults);
  log(`selected model ${selectedSpeed.modelId} doneMs=${selectedSpeed.doneMs}`);
  const selectedModel = runtimeModelFor(selectedSpeed.modelId);
  let {
    room,
    characters,
    messages: initialMessages = [],
    scenario = "custom",
  } = helper.createFixture();
  const flowSessionRootDir = join(workspacePath, "flow", "session");
  log("creating tavern flow session");
  await createSession(flowSessionRootDir, helper.bridgeSystemPrompt(room), {
    label: "tavern-flow",
    selectedModelId: selectedModel.modelId,
    runMarker,
  });

  const flowRuns = [];
  const allMessages = [...initialMessages];
  const characterContents = [];
  const privateSecrets = [];
  const characterNameById = new Map(characters.map((character) => [character.id, character.name]));

  if (
    scenario === "werewolf" &&
    room.settings.informationPolicy.roleAssignment.opening.autoStart &&
    !room.factEvents.some((event) => event.type === "role_assignment")
  ) {
    const requestInput = helper.buildRoleAssignmentRequest({ room, characters });
    const assignmentRun = await runAgent({
      label: "tavern-role-assignment-opening",
      sessionRootDir: flowSessionRootDir,
      agentRoleId: requestInput.agentRoleId,
      runtimeModel: selectedModel,
      systemPrompt: requestInput.systemPrompt,
      userMessage: requestInput.userMessage,
      requestContext: requestInput.requestContext,
      runtimeInstruction: requestInput.runtimeInstruction,
    });
    const createdAt = Date.now();
    const assignment = helper.parseRoleAssignment({
      text: assignmentRun.text,
      room,
      characters,
      turnId: "live-director-role-assignment",
      createdAt,
    });
    room = helper.applyRoleAssignmentOpening({
      room,
      assignment,
      createdAt,
    });
    const openingMessages = [
      assignment.openingNarrator,
      assignment.dayAnnouncement,
    ].filter(Boolean).map((content, index) => ({
      id: "live-opening-narrator-" + (index + 1),
      roomId: room.id,
      role: "narrator",
      presentationProfileId: room.presentation?.profileId,
      content,
      createdAt: createdAt + index,
      status: "done",
    }));
    allMessages.push(...openingMessages);
    flowRuns.push({
      label: assignmentRun.label,
      kind: "role_assignment_opening",
      firstDeltaMs: assignmentRun.firstDeltaMs,
      firstTextMs: assignmentRun.firstTextMs,
      doneMs: assignmentRun.doneMs,
      roleFactCount: assignment.factEvents.length,
      openingNarrator: assignment.openingNarrator,
      dayAnnouncement: assignment.dayAnnouncement,
      publicFact: assignment.publicFact,
      phase: room.statusSnapshot.global?.werewolf_phase,
    });
  }

  const characterNamePattern = characters
    .map((character) => character.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");

  const assertManagedReply = (reply, label) => {
    assert(reply.trim(), `${label} 托管用户回复不能为空`);
    assert(
      !(new RegExp(`(^|\\n)\\s*(?:${characterNamePattern}|旁白|用户|旅人)\\s*[:：]`)).test(reply),
      `${label} 托管用户不应输出角色/旁白标签`,
      reply,
    );
    assert(!/<\/?(?:function_calls?|tool_calls?|invoke|tool|arguments?)[^>]*>/i.test(reply), `${label} 托管用户不应输出工具调用`, reply);
  };

  const scriptedDraftForRound = (roundIndex) => {
    if (scenario === "werewolf") {
      return [
        "我作为首位座次发言：昨夜我只听见旧钟慢了半拍，暂时不认定任何人身份，请后续玩家按座次给出公开证词。",
        "现在进入投票阶段。请停止辩论，由导演组织投票和放逐结算，不要再安排角色公开发言。",
        "继续进入下一夜，只公布公开主持流程，不要泄露隐藏身份。",
      ][roundIndex] ?? "继续按狼人杀阶段规则推进。";
    }

    if (scenario === "win-hearts") {
      if (TARGET_SILENCE_CASE && roundIndex === 0) {
        return "我看向叶小满，冒犯地问：你是不是只会靠可爱卖甜点？我知道这很冒犯，你现在不用回答我，只用动作表示你是否不快。";
      }
      return [
        "我先认真回应叶小满，指出甜品里一处具体优点，也给一个尊重她店长判断的小建议。",
        "我继续把注意力放在叶小满身上，主动帮她整理试营业动线，但也礼貌回应柳青霜。",
        "我邀请叶小满一起确认下一份新品，同时注意不替她做决定。",
      ][roundIndex] ?? "继续围绕叶小满的店长计划行动。";
    }

    return roundIndex === 0
      ? "先请贝拉、阿洛、琪拉、莫尔依次各报一句自己的岗位情况；赛恩先照看炉火，可以只给一个动作描写。"
      : "";
  };

  const selectedTargetCharacterIdsForRound = (roundIndex) => {
    if (scenario === "win-hearts" && roundIndex <= 2) {
      return ["route-ye"];
    }
    return [];
  };

  const prepareScenarioRound = (roundIndex) => {
    if (scenario !== "werewolf") {
      return;
    }

    const nextPhase = room.settings.informationPolicy.roleAssignment.opening.autoStart
      ? roundIndex === 0
        ? "day_discussion"
        : roundIndex === 1
        ? "vote"
        : "night"
      : roundIndex === 0
      ? "night"
      : roundIndex === 1
      ? "day_discussion"
      : "vote";
    room = helper.setGlobalStatus(room, "werewolf_phase", nextPhase);
  };

  const runManagedUser = async (roundIndex) => {
    const currentDraft = scriptedDraftForRound(roundIndex);
    if (DIRECT_USER_INPUT) {
      flowRuns.push({
        label: `tavern-direct-user-${roundIndex + 1}`,
        activeName: room.userPersonaName || "旅人",
        kind: "direct_user",
        content: currentDraft,
      });
      return currentDraft;
    }
    const requestInput = helper.buildManagedUserRequest({
      room,
      characters,
      messages: allMessages,
      currentDraft,
    });
    const run = await runAgent({
      label: `tavern-managed-user-${roundIndex + 1}`,
      sessionRootDir: flowSessionRootDir,
      agentRoleId: requestInput.agentRoleId,
      runtimeModel: selectedModel,
      systemPrompt: requestInput.systemPrompt,
      userMessage: requestInput.userMessage,
      requestContext: requestInput.requestContext,
      runtimeInstruction: requestInput.runtimeInstruction,
    });
    const reply = helper.parseManagedReply(run.text, room.userPersonaName);
    assertManagedReply(reply, `round ${roundIndex + 1}`);
    flowRuns.push({
      label: run.label,
      activeName: room.userPersonaName || "旅人",
      kind: "managed_user",
      firstDeltaMs: run.firstDeltaMs,
      firstTextMs: run.firstTextMs,
      doneMs: run.doneMs,
      content: reply,
    });
    return reply;
  };

  const runDirector = async (roundIndex, currentUserText, selectedTargetCharacterIds = []) => {
    const maxSpeakers = helper.fixedOrderPhase(room)
      ? characters.length
      : Math.min(4, characters.length);
    const requestInput = helper.buildDirectorRequest({
      room,
      characters,
      messages: allMessages,
      currentUserText,
      selectedTargetCharacterIds,
      maxSpeakers,
    });
    const run = await runAgent({
      label: `tavern-director-${roundIndex + 1}`,
      sessionRootDir: flowSessionRootDir,
      agentRoleId: requestInput.agentRoleId,
      runtimeModel: selectedModel,
      systemPrompt: requestInput.systemPrompt,
      userMessage: requestInput.userMessage,
      requestContext: requestInput.requestContext,
      runtimeInstruction: requestInput.runtimeInstruction,
    });
    const parsedDecision = helper.parseDirectorDecision(run.text, characters, maxSpeakers);
    const scheduledSpeakerIds = helper.resolveScheduledSpeakerIds({
      room,
      characters,
      directorSpeakerIds: parsedDecision.speakerIds,
      directorNonverbalReplyIds: parsedDecision.nonverbalReplyIds,
      selectedTargetCharacterIds,
      currentUserText,
    });
    const decision = {
      ...parsedDecision,
      speakerIds: scheduledSpeakerIds,
      ambientActions: (parsedDecision.ambientActions ?? [])
        .filter((action) => !scheduledSpeakerIds.includes(action.characterId)),
      reason: [
        parsedDecision.reason ?? "",
        scheduledSpeakerIds.join("|") !== parsedDecision.speakerIds.join("|")
          ? "应用侧调度规则已调整 speakerIds。"
          : "",
      ].filter(Boolean).join("；") || undefined,
    };
    const selectedTargetsCanStaySilent = helper.canSelectedTargetsStaySilent(room, selectedTargetCharacterIds);
    const selectedTargetNames = selectedTargetCharacterIds
      .map((characterId) => characterNameById.get(characterId))
      .filter(Boolean);
    const selectedTargetVisibleHandled = selectedTargetCharacterIds.some((characterId) =>
      decision.ambientActions?.some((action) => action.characterId === characterId)
    ) || selectedTargetNames.some((name) => decision.narrator?.includes(name));
    const scheduledOnlyForNonverbalTarget = parsedDecision.speakerIds.length === 0 &&
      scheduledSpeakerIds.some((speakerId) => helper.canCharacterUseNonverbalReply({
        room,
        characterId: speakerId,
        selectedTargetCharacterIds,
        directorNonverbalReplyIds: parsedDecision.nonverbalReplyIds,
        currentUserText,
        directorReason: parsedDecision.reason ?? "",
      }));
    if (
      parsedDecision.speakerIds.length === 0 &&
      scheduledSpeakerIds.length > 0 &&
      !scheduledOnlyForNonverbalTarget &&
      !helper.fixedOrderPhase(room)
    ) {
      formatWarnings.push({
        label: `tavern-director-${roundIndex + 1}`,
        issue: "director_empty_speaker_ids_scheduler_fallback",
        raw: run.text,
        fallbackSpeakerIds: scheduledSpeakerIds,
      });
    }
    assert(
      decision.speakerIds.length > 0 ||
        helper.directorOnlyAllowed(room) ||
        (selectedTargetsCanStaySilent && selectedTargetVisibleHandled),
      `round ${roundIndex + 1} 必须有合法 speakerId；只有导演-only 或被点名目标已有可见动作/旁白回应时才能为空`,
      {
      raw: run.text,
      decision,
      directorOnlyAllowed: helper.directorOnlyAllowed(room),
      selectedTargetsCanStaySilent,
      selectedTargetCharacterIds,
      selectedTargetNames,
    });
    flowRuns.push({
      label: run.label,
      kind: "director",
      firstDeltaMs: run.firstDeltaMs,
      firstTextMs: run.firstTextMs,
      doneMs: run.doneMs,
      decision,
    });
    return decision;
  };

  const runCharacter = async ({
    activeCharacterId,
    activeName,
    turnMessages,
    currentUserText,
    speakerIndex,
    speakerCount,
    directorReason,
    forbiddenMarkers,
    forbiddenSecrets,
    forbiddenContentFragments,
    allowNonverbalReply = false,
    label,
  }) => {
    const requestInput = helper.buildCharacterRequest({
      room,
      characters,
      activeCharacterId,
      messages: turnMessages,
      currentUserText,
      speakerIndex,
      speakerCount,
      replyMode: "director",
      isDirectorLikeMode: true,
      isManagedMode: true,
      directorReason,
      promptVariant: PROMPT_VARIANT,
      allowNonverbalReply,
    });
    for (const secret of forbiddenSecrets ?? []) {
      assert(!requestInput.requestContext.includes(secret), `${label} request_context 不应包含其他角色心理`, {
        secret,
        requestContext: requestInput.requestContext,
      });
    }
    const runAttempt = async ({ attemptLabel, runtimeInstruction }) => {
      const run = await runAgent({
        label: attemptLabel,
        sessionRootDir: flowSessionRootDir,
        agentRoleId: requestInput.agentRoleId,
        runtimeModel: selectedModel,
        systemPrompt: requestInput.systemPrompt,
        userMessage: requestInput.userMessage,
        requestContext: requestInput.requestContext,
        runtimeInstruction,
      });
      const parsed = helper.parseCharacterReply({
        text: run.text,
        room,
        characters,
        activeCharacterId,
      });

      return { run, parsed };
    };
    let retryCount = 0;
    let attempt = await runAttempt({
      attemptLabel: label,
      runtimeInstruction: requestInput.runtimeInstruction,
    });
    const contentOnlyReplyAllowed = allowNonverbalReply || helper.isContentOnlyReplyAllowed();
    if (!attempt.parsed.content.trim() || (!contentOnlyReplyAllowed && !helper.hasCharacterDialogueText(attempt.parsed.content))) {
      formatWarnings.push({
        label,
        issue: "character_unusable_reply_retry",
        raw: attempt.run.text,
        parsed: attempt.parsed,
      });
      retryCount = 1;
      const publicContentTag = helper.livePresentation.publicContentTag;
      const retryInstruction = [
        requestInput.runtimeInstruction,
        "",
        "<retry_instruction>",
        helper.isContentOnlyReplyAllowed()
          ? "上一次输出没有可展示正文。"
          : allowNonverbalReply
          ? "上一次输出没有可展示的公开动作。"
          : "上一次输出的 <reply> 为空或只有动作标注，不能作为公开回复。",
        helper.isContentOnlyReplyAllowed()
          ? `请重新输出完整 XML：<inner_thought>当前角色自己的心理短句</inner_thought><${publicContentTag}>一段可展示的第三人称正文。</${publicContentTag}>。`
          : allowNonverbalReply
          ? "请重新输出完整 XML：<inner_thought>当前角色自己的心理短句</inner_thought><reply>*一个可被观察到的动作，不写直接对白。*</reply>。"
          : "请重新输出完整 XML：<inner_thought>当前角色自己的心理短句</inner_thought><reply>一句非空直接对白，可选一个动作。</reply>。",
        helper.isContentOnlyReplyAllowed()
          ? "本轮可以没有直接对白，但必须有可读正文，不要输出聊天记录格式。"
          : allowNonverbalReply
          ? "本轮允许不开口，但必须给出用户能看到的动作或神态。"
          : "不能只点头、沉默、看向某处或只写动作；如果角色只想确认，也要先说一句短对白。",
        "</retry_instruction>",
      ].filter(Boolean).join("\n");
      attempt = await runAttempt({
        attemptLabel: `${label}-retry`,
        runtimeInstruction: retryInstruction,
      });
    }
    const { run, parsed } = attempt;
    assertCharacterReply({
      label,
      raw: run.text,
      parsed,
      forbiddenMarkers,
      forbiddenSecrets,
      forbiddenContentFragments,
      activeName,
      characterNames: characters.map((character) => character.name),
      allowNonverbalReply,
    });
    flowRuns.push({
      label,
      activeName,
      kind: "character",
      firstDeltaMs: run.firstDeltaMs,
      firstTextMs: run.firstTextMs,
      doneMs: run.doneMs,
      retryCount,
      allowNonverbalReply,
      content: parsed.content,
      thought: parsed.thought ?? "",
    });
    return {
      run,
      parsed,
      requestContext: requestInput.requestContext,
    };
  };

  for (let roundIndex = 0; roundIndex < FLOW_ROUNDS; roundIndex += 1) {
    log(`running managed/director tavern round ${roundIndex + 1}/${FLOW_ROUNDS}`);
    prepareScenarioRound(roundIndex);
    const selectedTargetCharacterIds = selectedTargetCharacterIdsForRound(roundIndex);
    const userText = await runManagedUser(roundIndex);
    const userMessage = {
      id: `u-${roundIndex + 1}`,
      roomId: room.id,
      role: "user",
      presentationProfileId: room.presentation?.profileId,
      content: userText,
      targetCharacterIds: selectedTargetCharacterIds.length > 0
        ? selectedTargetCharacterIds
        : undefined,
      createdAt: Date.now(),
      status: "done",
    };
    allMessages.push(userMessage);
    const turnMessages = [userMessage];

    const decision = await runDirector(roundIndex, userText, selectedTargetCharacterIds);
    if (decision.narrator?.trim()) {
      const narratorMessage = {
        id: `n-${roundIndex + 1}`,
        roomId: room.id,
        role: "narrator",
        presentationProfileId: room.presentation?.profileId,
        content: decision.narrator.trim(),
        createdAt: Date.now(),
        status: "done",
      };
      allMessages.push(narratorMessage);
      turnMessages.push(narratorMessage);
    }
    for (const [actionIndex, action] of (decision.ambientActions ?? []).entries()) {
      assert(!decision.speakerIds.includes(action.characterId), `round ${roundIndex + 1} ambientActions 不能包含已发言角色`, {
        decision,
        action,
      });
      assert(characterNameById.has(action.characterId), `round ${roundIndex + 1} ambientActions 必须使用合法角色`, action);
      const actionMessage = {
        id: `a-${roundIndex + 1}-${action.characterId}-${actionIndex}`,
        roomId: room.id,
        role: "narrator",
        characterId: action.characterId,
        presentationProfileId: room.presentation?.profileId,
        content: action.action,
        createdAt: Date.now(),
        status: "done",
      };
      allMessages.push(actionMessage);
      turnMessages.push(actionMessage);
      flowRuns.push({
        label: `tavern-ambient-action-${roundIndex + 1}-${characterNameById.get(action.characterId) ?? action.characterId}`,
        activeName: characterNameById.get(action.characterId) ?? action.characterId,
        kind: "ambient_action",
        content: action.action,
      });
    }

    let speakerQueue = decision.speakerIds;
    let continuationRound = 0;
    let speakerRunIndex = 0;
    let currentContinuationInteractionIds = [];
    const closedInteractionIds = new Set();
    const continuationInstructionBySpeakerId = new Map();

    while (speakerQueue.length > 0) {
      const activeSpeakerIds = speakerQueue;
      speakerQueue = [];
      const activeContinuationInteractionIds = currentContinuationInteractionIds;
      currentContinuationInteractionIds = [];

      for (const [speakerIndex, speakerId] of activeSpeakerIds.entries()) {
        const activeName = characterNameById.get(speakerId) ?? speakerId;
        const continuationInstruction = continuationInstructionBySpeakerId.get(speakerId);
        const baseDirectorReason = room.settings.informationPolicy.hiddenFacts.enabled ||
            room.settings.informationPolicy.mode === "social_deduction" ||
            room.settings.informationPolicy.mode === "mystery"
          ? "导演根据当前公开流程安排本轮发言；只依据自己可见信息回应，不要泄露身份、阵营或私密事实。"
          : decision.reason ?? "";
        const directorReasonText = [
          baseDirectorReason,
          continuationInstruction
            ? `自动续调度：${continuationInstruction}`
            : "",
        ].filter(Boolean).join("\n");
        const allowNonverbalReply = helper.canCharacterUseNonverbalReply({
          room,
          characterId: speakerId,
          selectedTargetCharacterIds,
          directorNonverbalReplyIds: decision.nonverbalReplyIds,
          currentUserText: userText,
          directorReason: directorReasonText,
        });
        const otherTurnSecrets = privateSecrets
          .filter((item) => item.characterId !== speakerId && turnMessages.some((message) => message.id === item.messageId))
          .map((item) => item.secret);
        const forbiddenContentFragments = characterContents
          .filter((item) => item.characterId !== speakerId)
          .map((item) => item.content);
        const characterRun = await runCharacter({
          activeCharacterId: speakerId,
          activeName,
          turnMessages,
          currentUserText: userText,
          speakerIndex,
          speakerCount: activeSpeakerIds.length,
          directorReason: directorReasonText,
          forbiddenMarkers: [],
          forbiddenSecrets: otherTurnSecrets,
          forbiddenContentFragments,
          allowNonverbalReply,
          label: continuationRound > 0
            ? `tavern-round-${roundIndex + 1}-continuation-${continuationRound}-${activeName}`
            : `tavern-round-${roundIndex + 1}-${activeName}`,
        });
        for (const prior of turnMessages) {
          if (
            prior.role === "character" &&
            prior.characterId !== speakerId &&
            prior.content.trim()
          ) {
            assert(characterRun.requestContext.includes(prior.content), `${activeName} request_context 应包含本轮前序角色公开回复`, {
              prior,
              requestContext: characterRun.requestContext,
            });
          }
        }
        const secret = `${runMarker}_ROUND_${roundIndex + 1}_${speakerId}_PRIVATE_SECRET`;
        const messageId = `c-${roundIndex + 1}-${speakerId}-${speakerRunIndex}`;
        speakerRunIndex += 1;
        const message = {
          id: messageId,
          roomId: room.id,
          role: "character",
          characterId: speakerId,
          kind: helper.livePresentation.characterMessageKind,
          presentationProfileId: room.presentation?.profileId,
          content: characterRun.parsed.content,
          thought: [characterRun.parsed.thought ?? "", secret].filter(Boolean).join("\n"),
          respondsToInteractionIds: activeContinuationInteractionIds.length > 0
            ? activeContinuationInteractionIds
            : undefined,
          createdAt: Date.now(),
          status: "done",
        };
        allMessages.push(message);
        turnMessages.push(message);
        characterContents.push({
          characterId: speakerId,
          content: characterRun.parsed.content,
        });
        privateSecrets.push({
          messageId,
          characterId: speakerId,
          secret,
        });
      }

      const latestPendingInteractions = helper.extractPendingInteractions({
        room,
        characters,
        messages: turnMessages,
        turnId: userMessage.id,
      }).filter((interaction) => !closedInteractionIds.has(interaction.id));
      const continuationPlan = room.settings.continuation.enabled &&
          !helper.suppressContinuation(room)
        ? helper.planContinuation({
            room,
            characters,
            pendingInteractions: latestPendingInteractions,
            continuationRound,
          })
        : {
            shouldContinue: false,
            speakerIds: [],
            interactionIds: [],
            reason: "none",
          };

      if (!continuationPlan.shouldContinue) {
        break;
      }

      continuationRound += 1;
      currentContinuationInteractionIds = continuationPlan.interactionIds;
      for (const interactionId of continuationPlan.interactionIds) {
        closedInteractionIds.add(interactionId);
      }
      const interactionText = latestPendingInteractions.find((interaction) =>
        continuationPlan.interactionIds.includes(interaction.id)
      )?.text;
      speakerQueue = continuationPlan.speakerIds.filter((speakerId) =>
        characterNameById.has(speakerId)
      );
      for (const speakerId of speakerQueue) {
        continuationInstructionBySpeakerId.set(
          speakerId,
          interactionText
            ? `回应刚才指向你的待回应事项：「${interactionText}」。`
            : "回应刚才指向你的待回应事项。",
        );
      }
      flowRuns.push({
        label: `tavern-continuation-${roundIndex + 1}-${continuationRound}`,
        kind: "continuation",
        decision: continuationPlan,
        pendingInteractions: latestPendingInteractions,
      });
    }

    if (scenario === "win-hearts" && !TARGET_SILENCE_CASE && LIVE_PROGRESS_VALUE !== 0) {
      const progressPatch = helper.advanceProgressFromFacts({
        room,
        factEvents: [{
          id: `live-win-hearts-progress-${roundIndex + 1}`,
          turnId: userMessage.id,
          sourceMessageIds: turnMessages.map((message) => message.id),
          type: "help",
          actor: { type: "user", userId: "user" },
          target: { type: "character", characterId: "route-ye" },
          value: LIVE_PROGRESS_VALUE,
          evidence: `真实 LLM 第 ${roundIndex + 1} 轮后，用户持续以明确行动支持叶小满。`,
          confidence: 0.96,
          visibility: "public",
          createdAt: Date.now(),
        }],
        turnId: userMessage.id,
        createdAt: Date.now(),
      });
      room = {
        ...room,
        ...progressPatch,
      };
      flowRuns.push({
        label: `tavern-progress-${roundIndex + 1}`,
        kind: "progress",
        value: LIVE_PROGRESS_VALUE,
        yeFavorability: room.statusSnapshot.relationships?.["character:route-ye::user"]?.favorability,
        completedTasks: Object.fromEntries(
          Object.entries(room.taskSnapshot).map(([key, value]) => [key, value.status]),
        ),
        outcomes: room.outcomeEvents.map((event) => event.outcomeId),
      });
    }
  }

  if (scenario === "werewolf") {
    const directorRuns = flowRuns.filter((run) => run.kind === "director");
    const roleAssignmentRuns = flowRuns.filter((run) => run.kind === "role_assignment_opening");
    assert(
      roleAssignmentRuns.length === 1 && roleAssignmentRuns[0].roleFactCount === 6,
      "狼人杀真实流程应先由导演实时分配用户+5名角色身份",
      roleAssignmentRuns,
    );
    if (FLOW_ROUNDS >= 1) {
      assert(
        directorRuns[0]?.decision?.speakerIds.join("|") === "wolf-qiao|wolf-shen|wolf-tan|wolf-lin|wolf-bai",
        "狼人杀开局后第一轮应视为用户首位发言，然后按存活座次调度其他角色",
        directorRuns[0],
      );
    }
    if (FLOW_ROUNDS >= 2) {
      assert(directorRuns[1]?.decision?.speakerIds.length === 0, "狼人杀投票阶段不应继续公开辩论发言", directorRuns[1]);
    }
    assert(
      !flowRuns.some((run) => run.kind === "continuation"),
      "狼人杀固定顺序/投票流程不应触发自动续调度",
      flowRuns.filter((run) => run.kind === "continuation"),
    );
  }

  if (scenario === "win-hearts") {
    const directorRuns = flowRuns.filter((run) => run.kind === "director");
    const targetHandled = (run) =>
      run.decision?.speakerIds.includes("route-ye") ||
      run.decision?.nonverbalReplyIds?.includes("route-ye") ||
      run.decision?.ambientActions?.some((action) => action.characterId === "route-ye") ||
      /叶小满|小满/.test(run.decision?.narrator ?? "");
    assert(
      directorRuns.slice(0, Math.min(3, FLOW_ROUNDS)).every(targetHandled),
      "好感度指定叶小满时，导演必须处理目标，但目标可以发言、动作反应或被旁白处理",
      directorRuns,
    );
    if (TARGET_SILENCE_CASE) {
      const routeYeRuns = flowRuns.filter((run) =>
        run.kind === "character" && run.activeName === "叶小满"
      );
      assert(
        routeYeRuns.some((run) =>
          run.allowNonverbalReply && !helper.hasCharacterDialogueText(run.content ?? "")
        ),
        "目标沉默 case 应由叶小满角色 Agent 输出非语言回复，而不是旁白替代或直接对白",
        routeYeRuns,
      );
    }
    if (ASSERT_GAME_VICTORY) {
      assert(
        room.taskSnapshot["win-ye-xiaoman-heart"]?.status === "completed",
        "好感度真实 LLM 流程应完成叶小满路线任务",
        { taskSnapshot: room.taskSnapshot, flowRuns: flowRuns.filter((run) => run.kind === "progress") },
      );
      assert(
        room.outcomeEvents.some((event) => event.outcomeId === "ye-route-clear"),
        "好感度真实 LLM 流程应触发叶小满路线胜利事件",
        { outcomeEvents: room.outcomeEvents },
      );
    }
  }

  console.log(JSON.stringify({
    ok: true,
    scenario,
    targetSilenceCase: TARGET_SILENCE_CASE,
    directUserInput: DIRECT_USER_INPUT,
    assertGameVictory: ASSERT_GAME_VICTORY,
    liveProgressValue: LIVE_PROGRESS_VALUE,
    summaryOnly: SUMMARY_ONLY,
    selectedModelId: selectedModel.modelId,
    promptVariant: PROMPT_VARIANT,
    presentation: {
      requestedProfileId: PRESENTATION_PROFILE_ID,
      ...helper.livePresentation,
    },
    rounds: FLOW_ROUNDS,
    speedResults,
    formatWarnings,
    flowRuns: SUMMARY_ONLY
      ? flowRuns.map((run) => ({
          label: run.label,
          kind: run.kind,
          activeName: run.activeName,
          decision: run.kind === "director" ? run.decision : undefined,
          allowNonverbalReply: run.allowNonverbalReply,
          retryCount: run.retryCount,
          content: typeof run.content === "string" ? run.content.slice(0, 120) : undefined,
          value: run.value,
          completedTasks: run.completedTasks,
          outcomes: run.outcomes,
        }))
      : flowRuns,
    finalProgress: scenario === "win-hearts"
      ? {
          taskSnapshot: room.taskSnapshot,
          outcomeEvents: room.outcomeEvents,
        }
      : undefined,
  }, null, 2));

  await shutdown();
} finally {
  await cleanup();
}
