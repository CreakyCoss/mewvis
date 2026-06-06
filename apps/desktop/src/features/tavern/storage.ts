import {
  DEFAULT_VISUAL_PRESET_ID,
  normalizeVisualPresetId,
} from "@/features/visual-presets";
import type {
  TavernAssetDraft,
  TavernCharacter,
  TavernCharacterModelConfig,
  TavernCharacterMemoryDraft,
  TavernLorebookEntry,
  TavernLorebookDraft,
  TavernMessage,
  TavernReplyMode,
  TavernRoom,
  TavernRoomSettings,
  TavernState,
  TavernTimelineDraft,
  TavernTimelineEvent,
} from "./types";

const STORAGE_PREFIX = "novel-claw:tavern";

const storageKeyForWorkspace = (workspaceId: string) => `${STORAGE_PREFIX}:${workspaceId}`;

const createId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

const now = () => Date.now();

export const DEFAULT_TAVERN_ROOM_SETTINGS: TavernRoomSettings = {
  showExecutionTrace: false,
  autoAssetExtractionEnabled: false,
  assetExtractionIntervalTurns: 3,
  maxAssetDrafts: 5,
  directorMaxSpeakers: 3,
};

const normalizeReplyMode = (value: unknown): TavernReplyMode =>
  value === "round" || value === "director" ? value : "active";

const clampInteger = (value: unknown, fallback: number, min: number, max: number) => {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(numberValue)));
};

const normalizeRoomSettings = (value: unknown): TavernRoomSettings => {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_TAVERN_ROOM_SETTINGS };
  }

  const candidate = value as Partial<TavernRoomSettings>;
  return {
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

const normalizeCharacterModelConfig = (
  value: unknown,
): TavernCharacterModelConfig | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Partial<TavernCharacterModelConfig>;
  const providerId = typeof candidate.providerId === "string" ? candidate.providerId.trim() : "";
  const modelId = typeof candidate.modelId === "string" ? candidate.modelId.trim() : "";

  return providerId && modelId
    ? {
        providerId,
        modelId,
      }
    : undefined;
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

const normalizeTimelineEvent = (
  value: unknown,
): TavernTimelineEvent | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernTimelineEvent>;
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  const summary = typeof candidate.summary === "string" ? candidate.summary.trim() : "";
  if (!candidate.id || !title || !summary) {
    return null;
  }

  const updatedAt = typeof candidate.updatedAt === "number" ? candidate.updatedAt : now();

  return {
    id: candidate.id,
    title,
    summary,
    createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : updatedAt,
    updatedAt,
  };
};

const normalizeTimelineDraft = (
  value: unknown,
): TavernTimelineDraft | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<TavernTimelineDraft>;
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  const summary = typeof candidate.summary === "string" ? candidate.summary.trim() : "";
  if (!candidate.id || !title || !summary) {
    return null;
  }

  return {
    id: candidate.id,
    title,
    summary,
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
  const timelineEvents = Array.isArray(candidate.timelineEvents)
    ? candidate.timelineEvents
        .map(normalizeTimelineDraft)
        .filter((draft): draft is TavernTimelineDraft => Boolean(draft))
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
    timelineEvents.length === 0 &&
    characterMemories.length === 0 &&
    lorebookEntries.length === 0
  ) {
    return null;
  }

  return {
    id: candidate.id,
    sourceMessageIds,
    timelineEvents,
    characterMemories,
    lorebookEntries,
    createdAt: typeof candidate.createdAt === "number" ? candidate.createdAt : updatedAt,
    updatedAt,
  };
};

export const createDefaultTavernState = (workspaceId: string): TavernState => {
  const createdAt = now();
  const roomId = createId("room");
  const keeperId = createId("character");
  const scoutId = createId("character");
  const editorId = createId("character");
  const characters: TavernCharacter[] = [
    {
      id: keeperId,
      name: "柜台记录员",
      avatar: "tavern-01",
      description: "熟悉本地传闻与人物关系，擅长把混乱信息整理成可继续推进的线索。",
      speakingStyle: "温和、简洁，像在吧台边低声递来一张便签。",
      goals: "帮助用户把场景推进到下一处可写的行动。",
      relationships: "对所有来客保持礼貌距离，但会记得重要细节。",
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: scoutId,
      name: "夜巡旅人",
      avatar: "tavern-06",
      description: "见过很多地方，擅长补充环境、路线、风险和现场气氛。",
      speakingStyle: "直接、画面感强，常用短句描述他看到的东西。",
      goals: "让场景更有行动感和空间感。",
      relationships: "信任能自己做决定的人。",
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: editorId,
      name: "炉边评注者",
      avatar: "tavern-08",
      description: "善于从叙事节奏、人物动机和冲突张力上提出补充。",
      speakingStyle: "冷静、克制，偶尔带一点尖锐的判断。",
      goals: "让每段对话都有更清晰的戏剧目的。",
      relationships: "喜欢和观点鲜明的人交锋。",
      createdAt,
      updatedAt: createdAt,
    },
  ];
  const room: TavernRoom = {
    id: roomId,
    workspaceId,
    title: "夜灯酒馆",
    scenePresetId: "tavern",
    scene: "雨停后的夜晚，吧台上还有未擦干的水痕。几位熟客围在靠窗的位置，等待有人把故事继续讲下去。",
    sceneGoal: "找到下一条值得追问的线索，让谈话自然进入行动。",
    memory: "",
    autoMemory: "",
    autoMemoryUpdatedAt: undefined,
    summarizedMessageIds: [],
    characterMemories: {},
    lorebookEntries: [],
    timelineEvents: [],
    assetDrafts: [],
    characterIds: characters.map((character) => character.id),
    activeCharacterId: keeperId,
    replyMode: "active",
    userPersonaName: "我",
    settings: { ...DEFAULT_TAVERN_ROOM_SETTINGS },
    createdAt,
    updatedAt: createdAt,
  };
  const openingMessage: TavernMessage = {
    id: createId("message"),
    roomId,
    role: "narrator",
    content: "门铃轻响。房间里的谈话暂时停住，所有目光都落向新来的叙事者。",
    createdAt,
    status: "done",
  };

  return {
    version: 1,
    activeRoomId: roomId,
    rooms: [room],
    characters,
    messagesByRoom: {
      [roomId]: [openingMessage],
    },
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
    candidate.version !== 1 ||
    !Array.isArray(candidate.rooms) ||
    !Array.isArray(candidate.characters) ||
    !candidate.messagesByRoom ||
    typeof candidate.messagesByRoom !== "object"
  ) {
    return null;
  }

  const rooms = candidate.rooms.filter((room): room is TavernRoom =>
    Boolean(room?.id && room.workspaceId === workspaceId && room.title)
  ).map((room) => ({
    ...room,
    scenePresetId: normalizeRoomScenePresetId(room),
    memory: typeof (room as Partial<TavernRoom>).memory === "string"
      ? (room as Partial<TavernRoom>).memory ?? ""
      : "",
    sceneGoal: typeof (room as Partial<TavernRoom>).sceneGoal === "string"
      ? (room as Partial<TavernRoom>).sceneGoal ?? ""
      : "",
    autoMemory: typeof (room as Partial<TavernRoom>).autoMemory === "string"
      ? (room as Partial<TavernRoom>).autoMemory ?? ""
      : "",
    autoMemoryUpdatedAt: typeof (room as Partial<TavernRoom>).autoMemoryUpdatedAt === "number"
      ? (room as Partial<TavernRoom>).autoMemoryUpdatedAt
      : undefined,
    summarizedMessageIds: Array.isArray((room as Partial<TavernRoom>).summarizedMessageIds)
      ? ((room as Partial<TavernRoom>).summarizedMessageIds ?? []).filter((item): item is string =>
          typeof item === "string"
        )
      : [],
    characterMemories: normalizeStringRecord((room as Partial<TavernRoom>).characterMemories),
    lorebookEntries: Array.isArray((room as Partial<TavernRoom>).lorebookEntries)
      ? ((room as Partial<TavernRoom>).lorebookEntries ?? [])
          .map(normalizeLorebookEntry)
          .filter((entry): entry is TavernLorebookEntry => Boolean(entry))
      : [],
    timelineEvents: Array.isArray((room as Partial<TavernRoom>).timelineEvents)
      ? ((room as Partial<TavernRoom>).timelineEvents ?? [])
          .map(normalizeTimelineEvent)
          .filter((event): event is TavernTimelineEvent => Boolean(event))
      : [],
    assetDrafts: Array.isArray((room as Partial<TavernRoom>).assetDrafts)
      ? ((room as Partial<TavernRoom>).assetDrafts ?? [])
          .map(normalizeAssetDraft)
          .filter((draft): draft is TavernAssetDraft => Boolean(draft))
      : [],
    replyMode: normalizeReplyMode((room as Partial<TavernRoom>).replyMode),
    userPersonaName: room.userPersonaName || "我",
    settings: normalizeRoomSettings((room as Partial<TavernRoom>).settings),
    characterIds: Array.isArray(room.characterIds) ? room.characterIds : [],
    activeCharacterId: room.activeCharacterId || "",
  }));
  const characters = candidate.characters.filter((character): character is TavernCharacter =>
    Boolean(character?.id && character.name)
  ).map((character) => ({
    ...character,
    modelConfig: normalizeCharacterModelConfig((character as Partial<TavernCharacter>).modelConfig),
  }));
  if (rooms.length === 0 || characters.length === 0) {
    return null;
  }

  const activeRoomId = rooms.some((room) => room.id === candidate.activeRoomId)
    ? candidate.activeRoomId ?? rooms[0].id
    : rooms[0].id;

  return {
    version: 1,
    activeRoomId,
    rooms,
    characters,
    messagesByRoom: candidate.messagesByRoom as Record<string, TavernMessage[]>,
  };
};

export const loadTavernState = (workspaceId: string): TavernState => {
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

export const saveTavernState = (workspaceId: string, state: TavernState) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(storageKeyForWorkspace(workspaceId), JSON.stringify(state));
};

export const createTavernRoom = (workspaceId: string, index: number): TavernRoom => {
  const createdAt = now();
  return {
    id: createId("room"),
    workspaceId,
    title: `新酒馆 ${index}`,
    scenePresetId: DEFAULT_VISUAL_PRESET_ID,
    scene: "一张空桌、一盏低灯，以及等待被写下的第一句对白。",
    sceneGoal: "",
    memory: "",
    autoMemory: "",
    autoMemoryUpdatedAt: undefined,
    summarizedMessageIds: [],
    characterMemories: {},
    lorebookEntries: [],
    timelineEvents: [],
    assetDrafts: [],
    characterIds: [],
    activeCharacterId: "",
    replyMode: "active",
    userPersonaName: "我",
    settings: { ...DEFAULT_TAVERN_ROOM_SETTINGS },
    createdAt,
    updatedAt: createdAt,
  };
};

export const createTavernTimelineEvent = (input: {
  title: string;
  summary: string;
}): TavernTimelineEvent => {
  const createdAt = now();
  return {
    id: createId("event"),
    title: input.title.trim(),
    summary: input.summary.trim(),
    createdAt,
    updatedAt: createdAt,
  };
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
  timelineEvents?: Array<{
    title: string;
    summary: string;
  }>;
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
    timelineEvents: input.timelineEvents?.map((event) => ({
      id: createId("timeline-draft"),
      title: event.title.trim(),
      summary: event.summary.trim(),
    })).filter((event) => event.title && event.summary) ?? [],
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

export const createTavernCharacter = (input: {
  name: string;
  avatar: string;
  description: string;
  speakingStyle: string;
  goals?: string;
  relationships?: string;
  modelConfig?: TavernCharacterModelConfig;
}): TavernCharacter => {
  const createdAt = now();
  return {
    id: createId("character"),
    name: input.name,
    avatar: input.avatar,
    description: input.description,
    speakingStyle: input.speakingStyle,
    goals: input.goals?.trim() || undefined,
    relationships: input.relationships?.trim() || undefined,
    modelConfig: input.modelConfig,
    createdAt,
    updatedAt: createdAt,
  };
};

export const createTavernMessage = (
  input: Omit<TavernMessage, "id" | "createdAt">,
): TavernMessage => ({
  ...input,
  id: createId("message"),
  createdAt: now(),
});
