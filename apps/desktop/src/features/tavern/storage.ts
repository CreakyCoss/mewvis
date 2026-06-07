import {
  DEFAULT_VISUAL_PRESET_ID,
  normalizeVisualPresetId,
} from "@/features/visual-presets";
import systemPresetData from "./system-presets/default-taverns.json";
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
  TavernRoomCharacterConfig,
  TavernScene,
  TavernRoomSettings,
  TavernState,
  TavernTimelineDraft,
  TavernTimelineEvent,
  TavernTimelineScope,
} from "./types";

const STORAGE_PREFIX = "novel-claw:tavern";

const storageKeyForWorkspace = (workspaceId: string) => `${STORAGE_PREFIX}:${workspaceId}`;

const createId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

const now = () => Date.now();

type TavernSystemPresetCharacter = {
  id: string;
  name: string;
  avatar: string;
  description: string;
  speakingStyle: string;
  goals?: string;
  relationships?: string;
  modelConfig?: TavernCharacterModelConfig;
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
  characterMemories?: Record<string, string>;
  lorebookEntries?: Array<{
    title: string;
    content: string;
    keywords?: string[];
    enabled?: boolean;
    alwaysOn?: boolean;
  }>;
  timelineEvents?: Array<{
    title: string;
    summary: string;
  }>;
  assetDrafts?: Array<{
    sourceMessageIds?: string[];
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
  }>;
  characterIds?: string[];
  activeCharacterId?: string;
};

type TavernSystemPresetRoom = {
  title: string;
  storyOutline?: string;
  storyGoal?: string;
  scenePresetId?: unknown;
  scene: string;
  sceneGoal?: string;
  plot?: string;
  storyDirection?: string;
  transition?: string;
  memory?: string;
  scenes?: TavernSystemPresetScene[];
  characterMemories?: Record<string, string>;
  lorebookEntries?: Array<{
    title: string;
    content: string;
    keywords?: string[];
    enabled?: boolean;
    alwaysOn?: boolean;
  }>;
  timelineEvents?: Array<{
    title: string;
    summary: string;
  }>;
  assetDrafts?: Array<{
    sourceMessageIds?: string[];
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
  version: 1;
  presets: TavernSystemPreset[];
};

const tavernSystemPresetCollection = systemPresetData as unknown as TavernSystemPresetCollection;

export const tavernSystemPresets = tavernSystemPresetCollection.presets;

const tavernSystemPresetById = new Map(
  tavernSystemPresets.map((preset) => [preset.id, preset]),
);

export const getTavernSystemPreset = (presetId: string | null | undefined) =>
  tavernSystemPresetById.get(presetId ?? "") ?? null;

const normalizeSystemPresetId = (presetId: unknown) => {
  if (typeof presetId !== "string") {
    return undefined;
  }

  return getTavernSystemPreset(presetId)?.id;
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
    avatar: character.avatar,
    description: character.description.trim(),
    speakingStyle: character.speakingStyle.trim(),
    goals: character.goals?.trim() || undefined,
    relationships: character.relationships?.trim() || undefined,
    createdAt,
    updatedAt: createdAt,
  };
};

const inferLegacySystemPresetId = (room: Partial<TavernRoom>) =>
  tavernSystemPresets.find((preset) =>
    room.title === preset.room.title &&
    normalizeRoomScenePresetId(room) === normalizeVisualPresetId(preset.room.scenePresetId)
  )?.id;

const removedSystemPresetIds = new Set(["night-lamp-tavern"]);

const legacyNightLampRoom = {
  title: "夜灯酒馆",
  scene: "雨停后的夜晚，吧台上还有未擦干的水痕。几位熟客围在靠窗的位置，等待有人把故事继续讲下去。",
  sceneGoal: "找到下一条值得追问的线索，让谈话自然进入行动。",
  openingMessage: "门铃轻响。房间里的谈话暂时停住，所有目光都落向新来的叙事者。",
};

const defaultSceneTitle = "默认场景";

const isRemovedSystemPresetId = (presetId: unknown) =>
  typeof presetId === "string" && removedSystemPresetIds.has(presetId);

const isLegacyNightLampRoom = (
  room: Partial<TavernRoom>,
  messagesByRoom: Record<string, unknown>,
) => {
  if (isRemovedSystemPresetId((room as Partial<TavernRoom>).systemPresetId)) {
    return true;
  }

  if (
    room.title !== legacyNightLampRoom.title ||
    room.scene !== legacyNightLampRoom.scene ||
    room.sceneGoal !== legacyNightLampRoom.sceneGoal
  ) {
    return false;
  }

  const messages = Array.isArray(messagesByRoom[room.id ?? ""])
    ? messagesByRoom[room.id ?? ""] as Array<Partial<TavernMessage>>
    : [];

  return messages.some((message) =>
    message.role === "narrator" && message.content === legacyNightLampRoom.openingMessage
  );
};

export const DEFAULT_TAVERN_ROOM_SETTINGS: TavernRoomSettings = {
  immersiveDescriptionEnabled: true,
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
      modelConfig: normalizeCharacterModelConfig(candidate.modelConfig),
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

const collectRoomMessageCharacterIds = (
  roomId: string,
  messagesByRoom: Record<string, unknown> = {},
) => {
  const characterIds = new Set<string>();
  const messages = messagesByRoom[roomId];

  if (!Array.isArray(messages)) {
    return characterIds;
  }

  for (const message of messages as Array<Partial<TavernMessage>>) {
    if (message.role === "character" && typeof message.characterId === "string") {
      characterIds.add(message.characterId);
    }
  }

  return characterIds;
};

const normalizeTavernCharacter = (
  character: TavernCharacter,
  {
    allowSystemPreset = true,
    allowLegacyModelConfig = true,
  }: {
    allowSystemPreset?: boolean;
    allowLegacyModelConfig?: boolean;
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
    systemPresetId: normalizedSystemPresetId,
    systemPresetCharacterId,
    systemPresetVersion: systemPreset && normalizedSystemPresetId
      ? typeof (character as Partial<TavernCharacter>).systemPresetVersion === "number"
        ? (character as Partial<TavernCharacter>).systemPresetVersion
        : systemPreset.version
      : undefined,
    modelConfig: allowLegacyModelConfig
      ? normalizeCharacterModelConfig((character as Partial<TavernCharacter>).modelConfig)
      : undefined,
  };
};

const applyLegacyCharacterModelsToRooms = (
  rooms: TavernRoom[],
  characters: TavernCharacter[],
) => {
  const characterModelConfigs = new Map(
    characters.flatMap((character) =>
      character.modelConfig ? [[character.id, character.modelConfig] as const] : []
    ),
  );

  return rooms.map((room) => {
    let didChange = false;
    const applyCharacterModels = (
      characterIds: string[],
      configs: Record<string, TavernRoomCharacterConfig> | undefined,
      memories: Record<string, string>,
    ) => {
      let configDidChange = false;
      const nextConfigs = { ...(configs ?? {}) };

      for (const characterId of characterIds) {
        const existingConfig = nextConfigs[characterId];
        const legacyModelConfig = characterModelConfigs.get(characterId);
        if (!existingConfig) {
          nextConfigs[characterId] = {
            characterId,
            memory: memories[characterId]?.trim() || undefined,
            modelConfig: legacyModelConfig,
          };
          configDidChange = true;
          continue;
        }

        if (legacyModelConfig && !existingConfig.modelConfig) {
          nextConfigs[characterId] = {
            ...existingConfig,
            modelConfig: legacyModelConfig,
          };
          configDidChange = true;
        }
      }

      didChange = didChange || configDidChange;
      return nextConfigs;
    };
    const characterConfigs = applyCharacterModels(
      room.characterIds,
      room.characterConfigs,
      room.characterMemories,
    );
    const scenes = room.scenes?.map((scene) => {
      const sceneCharacterConfigs = applyCharacterModels(
        scene.characterIds,
        scene.characterConfigs,
        scene.characterMemories,
      );
      return {
        ...scene,
        characterConfigs: sceneCharacterConfigs,
        characterMemories: roomCharacterMemoriesFromConfigs(sceneCharacterConfigs),
      };
    });

    if (!didChange) {
      return {
        ...room,
        characterMemories: roomCharacterMemoriesFromConfigs(characterConfigs),
        scenes,
      };
    }

    return {
      ...room,
      characterConfigs,
      characterMemories: roomCharacterMemoriesFromConfigs(characterConfigs),
      scenes,
    };
  });
};

const materializeRoomLocalCharacters = (
  rooms: TavernRoom[],
  legacyCharacters: TavernCharacter[],
  messagesByRoom: Record<string, unknown> = {},
) => {
  const legacyCharacterById = new Map(
    legacyCharacters.map((character) => [character.id, character]),
  );

  return rooms.map((room) => {
    const localCharacterById = new Map(
      (room.localCharacters ?? []).map((character) => [
        character.id,
        normalizeTavernCharacter(character, {
          allowSystemPreset: false,
          allowLegacyModelConfig: true,
        }),
      ]),
    );
    const referencedCharacterIds = new Set([
      ...room.characterIds,
      ...collectRoomMessageCharacterIds(room.id, messagesByRoom),
    ]);

    for (const characterId of referencedCharacterIds) {
      if (localCharacterById.has(characterId)) {
        continue;
      }

      const legacyCharacter = legacyCharacterById.get(characterId);
      if (!legacyCharacter) {
        continue;
      }

      localCharacterById.set(
        characterId,
        normalizeTavernCharacter(legacyCharacter, {
          allowSystemPreset: false,
          allowLegacyModelConfig: true,
        }),
      );
    }

    return {
      ...room,
      localCharacters: Array.from(localCharacterById.values()),
    };
  });
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

const mergeTimelineEvents = (
  ...groups: TavernTimelineEvent[][]
) => {
  const seen = new Set<string>();
  return groups.flat().filter((event) => {
    const key = [
      event.title.trim().toLowerCase(),
      event.summary.trim().toLowerCase(),
    ].join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
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

const createPresetTimelineEvent = (
  event: NonNullable<TavernSystemPresetRoom["timelineEvents"]>[number],
  createdAt: number,
): TavernTimelineEvent | null => {
  const title = typeof event.title === "string" ? event.title.trim() : "";
  const summary = typeof event.summary === "string" ? event.summary.trim() : "";
  if (!title || !summary) {
    return null;
  }

  return {
    id: createId("event"),
    title,
    summary,
    createdAt,
    updatedAt: createdAt,
  };
};

const createPresetAssetDraft = (
  draft: NonNullable<TavernSystemPresetRoom["assetDrafts"]>[number],
  characterIdByPresetId: Map<string, string>,
  createdAt: number,
): TavernAssetDraft | null => {
  const timelineEvents = (draft.timelineEvents ?? []).flatMap((event) => {
    const title = typeof event.title === "string" ? event.title.trim() : "";
    const summary = typeof event.summary === "string" ? event.summary.trim() : "";
    return title && summary
      ? [{
          id: createId("timeline-draft"),
          title,
          summary,
        }]
      : [];
  });
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
    timelineEvents.length === 0 &&
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
    timelineEvents,
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

const normalizeTimelineScope = (value: unknown): TavernTimelineScope => {
  if (!value || typeof value !== "object") {
    return { mode: "auto" };
  }

  const candidate = value as Partial<TavernTimelineScope>;
  if (candidate.mode === "range") {
    return {
      mode: "range",
      startEventId: typeof candidate.startEventId === "string" && candidate.startEventId.trim()
        ? candidate.startEventId
        : undefined,
      endEventId: typeof candidate.endEventId === "string" && candidate.endEventId.trim()
        ? candidate.endEventId
        : undefined,
    };
  }

  if (candidate.mode === "selected") {
    return {
      mode: "selected",
      eventIds: Array.isArray(candidate.eventIds)
        ? [...new Set(candidate.eventIds.filter((item): item is string =>
            typeof item === "string" && item.trim().length > 0
          ))]
        : [],
    };
  }

  return { mode: "auto" };
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
    timelineScope: normalizeTimelineScope(input.timelineScope),
    memory: input.memory?.trim() || fallback.memory?.trim() || "",
    autoMemory: input.autoMemory?.trim() || fallback.autoMemory?.trim() || "",
    autoMemoryUpdatedAt: typeof input.autoMemoryUpdatedAt === "number"
      ? input.autoMemoryUpdatedAt
      : typeof fallback.autoMemoryUpdatedAt === "number"
      ? fallback.autoMemoryUpdatedAt
      : undefined,
    summarizedMessageIds: Array.isArray(input.summarizedMessageIds)
      ? input.summarizedMessageIds.filter((item): item is string => typeof item === "string")
      : Array.isArray(fallback.summarizedMessageIds)
      ? fallback.summarizedMessageIds.filter((item): item is string => typeof item === "string")
      : [],
    characterConfigs,
    characterMemories: roomCharacterMemoriesFromConfigs(characterConfigs),
    lorebookEntries: Array.isArray(input.lorebookEntries)
      ? input.lorebookEntries
          .map(normalizeLorebookEntry)
          .filter((entry): entry is TavernLorebookEntry => Boolean(entry))
      : [],
    timelineEvents: Array.isArray(input.timelineEvents)
      ? input.timelineEvents
          .map(normalizeTimelineEvent)
          .filter((event): event is TavernTimelineEvent => Boolean(event))
      : [],
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

export const getActiveTavernScene = (room: TavernRoom | null | undefined) => {
  if (!room?.scenes?.length) {
    return null;
  }

  return room.scenes.find((scene) => scene.id === room.activeSceneId) ?? room.scenes[0] ?? null;
};

export const projectTavernSceneOntoRoom = (room: TavernRoom): TavernRoom => {
  const activeScene = getActiveTavernScene(room);
  if (!activeScene) {
    return room;
  }

  return {
    ...room,
    activeSceneId: activeScene.id,
    scenePresetId: activeScene.scenePresetId,
    scene: activeScene.scene,
    sceneGoal: activeScene.sceneGoal,
    scenePlot: activeScene.plot,
    sceneDirection: activeScene.storyDirection,
    sceneTransition: activeScene.transition,
    memory: activeScene.memory,
    autoMemory: activeScene.autoMemory,
    autoMemoryUpdatedAt: activeScene.autoMemoryUpdatedAt,
    summarizedMessageIds: activeScene.summarizedMessageIds ?? [],
    characterConfigs: activeScene.characterConfigs ?? {},
    characterMemories: activeScene.characterMemories,
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
    autoMemory: room.autoMemory,
    autoMemoryUpdatedAt: room.autoMemoryUpdatedAt,
    summarizedMessageIds: room.summarizedMessageIds ?? [],
    characterConfigs: room.characterConfigs ?? {},
    characterMemories: room.characterMemories,
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
  return scene
    ? projectTavernSceneOntoRoom({
        ...room,
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
  const characters: TavernCharacter[] = preset.characters.map((character) => {
    const characterId = options.characterIdByPresetId?.get(character.id) ?? createId("character");
    characterIdByPresetId.set(character.id, characterId);

    return createTavernCharacterFromSystemPresetCharacter(character, {
      id: characterId,
      createdAt,
    });
  });
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
  const presetScenes = Array.isArray(preset.room.scenes) && preset.room.scenes.length > 0
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
  const sharedTimelineEvents = mergeTimelineEvents([
    ...(preset.room.timelineEvents ?? []),
    ...presetScenes.flatMap((presetScene) => presetScene.timelineEvents ?? []),
  ].map((event) => createPresetTimelineEvent(event, createdAt))
    .filter((event): event is TavernTimelineEvent => Boolean(event)));
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
      autoMemory: "",
      autoMemoryUpdatedAt: undefined,
      summarizedMessageIds: [],
      characterConfigs: sceneCharacterConfigs,
      characterMemories: sceneCharacterMemories,
      lorebookEntries: [],
      timelineEvents: [],
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
    storyOutline: preset.room.storyOutline?.trim() || "",
    storyGoal: preset.room.storyGoal?.trim() || "",
    activeSceneId: scene.id,
    scenes: scenes.length > 0 ? scenes : [scene],
    scenePresetId: scene.scenePresetId,
    scene: scene.scene,
    sceneGoal: scene.sceneGoal,
    scenePlot: scene.plot,
    sceneDirection: scene.storyDirection,
    sceneTransition: scene.transition,
    memory: scene.memory,
    modelConfig: undefined,
    autoMemory: "",
    autoMemoryUpdatedAt: undefined,
    summarizedMessageIds: [],
    characterConfigs,
    characterMemories,
    localCharacters: characters,
    lorebookEntries: sharedLorebookEntries,
    timelineEvents: sharedTimelineEvents,
    assetDrafts: scene.assetDrafts,
    characterIds,
    activeCharacterId,
    replyMode: normalizeReplyMode(preset.room.replyMode),
    userPersonaName: preset.room.userPersonaName?.trim() || "我",
    settings: normalizeRoomSettings(preset.room.settings),
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
  });

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

export const createDefaultTavernState = (workspaceId: string): TavernState => {
  const createdAt = now();
  const materializedPresets = tavernSystemPresets.map((preset) =>
    createTavernRoomFromSystemPreset(workspaceId, preset.id, { createdAt })
  );
  const firstRoom = materializedPresets[0]?.room;

  return {
    version: 1,
    activeRoomId: firstRoom?.id ?? "",
    rooms: materializedPresets.map((preset) => preset.room),
    characters: [],
    messagesByRoom: Object.fromEntries(
      materializedPresets.map((preset) => [preset.room.id, preset.messages]),
    ),
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
  let nextMessagesByRoom = { ...state.messagesByRoom };
  let nextMessagesByScene = { ...(state.messagesByScene ?? {}) };
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
    nextMessagesByRoom = {
      ...nextMessagesByRoom,
      [materialized.room.id]: materialized.messages,
    };
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
    characters: [],
    messagesByRoom: nextMessagesByRoom,
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
    candidate.version !== 1 ||
    !Array.isArray(candidate.rooms) ||
    !Array.isArray(candidate.characters) ||
    !candidate.messagesByRoom ||
    typeof candidate.messagesByRoom !== "object"
  ) {
    return null;
  }

  const sourceMessagesByRoom = candidate.messagesByRoom as Record<string, unknown>;
  const sourceMessagesByScene = candidate.messagesByScene && typeof candidate.messagesByScene === "object"
    ? candidate.messagesByScene as Record<string, unknown>
    : {};
  const rooms = candidate.rooms.filter((room): room is TavernRoom =>
    Boolean(room?.id && room.workspaceId === workspaceId && room.title)
  ).filter((room) => !isLegacyNightLampRoom(room, sourceMessagesByRoom)).map((room) => {
    const systemPresetId = normalizeSystemPresetId((room as Partial<TavernRoom>).systemPresetId)
      ?? inferLegacySystemPresetId(room);
    const systemPreset = getTavernSystemPreset(systemPresetId);
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
          .map((character) => normalizeTavernCharacter(character, {
            allowSystemPreset: false,
            allowLegacyModelConfig: true,
          }))
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
      storyOutline: typeof (room as Partial<TavernRoom>).storyOutline === "string"
        ? (room as Partial<TavernRoom>).storyOutline ?? ""
        : "",
      storyGoal: typeof (room as Partial<TavernRoom>).storyGoal === "string"
        ? (room as Partial<TavernRoom>).storyGoal ?? ""
        : "",
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
      modelConfig: normalizeCharacterModelConfig((room as Partial<TavernRoom>).modelConfig),
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
      characterConfigs,
      characterMemories: roomCharacterMemoriesFromConfigs(characterConfigs),
      localCharacters,
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
    };
    const normalizedScenes = Array.isArray((room as Partial<TavernRoom>).scenes)
      ? ((room as Partial<TavernRoom>).scenes ?? [])
          .map((scene) => buildTavernScene(scene, normalizedRoom))
          .filter((scene) => scene.title.trim())
      : [];
    const fallbackScene = buildTavernScene({
      title: defaultSceneTitle,
    }, normalizedRoom);
    const scenes = (normalizedScenes.length > 0 ? normalizedScenes : [fallbackScene])
      .sort((left, right) => left.order - right.order)
      .map((scene, index) => ({ ...scene, order: index }));
    const sharedLorebookEntries = mergeLorebookEntries(
      normalizedRoom.lorebookEntries,
      scenes.flatMap((scene) => scene.lorebookEntries),
    );
    const sharedTimelineEvents = mergeTimelineEvents(
      normalizedRoom.timelineEvents,
      scenes.flatMap((scene) => scene.timelineEvents),
    );
    const scenesWithoutSharedAssets = scenes.map((scene) => ({
      ...scene,
      lorebookEntries: [],
      timelineEvents: [],
    }));
    const activeSceneId = scenes.some((scene) => scene.id === (room as Partial<TavernRoom>).activeSceneId)
      ? (room as Partial<TavernRoom>).activeSceneId
      : scenes[0]?.id;

    return projectTavernSceneOntoRoom({
      ...normalizedRoom,
      lorebookEntries: sharedLorebookEntries,
      timelineEvents: sharedTimelineEvents,
      activeSceneId,
      scenes: scenesWithoutSharedAssets,
    });
  });
  const legacyCharacters = candidate.characters.filter((character): character is TavernCharacter =>
    Boolean(character?.id && character.name)
  ).map((character) => normalizeTavernCharacter(character, {
    allowSystemPreset: false,
    allowLegacyModelConfig: true,
  }));
  if (rooms.length === 0) {
    return null;
  }
  const roomsWithLocalCharacters = materializeRoomLocalCharacters(
    rooms,
    legacyCharacters,
    sourceMessagesByRoom,
  );
  const normalizedRoomsWithModels = applyLegacyCharacterModelsToRooms(
    roomsWithLocalCharacters,
    [
      ...legacyCharacters,
      ...roomsWithLocalCharacters.flatMap((room) => room.localCharacters ?? []),
    ],
  );
  const normalizedRooms = normalizedRoomsWithModels;
  const messagesByScene = Object.fromEntries(
    normalizedRooms.flatMap((room) => (room.scenes ?? []).map((scene) => {
      const sceneMessages = Array.isArray(sourceMessagesByScene[scene.id])
        ? sourceMessagesByScene[scene.id] as TavernMessage[]
        : scene.id === room.activeSceneId && Array.isArray(sourceMessagesByRoom[room.id])
        ? sourceMessagesByRoom[room.id] as TavernMessage[]
        : [];

      return [scene.id, sceneMessages] as const;
    })),
  );
  const messagesByRoom = Object.fromEntries(
    normalizedRooms.map((room) => [
      room.id,
      room.activeSceneId ? messagesByScene[room.activeSceneId] ?? [] : [],
    ]),
  );

  const activeRoomId = normalizedRooms.some((room) => room.id === candidate.activeRoomId)
    ? candidate.activeRoomId ?? rooms[0].id
    : normalizedRooms[0].id;

  return ensureSystemPresetRooms(workspaceId, {
    version: 1,
    activeRoomId,
    rooms: normalizedRooms,
    characters: [],
    messagesByRoom,
    messagesByScene,
  });
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

  const normalizedState = normalizeTavernState(workspaceId, state) ?? state;
  window.localStorage.setItem(storageKeyForWorkspace(workspaceId), JSON.stringify(normalizedState));
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

  return projectTavernSceneOntoRoom({
    id: createId("room"),
    workspaceId,
    locked: false,
    title: `新酒馆 ${index}`,
    storyOutline: "",
    storyGoal: "",
    activeSceneId: scene.id,
    scenes: [scene],
    scenePresetId: scene.scenePresetId,
    scene: scene.scene,
    sceneGoal: scene.sceneGoal,
    scenePlot: scene.plot,
    sceneDirection: scene.storyDirection,
    sceneTransition: scene.transition,
    memory: scene.memory,
    modelConfig: undefined,
    autoMemory: "",
    autoMemoryUpdatedAt: undefined,
    summarizedMessageIds: [],
    characterConfigs: {},
    characterMemories: {},
    localCharacters: [],
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
  });
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
