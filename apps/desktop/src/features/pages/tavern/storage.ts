import { invoke, isTauri } from "@tauri-apps/api/core";
import { normalizeTavernAvatarId } from "@/assets/agent-avatars";
import {
  DEFAULT_VISUAL_PRESET_ID,
  normalizeVisualPresetId,
} from "@/features/pages/tavern/visual-presets";
import systemPresetData from "./system-presets/default-taverns.json";
import type {
  TavernAssetDraft,
  TavernCharacter,
  TavernCharacterRelationship,
  TavernCharacterPrivateStatus,
  TavernCharacterPublicStatus,
  TavernCharacterMemoryDraft,
  TavernCondition,
  TavernDirectorProfile,
  TavernEntityRef,
  TavernIllustrationHint,
  TavernLorebookEntry,
  TavernLorebookDraft,
  TavernMessage,
  TavernFactEvent,
  TavernGeneratedPresetJson,
  TavernGeneratedPresetRoom,
  TavernGeneratedPresetScene,
  TavernOutcomeEvent,
  TavernPendingInteraction,
  TavernPresentationSettings,
  TavernProgressCheckpoint,
  TavernProgressTrackerSettings,
  TavernProgressAction,
  TavernProgressView,
  TavernReplyMode,
  TavernReplyOption,
  TavernRelationshipTarget,
  TavernRoom,
  TavernRoomCharacterConfig,
  TavernSceneRelationshipOverride,
  TavernSceneOutcomeDefinition,
  TavernSceneStatus,
  TavernScene,
  TavernStoryEdge,
  TavernStoryGraph,
  TavernStoryNode,
  TavernStoryStage,
  TavernRoomSettings,
  TavernState,
  TavernStatusDefinition,
  TavernStatusEvent,
  TavernStatusRule,
  TavernStatusSnapshot,
  TavernStatusTargetRef,
  TavernTaskDefinition,
  TavernTaskEvent,
  TavernTaskState,
} from "./types";
import {
  createTavernDirectorProfileFromCharacters,
  normalizeTavernDirectorProfile,
} from "./core/scheduling-profile";
import {
  buildTavernMessageSegments,
  inferTavernMessageKind,
} from "./message";
import {
  DEFAULT_TAVERN_PROMPT_STYLE_ID,
  normalizeTavernPromptStyleId,
} from "./prompt-styles";
import {
  DEFAULT_TAVERN_SYSTEM_NARRATIVE_PRESET_ID,
  normalizeTavernSystemNarrativePresetSettings,
} from "./prompt-registry/system-narrative-styles";
import {
  DEFAULT_TAVERN_INTERACTION_QUALITY_RULE_IDS,
  DEFAULT_TAVERN_RULE_COMPOSITION_ID,
  normalizeTavernQualityRuleIds,
  normalizeTavernRuleCompositionId,
} from "./prompt-registry/rule-layers/resolver";
import {
  createDefaultTavernPresentation,
  normalizeTavernPresentation,
} from "./prompt-registry/presentation-rules";
import {
  createDefaultTavernPromptSettings,
  normalizeTavernPromptSettings,
} from "./prompt-registry/text-blocks";

const STORAGE_PREFIX = "novel-claw:tavern";

const storageKeyForWorkspace = (workspaceId: string) => `${STORAGE_PREFIX}:${workspaceId}`;

const padIdPart = (value: number, length = 2) => value.toString().padStart(length, "0");

const formatTimestampId = (date: Date) => [
  date.getFullYear(),
  padIdPart(date.getMonth() + 1),
  padIdPart(date.getDate()),
  "-",
  padIdPart(date.getHours()),
  padIdPart(date.getMinutes()),
  padIdPart(date.getSeconds()),
  "-",
  padIdPart(date.getMilliseconds(), 3),
].join("");

const createId = (prefix: string) => {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `${prefix}-${formatTimestampId(new Date())}-${suffix}`;
};

const now = () => Date.now();

const createDefaultPromptForPresentation = (
  presentation: TavernPresentationSettings,
) => createDefaultTavernPromptSettings({
  presentationProfileId: presentation.profileId,
  promptStyleId: DEFAULT_TAVERN_PROMPT_STYLE_ID,
  systemNarrativePresetId: DEFAULT_TAVERN_SYSTEM_NARRATIVE_PRESET_ID,
  ruleCompositionId: DEFAULT_TAVERN_RULE_COMPOSITION_ID,
  immersiveDescriptionEnabled: DEFAULT_TAVERN_ROOM_SETTINGS.immersiveDescriptionEnabled,
});

type TavernSystemPresetCharacter = {
  id: string;
  name: string;
  avatar: string;
  description: string;
  speakingStyle: string;
  writingStyle?: string;
  replyStylePrompt?: string;
  goals?: string;
  relationships?: TavernCharacterRelationship[];
};

type TavernSystemPresetMessage = {
  role: TavernMessage["role"];
  characterId?: string;
  content: string;
};

type TavernSystemPresetScene = {
  title?: string;
  order?: number;
  scenePresetId?: unknown;
  scene?: string;
  sceneGoal?: string;
  plot?: string;
  storyDirection?: string;
  transition?: string;
  memory?: string;
  relationshipOverrides?: TavernSceneRelationshipOverride[];
  sceneStatus?: Partial<TavernSceneStatus>;
  characterPublicStatuses?: Record<string, Partial<TavernCharacterPublicStatus>>;
  characterPrivateStatuses?: Record<string, Partial<TavernCharacterPrivateStatus>>;
  statusSnapshot?: Partial<TavernStatusSnapshot>;
  taskDefinitions?: TavernTaskDefinition[];
  sceneOutcomes?: TavernSceneOutcomeDefinition[];
  characterMemories?: Record<string, string>;
  lorebookEntries?: Array<{
    title: string;
    content: string;
    keywords?: string[];
    enabled?: boolean;
    alwaysOn?: boolean;
  }>;
  assetDrafts?: Array<{
    sourceMessageIds?: string[];
    characterMemories?: Array<{
      characterId: string;
      note: string;
    }>;
    lorebookEntries?: Array<{
      title: string;
      content: string;
      keywords?: string[];
      alwaysOn?: boolean;
    }>;
  }>;
  characterIds?: string[];
  activeCharacterId?: string;
};

type TavernSystemPresetRoom = {
  title: string;
  presentation?: Partial<TavernPresentationSettings> & {
    profileId?: unknown;
  };
  presentationProfileId?: unknown;
  promptStyleId?: unknown;
  storyOutline?: string;
  storyGoal?: string;
  scenePresetId?: unknown;
  scene: string;
  sceneGoal?: string;
  plot?: string;
  storyDirection?: string;
  transition?: string;
  memory?: string;
  relationshipOverrides?: TavernSceneRelationshipOverride[];
  sceneStatus?: Partial<TavernSceneStatus>;
  characterPublicStatuses?: Record<string, Partial<TavernCharacterPublicStatus>>;
  characterPrivateStatuses?: Record<string, Partial<TavernCharacterPrivateStatus>>;
  statusDefinitions?: TavernStatusDefinition[];
  statusRules?: TavernStatusRule[];
  progressViews?: TavernProgressView[];
  progressTracker?: Partial<TavernProgressTrackerSettings>;
  statusSnapshot?: Partial<TavernStatusSnapshot>;
  taskDefinitions?: TavernTaskDefinition[];
  sceneOutcomes?: TavernSceneOutcomeDefinition[];
  scenes?: TavernSystemPresetScene[];
  characterMemories?: Record<string, string>;
  lorebookEntries?: Array<{
    title: string;
    content: string;
    keywords?: string[];
    enabled?: boolean;
    alwaysOn?: boolean;
  }>;
  assetDrafts?: Array<{
    sourceMessageIds?: string[];
    characterMemories?: Array<{
      characterId: string;
      note: string;
    }>;
    lorebookEntries?: Array<{
      title: string;
      content: string;
      keywords?: string[];
      alwaysOn?: boolean;
    }>;
  }>;
  characterIds: string[];
  activeCharacterId: string;
  replyMode?: TavernReplyMode;
  userPersonaName?: string;
  settings?: Partial<TavernRoomSettings>;
};

export type TavernSystemPreset = {
  id: string;
  version: number;
  label: string;
  description: string;
  characters: TavernSystemPresetCharacter[];
  room: TavernSystemPresetRoom;
  messages: TavernSystemPresetMessage[];
};

type TavernSystemPresetCollection = {
  version: 2;
  presets: TavernSystemPreset[];
};

const tavernSystemPresetCollection = systemPresetData as unknown as TavernSystemPresetCollection;

export const tavernSystemPresets = tavernSystemPresetCollection.presets;

const tavernSystemPresetById = new Map(
  tavernSystemPresets.map((preset) => [preset.id, preset]),
);

export const getTavernSystemPreset = (presetId: string | null | undefined) =>
  tavernSystemPresetById.get(presetId ?? "") ?? null;

const LEGACY_TAVERN_SYSTEM_PRESET_TITLES = new Set([
  "雾港失物馆",
  "竹雨驿馆",
  "星坠补给吧",
  "灰月商队馆",
  "万象问命馆",
  "月下圆桌狼人杀",
  "心动争夺赛：谁先赢得你",
  "双人攻略：你先打动谁",
  "刀雨驿站",
]);

const normalizeSystemPresetId = (presetId: unknown) => {
  if (typeof presetId !== "string") {
    return undefined;
  }

  return getTavernSystemPreset(presetId)?.id;
};

const shouldDiscardLegacyTavernRoom = (room: Partial<TavernRoom>) => {
  const rawSystemPresetId = typeof room.systemPresetId === "string"
    ? room.systemPresetId.trim()
    : "";
  if (rawSystemPresetId && !getTavernSystemPreset(rawSystemPresetId)) {
    return true;
  }

  const title = typeof room.title === "string" ? room.title.trim() : "";
  return LEGACY_TAVERN_SYSTEM_PRESET_TITLES.has(title);
};

const normalizeSystemPresetCharacterId = (
  presetId: string | undefined,
  characterId: unknown,
) => {
  if (!presetId || typeof characterId !== "string") {
    return undefined;
  }

  return getTavernSystemPreset(presetId)?.characters.some((character) =>
    character.id === characterId
  )
    ? characterId
    : undefined;
};

const createTavernCharacterFromSystemPresetCharacter = (
  character: TavernSystemPresetCharacter,
  options: {
    id?: string;
    createdAt?: number;
  } = {},
): TavernCharacter => {
  const createdAt = options.createdAt ?? now();
  return {
    id: options.id ?? createId("character"),
    name: character.name.trim(),
    avatar: normalizeTavernAvatarId(character.avatar),
    description: character.description.trim(),
    speakingStyle: character.speakingStyle.trim(),
    writingStyle: character.writingStyle?.trim() || undefined,
    replyStylePrompt: character.replyStylePrompt?.trim() || undefined,
    goals: character.goals?.trim() || undefined,
    relationships: normalizeCharacterRelationships(character.relationships, createdAt),
    createdAt,
    updatedAt: createdAt,
  };
};

const defaultSceneTitle = "默认场景";

export const DEFAULT_TAVERN_ROOM_SETTINGS: TavernRoomSettings = {
  immersiveDescriptionEnabled: true,
  showExecutionTrace: false,
  autoAssetExtractionEnabled: false,
  assetExtractionIntervalTurns: 3,
  maxAssetDrafts: 5,
  directorMaxSpeakers: 3,
  agentKnowledgeCompactIntervalTurns: 0,
  interactionQualityRuleIds: [...DEFAULT_TAVERN_INTERACTION_QUALITY_RULE_IDS],
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
          when: "用户明确询问、点名、选择候选回复目标，或上一位角色的问题明确指向某角色。",
          priority: 100,
          instruction: "被直接指向的角色必须优先被导演评估；若需要回应但不适合开口，应进入 nonverbalReplyIds 并由角色 Agent 输出心理和动作，不要改成旁白代替。只有完全无需近景反应时才不调度。",
        },
        {
          id: "goal-competes-for-user-attention",
          label: "目标竞争用户注意",
          when: "角色的个人任务、胜利条件、关系目标或当前人设目标与获得用户注意/好感/信任相关。",
          priority: 72,
          instruction: "即使用户没有点名，该角色也可以主动发言吸引用户注意，但不要每轮都抢话；根据人设克制程度决定是否加入。",
        },
        {
          id: "knowledge-holder-helps-or-misdirects",
          label: "知情者介入",
          when: "角色掌握与当前问题相关的公开事实、私有事实、阵营信息、线索或世界书知识。",
          priority: 68,
          instruction: "友好或守序角色倾向于补充帮助；有隐藏目标、敌对或欺骗动机的角色可误导、转移焦点或半真半假地发言，但不能泄露不该公开的事实。",
        },
        {
          id: "relationship-stakes",
          label: "关系利益相关",
          when: "当前发言会影响角色与用户或其他角色的好感、敌对、信任、承诺或竞争关系。",
          priority: 58,
          instruction: "关系利益越高，说话欲望越高；关系冷淡或无关的角色保持旁观或只做 ambient action。",
        },
        {
          id: "quiet-temperament-brake",
          label: "沉默人设刹车",
          when: "角色人设是寡言、谨慎、冷淡、观察者、守规矩，且没有被点名、没有关键事实、没有强利益相关。",
          priority: 25,
          instruction: "这类角色一般不要加入 speakerIds，可用 ambientActions 表示弱在场；但如果被点名或需要近景非语言反应，可加入 nonverbalReplyIds 并用角色动作完成本轮。",
        }
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
      opening: {
        autoStart: false,
        publicEventType: "",
        globalStatusPatches: [],
      },
    },
  },
};

export const DEFAULT_TAVERN_PROGRESS_TRACKER: TavernProgressTrackerSettings = {
  enabled: false,
  mode: "manual",
  intervalTurns: 1,
  applyMode: "review",
  factConfidenceThreshold: 0.75,
  generateCheckpointBeforeContextTrim: true,
};

export const DEFAULT_TAVERN_STATUS_DEFINITIONS: TavernStatusDefinition[] = [
  {
    id: "scene_phase",
    label: "阶段",
    scope: "scene",
    valueType: "text",
    defaultValue: "",
    visibility: "public",
    updatePolicy: {
      mode: "manualOnly",
      requireFactEvent: false,
    },
  },
  {
    id: "threat_level",
    label: "威胁",
    scope: "scene",
    valueType: "number",
    defaultValue: 0,
    visibility: "public",
    min: 0,
    max: 100,
    updatePolicy: {
      mode: "eventDrivenWithReview",
      requireFactEvent: true,
      allowedEventTypes: ["threat", "stabilize"],
      maxDeltaPerTurn: 20,
      confidenceThreshold: 0.75,
    },
  },
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
      mode: "eventDrivenWithReview",
      requireFactEvent: true,
      allowedEventTypes: ["damage", "healing"],
      maxDeltaPerTurn: 30,
      confidenceThreshold: 0.75,
    },
  },
  {
    id: "san",
    label: "理智",
    scope: "character",
    valueType: "number",
    defaultValue: 100,
    visibility: "private",
    min: 0,
    max: 100,
    updatePolicy: {
      mode: "eventDrivenWithReview",
      requireFactEvent: true,
      allowedEventTypes: ["sanityShock", "comfort", "rest"],
      maxDeltaPerTurn: 15,
      confidenceThreshold: 0.75,
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
      mode: "eventDrivenWithReview",
      requireFactEvent: true,
      allowedEventTypes: ["help", "gift", "betrayal", "promiseKept", "promiseBroken", "dateAccepted", "dateRejected"],
      maxDeltaPerTurn: 5,
      confidenceThreshold: 0.8,
      manualReviewAboveDelta: 3,
    },
  },
  {
    id: "hostility",
    label: "敌对",
    scope: "relationship",
    valueType: "number",
    defaultValue: 0,
    visibility: "private",
    min: 0,
    max: 100,
    relationship: {
      directed: true,
      allowedSubjectTypes: ["character", "user"],
      allowedObjectTypes: ["character", "user"],
    },
    updatePolicy: {
      mode: "eventDrivenWithReview",
      requireFactEvent: true,
      allowedEventTypes: ["betrayal", "threat", "attack", "insult"],
      maxDeltaPerTurn: 10,
      confidenceThreshold: 0.8,
    },
  },
];

export const DEFAULT_TAVERN_STATUS_RULES: TavernStatusRule[] = [
  {
    id: "damage-to-health",
    label: "伤害降低健康",
    when: { eventType: "damage", targetScope: "character" },
    apply: {
      statusId: "health",
      target: "eventTarget",
      op: "add",
      valueByIntensity: {
        trivial: -1,
        minor: -5,
        moderate: -15,
        major: -30,
        critical: -60,
      },
      clamp: [0, 100],
    },
    safeguards: {
      maxDeltaPerTurn: 30,
      requireExplicitEvidence: true,
      manualReviewAboveDelta: 20,
    },
  },
  {
    id: "threat-to-scene-threat",
    label: "威胁事件提升场景威胁",
    when: { eventType: "threat", targetScope: "scene" },
    apply: {
      statusId: "threat_level",
      target: "eventTarget",
      op: "add",
      valueByIntensity: {
        trivial: 2,
        minor: 5,
        moderate: 15,
        major: 40,
        critical: 70,
      },
      clamp: [0, 100],
    },
    safeguards: {
      maxDeltaPerTurn: 40,
      requireExplicitEvidence: true,
      manualReviewAboveDelta: 20,
    },
  },
  {
    id: "stabilize-to-scene-threat",
    label: "稳定行动降低场景威胁",
    when: { eventType: "stabilize", targetScope: "scene" },
    apply: {
      statusId: "threat_level",
      target: "eventTarget",
      op: "add",
      valueByIntensity: {
        trivial: -2,
        minor: -5,
        moderate: -15,
        major: -35,
        critical: -60,
      },
      clamp: [0, 100],
    },
    safeguards: {
      maxDeltaPerTurn: 35,
      requireExplicitEvidence: true,
      manualReviewAboveDelta: 20,
    },
  },
  {
    id: "healing-to-health",
    label: "治疗恢复健康",
    when: { eventType: "healing", targetScope: "character" },
    apply: {
      statusId: "health",
      target: "eventTarget",
      op: "add",
      valueByIntensity: {
        trivial: 1,
        minor: 5,
        moderate: 15,
        major: 30,
        critical: 60,
      },
      clamp: [0, 100],
    },
  },
  {
    id: "shock-to-san",
    label: "冲击降低理智",
    when: { eventType: "sanityShock", targetScope: "character" },
    apply: {
      statusId: "san",
      target: "eventTarget",
      op: "add",
      valueByIntensity: {
        trivial: -1,
        minor: -2,
        moderate: -5,
        major: -15,
        critical: -30,
      },
      clamp: [0, 100],
    },
    safeguards: {
      maxDeltaPerTurn: 15,
      requireExplicitEvidence: true,
      manualReviewAboveDelta: 10,
    },
  },
  {
    id: "help-to-favorability",
    label: "帮助提升被帮助者好感",
    when: { eventType: "help", targetScope: "relationship" },
    apply: {
      statusId: "favorability",
      target: "relationshipTargetToActor",
      op: "add",
      valueByIntensity: {
        trivial: 1,
        minor: 1,
        moderate: 3,
        major: 5,
        critical: 8,
      },
      clamp: [-100, 100],
    },
    safeguards: {
      maxDeltaPerTurn: 5,
      requireExplicitEvidence: true,
      manualReviewAboveDelta: 3,
    },
  },
  {
    id: "betrayal-to-hostility",
    label: "背叛提升受害者敌对",
    when: { eventType: "betrayal", targetScope: "relationship" },
    apply: {
      statusId: "hostility",
      target: "relationshipTargetToActor",
      op: "add",
      valueByIntensity: {
        minor: 5,
        moderate: 10,
        major: 20,
        critical: 35,
      },
      clamp: [0, 100],
    },
    safeguards: {
      maxDeltaPerTurn: 20,
      requireExplicitEvidence: true,
    },
  },
];

export const DEFAULT_TAVERN_PROGRESS_VIEWS: TavernProgressView[] = [
  {
    id: "scene-overview",
    label: "全局状态",
    kind: "status",
    placement: "sidePanel",
    ownerBinding: "scene",
    layout: "compact",
    compareWith: "previousTurn",
    items: [
      { type: "status", statusId: "scene_phase", display: "text", hiddenWhenDefault: true },
      { type: "status", statusId: "threat_level", display: "meter", showDelta: true },
    ],
  },
  {
    id: "character-vitals",
    label: "角色状态",
    kind: "status",
    placement: "characterCard",
    ownerBinding: "allCharacters",
    layout: "bars",
    compareWith: "previousTurn",
    items: [
      { type: "status", statusId: "health", display: "bar", showDelta: true },
      { type: "status", statusId: "san", display: "bar", showDelta: true },
    ],
  },
  {
    id: "scene-progress",
    label: "任务与结局",
    kind: "mixed",
    placement: "sidePanel",
    ownerBinding: "scene",
    layout: "questLog",
    compareWith: "previousTurn",
    items: [],
  },
  {
    id: "relationship-to-user",
    label: "对你的态度",
    kind: "status",
    placement: "composerBelow",
    ownerBinding: "allCharactersToUser",
    layout: "compact",
    compareWith: "previousTurn",
    items: [
      { type: "status", statusId: "favorability", display: "meter", showDelta: true },
      { type: "status", statusId: "hostility", display: "meter", showDelta: true },
    ],
  },
];

export const DEFAULT_TAVERN_TASK_DEFINITIONS: TavernTaskDefinition[] = [
  {
    id: "stabilize-scene-threat",
    title: "稳定当前局势",
    description: "当场景威胁升高时，需要通过明确行动把局势重新压回可控范围。",
    scope: "scene",
    owner: { type: "scene", sceneId: "current" },
    visibility: "public",
    required: true,
    optional: false,
    repeatable: false,
    lifecycle: {
      initialStatus: "inactive",
      startCondition: {
        status: "threat_level",
        target: { type: "scene" },
        gte: 40,
      },
      completeCondition: {
        status: "threat_level",
        target: { type: "scene" },
        lte: 20,
      },
      failCondition: {
        status: "threat_level",
        target: { type: "scene" },
        gte: 90,
      },
    },
    onComplete: [
      {
        type: "messageInline",
        visibility: "public",
        text: "局势暂时稳定下来，新的选择窗口打开了。",
      },
      {
        type: "replyOptions",
        options: [
          {
            id: "progress-reply-check-party",
            text: "确认每个人的状态。",
            targetCharacterIds: [],
            intent: "inspect",
          },
          {
            id: "progress-reply-press-on",
            text: "趁局势稳定继续推进。",
            targetCharacterIds: [],
            intent: "act",
          },
        ],
      },
    ],
    onFail: [
      {
        type: "messageInline",
        visibility: "public",
        text: "局势已经失控，所有人都能感到危险正在逼近。",
      },
      {
        type: "directorDirective",
        instruction: "下一轮聚焦失控后果和角色反应，不要替用户选择撤退或牺牲。",
      },
    ],
  },
  {
    id: "earn-trust-through-help",
    title: "赢得同伴信任",
    description: "通过两次明确帮助或保护行动，让至少一位同伴建立信任。",
    scope: "personal",
    owner: { type: "user", userId: "user" },
    visibility: "owner",
    required: false,
    optional: true,
    repeatable: false,
    lifecycle: {
      initialStatus: "active",
      completeCondition: {
        factEvent: "help",
        actor: { type: "user", userId: "user" },
        countGte: 2,
      },
      failCondition: {
        factEvent: "betrayal",
        actor: { type: "user", userId: "user" },
        countGte: 1,
      },
    },
    onComplete: [
      {
        type: "messageInline",
        visibility: "owner",
        text: "至少一位同伴开始更愿意相信你的判断。",
      },
    ],
  },
];

export const DEFAULT_TAVERN_SCENE_OUTCOMES: TavernSceneOutcomeDefinition[] = [
  {
    id: "scene-stabilized-success",
    label: "局势已稳定",
    winner: [{ type: "user", userId: "user" }],
    condition: {
      task: "stabilize-scene-threat",
      owner: { type: "scene", sceneId: "current" },
      status: "completed",
    },
    priority: 60,
    exclusive: false,
    endScene: "suggest",
    visibility: "public",
    onAchieved: [
      {
        type: "replyOptions",
        options: [
          {
            id: "progress-reply-end-scene",
            text: "确认这一阶段暂时告一段落。",
            targetCharacterIds: [],
            intent: "act",
          },
        ],
      },
    ],
  },
  {
    id: "scene-overwhelmed-failure",
    label: "局势失控",
    loser: [{ type: "user", userId: "user" }],
    condition: {
      status: "threat_level",
      target: { type: "scene" },
      gte: 90,
    },
    priority: 100,
    exclusive: true,
    endScene: "suggest",
    visibility: "public",
  },
];

const normalizeReplyMode = (value: unknown): TavernReplyMode =>
  value === "round" || value === "director" ? value : "active";

const normalizeRoomPresentation = ({
  presentation,
  presentationProfileId,
}: {
  presentation?: unknown;
  presentationProfileId?: unknown;
}) => normalizeTavernPresentation(
  presentation ?? (presentationProfileId ? { profileId: presentationProfileId } : undefined),
);

const materializeTavernMessage = (
  message: TavernMessage,
  presentationProfileId: TavernMessage["presentationProfileId"],
): TavernMessage => {
  const nextMessage = {
    ...message,
    presentationProfileId: message.presentationProfileId ?? presentationProfileId,
  };

  return {
    ...nextMessage,
    kind: nextMessage.kind ?? inferTavernMessageKind({
      role: nextMessage.role,
      presentationProfileId: nextMessage.presentationProfileId,
    }),
    segments: nextMessage.segments ?? buildTavernMessageSegments(nextMessage),
  };
};

const clampInteger = (value: unknown, fallback: number, min: number, max: number) => {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(numberValue)));
};

const cloneTavernDirectorProfile = (
  profile: TavernDirectorProfile | undefined,
): TavernDirectorProfile | undefined => profile
  ? {
      ...profile,
      globalGoals: [...profile.globalGoals],
      globalRules: [...profile.globalRules],
      characterProfiles: Object.fromEntries(
        Object.entries(profile.characterProfiles).map(([characterId, characterProfile]) => [
          characterId,
          {
            ...characterProfile,
            interestTags: [...characterProfile.interestTags],
            goalTags: [...characterProfile.goalTags],
            knowledgeTags: [...characterProfile.knowledgeTags],
            speechTriggers: [...characterProfile.speechTriggers],
            silenceTriggers: [...characterProfile.silenceTriggers],
          },
        ]),
      ),
    }
  : undefined;

const cloneDefaultRoomSettings = (): TavernRoomSettings => ({
  ...DEFAULT_TAVERN_ROOM_SETTINGS,
  interactionQualityRuleIds: [...DEFAULT_TAVERN_ROOM_SETTINGS.interactionQualityRuleIds],
  directorNarrativeControl: { ...DEFAULT_TAVERN_ROOM_SETTINGS.directorNarrativeControl },
  continuation: { ...DEFAULT_TAVERN_ROOM_SETTINGS.continuation },
  replyOptions: { ...DEFAULT_TAVERN_ROOM_SETTINGS.replyOptions },
  statusTracking: { ...DEFAULT_TAVERN_ROOM_SETTINGS.statusTracking },
  randomEvents: { ...DEFAULT_TAVERN_ROOM_SETTINGS.randomEvents },
  illustrationHints: { ...DEFAULT_TAVERN_ROOM_SETTINGS.illustrationHints },
  directorScheduling: {
    ...DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling,
    directorOnlyPhaseValues: [...DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling.directorOnlyPhaseValues],
    speakerMotivation: {
      ...DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling.speakerMotivation,
      rules: DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling.speakerMotivation.rules.map((rule) => ({ ...rule })),
    },
    profile: cloneTavernDirectorProfile(DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling.profile),
    fixedOrder: {
      ...DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling.fixedOrder,
      phaseValues: [...DEFAULT_TAVERN_ROOM_SETTINGS.directorScheduling.fixedOrder.phaseValues],
    },
  },
  informationPolicy: {
    ...DEFAULT_TAVERN_ROOM_SETTINGS.informationPolicy,
    hiddenFacts: { ...DEFAULT_TAVERN_ROOM_SETTINGS.informationPolicy.hiddenFacts },
    roleAssignment: {
      ...DEFAULT_TAVERN_ROOM_SETTINGS.informationPolicy.roleAssignment,
      rolePool: DEFAULT_TAVERN_ROOM_SETTINGS.informationPolicy.roleAssignment.rolePool.map((role) => ({ ...role })),
    },
  },
});

const normalizeInformationRevealMode = (value: unknown) =>
  value === "sceneOutcome" || value === "never" || value === "manual"
    ? value
    : "manual";

const normalizeRoleAssignmentPool = (
  value: unknown,
): TavernRoomSettings["informationPolicy"]["roleAssignment"]["rolePool"] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const candidate = item as Record<string, unknown>;
    const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
    if (!label) {
      return [];
    }

    const rawId = typeof candidate.id === "string" ? candidate.id.trim() : "";
    const count = typeof candidate.count === "number" && Number.isFinite(candidate.count)
      ? Math.min(20, Math.max(1, Math.round(candidate.count)))
      : 1;
    const description = typeof candidate.description === "string"
      ? candidate.description.trim()
      : "";
    const factionId = typeof candidate.factionId === "string"
      ? candidate.factionId.trim()
      : "";
    const factionLabel = typeof candidate.factionLabel === "string"
      ? candidate.factionLabel.trim()
      : "";

    return [{
      id: rawId || `role-${index + 1}`,
      label,
      ...(description ? { description } : {}),
      ...(factionId ? { factionId } : {}),
      ...(factionLabel ? { factionLabel } : {}),
      count,
    }];
  });
};

const normalizeInformationPolicy = (
  value: unknown,
): TavernRoomSettings["informationPolicy"] => {
  const defaults = cloneDefaultRoomSettings().informationPolicy;
  if (!value || typeof value !== "object") {
    return defaults;
  }

  const candidate = value as Partial<TavernRoomSettings["informationPolicy"]>;
  const hiddenFacts = candidate.hiddenFacts && typeof candidate.hiddenFacts === "object"
    ? candidate.hiddenFacts as Partial<TavernRoomSettings["informationPolicy"]["hiddenFacts"]>
    : {};
  const roleAssignment = candidate.roleAssignment && typeof candidate.roleAssignment === "object"
    ? candidate.roleAssignment as Partial<TavernRoomSettings["informationPolicy"]["roleAssignment"]>
    : {};
  const roleAssignmentOpening = roleAssignment.opening && typeof roleAssignment.opening === "object"
    ? roleAssignment.opening as Partial<TavernRoomSettings["informationPolicy"]["roleAssignment"]["opening"]>
    : {};
  const mode = candidate.mode === "mystery" ||
      candidate.mode === "social_deduction" ||
      candidate.mode === "custom" ||
      candidate.mode === "open"
    ? candidate.mode
    : defaults.mode;
  const uiDefaultView = candidate.uiDefaultView === "public" ||
      candidate.uiDefaultView === "director" ||
      candidate.uiDefaultView === "reveal"
    ? candidate.uiDefaultView
    : defaults.uiDefaultView;
  const defaultVisibility = hiddenFacts.defaultVisibility === "hidden" ||
      hiddenFacts.defaultVisibility === "debug" ||
      hiddenFacts.defaultVisibility === "director"
    ? hiddenFacts.defaultVisibility
    : defaults.hiddenFacts.defaultVisibility;

  return {
    mode,
    uiDefaultView,
    hideCharacterThoughts: Boolean(candidate.hideCharacterThoughts),
    revealThoughts: normalizeInformationRevealMode(candidate.revealThoughts),
    hiddenFacts: {
      enabled: Boolean(hiddenFacts.enabled),
      defaultVisibility,
      reveal: normalizeInformationRevealMode(hiddenFacts.reveal),
    },
    roleAssignment: {
      enabled: Boolean(roleAssignment.enabled),
      strategy: roleAssignment.strategy === "director_random" ? "director_random" : "manual",
      includeUser: roleAssignment.includeUser !== false,
      revealToAssignedCharacter: roleAssignment.revealToAssignedCharacter !== false,
      revealFactionMembers: roleAssignment.revealFactionMembers !== false,
      rolePool: normalizeRoleAssignmentPool(roleAssignment.rolePool),
      opening: {
        autoStart: Boolean(roleAssignmentOpening.autoStart),
        publicEventType: typeof roleAssignmentOpening.publicEventType === "string"
          ? roleAssignmentOpening.publicEventType.trim().slice(0, 80)
          : "",
        ...(roleAssignmentOpening.publicEventValue !== undefined
          ? { publicEventValue: normalizeStatusValue(roleAssignmentOpening.publicEventValue) }
          : {}),
        globalStatusPatches: Array.isArray(roleAssignmentOpening.globalStatusPatches)
          ? roleAssignmentOpening.globalStatusPatches.flatMap((patch) => {
              if (!patch || typeof patch !== "object") {
                return [];
              }
              const record = patch as Record<string, unknown>;
              const statusId = typeof record.statusId === "string" ? record.statusId.trim() : "";
              if (!statusId) {
                return [];
              }
              return [{
                statusId,
                value: normalizeStatusValue(record.value),
              }];
            }).slice(0, 12)
          : [],
      },
    },
  };
};

const normalizeStringList = (value: unknown, maxItems = 12) => Array.isArray(value)
  ? [...new Set(value.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : []))]
      .slice(0, maxItems)
  : [];

const normalizeRelationshipTarget = (value: unknown): TavernRelationshipTarget | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernRelationshipTarget>;
  if (candidate.type === "user") {
    return { type: "user" };
  }
  if (candidate.type === "character") {
    const characterId = typeof candidate.characterId === "string" ? candidate.characterId.trim() : "";
    return characterId ? { type: "character", characterId } : null;
  }
  return null;
};

const normalizeCharacterRelationships = (
  value: unknown,
  updatedAt: number,
): TavernCharacterRelationship[] => Array.isArray(value)
  ? value.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }
      const candidate = item as Partial<TavernCharacterRelationship>;
      const target = normalizeRelationshipTarget(candidate.target);
      if (!target) {
        return [];
      }
      return [{
        id: typeof candidate.id === "string" && candidate.id.trim()
          ? candidate.id.trim()
          : createId("relationship"),
        target,
        label: typeof candidate.label === "string" && candidate.label.trim()
          ? candidate.label.trim()
          : undefined,
        attitude: typeof candidate.attitude === "string" && candidate.attitude.trim()
          ? candidate.attitude.trim()
          : undefined,
        publicNote: typeof candidate.publicNote === "string" && candidate.publicNote.trim()
          ? candidate.publicNote.trim()
          : undefined,
        privateNote: typeof candidate.privateNote === "string" && candidate.privateNote.trim()
          ? candidate.privateNote.trim()
          : undefined,
        tags: normalizeStringList(candidate.tags, 8),
        updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : updatedAt,
      }];
    })
  : [];

const normalizeSceneRelationshipOverrides = (
  value: unknown,
  updatedAt: number,
): TavernSceneRelationshipOverride[] => Array.isArray(value)
  ? value.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }
      const candidate = item as Partial<TavernSceneRelationshipOverride>;
      const subjectCharacterId = typeof candidate.subjectCharacterId === "string"
        ? candidate.subjectCharacterId.trim()
        : "";
      const target = normalizeRelationshipTarget(candidate.target);
      if (!subjectCharacterId || !target) {
        return [];
      }
      return [{
        id: typeof candidate.id === "string" && candidate.id.trim()
          ? candidate.id.trim()
          : createId("scene-relationship"),
        subjectCharacterId,
        target,
        label: typeof candidate.label === "string" && candidate.label.trim()
          ? candidate.label.trim()
          : undefined,
        publicNote: typeof candidate.publicNote === "string" && candidate.publicNote.trim()
          ? candidate.publicNote.trim()
          : undefined,
        privateNote: typeof candidate.privateNote === "string" && candidate.privateNote.trim()
          ? candidate.privateNote.trim()
          : undefined,
        tags: normalizeStringList(candidate.tags, 8),
        updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : updatedAt,
      }];
    })
  : [];

const normalizeDirectorScheduling = (
  value: unknown,
  options: {
    characters?: TavernCharacter[];
    characterIds?: string[];
    mapCharacterId?: (characterId: string) => string | undefined;
    profileSource?: TavernDirectorProfile["source"];
    updatedAt?: number;
  } = {},
): TavernRoomSettings["directorScheduling"] => {
  const defaults = cloneDefaultRoomSettings().directorScheduling;
  const defaultsWithProfile = options.characters?.length
    ? {
        ...defaults,
        profile: createTavernDirectorProfileFromCharacters({
          characters: options.characters,
          source: options.profileSource ?? "system",
          updatedAt: options.updatedAt,
        }),
      }
    : defaults;
  if (!value || typeof value !== "object") {
    return defaultsWithProfile;
  }

  const candidate = value as Partial<TavernRoomSettings["directorScheduling"]>;
  const fixedOrder = candidate.fixedOrder && typeof candidate.fixedOrder === "object"
    ? candidate.fixedOrder as Partial<TavernRoomSettings["directorScheduling"]["fixedOrder"]>
    : {};
  const speakerMotivation = candidate.speakerMotivation && typeof candidate.speakerMotivation === "object"
    ? candidate.speakerMotivation as Partial<TavernRoomSettings["directorScheduling"]["speakerMotivation"]>
    : {};
  const targetedReplyPolicy = candidate.targetedReplyPolicy === "director" ||
      candidate.targetedReplyPolicy === "prefer" ||
      candidate.targetedReplyPolicy === "exclusive" ||
      candidate.targetedReplyPolicy === "include"
    ? candidate.targetedReplyPolicy
    : defaults.targetedReplyPolicy;
  const autoContinuation = candidate.autoContinuation === "disabled" ||
      candidate.autoContinuation === "disabledForFixedOrder" ||
      candidate.autoContinuation === "enabled"
    ? candidate.autoContinuation
    : defaults.autoContinuation;

  return {
    targetedReplyPolicy,
    maxExtraSpeakersOnTargetedReply: clampInteger(
      candidate.maxExtraSpeakersOnTargetedReply,
      defaults.maxExtraSpeakersOnTargetedReply,
      0,
      5,
    ),
    allowDirectorOnly: Boolean(candidate.allowDirectorOnly),
    directorOnlyPhaseStatusId: typeof candidate.directorOnlyPhaseStatusId === "string"
      ? candidate.directorOnlyPhaseStatusId.trim()
      : "",
    directorOnlyPhaseValues: normalizeStringList(candidate.directorOnlyPhaseValues),
    speakerMotivation: {
      enabled: speakerMotivation.enabled !== false,
      maxMotivatedSpeakers: clampInteger(
        speakerMotivation.maxMotivatedSpeakers,
        defaults.speakerMotivation.maxMotivatedSpeakers,
        0,
        5,
      ),
      rules: Array.isArray(speakerMotivation.rules)
        ? speakerMotivation.rules.flatMap((item, index) => {
            if (!item || typeof item !== "object") {
              return [];
            }
            const record = item as Record<string, unknown>;
            const label = typeof record.label === "string" ? record.label.trim() : "";
            const when = typeof record.when === "string" ? record.when.trim() : "";
            const instruction = typeof record.instruction === "string" ? record.instruction.trim() : "";
            if (!label || !when || !instruction) {
              return [];
            }
            const rawId = typeof record.id === "string" ? record.id.trim() : "";
            return [{
              id: rawId || `speaker-motivation-${index + 1}`,
              label: label.slice(0, 80),
              when: when.slice(0, 240),
              priority: clampInteger(record.priority, 50, 0, 100),
              instruction: instruction.slice(0, 360),
            }];
          }).slice(0, 12)
        : defaults.speakerMotivation.rules.map((rule) => ({ ...rule })),
    },
    profile: normalizeTavernDirectorProfile(candidate.profile, {
      characters: options.characters,
      characterIds: options.characterIds,
      mapCharacterId: options.mapCharacterId,
      source: options.profileSource,
      updatedAt: options.updatedAt,
    }),
    fixedOrder: {
      enabled: Boolean(fixedOrder.enabled),
      phaseStatusId: typeof fixedOrder.phaseStatusId === "string"
        ? fixedOrder.phaseStatusId.trim()
        : "",
      phaseValues: normalizeStringList(fixedOrder.phaseValues),
      stopAfterRound: Boolean(fixedOrder.stopAfterRound),
      includeUser: Boolean(fixedOrder.includeUser),
      userPosition: fixedOrder.userPosition === "last" ? "last" : "first",
    },
    autoContinuation,
    instruction: typeof candidate.instruction === "string"
      ? candidate.instruction.trim().slice(0, 1200)
      : "",
  };
};

const normalizeDirectorNarrativeControl = (
  value: unknown,
): TavernRoomSettings["directorNarrativeControl"] => {
  const defaults = cloneDefaultRoomSettings().directorNarrativeControl;
  if (!value || typeof value !== "object") {
    return defaults;
  }

  const candidate = value as Partial<TavernRoomSettings["directorNarrativeControl"]>;
  return {
    agencyMode: candidate.agencyMode === "player_protagonist" ||
        candidate.agencyMode === "story_directive" ||
        candidate.agencyMode === "scene_drive"
      ? candidate.agencyMode
      : defaults.agencyMode,
    responseScale: candidate.responseScale === "focused" ||
        candidate.responseScale === "balanced" ||
        candidate.responseScale === "ensemble"
      ? candidate.responseScale
      : defaults.responseScale,
    narratorPressure: candidate.narratorPressure === "low" ||
        candidate.narratorPressure === "balanced" ||
        candidate.narratorPressure === "high"
      ? candidate.narratorPressure
      : defaults.narratorPressure,
    eventInterruption: candidate.eventInterruption === "off" ||
        candidate.eventInterruption === "auto" ||
        candidate.eventInterruption === "forceOnStall"
      ? candidate.eventInterruption
      : defaults.eventInterruption,
    userActionConsequence: candidate.userActionConsequence === "light" ||
        candidate.userActionConsequence === "visible" ||
        candidate.userActionConsequence === "strict"
      ? candidate.userActionConsequence
      : defaults.userActionConsequence,
    mainHook: candidate.mainHook === "off" ||
        candidate.mainHook === "auto" ||
        candidate.mainHook === "forceOnStall"
      ? candidate.mainHook
      : defaults.mainHook,
    qnaBreak: candidate.qnaBreak === "off" ||
        candidate.qnaBreak === "auto" ||
        candidate.qnaBreak === "aggressive"
      ? candidate.qnaBreak
      : defaults.qnaBreak,
  };
};

const normalizeRoomSettings = (
  value: unknown,
  options: {
    characters?: TavernCharacter[];
    characterIds?: string[];
    mapCharacterId?: (characterId: string) => string | undefined;
    profileSource?: TavernDirectorProfile["source"];
    updatedAt?: number;
  } = {},
): TavernRoomSettings => {
  if (!value || typeof value !== "object") {
    const defaults = cloneDefaultRoomSettings();
    return {
      ...defaults,
      directorScheduling: normalizeDirectorScheduling(undefined, options),
    };
  }

  const candidate = value as Partial<TavernRoomSettings>;
  const continuation = candidate.continuation && typeof candidate.continuation === "object"
    ? candidate.continuation as Partial<TavernRoomSettings["continuation"]>
    : {};
  const replyOptions = candidate.replyOptions && typeof candidate.replyOptions === "object"
    ? candidate.replyOptions as Partial<TavernRoomSettings["replyOptions"]>
    : {};
  const statusTracking = candidate.statusTracking && typeof candidate.statusTracking === "object"
    ? candidate.statusTracking as Partial<TavernRoomSettings["statusTracking"]>
    : {};
  const randomEvents = candidate.randomEvents && typeof candidate.randomEvents === "object"
    ? candidate.randomEvents as Partial<TavernRoomSettings["randomEvents"]>
    : {};
  const illustrationHints = candidate.illustrationHints && typeof candidate.illustrationHints === "object"
    ? candidate.illustrationHints as Partial<TavernRoomSettings["illustrationHints"]>
    : {};
  const probability = typeof randomEvents.probability === "number"
    ? randomEvents.probability
    : DEFAULT_TAVERN_ROOM_SETTINGS.randomEvents.probability;
  return {
    immersiveDescriptionEnabled: candidate.immersiveDescriptionEnabled !== false,
    showExecutionTrace: Boolean(candidate.showExecutionTrace),
    autoAssetExtractionEnabled: Boolean(candidate.autoAssetExtractionEnabled),
    assetExtractionIntervalTurns: clampInteger(
      candidate.assetExtractionIntervalTurns,
      DEFAULT_TAVERN_ROOM_SETTINGS.assetExtractionIntervalTurns,
      1,
      10,
    ),
    maxAssetDrafts: clampInteger(
      candidate.maxAssetDrafts,
      DEFAULT_TAVERN_ROOM_SETTINGS.maxAssetDrafts,
      1,
      20,
    ),
    directorMaxSpeakers: clampInteger(
      candidate.directorMaxSpeakers,
      DEFAULT_TAVERN_ROOM_SETTINGS.directorMaxSpeakers,
      1,
      6,
    ),
    agentKnowledgeCompactIntervalTurns: clampInteger(
      candidate.agentKnowledgeCompactIntervalTurns,
      DEFAULT_TAVERN_ROOM_SETTINGS.agentKnowledgeCompactIntervalTurns,
      0,
      50,
    ),
    interactionQualityRuleIds: normalizeTavernQualityRuleIds(
      candidate.interactionQualityRuleIds ?? DEFAULT_TAVERN_ROOM_SETTINGS.interactionQualityRuleIds,
    ),
    directorNarrativeControl: normalizeDirectorNarrativeControl(candidate.directorNarrativeControl),
    directorScheduling: normalizeDirectorScheduling(candidate.directorScheduling, options),
    continuation: {
      enabled: continuation.enabled !== false,
      maxAutoContinuationRounds: clampInteger(
        continuation.maxAutoContinuationRounds,
        DEFAULT_TAVERN_ROOM_SETTINGS.continuation.maxAutoContinuationRounds,
        0,
        3,
      ),
      maxSpeakersPerContinuation: clampInteger(
        continuation.maxSpeakersPerContinuation,
        DEFAULT_TAVERN_ROOM_SETTINGS.continuation.maxSpeakersPerContinuation,
        1,
        3,
      ),
      stopWhenUserTargeted: continuation.stopWhenUserTargeted !== false,
    },
    replyOptions: {
      enabled: replyOptions.enabled !== false,
      count: clampInteger(
        replyOptions.count,
        DEFAULT_TAVERN_ROOM_SETTINGS.replyOptions.count,
        1,
        6,
      ),
    },
    statusTracking: {
      enabled: statusTracking.enabled !== false,
      visibleToUser: statusTracking.visibleToUser !== false,
    },
    randomEvents: {
      enabled: Boolean(randomEvents.enabled),
      probability: Math.min(1, Math.max(0, probability)),
    },
    illustrationHints: {
      enabled: Boolean(illustrationHints.enabled),
    },
    informationPolicy: normalizeInformationPolicy(candidate.informationPolicy),
  };
};

const normalizeRoomScenePresetId = (room: Partial<TavernRoom>) => {
  if (room.scenePresetId) {
    return normalizeVisualPresetId(room.scenePresetId);
  }

  return typeof room.title === "string" && room.title.includes("酒馆")
    ? "tavern"
    : DEFAULT_VISUAL_PRESET_ID;
};

const normalizeStringRecord = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .flatMap(([key, item]) => {
        const valueText = typeof item === "string" ? item : "";
        return key && valueText ? [[key, valueText]] : [];
      }),
  );
};

const normalizeStatusValue = (value: unknown): string | number | boolean | string[] | null => {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }

  return normalizeStringArray(value);
};

const normalizeStringArray = (value: unknown) => Array.isArray(value)
  ? value.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : [])
  : [];

const createEmptyStatusSnapshot = (
  turnId = "initial",
  updatedAt = now(),
): TavernStatusSnapshot => ({
  turnId,
  global: {},
  scene: {},
  parties: {},
  characters: {},
  relationships: {},
  updatedAt,
});

const normalizeStatusValueRecord = (value: unknown): Record<string, string | number | boolean | string[] | null> => {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      normalizeStatusValue(item),
    ]),
  );
};

const normalizeNestedStatusValueRecord = (
  value: unknown,
): Record<string, Record<string, string | number | boolean | string[] | null>> => {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      normalizeStatusValueRecord(item),
    ]),
  );
};

const normalizeStatusSnapshot = (
  value: unknown,
  updatedAt: number,
  fallbackTurnId = "initial",
): TavernStatusSnapshot => {
  if (!value || typeof value !== "object") {
    return createEmptyStatusSnapshot(fallbackTurnId, updatedAt);
  }

  const candidate = value as Partial<TavernStatusSnapshot>;
  return {
    turnId: typeof candidate.turnId === "string" && candidate.turnId.trim()
      ? candidate.turnId
      : fallbackTurnId,
    global: normalizeStatusValueRecord(candidate.global),
    scene: normalizeStatusValueRecord(candidate.scene),
    parties: normalizeNestedStatusValueRecord(candidate.parties),
    characters: normalizeNestedStatusValueRecord(candidate.characters),
    relationships: normalizeNestedStatusValueRecord(candidate.relationships),
    updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : updatedAt,
  };
};

const normalizeStatusDefinitions = (
  value: unknown,
  fallback: TavernStatusDefinition[] = DEFAULT_TAVERN_STATUS_DEFINITIONS,
) => {
  const source = Array.isArray(value) ? value : fallback;
  return source.flatMap((item): TavernStatusDefinition[] => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const candidate = item as Partial<TavernStatusDefinition>;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
    if (!id || !label) {
      return [];
    }

    return [{
      ...candidate,
      id,
      label,
      scope: candidate.scope === "global" ||
          candidate.scope === "scene" ||
          candidate.scope === "party" ||
          candidate.scope === "character" ||
          candidate.scope === "relationship"
        ? candidate.scope
        : "scene",
      valueType: candidate.valueType === "number" ||
          candidate.valueType === "text" ||
          candidate.valueType === "enum" ||
          candidate.valueType === "boolean" ||
          candidate.valueType === "tags"
        ? candidate.valueType
        : "text",
      defaultValue: normalizeStatusValue(candidate.defaultValue),
      visibility: candidate.visibility ?? "public",
      updatePolicy: {
        mode: candidate.updatePolicy?.mode ?? "manualOnly",
        requireFactEvent: Boolean(candidate.updatePolicy?.requireFactEvent),
        allowedEventTypes: Array.isArray(candidate.updatePolicy?.allowedEventTypes)
          ? candidate.updatePolicy.allowedEventTypes
          : undefined,
        maxDeltaPerTurn: typeof candidate.updatePolicy?.maxDeltaPerTurn === "number"
          ? candidate.updatePolicy.maxDeltaPerTurn
          : undefined,
        confidenceThreshold: typeof candidate.updatePolicy?.confidenceThreshold === "number"
          ? candidate.updatePolicy.confidenceThreshold
          : undefined,
        manualReviewAboveDelta: typeof candidate.updatePolicy?.manualReviewAboveDelta === "number"
          ? candidate.updatePolicy.manualReviewAboveDelta
          : undefined,
      },
    }];
  });
};

const normalizeStatusRules = (
  value: unknown,
  fallback: TavernStatusRule[] = DEFAULT_TAVERN_STATUS_RULES,
) => {
  const source = Array.isArray(value) ? value : fallback;
  return source.filter((item): item is TavernStatusRule =>
    Boolean(
      item &&
      typeof item === "object" &&
      typeof (item as Partial<TavernStatusRule>).id === "string" &&
      typeof (item as Partial<TavernStatusRule>).label === "string" &&
      (item as Partial<TavernStatusRule>).when &&
      (item as Partial<TavernStatusRule>).apply,
    )
  );
};

const normalizeProgressViews = (
  value: unknown,
  fallback: TavernProgressView[] = DEFAULT_TAVERN_PROGRESS_VIEWS,
) => {
  const source = Array.isArray(value) ? value : fallback;
  return source.filter((item): item is TavernProgressView =>
    Boolean(
      item &&
      typeof item === "object" &&
      typeof (item as Partial<TavernProgressView>).id === "string" &&
      typeof (item as Partial<TavernProgressView>).label === "string" &&
      Array.isArray((item as Partial<TavernProgressView>).items),
    )
  );
};

const normalizeProgressTracker = (value: unknown): TavernProgressTrackerSettings => {
  const candidate = value && typeof value === "object"
    ? value as Partial<TavernProgressTrackerSettings>
    : {};
  return {
    enabled: Boolean(candidate.enabled),
    mode: candidate.mode === "afterTurn" || candidate.mode === "fixedTurns"
      ? candidate.mode
      : "manual",
    intervalTurns: clampInteger(candidate.intervalTurns, DEFAULT_TAVERN_PROGRESS_TRACKER.intervalTurns, 1, 50),
    applyMode: candidate.applyMode === "auto" ? "auto" : "review",
    factConfidenceThreshold: typeof candidate.factConfidenceThreshold === "number"
      ? Math.min(1, Math.max(0, candidate.factConfidenceThreshold))
      : DEFAULT_TAVERN_PROGRESS_TRACKER.factConfidenceThreshold,
    generateCheckpointBeforeContextTrim: candidate.generateCheckpointBeforeContextTrim !== false,
  };
};

const normalizeFactEvents = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is TavernFactEvent =>
      Boolean(item && typeof item === "object" && typeof (item as Partial<TavernFactEvent>).id === "string")
    )
  : [];

const normalizeStatusEvents = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is TavernStatusEvent =>
      Boolean(item && typeof item === "object" && typeof (item as Partial<TavernStatusEvent>).id === "string")
    )
  : [];

const normalizeTaskDefinitions = (
  value: unknown,
  fallback: TavernTaskDefinition[] = DEFAULT_TAVERN_TASK_DEFINITIONS,
) => {
  const source = Array.isArray(value) ? value : fallback;
  return source.filter((item): item is TavernTaskDefinition =>
      Boolean(item && typeof item === "object" && typeof (item as Partial<TavernTaskDefinition>).id === "string")
    );
};

const normalizeTaskEvents = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is TavernTaskEvent =>
      Boolean(item && typeof item === "object" && typeof (item as Partial<TavernTaskEvent>).id === "string")
    )
  : [];

const normalizeTaskSnapshot = (value: unknown): Record<string, TavernTaskState> => {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => (
      item && typeof item === "object"
        ? [[key, item as TavernTaskState]]
        : []
    )),
  );
};

const normalizeSceneOutcomes = (
  value: unknown,
  fallback: TavernSceneOutcomeDefinition[] = DEFAULT_TAVERN_SCENE_OUTCOMES,
) => {
  const source = Array.isArray(value) ? value : fallback;
  return source.filter((item): item is TavernSceneOutcomeDefinition =>
      Boolean(item && typeof item === "object" && typeof (item as Partial<TavernSceneOutcomeDefinition>).id === "string")
    );
};

const normalizeOutcomeEvents = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is TavernOutcomeEvent =>
      Boolean(item && typeof item === "object" && typeof (item as Partial<TavernOutcomeEvent>).id === "string")
    )
  : [];

const normalizeProgressCheckpoints = (value: unknown) => Array.isArray(value)
  ? value.flatMap((item): TavernProgressCheckpoint[] => {
      if (!item || typeof item !== "object" || typeof (item as Partial<TavernProgressCheckpoint>).id !== "string") {
        return [];
      }

      const checkpoint = item as Partial<TavernProgressCheckpoint>;
      const id = (item as { id: string }).id;
      return [{
        id,
        turnId: typeof checkpoint.turnId === "string" ? checkpoint.turnId : "unknown",
        statusSnapshot: normalizeStatusSnapshot(checkpoint.statusSnapshot, Date.now()),
        taskSnapshot: normalizeTaskSnapshot(checkpoint.taskSnapshot),
        includedFactEventIds: normalizeStringArray(checkpoint.includedFactEventIds),
        includedStatusEventIds: normalizeStringArray(checkpoint.includedStatusEventIds),
        includedTaskEventIds: normalizeStringArray(checkpoint.includedTaskEventIds),
        includedOutcomeEventIds: normalizeStringArray(checkpoint.includedOutcomeEventIds),
        reason: checkpoint.reason === "initial" ||
          checkpoint.reason === "after_turn" ||
          checkpoint.reason === "before_context_trim" ||
          checkpoint.reason === "manual" ||
          checkpoint.reason === "compaction" ||
          checkpoint.reason === "rebuild"
          ? checkpoint.reason
          : "manual",
        createdAt: typeof checkpoint.createdAt === "number" ? checkpoint.createdAt : Date.now(),
      }];
    })
  : [];

const normalizeSceneStatus = (
  value: unknown,
  updatedAt: number,
): TavernSceneStatus | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Partial<TavernSceneStatus>;
  const status: TavernSceneStatus = {
    location: typeof candidate.location === "string" && candidate.location.trim()
      ? candidate.location.trim()
      : undefined,
    timeLabel: typeof candidate.timeLabel === "string" && candidate.timeLabel.trim()
      ? candidate.timeLabel.trim()
      : undefined,
    weather: typeof candidate.weather === "string" && candidate.weather.trim()
      ? candidate.weather.trim()
      : undefined,
    atmosphere: typeof candidate.atmosphere === "string" && candidate.atmosphere.trim()
      ? candidate.atmosphere.trim()
      : undefined,
    scenePhase: typeof candidate.scenePhase === "string" && candidate.scenePhase.trim()
      ? candidate.scenePhase.trim()
      : undefined,
    immediateThreat: typeof candidate.immediateThreat === "string" && candidate.immediateThreat.trim()
      ? candidate.immediateThreat.trim()
      : undefined,
    updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : updatedAt,
  };

  return Object.values(status).some((item) => typeof item === "string" && item.trim())
    ? status
    : undefined;
};

const normalizeCharacterPublicStatuses = (
  value: unknown,
  characterIds: string[],
  characterIdMap: Map<string, string> | undefined,
  updatedAt: number,
): Record<string, TavernCharacterPublicStatus> => {
  if (!value || typeof value !== "object") {
    return {};
  }

  const allowedIds = new Set(characterIds);
  const statuses: Record<string, TavernCharacterPublicStatus> = {};
  for (const [sourceCharacterId, item] of Object.entries(value as Record<string, unknown>)) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const characterId = characterIdMap?.get(sourceCharacterId) ?? sourceCharacterId;
    if (!allowedIds.has(characterId)) {
      continue;
    }

    const candidate = item as Partial<TavernCharacterPublicStatus>;
    statuses[characterId] = {
      characterId,
      location: typeof candidate.location === "string" && candidate.location.trim()
        ? candidate.location.trim()
        : undefined,
      posture: typeof candidate.posture === "string" && candidate.posture.trim()
        ? candidate.posture.trim()
        : undefined,
      visibleMood: typeof candidate.visibleMood === "string" && candidate.visibleMood.trim()
        ? candidate.visibleMood.trim()
        : undefined,
      outfit: typeof candidate.outfit === "string" && candidate.outfit.trim()
        ? candidate.outfit.trim()
        : undefined,
      visibleInjury: typeof candidate.visibleInjury === "string" && candidate.visibleInjury.trim()
        ? candidate.visibleInjury.trim()
        : undefined,
      holding: normalizeStringArray(candidate.holding),
      publicGoal: typeof candidate.publicGoal === "string" && candidate.publicGoal.trim()
        ? candidate.publicGoal.trim()
        : undefined,
      updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : updatedAt,
    };
  }

  return statuses;
};

const normalizeCharacterPrivateStatuses = (
  value: unknown,
  characterIds: string[],
  characterIdMap: Map<string, string> | undefined,
  updatedAt: number,
): Record<string, TavernCharacterPrivateStatus> => {
  if (!value || typeof value !== "object") {
    return {};
  }

  const allowedIds = new Set(characterIds);
  const statuses: Record<string, TavernCharacterPrivateStatus> = {};
  for (const [sourceCharacterId, item] of Object.entries(value as Record<string, unknown>)) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const characterId = characterIdMap?.get(sourceCharacterId) ?? sourceCharacterId;
    if (!allowedIds.has(characterId)) {
      continue;
    }

    const candidate = item as Partial<TavernCharacterPrivateStatus>;
    statuses[characterId] = {
      characterId,
      privateMood: typeof candidate.privateMood === "string" && candidate.privateMood.trim()
        ? candidate.privateMood.trim()
        : undefined,
      suspicion: typeof candidate.suspicion === "string" && candidate.suspicion.trim()
        ? candidate.suspicion.trim()
        : undefined,
      hiddenGoal: typeof candidate.hiddenGoal === "string" && candidate.hiddenGoal.trim()
        ? candidate.hiddenGoal.trim()
        : undefined,
      privateKnowledge: normalizeStringArray(candidate.privateKnowledge),
      relationshipNotes: normalizeStringRecord(candidate.relationshipNotes),
      updatedAt: typeof candidate.updatedAt === "number" ? candidate.updatedAt : updatedAt,
    };
  }

  return statuses;
};

const normalizePendingInteraction = (
  value: unknown,
): TavernPendingInteraction | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernPendingInteraction>;
  const source = candidate.source && typeof candidate.source === "object" ? candidate.source : null;
  const target = candidate.target && typeof candidate.target === "object" ? candidate.target : null;
  const kind = candidate.kind === "request" ||
      candidate.kind === "challenge" ||
      candidate.kind === "invitation" ||
      candidate.kind === "answer"
    ? candidate.kind
    : "question";
  const status = candidate.status === "answered" || candidate.status === "expired"
    ? candidate.status
    : "open";
  const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
  if (!candidate.id || !candidate.sourceMessageId || !source || !target || !text) {
    return null;
  }

  const sourceType = source.type === "character" ? "character" : "user";
  const targetType = target.type === "user" ||
      target.type === "character" ||
      target.type === "group"
    ? target.type
    : "unknown";

  return {
    id: candidate.id,
    sourceMessageId: candidate.sourceMessageId,
    source: {
      type: sourceType,
      characterId: typeof source.characterId === "string" ? source.characterId : undefined,
    },
    target: {
      type: targetType,
      characterIds: normalizeStringArray(target.characterIds),
    },
    kind,
    text,
    requiresResponse: candidate.requiresResponse !== false,
    status,
    createdTurnId: typeof candidate.createdTurnId === "string" && candidate.createdTurnId.trim()
      ? candidate.createdTurnId
      : candidate.sourceMessageId,
  };
};

const normalizeReplyOption = (value: unknown): TavernReplyOption | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernReplyOption>;
  const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
  if (!candidate.id || !text) {
    return null;
  }

  const intent = candidate.intent === "ask" ||
      candidate.intent === "act" ||
      candidate.intent === "interrupt" ||
      candidate.intent === "wait" ||
      candidate.intent === "inspect"
    ? candidate.intent
    : "answer";

  return {
    id: candidate.id,
    text,
    respondsToInteractionId: typeof candidate.respondsToInteractionId === "string" &&
        candidate.respondsToInteractionId.trim()
      ? candidate.respondsToInteractionId
      : undefined,
    targetCharacterIds: normalizeStringArray(candidate.targetCharacterIds),
    intent,
  };
};

const normalizeRoomCharacterConfigs = (
  value: unknown,
  fallbackMemories: Record<string, string> = {},
): Record<string, TavernRoomCharacterConfig> => {
  const configs: Record<string, TavernRoomCharacterConfig> = {};

  for (const [characterId, memory] of Object.entries(fallbackMemories)) {
    if (!characterId) {
      continue;
    }

    configs[characterId] = {
      characterId,
      memory: memory.trim() || undefined,
    };
  }

  if (!value || typeof value !== "object") {
    return configs;
  }

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!key || !item || typeof item !== "object") {
      continue;
    }

    const candidate = item as Partial<TavernRoomCharacterConfig>;
    const characterId = typeof candidate.characterId === "string"
      ? candidate.characterId.trim()
      : key;
    if (!characterId) {
      continue;
    }

    const memory = typeof candidate.memory === "string"
      ? candidate.memory.trim()
      : configs[characterId]?.memory ?? fallbackMemories[characterId]?.trim() ?? "";
    configs[characterId] = {
      characterId,
      memory: memory || undefined,
    };
  }

  return configs;
};

const roomCharacterMemoriesFromConfigs = (
  configs: Record<string, TavernRoomCharacterConfig>,
) => Object.fromEntries(
  Object.entries(configs).flatMap(([characterId, config]) => {
    const memory = config.memory?.trim() ?? "";
    return memory ? [[characterId, memory]] : [];
  }),
);

const normalizeTavernCharacter = (
  character: TavernCharacter,
  {
    allowSystemPreset = true,
  }: {
    allowSystemPreset?: boolean;
  } = {},
): TavernCharacter => {
  const systemPresetId = allowSystemPreset
    ? normalizeSystemPresetId((character as Partial<TavernCharacter>).systemPresetId)
    : undefined;
  const systemPreset = getTavernSystemPreset(systemPresetId);
  const systemPresetCharacterId = normalizeSystemPresetCharacterId(
    systemPresetId,
    (character as Partial<TavernCharacter>).systemPresetCharacterId,
  );
  const normalizedSystemPresetId = systemPresetCharacterId ? systemPresetId : undefined;

  return {
    ...character,
    avatar: normalizeTavernAvatarId(character.avatar),
    systemPresetId: normalizedSystemPresetId,
    systemPresetCharacterId,
    systemPresetVersion: systemPreset && normalizedSystemPresetId
      ? typeof (character as Partial<TavernCharacter>).systemPresetVersion === "number"
        ? (character as Partial<TavernCharacter>).systemPresetVersion
        : systemPreset.version
      : undefined,
    writingStyle: typeof character.writingStyle === "string" && character.writingStyle.trim()
      ? character.writingStyle.trim()
      : undefined,
    replyStylePrompt: typeof character.replyStylePrompt === "string" && character.replyStylePrompt.trim()
      ? character.replyStylePrompt.trim()
      : undefined,
    relationships: normalizeCharacterRelationships(
      (character as Partial<TavernCharacter>).relationships,
      typeof character.updatedAt === "number" ? character.updatedAt : now(),
    ),
  };
};

const normalizeLorebookKeywords = (value: unknown) => Array.isArray(value)
  ? value
      .flatMap((item) => typeof item === "string" ? [item.trim()] : [])
      .filter(Boolean)
  : [];

const normalizeLorebookEntry = (
  value: unknown,
): TavernLorebookEntry | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernLorebookEntry>;
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  const content = typeof candidate.content === "string" ? candidate.content.trim() : "";
  if (!candidate.id || !title || !content) {
    return null;
  }

  const updatedAt = typeof candidate.updatedAt === "number" ? candidate.updatedAt : now();

  return {
    id: candidate.id,
    title,
    content,
    keywords: normalizeLorebookKeywords(candidate.keywords),
    enabled: candidate.enabled !== false,
    alwaysOn: Boolean(candidate.alwaysOn),
    createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : updatedAt,
    updatedAt,
  };
};

const normalizeCharacterMemoryDraft = (
  value: unknown,
): TavernCharacterMemoryDraft | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernCharacterMemoryDraft>;
  const characterId = typeof candidate.characterId === "string" ? candidate.characterId.trim() : "";
  const note = typeof candidate.note === "string" ? candidate.note.trim() : "";
  if (!candidate.id || !characterId || !note) {
    return null;
  }

  return {
    id: candidate.id,
    characterId,
    note,
  };
};

const normalizeLorebookDraft = (
  value: unknown,
): TavernLorebookDraft | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernLorebookDraft>;
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  const content = typeof candidate.content === "string" ? candidate.content.trim() : "";
  if (!candidate.id || !title || !content) {
    return null;
  }

  return {
    id: candidate.id,
    title,
    content,
    keywords: normalizeLorebookKeywords(candidate.keywords),
    alwaysOn: Boolean(candidate.alwaysOn),
  };
};

const normalizeAssetDraft = (
  value: unknown,
): TavernAssetDraft | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernAssetDraft>;
  if (!candidate.id) {
    return null;
  }

  const updatedAt = typeof candidate.updatedAt === "number" ? candidate.updatedAt : now();
  const sourceMessageIds = Array.isArray(candidate.sourceMessageIds)
    ? candidate.sourceMessageIds.filter((item): item is string => typeof item === "string")
    : [];
  const characterMemories = Array.isArray(candidate.characterMemories)
    ? candidate.characterMemories
        .map(normalizeCharacterMemoryDraft)
        .filter((draft): draft is TavernCharacterMemoryDraft => Boolean(draft))
    : [];
  const lorebookEntries = Array.isArray(candidate.lorebookEntries)
    ? candidate.lorebookEntries
        .map(normalizeLorebookDraft)
        .filter((draft): draft is TavernLorebookDraft => Boolean(draft))
    : [];

  if (
    characterMemories.length === 0 &&
    lorebookEntries.length === 0
  ) {
    return null;
  }

  return {
    id: candidate.id,
    sourceMessageIds,
    characterMemories,
    lorebookEntries,
    createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : updatedAt,
    updatedAt,
  };
};

const normalizeIllustrationHint = (
  value: unknown,
): TavernIllustrationHint | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernIllustrationHint>;
  const prompt = typeof candidate.prompt === "string" ? candidate.prompt.trim() : "";
  if (!candidate.id || !prompt) {
    return null;
  }

  return {
    id: candidate.id,
    turnId: typeof candidate.turnId === "string" && candidate.turnId.trim()
      ? candidate.turnId
      : undefined,
    source: "director",
    prompt,
    sourceMessageIds: Array.isArray(candidate.sourceMessageIds)
      ? candidate.sourceMessageIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [],
    createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : now(),
  };
};

const normalizeIllustrationHints = (value: unknown): TavernIllustrationHint[] => Array.isArray(value)
  ? value
      .map(normalizeIllustrationHint)
      .filter((hint): hint is TavernIllustrationHint => Boolean(hint))
  : [];

type TavernCharacterIdMapper = (characterId: string) => string | undefined;

const mapCharacterId = (
  characterId: string,
  mapper: TavernCharacterIdMapper,
) => mapper(characterId) ?? characterId;

const mapTavernRelationshipTarget = (
  target: TavernRelationshipTarget,
  mapper: TavernCharacterIdMapper,
): TavernRelationshipTarget => target.type === "character"
  ? {
      type: "character",
      characterId: mapCharacterId(target.characterId, mapper),
    }
  : target;

const mapTavernCharacterRelationships = (
  relationships: TavernCharacterRelationship[] | undefined,
  mapper: TavernCharacterIdMapper,
): TavernCharacterRelationship[] => (relationships ?? []).map((relationship) => ({
  ...relationship,
  target: mapTavernRelationshipTarget(relationship.target, mapper),
}));

const mapTavernSceneRelationshipOverrides = (
  overrides: TavernSceneRelationshipOverride[] | undefined,
  mapper: TavernCharacterIdMapper,
): TavernSceneRelationshipOverride[] => (overrides ?? []).map((override) => ({
  ...override,
  subjectCharacterId: mapCharacterId(override.subjectCharacterId, mapper),
  target: mapTavernRelationshipTarget(override.target, mapper),
}));

const tavernEntityRefKey = (entity: TavernEntityRef): string => {
  switch (entity.type) {
    case "user":
      return `user:${entity.userId}`;
    case "character":
      return `character:${entity.characterId}`;
    case "team":
      return `team:${entity.teamId}`;
    case "faction":
      return `faction:${entity.factionId}`;
    case "party":
      return `party:${entity.partyId}`;
    case "scene":
      return `scene:${entity.sceneId}`;
    case "global":
      return "global";
  }
};

const tavernRelationshipStatusKey = (
  subject: TavernEntityRef,
  object: TavernEntityRef,
) => `relationship:${tavernEntityRefKey(subject)}->${tavernEntityRefKey(object)}`;

const parseTavernEntityRefKey = (value: string): TavernEntityRef | null => {
  if (value === "global") {
    return { type: "global" };
  }
  const separatorIndex = value.indexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }
  const type = value.slice(0, separatorIndex);
  const id = value.slice(separatorIndex + 1);
  if (!id) {
    return null;
  }
  switch (type) {
    case "user":
      return id === "user" ? { type: "user", userId: "user" } : null;
    case "character":
      return { type: "character", characterId: id };
    case "team":
      return { type: "team", teamId: id };
    case "faction":
      return { type: "faction", factionId: id };
    case "party":
      return { type: "party", partyId: id };
    case "scene":
      return { type: "scene", sceneId: id };
    default:
      return null;
  }
};

const parseTavernRelationshipStatusKey = (value: string) => {
  if (!value.startsWith("relationship:")) {
    return null;
  }
  const rawPair = value.slice("relationship:".length);
  const separatorIndex = rawPair.indexOf("->");
  if (separatorIndex <= 0) {
    return null;
  }
  const subject = parseTavernEntityRefKey(rawPair.slice(0, separatorIndex));
  const object = parseTavernEntityRefKey(rawPair.slice(separatorIndex + 2));
  return subject && object ? { subject, object } : null;
};

const mapTavernEntityRef = (
  entity: TavernEntityRef,
  mapper: TavernCharacterIdMapper,
): TavernEntityRef => {
  if (entity.type === "character") {
    return {
      type: "character",
      characterId: mapCharacterId(entity.characterId, mapper),
    };
  }
  return entity;
};

const mapTavernStatusTargetRef = (
  target: TavernStatusTargetRef,
  mapper: TavernCharacterIdMapper,
): TavernStatusTargetRef => {
  if (target.type === "character") {
    return {
      type: "character",
      characterId: mapCharacterId(target.characterId, mapper),
    };
  }
  if (target.type === "relationship") {
    return {
      type: "relationship",
      subject: mapTavernEntityRef(target.subject, mapper),
      object: mapTavernEntityRef(target.object, mapper),
    };
  }
  return target;
};

const mapTavernCondition = (
  condition: TavernCondition,
  mapper: TavernCharacterIdMapper,
): TavernCondition => {
  if ("all" in condition) {
    return { ...condition, all: condition.all.map((item) => mapTavernCondition(item, mapper)) };
  }
  if ("any" in condition) {
    return { ...condition, any: condition.any.map((item) => mapTavernCondition(item, mapper)) };
  }
  if ("not" in condition) {
    return { ...condition, not: mapTavernCondition(condition.not, mapper) };
  }
  if ("status" in condition && "target" in condition) {
    return {
      ...condition,
      target: mapTavernStatusTargetRef(condition.target, mapper),
    };
  }
  if ("factEvent" in condition) {
    return {
      ...condition,
      ...(condition.actor ? { actor: mapTavernEntityRef(condition.actor, mapper) } : {}),
      ...(condition.target ? { target: mapTavernEntityRef(condition.target, mapper) } : {}),
    };
  }
  if ("task" in condition) {
    return {
      ...condition,
      ...(condition.owner ? { owner: mapTavernEntityRef(condition.owner, mapper) } : {}),
    };
  }
  return condition;
};

const mapTavernReplyOption = (
  option: TavernReplyOption,
  mapper: TavernCharacterIdMapper,
): TavernReplyOption => ({
  ...option,
  targetCharacterIds: option.targetCharacterIds.map((characterId) =>
    mapCharacterId(characterId, mapper)
  ),
});

const mapTavernStatusEvent = (
  event: TavernStatusEvent,
  mapper: TavernCharacterIdMapper,
): TavernStatusEvent => ({
  ...event,
  target: mapTavernStatusTargetRef(event.target, mapper),
});

const mapTavernProgressAction = (
  action: TavernProgressAction,
  mapper: TavernCharacterIdMapper,
): TavernProgressAction => {
  if (action.type === "statusPatch") {
    return {
      ...action,
      statusEvents: action.statusEvents.map((event) => mapTavernStatusEvent(event, mapper)),
    };
  }
  if (action.type === "replyOptions") {
    return {
      ...action,
      options: action.options.map((option) => mapTavernReplyOption(option, mapper)),
    };
  }
  return action;
};

const mapTavernTaskDefinition = (
  task: TavernTaskDefinition,
  mapper: TavernCharacterIdMapper,
): TavernTaskDefinition => ({
  ...task,
  owner: mapTavernEntityRef(task.owner, mapper),
  participants: task.participants?.map((participant) => mapTavernEntityRef(participant, mapper)),
  lifecycle: {
    ...task.lifecycle,
    startCondition: task.lifecycle.startCondition
      ? mapTavernCondition(task.lifecycle.startCondition, mapper)
      : undefined,
    completeCondition: mapTavernCondition(task.lifecycle.completeCondition, mapper),
    failCondition: task.lifecycle.failCondition
      ? mapTavernCondition(task.lifecycle.failCondition, mapper)
      : undefined,
  },
  onComplete: task.onComplete?.map((action) => mapTavernProgressAction(action, mapper)),
  onFail: task.onFail?.map((action) => mapTavernProgressAction(action, mapper)),
});

const mapTavernTaskDefinitions = (
  value: unknown,
  mapper: TavernCharacterIdMapper,
) => Array.isArray(value)
  ? normalizeTaskDefinitions(value, []).map((item) => mapTavernTaskDefinition(item, mapper))
  : value;

const mapTavernSceneOutcomeDefinition = (
  outcome: TavernSceneOutcomeDefinition,
  mapper: TavernCharacterIdMapper,
): TavernSceneOutcomeDefinition => ({
  ...outcome,
  winner: outcome.winner?.map((entity) => mapTavernEntityRef(entity, mapper)),
  loser: outcome.loser?.map((entity) => mapTavernEntityRef(entity, mapper)),
  condition: mapTavernCondition(outcome.condition, mapper),
  onAchieved: outcome.onAchieved?.map((action) => mapTavernProgressAction(action, mapper)),
});

const mapTavernSceneOutcomeDefinitions = (
  value: unknown,
  mapper: TavernCharacterIdMapper,
) => Array.isArray(value)
  ? normalizeSceneOutcomes(value, []).map((item) => mapTavernSceneOutcomeDefinition(item, mapper))
  : value;

const mapTavernStatusSnapshot = (
  value: unknown,
  mapper: TavernCharacterIdMapper,
) => {
  if (!value || typeof value !== "object") {
    return value;
  }

  const candidate = value as Partial<TavernStatusSnapshot>;
  const characters = Object.fromEntries(
    Object.entries(candidate.characters ?? {}).map(([characterId, statuses]) => [
      mapCharacterId(characterId, mapper),
      statuses,
    ]),
  );
  const relationships = Object.fromEntries(
    Object.entries(candidate.relationships ?? {}).map(([relationshipKey, statuses]) => {
      const parsed = parseTavernRelationshipStatusKey(relationshipKey);
      if (!parsed) {
        return [relationshipKey, statuses];
      }
      return [
        tavernRelationshipStatusKey(
          mapTavernEntityRef(parsed.subject, mapper),
          mapTavernEntityRef(parsed.object, mapper),
        ),
        statuses,
      ];
    }),
  );

  return {
    ...candidate,
    characters,
    relationships,
  };
};

const mergeLorebookEntries = (
  ...groups: TavernLorebookEntry[][]
) => {
  const seen = new Set<string>();
  return groups.flat().filter((entry) => {
    const key = [
      entry.title.trim().toLowerCase(),
      entry.content.trim().toLowerCase(),
      entry.keywords.map((keyword) => keyword.trim().toLowerCase()).sort().join(","),
    ].join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

const defaultStoryStageTitle = "第一阶段";

const createTavernStoryStage = (
  input: Partial<TavernStoryStage> = {},
): TavernStoryStage => ({
  id: input.id || createId("stage"),
  title: input.title?.trim() || defaultStoryStageTitle,
  summary: input.summary?.trim() || undefined,
  routeNodeId: input.routeNodeId?.trim() || undefined,
  order: typeof input.order === "number" ? input.order : 0,
  collapsed: Boolean(input.collapsed),
});

const normalizeTavernStoryNodeType = (value: unknown): TavernStoryNode["type"] => {
  if (value === "failure" || value === "ending") {
    return value;
  }
  return "normal";
};

const normalizeTavernStoryPathRole = (value: unknown): TavernStoryNode["pathRole"] => (
  value === "branch" ? "branch" : "main"
);

const createTavernStoryNode = (
  input: Partial<TavernStoryNode> & {
    stageId: string;
    title: string;
  },
): TavernStoryNode => {
  const updatedAt = typeof input.updatedAt === "number" ? input.updatedAt : now();

  return {
    id: input.id || createId("node"),
    stageId: input.stageId,
    sceneId: input.sceneId?.trim() || undefined,
    title: input.title.trim() || "未命名节点",
    type: normalizeTavernStoryNodeType(input.type),
    pathRole: normalizeTavernStoryPathRole(input.pathRole),
    position: {
      x: typeof input.position?.x === "number" ? input.position.x : 120,
      y: typeof input.position?.y === "number" ? input.position.y : 120,
    },
    status: input.status ?? (input.sceneId ? "ready" : "draft"),
    createdAt: typeof input.createdAt === "number" ? input.createdAt : updatedAt,
    updatedAt,
  };
};

const createTavernStoryEdge = (
  input: Partial<TavernStoryEdge> & {
    fromNodeId: string;
    toNodeId: string;
  },
): TavernStoryEdge => {
  const updatedAt = typeof input.updatedAt === "number" ? input.updatedAt : now();

  return {
    id: input.id || createId("edge"),
    fromNodeId: input.fromNodeId,
    toNodeId: input.toNodeId,
    label: input.label?.trim() || "继续",
    reason: input.reason?.trim() || undefined,
    isDefault: Boolean(input.isDefault),
    priority: typeof input.priority === "number" ? input.priority : 0,
    createdAt: typeof input.createdAt === "number" ? input.createdAt : updatedAt,
    updatedAt,
  };
};

const createDefaultStoryGraph = (
  scenes: TavernScene[],
): TavernStoryGraph => {
  const stage = createTavernStoryStage({ title: defaultStoryStageTitle, order: 0 });
  const nodes = scenes.map((scene, index) =>
    createTavernStoryNode({
      stageId: stage.id,
      sceneId: scene.id,
      title: scene.title || `节点 ${index + 1}`,
      type: index === scenes.length - 1 && scenes.length > 1 ? "ending" : "normal",
      pathRole: "main",
      position: {
        x: 120 + index * 240,
        y: 160,
      },
      status: "ready",
      createdAt: scene.createdAt,
      updatedAt: scene.updatedAt,
    })
  );
  const entryNode = nodes[0] ??
    createTavernStoryNode({
      stageId: stage.id,
      title: "入口节点",
      status: "draft",
    });
  const edges = nodes.slice(0, -1).map((node, index) =>
    createTavernStoryEdge({
      fromNodeId: node.id,
      toNodeId: nodes[index + 1].id,
      label: "继续",
      isDefault: true,
      priority: index,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    })
  );

  return {
    version: 1,
    entryNodeId: entryNode.id,
    activeNodeId: entryNode.id,
    stages: [{ ...stage, routeNodeId: nodes[nodes.length - 1]?.id ?? entryNode.id }],
    nodes: nodes.length > 0 ? nodes : [entryNode],
    edges,
  };
};

const normalizeStoryGraph = (
  value: unknown,
  scenes: TavernScene[],
): TavernStoryGraph => {
  if (!value || typeof value !== "object") {
    return createDefaultStoryGraph(scenes);
  }

  const candidate = value as Partial<TavernStoryGraph>;
  const stages = Array.isArray(candidate.stages)
    ? candidate.stages
        .map((stage) => createTavernStoryStage(stage))
        .filter((stage) => stage.title.trim())
        .sort((left, right) => left.order - right.order)
        .map((stage, index) => ({ ...stage, order: index }))
    : [];
  const normalizedStages = stages.length > 0
    ? stages
    : createDefaultStoryGraph(scenes).stages;
  const stageIds = new Set(normalizedStages.map((stage) => stage.id));
  const fallbackStageId = normalizedStages[0]?.id ?? createId("stage");
  const sceneIds = new Set(scenes.map((scene) => scene.id));
  const nodes = Array.isArray(candidate.nodes)
    ? candidate.nodes
        .map((node) => {
          const rawNode = node as Partial<TavernStoryNode>;
          const title = typeof rawNode.title === "string" ? rawNode.title : "";
          if (!title.trim()) {
            return null;
          }

          return createTavernStoryNode({
            ...rawNode,
            stageId: rawNode.stageId && stageIds.has(rawNode.stageId)
              ? rawNode.stageId
              : fallbackStageId,
            sceneId: rawNode.sceneId && sceneIds.has(rawNode.sceneId)
              ? rawNode.sceneId
              : undefined,
            title,
          });
        })
        .filter((node): node is TavernStoryNode => Boolean(node))
    : [];
  const normalizedNodes = nodes.length > 0
    ? nodes
    : createDefaultStoryGraph(scenes).nodes;
  const nodeIds = new Set(normalizedNodes.map((node) => node.id));
  const validatedStages = normalizedStages.map((stage) => ({
    ...stage,
    routeNodeId: stage.routeNodeId && nodeIds.has(stage.routeNodeId)
      ? stage.routeNodeId
      : undefined,
  }));
  const edges = Array.isArray(candidate.edges)
    ? candidate.edges
        .map((edge) => {
          const rawEdge = edge as Partial<TavernStoryEdge>;
          if (
            !rawEdge.fromNodeId ||
            !rawEdge.toNodeId ||
            !nodeIds.has(rawEdge.fromNodeId) ||
            !nodeIds.has(rawEdge.toNodeId) ||
            rawEdge.fromNodeId === rawEdge.toNodeId
          ) {
            return null;
          }

          return createTavernStoryEdge({
            ...rawEdge,
            fromNodeId: rawEdge.fromNodeId,
            toNodeId: rawEdge.toNodeId,
          });
        })
        .filter((edge): edge is TavernStoryEdge => Boolean(edge))
    : [];
  const entryNodeId = candidate.entryNodeId && nodeIds.has(candidate.entryNodeId)
    ? candidate.entryNodeId
    : normalizedNodes[0]?.id ?? "";
  const activeNodeId = candidate.activeNodeId && nodeIds.has(candidate.activeNodeId)
    ? candidate.activeNodeId
    : entryNodeId;

  return {
    version: 1,
    entryNodeId,
    activeNodeId,
    stages: validatedStages,
    nodes: normalizedNodes,
    edges,
  };
};

const createPresetLorebookEntry = (
  entry: NonNullable<TavernSystemPresetRoom["lorebookEntries"]>[number],
  createdAt: number,
): TavernLorebookEntry | null => {
  const title = typeof entry.title === "string" ? entry.title.trim() : "";
  const content = typeof entry.content === "string" ? entry.content.trim() : "";
  if (!title || !content) {
    return null;
  }

  return {
    id: createId("lore"),
    title,
    content,
    keywords: normalizeLorebookKeywords(entry.keywords),
    enabled: entry.enabled !== false,
    alwaysOn: Boolean(entry.alwaysOn),
    createdAt,
    updatedAt: createdAt,
  };
};

const createPresetAssetDraft = (
  draft: NonNullable<TavernSystemPresetRoom["assetDrafts"]>[number],
  characterIdByPresetId: Map<string, string>,
  createdAt: number,
): TavernAssetDraft | null => {
  const characterMemories = (draft.characterMemories ?? []).flatMap((memory) => {
    const characterId = characterIdByPresetId.get(memory.characterId);
    const note = typeof memory.note === "string" ? memory.note.trim() : "";
    return characterId && note
      ? [{
          id: createId("memory-draft"),
          characterId,
          note,
        }]
      : [];
  });
  const lorebookEntries = (draft.lorebookEntries ?? []).flatMap((entry) => {
    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    const content = typeof entry.content === "string" ? entry.content.trim() : "";
    return title && content
      ? [{
          id: createId("lore-draft"),
          title,
          content,
          keywords: normalizeLorebookKeywords(entry.keywords),
          alwaysOn: Boolean(entry.alwaysOn),
        }]
      : [];
  });

  if (
    characterMemories.length === 0 &&
    lorebookEntries.length === 0
  ) {
    return null;
  }

  return {
    id: createId("draft"),
    sourceMessageIds: (draft.sourceMessageIds ?? []).filter((item): item is string =>
      typeof item === "string"
    ),
    characterMemories,
    lorebookEntries,
    createdAt,
    updatedAt: createdAt,
  };
};

type TavernSceneInput = Partial<Omit<TavernScene, "scenePresetId">> & {
  scenePresetId?: unknown;
};

const normalizeSceneCharacterIds = (
  characterIds: unknown,
  fallbackCharacterIds: string[] = [],
) => {
  const ids = Array.isArray(characterIds)
    ? characterIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : fallbackCharacterIds;

  return [...new Set(ids)];
};

const buildTavernScene = (
  input: TavernSceneInput,
  fallback: Partial<TavernRoom> = {},
): TavernScene => {
  const updatedAt = typeof input.updatedAt === "number"
    ? input.updatedAt
    : typeof fallback.updatedAt === "number"
    ? fallback.updatedAt
    : now();
  const createdAt = typeof input.createdAt === "number"
    ? input.createdAt
    : typeof fallback.createdAt === "number"
    ? fallback.createdAt
    : updatedAt;
  const fallbackCharacterMemories = normalizeStringRecord(fallback.characterMemories);
  const inputCharacterMemories = input.characterMemories === undefined
    ? fallbackCharacterMemories
    : normalizeStringRecord(input.characterMemories);
  const characterConfigs = normalizeRoomCharacterConfigs(
    input.characterConfigs ?? fallback.characterConfigs,
    inputCharacterMemories,
  );
  const characterIds = normalizeSceneCharacterIds(
    input.characterIds,
    Array.isArray(fallback.characterIds) ? fallback.characterIds : [],
  );
  const activeCharacterId = typeof input.activeCharacterId === "string" &&
      characterIds.includes(input.activeCharacterId)
    ? input.activeCharacterId
    : typeof fallback.activeCharacterId === "string" &&
        characterIds.includes(fallback.activeCharacterId)
    ? fallback.activeCharacterId
    : characterIds[0] ?? "";

  return {
    id: input.id || createId("scene"),
    order: typeof input.order === "number"
      ? input.order
      : typeof (fallback as Partial<TavernScene>).order === "number"
      ? (fallback as Partial<TavernScene>).order ?? 0
      : 0,
    title: input.title?.trim() || defaultSceneTitle,
    scenePresetId: normalizeVisualPresetId(input.scenePresetId ?? fallback.scenePresetId),
    scene: input.scene?.trim() || fallback.scene?.trim() || "一张空桌、一盏低灯，以及等待被写下的第一句对白。",
    sceneGoal: input.sceneGoal?.trim() || fallback.sceneGoal?.trim() || "",
    plot: input.plot?.trim() || fallback.scenePlot?.trim() || "",
    storyDirection: input.storyDirection?.trim() || fallback.sceneDirection?.trim() || "",
    transition: input.transition?.trim() || fallback.sceneTransition?.trim() || "",
    memory: input.memory?.trim() || fallback.memory?.trim() || "",
    relationshipOverrides: normalizeSceneRelationshipOverrides(
      input.relationshipOverrides ?? (fallback as Partial<TavernScene>).relationshipOverrides,
      updatedAt,
    ),
    sceneStatus: normalizeSceneStatus(input.sceneStatus, updatedAt) ??
      normalizeSceneStatus((fallback as Partial<TavernScene>).sceneStatus, updatedAt),
    characterPublicStatuses: normalizeCharacterPublicStatuses(
      input.characterPublicStatuses ?? (fallback as Partial<TavernScene>).characterPublicStatuses,
      characterIds,
      undefined,
      updatedAt,
    ),
    characterPrivateStatuses: normalizeCharacterPrivateStatuses(
      input.characterPrivateStatuses ?? (fallback as Partial<TavernScene>).characterPrivateStatuses,
      characterIds,
      undefined,
      updatedAt,
    ),
    pendingInteractions: Array.isArray(input.pendingInteractions)
      ? input.pendingInteractions
          .map(normalizePendingInteraction)
          .filter((interaction): interaction is TavernPendingInteraction => Boolean(interaction))
      : Array.isArray((fallback as Partial<TavernScene>).pendingInteractions)
      ? ((fallback as Partial<TavernScene>).pendingInteractions ?? [])
          .map(normalizePendingInteraction)
          .filter((interaction): interaction is TavernPendingInteraction => Boolean(interaction))
      : [],
    replyOptions: Array.isArray(input.replyOptions)
      ? input.replyOptions
          .map(normalizeReplyOption)
          .filter((option): option is TavernReplyOption => Boolean(option))
      : Array.isArray((fallback as Partial<TavernScene>).replyOptions)
      ? ((fallback as Partial<TavernScene>).replyOptions ?? [])
          .map(normalizeReplyOption)
          .filter((option): option is TavernReplyOption => Boolean(option))
      : [],
    factEvents: normalizeFactEvents(
      input.factEvents ?? (fallback as Partial<TavernScene>).factEvents,
    ),
    statusEvents: normalizeStatusEvents(
      input.statusEvents ?? (fallback as Partial<TavernScene>).statusEvents,
    ),
    statusSnapshot: normalizeStatusSnapshot(
      input.statusSnapshot ?? (fallback as Partial<TavernScene>).statusSnapshot,
      updatedAt,
    ),
    previousStatusSnapshot: (input.previousStatusSnapshot ?? (fallback as Partial<TavernScene>).previousStatusSnapshot)
      ? normalizeStatusSnapshot(
          input.previousStatusSnapshot ?? (fallback as Partial<TavernScene>).previousStatusSnapshot,
          updatedAt,
        )
      : undefined,
    statusCheckpoints: normalizeProgressCheckpoints(
      input.statusCheckpoints ?? (fallback as Partial<TavernScene>).statusCheckpoints,
    ),
    taskDefinitions: normalizeTaskDefinitions(
      input.taskDefinitions ?? (fallback as Partial<TavernScene>).taskDefinitions,
    ),
    taskEvents: normalizeTaskEvents(
      input.taskEvents ?? (fallback as Partial<TavernScene>).taskEvents,
    ),
    taskSnapshot: normalizeTaskSnapshot(
      input.taskSnapshot ?? (fallback as Partial<TavernScene>).taskSnapshot,
    ),
    sceneOutcomes: normalizeSceneOutcomes(
      input.sceneOutcomes ?? (fallback as Partial<TavernScene>).sceneOutcomes,
    ),
    outcomeEvents: normalizeOutcomeEvents(
      input.outcomeEvents ?? (fallback as Partial<TavernScene>).outcomeEvents,
    ),
    characterConfigs,
    characterMemories: roomCharacterMemoriesFromConfigs(characterConfigs),
    illustrationHints: normalizeIllustrationHints(
      input.illustrationHints ?? (fallback as Partial<TavernScene>).illustrationHints,
    ),
    assetDrafts: Array.isArray(input.assetDrafts)
      ? input.assetDrafts
          .map(normalizeAssetDraft)
          .filter((draft): draft is TavernAssetDraft => Boolean(draft))
      : Array.isArray(fallback.assetDrafts)
      ? fallback.assetDrafts
          .map(normalizeAssetDraft)
          .filter((draft): draft is TavernAssetDraft => Boolean(draft))
      : [],
    characterIds,
    activeCharacterId,
    createdAt,
    updatedAt,
  };
};

export const createTavernScene = (
  input: TavernSceneInput = {},
  fallback: Partial<TavernRoom> = {},
): TavernScene => buildTavernScene(input, fallback);

export const getActiveTavernStoryNode = (room: TavernRoom | null | undefined) => {
  if (!room?.storyGraph?.nodes.length) {
    return null;
  }

  return room.storyGraph.nodes.find((node) => node.id === room.storyGraph.activeNodeId) ??
    room.storyGraph.nodes.find((node) => node.id === room.storyGraph.entryNodeId) ??
    room.storyGraph.nodes[0] ??
    null;
};

export const getActiveTavernScene = (room: TavernRoom | null | undefined) => {
  if (!room?.scenes?.length) {
    return null;
  }

  const activeNode = getActiveTavernStoryNode(room);
  if (activeNode?.sceneId) {
    const nodeScene = room.scenes.find((scene) => scene.id === activeNode.sceneId);
    if (nodeScene) {
      return nodeScene;
    }
  }

  return room.scenes.find((scene) => scene.id === room.activeSceneId) ?? room.scenes[0] ?? null;
};

export const getTavernSceneDisplayTitle = (
  room: Pick<TavernRoom, "storyGraph" | "scenes"> | null | undefined,
  sceneId: string | undefined,
  fallback = "默认场景",
) => {
  if (!sceneId) {
    return fallback;
  }

  const boundNodeTitle = room?.storyGraph?.nodes
    .find((node) => node.sceneId === sceneId)
    ?.title
    ?.trim();
  if (boundNodeTitle) {
    return boundNodeTitle;
  }

  return room?.scenes?.find((scene) => scene.id === sceneId)?.title?.trim() || fallback;
};

export const projectTavernSceneOntoRoom = (room: TavernRoom): TavernRoom => {
  const activeScene = getActiveTavernScene(room);
  if (!activeScene) {
    return room;
  }

  return {
    ...room,
    activeSceneId: activeScene.id,
    scene: activeScene.scene,
    sceneGoal: activeScene.sceneGoal,
    scenePlot: activeScene.plot,
    sceneDirection: activeScene.storyDirection,
    sceneTransition: activeScene.transition,
    memory: activeScene.memory,
    relationshipOverrides: activeScene.relationshipOverrides,
    sceneStatus: activeScene.sceneStatus,
    characterPublicStatuses: activeScene.characterPublicStatuses,
    characterPrivateStatuses: activeScene.characterPrivateStatuses,
    pendingInteractions: activeScene.pendingInteractions,
    replyOptions: activeScene.replyOptions,
    factEvents: activeScene.factEvents,
    statusEvents: activeScene.statusEvents,
    statusSnapshot: activeScene.statusSnapshot,
    previousStatusSnapshot: activeScene.previousStatusSnapshot,
    statusCheckpoints: activeScene.statusCheckpoints,
    taskDefinitions: activeScene.taskDefinitions,
    taskEvents: activeScene.taskEvents,
    taskSnapshot: activeScene.taskSnapshot,
    sceneOutcomes: activeScene.sceneOutcomes,
    outcomeEvents: activeScene.outcomeEvents,
    characterConfigs: activeScene.characterConfigs ?? {},
    characterMemories: activeScene.characterMemories,
    illustrationHints: activeScene.illustrationHints,
    assetDrafts: activeScene.assetDrafts,
    characterIds: activeScene.characterIds,
    activeCharacterId: activeScene.activeCharacterId,
  };
};

export const syncTavernRoomActiveScene = (room: TavernRoom): TavernRoom => {
  const scenes = room.scenes?.length
    ? room.scenes
    : [buildTavernScene({}, room)];
  const activeScene = scenes.find((scene) => scene.id === room.activeSceneId) ?? scenes[0];
  const syncedScene: TavernScene = {
    ...activeScene,
    scenePresetId: room.scenePresetId,
    scene: room.scene,
    sceneGoal: room.sceneGoal,
    plot: room.scenePlot,
    storyDirection: room.sceneDirection,
    transition: room.sceneTransition,
    memory: room.memory,
    relationshipOverrides: room.relationshipOverrides,
    sceneStatus: room.sceneStatus,
    characterPublicStatuses: room.characterPublicStatuses,
    characterPrivateStatuses: room.characterPrivateStatuses,
    pendingInteractions: room.pendingInteractions,
    replyOptions: room.replyOptions,
    factEvents: room.factEvents,
    statusEvents: room.statusEvents,
    statusSnapshot: room.statusSnapshot,
    previousStatusSnapshot: room.previousStatusSnapshot,
    statusCheckpoints: room.statusCheckpoints,
    taskDefinitions: room.taskDefinitions,
    taskEvents: room.taskEvents,
    taskSnapshot: room.taskSnapshot,
    sceneOutcomes: room.sceneOutcomes,
    outcomeEvents: room.outcomeEvents,
    characterConfigs: room.characterConfigs ?? {},
    characterMemories: room.characterMemories,
    illustrationHints: room.illustrationHints,
    assetDrafts: room.assetDrafts,
    characterIds: room.characterIds,
    activeCharacterId: room.activeCharacterId,
    updatedAt: room.updatedAt,
  };

  return projectTavernSceneOntoRoom({
    ...room,
    activeSceneId: syncedScene.id,
    scenes: scenes.map((scene) => scene.id === syncedScene.id ? syncedScene : scene),
  });
};

export const switchTavernRoomScene = (
  room: TavernRoom,
  sceneId: string,
): TavernRoom => {
  const scene = room.scenes?.find((item) => item.id === sceneId);
  const node = room.storyGraph?.nodes.find((item) => item.sceneId === sceneId);
  return scene
    ? projectTavernSceneOntoRoom({
        ...room,
        storyGraph: node
          ? {
              ...room.storyGraph,
              activeNodeId: node.id,
            }
          : room.storyGraph,
        activeSceneId: scene.id,
        updatedAt: Date.now(),
      })
    : room;
};

export const createTavernRoomFromSystemPreset = (
  workspaceId: string,
  presetId: string,
  options: {
    roomId?: string;
    roomCreatedAt?: number;
    createdAt?: number;
    characterIdByPresetId?: Map<string, string>;
    markAsSystemPreset?: boolean;
  } = {},
) => {
  const preset = getTavernSystemPreset(presetId);
  if (!preset) {
    throw new Error(`Unknown tavern system preset: ${presetId}`);
  }

  const createdAt = options.createdAt ?? now();
  const roomId = options.roomId ?? createId("room");
  const characterIdByPresetId = new Map<string, string>();
  const rawCharacters: TavernCharacter[] = preset.characters.map((character) => {
    const characterId = options.characterIdByPresetId?.get(character.id) ?? createId("character");
    characterIdByPresetId.set(character.id, characterId);

    return createTavernCharacterFromSystemPresetCharacter(character, {
      id: characterId,
      createdAt,
    });
  });
  const mapSystemCharacterId = (characterId: string) => characterIdByPresetId.get(characterId);
  const characters = rawCharacters.map((character) => ({
    ...character,
    relationships: mapTavernCharacterRelationships(character.relationships, mapSystemCharacterId),
  }));
  const mappedCharacterIds = preset.room.characterIds
    .flatMap((characterId) => {
      const mappedId = characterIdByPresetId.get(characterId);
      return mappedId ? [mappedId] : [];
    });
  const characterIds = mappedCharacterIds.length > 0
    ? mappedCharacterIds
    : characters.map((character) => character.id);
  const activeCharacterId = characterIdByPresetId.get(preset.room.activeCharacterId)
    ?? characterIds[0]
    ?? "";
  const characterMemories = Object.fromEntries(
    Object.entries(preset.room.characterMemories ?? {})
      .flatMap(([presetCharacterId, memory]) => {
        const characterId = characterIdByPresetId.get(presetCharacterId);
        return characterId && memory.trim() ? [[characterId, memory.trim()]] : [];
      }),
  );
  const characterConfigs = normalizeRoomCharacterConfigs(undefined, characterMemories);
  const markAsSystemPreset = options.markAsSystemPreset !== false;
  const presetScenes: TavernSystemPresetScene[] = Array.isArray(preset.room.scenes) && preset.room.scenes.length > 0
    ? preset.room.scenes
    : [{
        title: defaultSceneTitle,
        order: 0,
        scenePresetId: preset.room.scenePresetId,
        scene: preset.room.scene,
        sceneGoal: preset.room.sceneGoal,
        plot: preset.room.plot,
        storyDirection: preset.room.storyDirection,
        transition: preset.room.transition,
        memory: preset.room.memory,
        relationshipOverrides: preset.room.relationshipOverrides,
        sceneStatus: preset.room.sceneStatus,
        characterPublicStatuses: preset.room.characterPublicStatuses,
        characterPrivateStatuses: preset.room.characterPrivateStatuses,
        statusSnapshot: preset.room.statusSnapshot,
        taskDefinitions: preset.room.taskDefinitions,
        sceneOutcomes: preset.room.sceneOutcomes,
        characterMemories: preset.room.characterMemories,
        assetDrafts: preset.room.assetDrafts,
        characterIds: preset.room.characterIds,
        activeCharacterId: preset.room.activeCharacterId,
      }];
  const sharedLorebookEntries = mergeLorebookEntries([
    ...(preset.room.lorebookEntries ?? []),
    ...presetScenes.flatMap((presetScene) => presetScene.lorebookEntries ?? []),
  ].map((entry) => createPresetLorebookEntry(entry, createdAt))
    .filter((entry): entry is TavernLorebookEntry => Boolean(entry)));
  const scenes = presetScenes.map((presetScene, index) => {
    const sceneCharacterIds = (presetScene.characterIds?.length
      ? presetScene.characterIds
      : preset.room.characterIds
    ).map((presetCharacterId) => characterIdByPresetId.get(presetCharacterId))
      .filter((characterId): characterId is string => Boolean(characterId));
    const sceneActiveCharacterId = characterIdByPresetId.get(
      presetScene.activeCharacterId || preset.room.activeCharacterId,
    ) ?? sceneCharacterIds[0] ?? "";
    const sceneCharacterMemories = Object.fromEntries(
      Object.entries(presetScene.characterMemories ?? preset.room.characterMemories ?? {})
        .flatMap(([presetCharacterId, memory]) => {
          const characterId = characterIdByPresetId.get(presetCharacterId);
          return characterId && memory.trim() ? [[characterId, memory.trim()]] : [];
        }),
    );
    const sceneCharacterConfigs = normalizeRoomCharacterConfigs(undefined, sceneCharacterMemories);
    const sceneStatus = normalizeSceneStatus(presetScene.sceneStatus, createdAt);
    const characterPublicStatuses = normalizeCharacterPublicStatuses(
      presetScene.characterPublicStatuses,
      sceneCharacterIds,
      characterIdByPresetId,
      createdAt,
    );
    const characterPrivateStatuses = normalizeCharacterPrivateStatuses(
      presetScene.characterPrivateStatuses,
      sceneCharacterIds,
      characterIdByPresetId,
      createdAt,
    );
    const statusSnapshot = normalizeStatusSnapshot(
      mapTavernStatusSnapshot(
        presetScene.statusSnapshot ?? preset.room.statusSnapshot,
        mapSystemCharacterId,
      ),
      createdAt,
    );

    return buildTavernScene({
      title: presetScene.title?.trim() || defaultSceneTitle,
      order: typeof presetScene.order === "number" ? presetScene.order : index,
      scenePresetId: presetScene.scenePresetId ?? preset.room.scenePresetId,
      scene: presetScene.scene?.trim() || preset.room.scene.trim(),
      sceneGoal: presetScene.sceneGoal?.trim() || preset.room.sceneGoal?.trim() || "",
      plot: presetScene.plot?.trim() || preset.room.plot?.trim() || "",
      storyDirection: presetScene.storyDirection?.trim() || preset.room.storyDirection?.trim() || "",
      transition: presetScene.transition?.trim() || preset.room.transition?.trim() || "",
      memory: presetScene.memory?.trim() || preset.room.memory?.trim() || "",
      relationshipOverrides: mapTavernSceneRelationshipOverrides(
        normalizeSceneRelationshipOverrides(
          presetScene.relationshipOverrides ?? preset.room.relationshipOverrides,
          createdAt,
        ),
        mapSystemCharacterId,
      ),
      sceneStatus,
      characterPublicStatuses,
      characterPrivateStatuses,
      pendingInteractions: [],
      replyOptions: [],
      factEvents: [],
      statusEvents: [],
      statusSnapshot,
      previousStatusSnapshot: undefined,
      statusCheckpoints: [],
      taskDefinitions: normalizeTaskDefinitions(
        mapTavernTaskDefinitions(
          presetScene.taskDefinitions ?? preset.room.taskDefinitions,
          mapSystemCharacterId,
        ),
      ),
      taskEvents: [],
      taskSnapshot: {},
      sceneOutcomes: normalizeSceneOutcomes(
        mapTavernSceneOutcomeDefinitions(
          presetScene.sceneOutcomes ?? preset.room.sceneOutcomes,
          mapSystemCharacterId,
        ),
      ),
      outcomeEvents: [],
      characterConfigs: sceneCharacterConfigs,
      characterMemories: sceneCharacterMemories,
      illustrationHints: [],
      assetDrafts: (presetScene.assetDrafts ?? preset.room.assetDrafts ?? [])
        .map((draft) => createPresetAssetDraft(draft, characterIdByPresetId, createdAt))
        .filter((draft): draft is TavernAssetDraft => Boolean(draft)),
      characterIds: sceneCharacterIds,
      activeCharacterId: sceneActiveCharacterId,
      createdAt,
      updatedAt: createdAt,
    });
  }).sort((left, right) => left.order - right.order)
    .map((item, index) => ({ ...item, order: index }));
  const scene = scenes[0] ?? buildTavernScene({
    title: defaultSceneTitle,
    characterConfigs,
    characterMemories,
    characterIds,
    activeCharacterId,
    createdAt,
    updatedAt: createdAt,
  });
  const storyGraph = createDefaultStoryGraph(scenes.length > 0 ? scenes : [scene]);
  const presentation = normalizeRoomPresentation({
    presentation: preset.room.presentation,
    presentationProfileId: preset.room.presentationProfileId,
  });
  const room: TavernRoom = projectTavernSceneOntoRoom({
    id: roomId,
    workspaceId,
    ...(markAsSystemPreset
      ? {
          systemPresetId: preset.id,
          systemPresetVersion: preset.version,
        }
      : {}),
    locked: false,
    title: preset.room.title.trim(),
    presentation,
    prompt: createDefaultTavernPromptSettings({
      presentationProfileId: presentation.profileId,
      promptStyleId: normalizeTavernPromptStyleId(preset.room.promptStyleId),
      systemNarrativePresetId: DEFAULT_TAVERN_SYSTEM_NARRATIVE_PRESET_ID,
      ruleCompositionId: DEFAULT_TAVERN_RULE_COMPOSITION_ID,
      immersiveDescriptionEnabled: true,
    }),
    creationSource: markAsSystemPreset ? "imported" : "manual",
    storyOutline: preset.room.storyOutline?.trim() || "",
    storyGoal: preset.room.storyGoal?.trim() || "",
    storyGraph,
    activeSceneId: scene.id,
    scenes: scenes.length > 0 ? scenes : [scene],
    scenePresetId: scene.scenePresetId,
    scene: scene.scene,
    sceneGoal: scene.sceneGoal,
    scenePlot: scene.plot,
    sceneDirection: scene.storyDirection,
    sceneTransition: scene.transition,
    memory: scene.memory,
    relationshipOverrides: scene.relationshipOverrides,
    sceneStatus: scene.sceneStatus,
    characterPublicStatuses: scene.characterPublicStatuses,
    characterPrivateStatuses: scene.characterPrivateStatuses,
    pendingInteractions: scene.pendingInteractions,
    replyOptions: scene.replyOptions,
    statusDefinitions: normalizeStatusDefinitions(preset.room.statusDefinitions),
    statusRules: normalizeStatusRules(preset.room.statusRules),
    progressViews: normalizeProgressViews(preset.room.progressViews),
    progressTracker: normalizeProgressTracker(preset.room.progressTracker),
    factEvents: scene.factEvents,
    statusEvents: scene.statusEvents,
    statusSnapshot: scene.statusSnapshot,
    previousStatusSnapshot: scene.previousStatusSnapshot,
    statusCheckpoints: scene.statusCheckpoints,
    taskDefinitions: normalizeTaskDefinitions(
      mapTavernTaskDefinitions(preset.room.taskDefinitions, mapSystemCharacterId),
    ),
    taskEvents: scene.taskEvents,
    taskSnapshot: scene.taskSnapshot,
    sceneOutcomes: scene.sceneOutcomes,
    outcomeEvents: scene.outcomeEvents,
    characterConfigs,
    characterMemories,
    localCharacters: characters,
    lorebookEntries: sharedLorebookEntries,
    illustrationHints: scene.illustrationHints,
    assetDrafts: scene.assetDrafts,
    characterIds,
    activeCharacterId,
    replyMode: normalizeReplyMode(preset.room.replyMode),
    userPersonaName: preset.room.userPersonaName?.trim() || "我",
    settings: normalizeRoomSettings(preset.room.settings, {
      characters,
      characterIds,
      mapCharacterId: mapSystemCharacterId,
      profileSource: "preset",
      updatedAt: createdAt,
    }),
    createdAt: options.roomCreatedAt ?? createdAt,
    updatedAt: createdAt,
  });
  const messages: TavernMessage[] = preset.messages.flatMap((message): TavernMessage[] => {
    const content = typeof message.content === "string" ? message.content.trim() : "";
    if (!content) {
      return [];
    }

    if (message.role === "character") {
      const characterId = characterIdByPresetId.get(message.characterId ?? "");
      return characterId
        ? [{
            id: createId("message"),
            roomId,
            role: "character" as const,
            characterId,
            content,
            createdAt,
            status: "done" as const,
          }]
        : [];
    }

    return [{
      id: createId("message"),
      roomId,
      role: message.role === "user" ? "user" as const : "narrator" as const,
      content,
      createdAt,
      status: "done" as const,
    }];
  }).map((message) => materializeTavernMessage(message, room.presentation.profileId));

  return {
    preset,
    room,
    characters,
    messages: messages.length > 0
      ? messages
      : [
          {
            id: createId("message"),
            roomId,
            role: "narrator" as const,
            content: "系统预设酒馆已恢复默认，灯光重新亮起。",
            createdAt,
            status: "done" as const,
          },
        ],
  };
};

const trimGeneratedString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const rememberGeneratedCharacterKey = (
  characterIdByGeneratedKey: Map<string, string>,
  key: unknown,
  characterId: string,
) => {
  const text = trimGeneratedString(key);
  if (!text) {
    return;
  }

  characterIdByGeneratedKey.set(text, characterId);
  characterIdByGeneratedKey.set(text.toLowerCase(), characterId);
};

const resolveGeneratedCharacterId = (
  value: unknown,
  characterIdByGeneratedKey: Map<string, string>,
) => {
  const text = trimGeneratedString(value);
  if (!text) {
    return undefined;
  }

  return characterIdByGeneratedKey.get(text) ??
    characterIdByGeneratedKey.get(text.toLowerCase());
};

const normalizeGeneratedCharacterIds = (
  value: unknown,
  fallback: string[],
  characterIdByGeneratedKey: Map<string, string>,
) => {
  const sourceIds = Array.isArray(value) ? value : [];
  const ids = sourceIds.flatMap((item) => {
    const characterId = resolveGeneratedCharacterId(item, characterIdByGeneratedKey);
    return characterId ? [characterId] : [];
  });

  return [...new Set(ids.length > 0 ? ids : fallback)];
};

const normalizeGeneratedStringRecord = (
  value: unknown,
  characterIdByGeneratedKey: Map<string, string>,
) => {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
      const characterId = resolveGeneratedCharacterId(key, characterIdByGeneratedKey);
      const text = trimGeneratedString(item);
      return characterId && text ? [[characterId, text]] : [];
    }),
  );
};

const normalizeGeneratedCharacterObjectRecord = (
  value: unknown,
  characterIdByGeneratedKey: Map<string, string>,
) => {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
      const characterId = resolveGeneratedCharacterId(key, characterIdByGeneratedKey);
      return characterId && item && typeof item === "object"
        ? [[characterId, item]]
        : [];
    }),
  );
};

const normalizeGeneratedStatusSnapshot = (
  value: unknown,
  characterIdByGeneratedKey: Map<string, string>,
) => {
  const mapGeneratedCharacterId = (characterId: string) =>
    resolveGeneratedCharacterId(characterId, characterIdByGeneratedKey);
  return mapTavernStatusSnapshot(value, mapGeneratedCharacterId);
};

const normalizeGeneratedEntityRef = (
  value: unknown,
  characterIdByGeneratedKey: Map<string, string>,
): TavernEntityRef | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const candidate = value as Partial<TavernEntityRef> & Record<string, unknown>;
  if (candidate.type === "user") {
    return { type: "user", userId: "user" };
  }
  if (candidate.type === "character") {
    const characterId = resolveGeneratedCharacterId(candidate.characterId, characterIdByGeneratedKey);
    return characterId ? { type: "character", characterId } : undefined;
  }
  if (candidate.type === "global") {
    return { type: "global" };
  }
  if (candidate.type === "scene") {
    const sceneId = trimGeneratedString(candidate.sceneId);
    return sceneId ? { type: "scene", sceneId } : { type: "scene", sceneId: "current" };
  }
  if (candidate.type === "team") {
    const teamId = trimGeneratedString(candidate.teamId);
    return teamId ? { type: "team", teamId } : undefined;
  }
  if (candidate.type === "faction") {
    const factionId = trimGeneratedString(candidate.factionId);
    return factionId ? { type: "faction", factionId } : undefined;
  }
  if (candidate.type === "party") {
    const partyId = trimGeneratedString(candidate.partyId);
    return partyId ? { type: "party", partyId } : undefined;
  }
  return undefined;
};

const createGeneratedFactEvent = (
  value: unknown,
  index: number,
  createdAt: number,
  characterIdByGeneratedKey: Map<string, string>,
): TavernFactEvent | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<TavernFactEvent>;
  const type = trimGeneratedString(candidate.type);
  const evidence = trimGeneratedString(candidate.evidence);
  if (!type || !evidence) {
    return null;
  }

  const visibility = candidate.visibility === "owner" ||
      candidate.visibility === "team" ||
      candidate.visibility === "private" ||
      candidate.visibility === "director" ||
      candidate.visibility === "hidden" ||
      candidate.visibility === "debug" ||
      candidate.visibility === "public"
    ? candidate.visibility
    : "public";
  const revealWhen = candidate.revealWhen === "sceneOutcome" ||
      candidate.revealWhen === "never" ||
      candidate.revealWhen === "manual"
    ? candidate.revealWhen
    : undefined;
  const visibleToCharacterIds = Array.isArray(candidate.visibleToCharacterIds)
    ? candidate.visibleToCharacterIds.flatMap((id) => {
        const characterId = resolveGeneratedCharacterId(id, characterIdByGeneratedKey);
        return characterId ? [characterId] : [];
      })
    : [];
  const visibleToFactionIds = Array.isArray(candidate.visibleToFactionIds)
    ? candidate.visibleToFactionIds.flatMap((id) => {
        const factionId = trimGeneratedString(id);
        return factionId ? [factionId] : [];
      })
    : [];
  const confidence = typeof candidate.confidence === "number" && Number.isFinite(candidate.confidence)
    ? Math.min(1, Math.max(0, candidate.confidence))
    : 1;

  return {
    id: trimGeneratedString(candidate.id) || createId("fact"),
    turnId: trimGeneratedString(candidate.turnId) || "initial",
    sourceMessageIds: Array.isArray(candidate.sourceMessageIds)
      ? candidate.sourceMessageIds.flatMap((id) => {
          const text = trimGeneratedString(id);
          return text ? [text] : [];
        })
      : [],
    type,
    ...(normalizeGeneratedEntityRef(candidate.actor, characterIdByGeneratedKey)
      ? { actor: normalizeGeneratedEntityRef(candidate.actor, characterIdByGeneratedKey) }
      : {}),
    ...(normalizeGeneratedEntityRef(candidate.target, characterIdByGeneratedKey)
      ? { target: normalizeGeneratedEntityRef(candidate.target, characterIdByGeneratedKey) }
      : {}),
    ...(candidate.intensity ? { intensity: candidate.intensity } : {}),
    ...(typeof candidate.value === "number" && Number.isFinite(candidate.value) ? { value: candidate.value } : {}),
    evidence,
    confidence,
    visibility,
    ...(revealWhen ? { revealWhen } : {}),
    ...(candidate.visibleToUser ? { visibleToUser: true } : {}),
    ...(visibleToCharacterIds.length > 0 ? { visibleToCharacterIds } : {}),
    ...(visibleToFactionIds.length > 0 ? { visibleToFactionIds } : {}),
    createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : createdAt + index,
  };
};

const firstJsonObjectFromText = (text: string) => {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (start === -1) {
      if (char === "{") {
        start = index;
        depth = 1;
      }
      continue;
    }

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = inString;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
};

export const parseTavernGeneratedPresetJsonText = (
  text: string,
): TavernGeneratedPresetJson => {
  const trimmed = text.trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const jsonText = trimmed.startsWith("{")
    ? trimmed
    : firstJsonObjectFromText(trimmed);
  if (!jsonText) {
    throw new Error("未找到可导入的酒馆 JSON 对象");
  }

  const parsed = JSON.parse(jsonText) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("酒馆生成结果必须是 JSON 对象");
  }

  return parsed as TavernGeneratedPresetJson;
};

const createGeneratedCharacter = (
  character: NonNullable<TavernGeneratedPresetJson["characters"]>[number],
  index: number,
  createdAt: number,
): TavernCharacter | null => {
  const name = trimGeneratedString(character.name) || `角色 ${index + 1}`;
  const description = trimGeneratedString(character.description);
  const speakingStyle = trimGeneratedString(character.speakingStyle);
  if (!description && !speakingStyle) {
    return null;
  }

  return {
    id: createId("character"),
    name,
    avatar: trimGeneratedString(character.avatar),
    description,
    speakingStyle: speakingStyle || "自然回应，保持人设一致。",
    writingStyle: trimGeneratedString(character.writingStyle) || undefined,
    replyStylePrompt: trimGeneratedString(character.replyStylePrompt) || undefined,
    goals: trimGeneratedString(character.goals) || undefined,
    relationships: normalizeCharacterRelationships(character.relationships, createdAt),
    createdAt,
    updatedAt: createdAt,
  };
};

export const createTavernRoomFromGeneratedPresetJson = (
  workspaceId: string,
  generated: TavernGeneratedPresetJson,
  options: {
    roomId?: string;
    roomCreatedAt?: number;
    createdAt?: number;
    creationSource?: TavernRoom["creationSource"];
  } = {},
) => {
  const createdAt = options.createdAt ?? now();
  const roomId = options.roomId ?? createId("room");
  const roomInput: TavernGeneratedPresetRoom = generated.room ?? {};
  const sourceCharacters = Array.isArray(generated.characters)
    ? generated.characters
    : [];
  const characterIdByGeneratedKey = new Map<string, string>();
  const generatedCharacters = sourceCharacters.flatMap((character, index) => {
    const materialized = createGeneratedCharacter(character, index, createdAt);
    if (!materialized) {
      return [];
    }

    rememberGeneratedCharacterKey(characterIdByGeneratedKey, character.id, materialized.id);
    rememberGeneratedCharacterKey(characterIdByGeneratedKey, character.name, materialized.id);
    rememberGeneratedCharacterKey(characterIdByGeneratedKey, materialized.name, materialized.id);
    rememberGeneratedCharacterKey(characterIdByGeneratedKey, materialized.id, materialized.id);
    return [{
      source: character,
      character: materialized,
    }];
  });
  if (generatedCharacters.length === 0) {
    throw new Error("生成酒馆至少需要一个有效角色");
  }

  const mapGeneratedCharacterId = (characterId: string) =>
    resolveGeneratedCharacterId(characterId, characterIdByGeneratedKey);
  const characters = generatedCharacters.map(({ character }) => ({
    ...character,
    relationships: mapTavernCharacterRelationships(character.relationships, mapGeneratedCharacterId),
  }));
  const allCharacterIds = characters.map((character) => character.id);
  const roomCharacterIds = normalizeGeneratedCharacterIds(
    roomInput.characterIds,
    allCharacterIds,
    characterIdByGeneratedKey,
  );
  const roomActiveCharacterId = resolveGeneratedCharacterId(
    roomInput.activeCharacterId,
    characterIdByGeneratedKey,
  ) ?? roomCharacterIds[0] ?? "";
  const characterMemoryDefaults = Object.fromEntries(
    generatedCharacters.flatMap(({ source, character }) => {
      const memory = trimGeneratedString(source.memory);
      return memory ? [[character.id, memory]] : [];
    }),
  );
  const roomCharacterMemories = {
    ...characterMemoryDefaults,
    ...normalizeGeneratedStringRecord(roomInput.characterMemories, characterIdByGeneratedKey),
  };
  const roomCharacterConfigs = normalizeRoomCharacterConfigs(undefined, roomCharacterMemories);
  const characterPublicStatusDefaults = Object.fromEntries(
    generatedCharacters.flatMap(({ source, character }) =>
      source.publicStatus && typeof source.publicStatus === "object"
        ? [[character.id, source.publicStatus]]
        : []
    ),
  );
  const characterPrivateStatusDefaults = Object.fromEntries(
    generatedCharacters.flatMap(({ source, character }) =>
      source.privateStatus && typeof source.privateStatus === "object"
        ? [[character.id, source.privateStatus]]
        : []
    ),
  );
  const generatedScenes: TavernGeneratedPresetScene[] = Array.isArray(roomInput.scenes) &&
      roomInput.scenes.length > 0
    ? roomInput.scenes
    : [{
        title: defaultSceneTitle,
        scenePresetId: roomInput.scenePresetId,
        scene: roomInput.scene,
        sceneGoal: roomInput.sceneGoal,
        plot: roomInput.plot,
        storyDirection: roomInput.storyDirection,
        transition: roomInput.transition,
        memory: roomInput.memory,
        relationshipOverrides: roomInput.relationshipOverrides,
        sceneStatus: roomInput.sceneStatus,
        characterPublicStatuses: roomInput.characterPublicStatuses,
        characterPrivateStatuses: roomInput.characterPrivateStatuses,
        statusSnapshot: roomInput.statusSnapshot,
        factEvents: roomInput.factEvents,
        taskDefinitions: roomInput.taskDefinitions,
        sceneOutcomes: roomInput.sceneOutcomes,
        characterMemories: roomInput.characterMemories,
        lorebookEntries: roomInput.lorebookEntries,
        characterIds: roomInput.characterIds,
        activeCharacterId: roomInput.activeCharacterId,
      }];
  const sharedLorebookEntries = mergeLorebookEntries([
    ...(roomInput.lorebookEntries ?? []),
    ...generatedScenes.flatMap((scene) => scene.lorebookEntries ?? []),
  ].map((entry) => createPresetLorebookEntry(entry, createdAt))
    .filter((entry): entry is TavernLorebookEntry => Boolean(entry)));
  const scenes = generatedScenes.map((sceneInput, index) => {
    const sceneCharacterIds = normalizeGeneratedCharacterIds(
      sceneInput.characterIds,
      roomCharacterIds,
      characterIdByGeneratedKey,
    );
    const sceneActiveCharacterId = resolveGeneratedCharacterId(
      sceneInput.activeCharacterId,
      characterIdByGeneratedKey,
    ) ?? (sceneCharacterIds.includes(roomActiveCharacterId)
      ? roomActiveCharacterId
      : sceneCharacterIds[0] ?? "");
    const sceneCharacterMemories = {
      ...roomCharacterMemories,
      ...normalizeGeneratedStringRecord(
        sceneInput.characterMemories,
        characterIdByGeneratedKey,
      ),
    };
    const scenePublicStatuses = {
      ...characterPublicStatusDefaults,
      ...normalizeGeneratedCharacterObjectRecord(
        roomInput.characterPublicStatuses,
        characterIdByGeneratedKey,
      ),
      ...normalizeGeneratedCharacterObjectRecord(
        sceneInput.characterPublicStatuses,
        characterIdByGeneratedKey,
      ),
    };
    const scenePrivateStatuses = {
      ...characterPrivateStatusDefaults,
      ...normalizeGeneratedCharacterObjectRecord(
        roomInput.characterPrivateStatuses,
        characterIdByGeneratedKey,
      ),
      ...normalizeGeneratedCharacterObjectRecord(
        sceneInput.characterPrivateStatuses,
        characterIdByGeneratedKey,
      ),
    };
    const sceneFactEvents = [
      ...(roomInput.factEvents ?? []),
      ...(sceneInput.factEvents ?? []),
    ].map((factEvent, factIndex) =>
      createGeneratedFactEvent(
        factEvent,
        index * 100 + factIndex,
        createdAt,
        characterIdByGeneratedKey,
      )
    ).filter((factEvent): factEvent is TavernFactEvent => Boolean(factEvent));

    return buildTavernScene({
      title: trimGeneratedString(sceneInput.title) || defaultSceneTitle,
      order: typeof sceneInput.order === "number" ? sceneInput.order : index,
      scenePresetId: sceneInput.scenePresetId ?? roomInput.scenePresetId,
      scene: trimGeneratedString(sceneInput.scene) ||
        trimGeneratedString(roomInput.scene) ||
        "一张空桌、一盏低灯，以及等待被写下的第一句对白。",
      sceneGoal: trimGeneratedString(sceneInput.sceneGoal) ||
        trimGeneratedString(roomInput.sceneGoal),
      plot: trimGeneratedString(sceneInput.plot) || trimGeneratedString(roomInput.plot),
      storyDirection: trimGeneratedString(sceneInput.storyDirection) ||
        trimGeneratedString(roomInput.storyDirection),
      transition: trimGeneratedString(sceneInput.transition) ||
        trimGeneratedString(roomInput.transition),
      memory: trimGeneratedString(sceneInput.memory) || trimGeneratedString(roomInput.memory),
      relationshipOverrides: mapTavernSceneRelationshipOverrides(
        normalizeSceneRelationshipOverrides(
          sceneInput.relationshipOverrides ?? roomInput.relationshipOverrides,
          createdAt,
        ),
        mapGeneratedCharacterId,
      ),
      sceneStatus: normalizeSceneStatus(
        sceneInput.sceneStatus ?? roomInput.sceneStatus,
        createdAt,
      ),
      characterPublicStatuses: normalizeCharacterPublicStatuses(
        scenePublicStatuses,
        sceneCharacterIds,
        undefined,
        createdAt,
      ),
      characterPrivateStatuses: normalizeCharacterPrivateStatuses(
        scenePrivateStatuses,
        sceneCharacterIds,
        undefined,
        createdAt,
      ),
      pendingInteractions: [],
      replyOptions: [],
      factEvents: sceneFactEvents,
      statusEvents: [],
      statusSnapshot: normalizeStatusSnapshot(
        normalizeGeneratedStatusSnapshot(
          sceneInput.statusSnapshot ?? roomInput.statusSnapshot,
          characterIdByGeneratedKey,
        ),
        createdAt,
      ),
      previousStatusSnapshot: undefined,
      statusCheckpoints: [],
      taskDefinitions: normalizeTaskDefinitions(
        mapTavernTaskDefinitions(
          sceneInput.taskDefinitions ?? roomInput.taskDefinitions,
          mapGeneratedCharacterId,
        ),
      ),
      taskEvents: [],
      taskSnapshot: {},
      sceneOutcomes: normalizeSceneOutcomes(
        mapTavernSceneOutcomeDefinitions(
          sceneInput.sceneOutcomes ?? roomInput.sceneOutcomes,
          mapGeneratedCharacterId,
        ),
      ),
      outcomeEvents: [],
      characterConfigs: normalizeRoomCharacterConfigs(undefined, sceneCharacterMemories),
      characterMemories: sceneCharacterMemories,
      illustrationHints: [],
      assetDrafts: [],
      characterIds: sceneCharacterIds,
      activeCharacterId: sceneActiveCharacterId,
      createdAt,
      updatedAt: createdAt,
    });
  }).sort((left, right) => left.order - right.order)
    .map((scene, index) => ({ ...scene, order: index }));
  const scene = scenes[0];
  const storyGraph = createDefaultStoryGraph(scenes);
  const title = trimGeneratedString(roomInput.title) ||
    trimGeneratedString(generated.label) ||
    "智能生成酒馆";
  const presentation = normalizeRoomPresentation({
    presentation: roomInput.presentation,
    presentationProfileId: roomInput.presentationProfileId,
  });
  const generatedPromptSettings = roomInput.settings && typeof roomInput.settings === "object"
    ? roomInput.settings as Partial<TavernRoomSettings> & {
        systemNarrativePreset?: unknown;
        platformStyleId?: unknown;
        qualityRuleIds?: unknown;
      }
    : {};
  const generatedSystemNarrative = normalizeTavernSystemNarrativePresetSettings(
    generatedPromptSettings.systemNarrativePreset,
  );
  const room: TavernRoom = projectTavernSceneOntoRoom({
    id: roomId,
    workspaceId,
    locked: false,
    title,
    presentation,
    prompt: normalizeTavernPromptSettings(roomInput.prompt, createDefaultTavernPromptSettings({
      presentationProfileId: presentation.profileId,
      promptStyleId: normalizeTavernPromptStyleId(roomInput.promptStyleId),
      systemNarrativePresetId: generatedSystemNarrative.presetId,
      ruleCompositionId: normalizeTavernRuleCompositionId(generatedPromptSettings.platformStyleId),
      qualityRuleIds: normalizeTavernQualityRuleIds(generatedPromptSettings.qualityRuleIds),
      immersiveDescriptionEnabled: true,
    })),
    creationSource: options.creationSource ?? "agent_generated",
    storyOutline: trimGeneratedString(roomInput.storyOutline),
    storyGoal: trimGeneratedString(roomInput.storyGoal),
    storyGraph,
    activeSceneId: scene.id,
    scenes,
    scenePresetId: scene.scenePresetId,
    scene: scene.scene,
    sceneGoal: scene.sceneGoal,
    scenePlot: scene.plot,
    sceneDirection: scene.storyDirection,
    sceneTransition: scene.transition,
    memory: scene.memory,
    relationshipOverrides: scene.relationshipOverrides,
    sceneStatus: scene.sceneStatus,
    characterPublicStatuses: scene.characterPublicStatuses,
    characterPrivateStatuses: scene.characterPrivateStatuses,
    pendingInteractions: scene.pendingInteractions,
    replyOptions: scene.replyOptions,
    statusDefinitions: normalizeStatusDefinitions(roomInput.statusDefinitions),
    statusRules: normalizeStatusRules(roomInput.statusRules),
    progressViews: normalizeProgressViews(roomInput.progressViews),
    progressTracker: normalizeProgressTracker(roomInput.progressTracker),
    factEvents: scene.factEvents,
    statusEvents: scene.statusEvents,
    statusSnapshot: scene.statusSnapshot,
    previousStatusSnapshot: scene.previousStatusSnapshot,
    statusCheckpoints: scene.statusCheckpoints,
    taskDefinitions: normalizeTaskDefinitions(
      mapTavernTaskDefinitions(roomInput.taskDefinitions, mapGeneratedCharacterId),
    ),
    taskEvents: scene.taskEvents,
    taskSnapshot: scene.taskSnapshot,
    sceneOutcomes: normalizeSceneOutcomes(
      mapTavernSceneOutcomeDefinitions(roomInput.sceneOutcomes, mapGeneratedCharacterId),
    ),
    outcomeEvents: scene.outcomeEvents,
    characterConfigs: roomCharacterConfigs,
    characterMemories: roomCharacterMemories,
    localCharacters: characters,
    lorebookEntries: sharedLorebookEntries,
    illustrationHints: scene.illustrationHints,
    assetDrafts: [],
    characterIds: roomCharacterIds,
    activeCharacterId: roomActiveCharacterId,
    replyMode: normalizeReplyMode(roomInput.replyMode),
    userPersonaName: trimGeneratedString(roomInput.userPersonaName) || "我",
    settings: normalizeRoomSettings(roomInput.settings, {
      characters,
      characterIds: roomCharacterIds,
      mapCharacterId: mapGeneratedCharacterId,
      profileSource: "generated",
      updatedAt: createdAt,
    }),
    createdAt: options.roomCreatedAt ?? createdAt,
    updatedAt: createdAt,
  });
  const messages = (Array.isArray(generated.messages) ? generated.messages : [])
    .flatMap((message): TavernMessage[] => {
      const content = trimGeneratedString(message.content);
      if (!content) {
        return [];
      }

      if (message.role === "character") {
        const characterId = resolveGeneratedCharacterId(
          message.characterId,
          characterIdByGeneratedKey,
        );
        return characterId
          ? [{
              id: createId("message"),
              roomId,
              role: "character" as const,
              characterId,
              content,
              createdAt,
              status: "done" as const,
            }]
          : [];
      }

      return [{
        id: createId("message"),
        roomId,
        role: message.role === "user" ? "user" as const : "narrator" as const,
        content,
        createdAt,
        status: "done" as const,
      }];
    })
    .map((message) => materializeTavernMessage(message, room.presentation.profileId));

  return {
    room,
    characters,
    messages: messages.length > 0
      ? messages
      : [{
          id: createId("message"),
          roomId,
          role: "narrator" as const,
          presentationProfileId: room.presentation.profileId,
          content: "智能生成酒馆已创建，新的场景已经准备好。",
          createdAt,
          status: "done" as const,
        }].map((message) => materializeTavernMessage(message, room.presentation.profileId)),
  };
};

export const createDefaultTavernState = (workspaceId: string): TavernState => {
  const createdAt = now();
  const materializedPresets = tavernSystemPresets.map((preset) =>
    createTavernRoomFromSystemPreset(workspaceId, preset.id, { createdAt })
  );
  const firstRoom = materializedPresets[0]?.room;

  return {
    version: 2,
    activeRoomId: firstRoom?.id ?? "",
    rooms: materializedPresets.map((preset) => preset.room),
    messagesByScene: Object.fromEntries(
      materializedPresets.map((preset) => [preset.room.activeSceneId ?? preset.room.id, preset.messages]),
    ),
  };
};

const ensureSystemPresetRooms = (
  workspaceId: string,
  state: TavernState,
): TavernState => {
  let nextRooms = [...state.rooms];
  let nextMessagesByScene = { ...state.messagesByScene };
  const existingPresetIds = new Set(
    nextRooms.flatMap((room) => room.systemPresetId ? [room.systemPresetId] : []),
  );
  const createdAt = now();

  for (const preset of tavernSystemPresets) {
    if (existingPresetIds.has(preset.id)) {
      continue;
    }

    const materialized = createTavernRoomFromSystemPreset(workspaceId, preset.id, {
      createdAt,
    });

    nextRooms = [...nextRooms, materialized.room];
    nextMessagesByScene = {
      ...nextMessagesByScene,
      [materialized.room.activeSceneId ?? materialized.room.id]: materialized.messages,
    };
    existingPresetIds.add(preset.id);
  }

  return {
    ...state,
    activeRoomId: nextRooms.some((room) => room.id === state.activeRoomId)
      ? state.activeRoomId
      : nextRooms[0]?.id ?? "",
    rooms: nextRooms,
    messagesByScene: nextMessagesByScene,
  };
};

const normalizeTavernState = (
  workspaceId: string,
  value: unknown,
): TavernState | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernState>;
  if (
    candidate.version !== 2 ||
    !Array.isArray(candidate.rooms) ||
    !candidate.messagesByScene ||
    typeof candidate.messagesByScene !== "object"
  ) {
    return null;
  }

  const sourceMessagesByScene = candidate.messagesByScene as Record<string, unknown>;
  const rooms = candidate.rooms.filter((room): room is TavernRoom =>
    Boolean(room?.id && room.workspaceId === workspaceId && room.title) &&
    !shouldDiscardLegacyTavernRoom(room)
  ).map((room) => {
    const systemPresetId = normalizeSystemPresetId((room as Partial<TavernRoom>).systemPresetId);
    const systemPreset = getTavernSystemPreset(systemPresetId);
    const systemPresetCharactersByName = new Map(
      (systemPreset?.characters ?? []).map((character) => [character.name.trim(), character]),
    );
    const systemPresetCharactersById = new Map(
      (systemPreset?.characters ?? []).map((character) => [character.id, character]),
    );
    const characterMemories = normalizeStringRecord((room as Partial<TavernRoom>).characterMemories);
    const characterConfigs = normalizeRoomCharacterConfigs(
      (room as Partial<TavernRoom>).characterConfigs,
      characterMemories,
    );
    const localCharacters = Array.isArray((room as Partial<TavernRoom>).localCharacters)
      ? ((room as Partial<TavernRoom>).localCharacters ?? [])
          .filter((character): character is TavernCharacter =>
            Boolean(character?.id && character.name)
          )
          .map((character) => {
            const presetCharacter = systemPreset
              ? systemPresetCharactersById.get(
                (character as Partial<TavernCharacter>).systemPresetCharacterId ?? "",
              ) ?? systemPresetCharactersByName.get(character.name.trim())
              : undefined;
            return normalizeTavernCharacter(
              presetCharacter
                ? {
                    ...character,
                    avatar: presetCharacter.avatar,
                    systemPresetId: systemPreset?.id,
                    systemPresetCharacterId: presetCharacter.id,
                    systemPresetVersion: systemPreset?.version,
                  }
                : character,
              { allowSystemPreset: Boolean(presetCharacter) },
            );
          })
      : [];

    const normalizedRoom: TavernRoom = {
      ...room,
      systemPresetId: systemPreset?.id,
      systemPresetVersion: systemPreset
        ? typeof (room as Partial<TavernRoom>).systemPresetVersion === "number"
          ? (room as Partial<TavernRoom>).systemPresetVersion
          : systemPreset.version
        : undefined,
      locked: Boolean((room as Partial<TavernRoom>).locked),
      presentation: normalizeRoomPresentation({
        presentation: (room as Partial<TavernRoom>).presentation,
      }),
      prompt: normalizeTavernPromptSettings(
        (room as Partial<TavernRoom>).prompt,
        createDefaultPromptForPresentation(normalizeRoomPresentation({
          presentation: (room as Partial<TavernRoom>).presentation,
        })),
      ),
      creationSource:
        (room as Partial<TavernRoom>).creationSource === "quick" ||
        (room as Partial<TavernRoom>).creationSource === "imported" ||
        (room as Partial<TavernRoom>).creationSource === "agent_generated"
          ? (room as Partial<TavernRoom>).creationSource
          : "manual",
      storyOutline: typeof (room as Partial<TavernRoom>).storyOutline === "string"
        ? (room as Partial<TavernRoom>).storyOutline ?? ""
        : "",
      storyGoal: typeof (room as Partial<TavernRoom>).storyGoal === "string"
        ? (room as Partial<TavernRoom>).storyGoal ?? ""
        : "",
      storyGraph: createDefaultStoryGraph([]),
      scenePresetId: normalizeRoomScenePresetId(room),
      memory: typeof (room as Partial<TavernRoom>).memory === "string"
        ? (room as Partial<TavernRoom>).memory ?? ""
        : "",
      sceneGoal: typeof (room as Partial<TavernRoom>).sceneGoal === "string"
        ? (room as Partial<TavernRoom>).sceneGoal ?? ""
        : "",
      scenePlot: typeof (room as Partial<TavernRoom>).scenePlot === "string"
        ? (room as Partial<TavernRoom>).scenePlot ?? ""
        : "",
      sceneDirection: typeof (room as Partial<TavernRoom>).sceneDirection === "string"
        ? (room as Partial<TavernRoom>).sceneDirection ?? ""
        : "",
      sceneTransition: typeof (room as Partial<TavernRoom>).sceneTransition === "string"
        ? (room as Partial<TavernRoom>).sceneTransition ?? ""
        : "",
      relationshipOverrides: normalizeSceneRelationshipOverrides(
        (room as Partial<TavernRoom>).relationshipOverrides,
        Date.now(),
      ),
      characterConfigs,
      characterMemories: roomCharacterMemoriesFromConfigs(characterConfigs),
      localCharacters,
      lorebookEntries: Array.isArray((room as Partial<TavernRoom>).lorebookEntries)
        ? ((room as Partial<TavernRoom>).lorebookEntries ?? [])
            .map(normalizeLorebookEntry)
            .filter((entry): entry is TavernLorebookEntry => Boolean(entry))
        : [],
      assetDrafts: Array.isArray((room as Partial<TavernRoom>).assetDrafts)
        ? ((room as Partial<TavernRoom>).assetDrafts ?? [])
            .map(normalizeAssetDraft)
            .filter((draft): draft is TavernAssetDraft => Boolean(draft))
        : [],
      sceneStatus: normalizeSceneStatus((room as Partial<TavernRoom>).sceneStatus, Date.now()),
      characterPublicStatuses: normalizeCharacterPublicStatuses(
        (room as Partial<TavernRoom>).characterPublicStatuses,
        Array.isArray(room.characterIds) ? room.characterIds : [],
        undefined,
        Date.now(),
      ),
      characterPrivateStatuses: normalizeCharacterPrivateStatuses(
        (room as Partial<TavernRoom>).characterPrivateStatuses,
        Array.isArray(room.characterIds) ? room.characterIds : [],
        undefined,
        Date.now(),
      ),
      pendingInteractions: Array.isArray((room as Partial<TavernRoom>).pendingInteractions)
        ? ((room as Partial<TavernRoom>).pendingInteractions ?? [])
            .map(normalizePendingInteraction)
            .filter((interaction): interaction is TavernPendingInteraction => Boolean(interaction))
        : [],
      replyOptions: Array.isArray((room as Partial<TavernRoom>).replyOptions)
        ? ((room as Partial<TavernRoom>).replyOptions ?? [])
            .map(normalizeReplyOption)
            .filter((option): option is TavernReplyOption => Boolean(option))
        : [],
      statusDefinitions: normalizeStatusDefinitions((room as Partial<TavernRoom>).statusDefinitions),
      statusRules: normalizeStatusRules((room as Partial<TavernRoom>).statusRules),
      progressViews: normalizeProgressViews((room as Partial<TavernRoom>).progressViews),
      progressTracker: normalizeProgressTracker((room as Partial<TavernRoom>).progressTracker),
      factEvents: normalizeFactEvents((room as Partial<TavernRoom>).factEvents),
      statusEvents: normalizeStatusEvents((room as Partial<TavernRoom>).statusEvents),
      statusSnapshot: normalizeStatusSnapshot((room as Partial<TavernRoom>).statusSnapshot, Date.now()),
      previousStatusSnapshot: (room as Partial<TavernRoom>).previousStatusSnapshot
        ? normalizeStatusSnapshot((room as Partial<TavernRoom>).previousStatusSnapshot, Date.now())
        : undefined,
      statusCheckpoints: normalizeProgressCheckpoints((room as Partial<TavernRoom>).statusCheckpoints),
      taskDefinitions: normalizeTaskDefinitions((room as Partial<TavernRoom>).taskDefinitions),
      taskEvents: normalizeTaskEvents((room as Partial<TavernRoom>).taskEvents),
      taskSnapshot: normalizeTaskSnapshot((room as Partial<TavernRoom>).taskSnapshot),
      sceneOutcomes: normalizeSceneOutcomes((room as Partial<TavernRoom>).sceneOutcomes),
      outcomeEvents: normalizeOutcomeEvents((room as Partial<TavernRoom>).outcomeEvents),
      illustrationHints: normalizeIllustrationHints((room as Partial<TavernRoom>).illustrationHints),
      replyMode: normalizeReplyMode((room as Partial<TavernRoom>).replyMode),
      userPersonaName: room.userPersonaName || "我",
      settings: normalizeRoomSettings((room as Partial<TavernRoom>).settings),
      characterIds: Array.isArray(room.characterIds) ? room.characterIds : [],
      activeCharacterId: room.activeCharacterId || "",
    };
    const normalizedScenes = Array.isArray((room as Partial<TavernRoom>).scenes)
      ? ((room as Partial<TavernRoom>).scenes ?? [])
          .map((scene) => buildTavernScene(scene, normalizedRoom))
      : [];
    const fallbackScene = buildTavernScene({
      title: defaultSceneTitle,
    }, normalizedRoom);
    const scenes = (normalizedScenes.length > 0 ? normalizedScenes : [fallbackScene])
      .sort((left, right) => left.order - right.order)
      .map((scene, index) => ({ ...scene, order: index }));
    const activeSceneId = scenes.some((scene) => scene.id === (room as Partial<TavernRoom>).activeSceneId)
      ? (room as Partial<TavernRoom>).activeSceneId
      : scenes[0]?.id;

    return projectTavernSceneOntoRoom({
      ...normalizedRoom,
      storyGraph: normalizeStoryGraph((room as Partial<TavernRoom>).storyGraph, scenes),
      activeSceneId,
      scenes,
    });
  });
  if (rooms.length === 0) {
    return null;
  }
  const normalizedRooms = rooms;
  const messagesByScene = Object.fromEntries(
    normalizedRooms.flatMap((room) => (room.scenes ?? []).map((scene) => {
      const sceneMessages = Array.isArray(sourceMessagesByScene[scene.id])
        ? sourceMessagesByScene[scene.id] as TavernMessage[]
        : [];

      return [
        scene.id,
        sceneMessages
          .filter((message): message is TavernMessage =>
            Boolean(message?.id && message.roomId && message.role && typeof message.content === "string")
          )
          .map((message) => materializeTavernMessage(message, room.presentation.profileId)),
      ] as const;
    })),
  );

  const activeRoomId = normalizedRooms.some((room) => room.id === candidate.activeRoomId)
    ? candidate.activeRoomId ?? rooms[0].id
    : normalizedRooms[0].id;

  return ensureSystemPresetRooms(workspaceId, {
    version: 2,
    activeRoomId,
    rooms: normalizedRooms,
    messagesByScene,
  });
};

const loadTavernStateFromLocalStorage = (workspaceId: string): TavernState => {
  if (typeof window === "undefined") {
    return createDefaultTavernState(workspaceId);
  }

  try {
    const raw = window.localStorage.getItem(storageKeyForWorkspace(workspaceId));
    const parsed = raw ? JSON.parse(raw) : null;
    return normalizeTavernState(workspaceId, parsed) ?? createDefaultTavernState(workspaceId);
  } catch {
    return createDefaultTavernState(workspaceId);
  }
};

const saveTavernStateToLocalStorage = (workspaceId: string, state: TavernState) => {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedState = normalizeTavernState(workspaceId, state) ?? state;
  window.localStorage.setItem(storageKeyForWorkspace(workspaceId), JSON.stringify(normalizedState));
};

const deleteTavernStateFromLocalStorage = (workspaceId: string) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(storageKeyForWorkspace(workspaceId));
};

export const loadTavernState = async (
  workspacePath: string,
  workspaceId: string,
): Promise<TavernState> => {
  if (!isTauri()) {
    return loadTavernStateFromLocalStorage(workspaceId);
  }

  deleteTavernStateFromLocalStorage(workspaceId);
  const storedState = await invoke<unknown | null>("load_tavern_state", {
    input: { workspacePath },
  });

  return normalizeTavernState(workspaceId, storedState) ?? createDefaultTavernState(workspaceId);
};

export const saveTavernState = async (
  workspacePath: string,
  workspaceId: string,
  state: TavernState,
) => {
  const normalizedState = normalizeTavernState(workspaceId, state) ?? state;
  if (!isTauri()) {
    saveTavernStateToLocalStorage(workspaceId, normalizedState);
    return normalizedState;
  }

  deleteTavernStateFromLocalStorage(workspaceId);
  await invoke("save_tavern_state", {
    input: { workspacePath, state: normalizedState },
  });
  return normalizedState;
};

export const createTavernRoom = (workspaceId: string, index: number): TavernRoom => {
  const createdAt = now();
  const scene = buildTavernScene({
    title: defaultSceneTitle,
    scenePresetId: DEFAULT_VISUAL_PRESET_ID,
    scene: "一张空桌、一盏低灯，以及等待被写下的第一句对白。",
    createdAt,
    updatedAt: createdAt,
  });
  const storyGraph = createDefaultStoryGraph([scene]);
  const presentation = createDefaultTavernPresentation();

  return projectTavernSceneOntoRoom({
    id: createId("room"),
    workspaceId,
    locked: false,
    title: `新酒馆 ${index}`,
    presentation,
    prompt: createDefaultPromptForPresentation(presentation),
    creationSource: "manual",
    storyOutline: "",
    storyGoal: "",
    storyGraph,
    activeSceneId: scene.id,
    scenes: [scene],
    scenePresetId: scene.scenePresetId,
    scene: scene.scene,
    sceneGoal: scene.sceneGoal,
    scenePlot: scene.plot,
    sceneDirection: scene.storyDirection,
    sceneTransition: scene.transition,
    memory: scene.memory,
    relationshipOverrides: scene.relationshipOverrides,
    sceneStatus: scene.sceneStatus,
    characterPublicStatuses: scene.characterPublicStatuses,
    characterPrivateStatuses: scene.characterPrivateStatuses,
    pendingInteractions: scene.pendingInteractions,
    replyOptions: scene.replyOptions,
    statusDefinitions: [...DEFAULT_TAVERN_STATUS_DEFINITIONS],
    statusRules: [...DEFAULT_TAVERN_STATUS_RULES],
    progressViews: [...DEFAULT_TAVERN_PROGRESS_VIEWS],
    progressTracker: { ...DEFAULT_TAVERN_PROGRESS_TRACKER },
    factEvents: scene.factEvents,
    statusEvents: scene.statusEvents,
    statusSnapshot: scene.statusSnapshot,
    previousStatusSnapshot: scene.previousStatusSnapshot,
    statusCheckpoints: scene.statusCheckpoints,
    taskDefinitions: scene.taskDefinitions,
    taskEvents: scene.taskEvents,
    taskSnapshot: scene.taskSnapshot,
    sceneOutcomes: scene.sceneOutcomes,
    outcomeEvents: scene.outcomeEvents,
    characterConfigs: {},
    characterMemories: {},
    localCharacters: [],
    lorebookEntries: [],
    illustrationHints: scene.illustrationHints,
    assetDrafts: [],
    characterIds: [],
    activeCharacterId: "",
    replyMode: "active",
    userPersonaName: "我",
    settings: cloneDefaultRoomSettings(),
    createdAt,
    updatedAt: createdAt,
  });
};

export const createTavernLorebookEntry = (input: {
  title: string;
  content: string;
  keywords?: string[];
  alwaysOn?: boolean;
}): TavernLorebookEntry => {
  const createdAt = now();
  return {
    id: createId("lore"),
    title: input.title.trim(),
    content: input.content.trim(),
    keywords: input.keywords?.map((keyword) => keyword.trim()).filter(Boolean) ?? [],
    enabled: true,
    alwaysOn: Boolean(input.alwaysOn),
    createdAt,
    updatedAt: createdAt,
  };
};

export const createTavernAssetDraft = (input: {
  sourceMessageIds: string[];
  characterMemories?: Array<{
    characterId: string;
    note: string;
  }>;
  lorebookEntries?: Array<{
    title: string;
    content: string;
    keywords?: string[];
    alwaysOn?: boolean;
  }>;
}): TavernAssetDraft => {
  const createdAt = now();
  return {
    id: createId("draft"),
    sourceMessageIds: input.sourceMessageIds,
    characterMemories: input.characterMemories?.map((memory) => ({
      id: createId("memory-draft"),
      characterId: memory.characterId.trim(),
      note: memory.note.trim(),
    })).filter((memory) => memory.characterId && memory.note) ?? [],
    lorebookEntries: input.lorebookEntries?.map((entry) => ({
      id: createId("lore-draft"),
      title: entry.title.trim(),
      content: entry.content.trim(),
      keywords: entry.keywords?.map((keyword) => keyword.trim()).filter(Boolean) ?? [],
      alwaysOn: Boolean(entry.alwaysOn),
    })).filter((entry) => entry.title && entry.content) ?? [],
    createdAt,
    updatedAt: createdAt,
  };
};

export const createTavernIllustrationHint = (input: {
  prompt: string;
  turnId?: string;
  sourceMessageIds?: string[];
}): TavernIllustrationHint => ({
  id: createId("illustration"),
  turnId: input.turnId?.trim() || undefined,
  source: "director",
  prompt: input.prompt.trim(),
  sourceMessageIds: input.sourceMessageIds?.filter((item) => item.trim()) ?? [],
  createdAt: now(),
});

export const createTavernCharacter = (input: {
  name: string;
  avatar: string;
  description: string;
  speakingStyle: string;
  writingStyle?: string;
  replyStylePrompt?: string;
  goals?: string;
  relationships?: TavernCharacterRelationship[];
}): TavernCharacter => {
  const createdAt = now();
  return {
    id: createId("character"),
    name: input.name,
    avatar: input.avatar,
    description: input.description,
    speakingStyle: input.speakingStyle,
    writingStyle: input.writingStyle?.trim() || undefined,
    replyStylePrompt: input.replyStylePrompt?.trim() || undefined,
    goals: input.goals?.trim() || undefined,
    relationships: normalizeCharacterRelationships(input.relationships, createdAt),
    createdAt,
    updatedAt: createdAt,
  };
};

export const createTavernMessage = (
  input: Omit<TavernMessage, "id" | "createdAt">,
): TavernMessage => {
  const message = {
    ...input,
    id: createId("message"),
    createdAt: now(),
  };

  return {
    ...message,
    kind: message.kind ?? inferTavernMessageKind({
      role: message.role,
      presentationProfileId: message.presentationProfileId,
    }),
    segments: message.segments ?? buildTavernMessageSegments(message),
  };
};
