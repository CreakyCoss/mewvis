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
  TavernRoomSettings,
  TavernState,
  TavernTimelineDraft,
  TavernTimelineEvent,
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

type TavernSystemPresetRoom = {
  title: string;
  scenePresetId?: unknown;
  scene: string;
  sceneGoal?: string;
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
  preset: TavernSystemPreset,
  character: TavernSystemPresetCharacter,
  options: {
    id?: string;
    createdAt?: number;
  } = {},
): TavernCharacter => {
  const createdAt = options.createdAt ?? now();
  return {
    id: options.id ?? createId("character"),
    systemPresetId: preset.id,
    systemPresetCharacterId: character.id,
    systemPresetVersion: preset.version,
    name: character.name.trim(),
    avatar: character.avatar,
    description: character.description.trim(),
    speakingStyle: character.speakingStyle.trim(),
    goals: character.goals?.trim() || undefined,
    relationships: character.relationships?.trim() || undefined,
    modelConfig: normalizeCharacterModelConfig(character.modelConfig),
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

const legacyNightLampCharacters = new Set([
  "柜台记录员|tavern-01",
  "夜巡旅人|tavern-06",
  "炉边评注者|tavern-08",
]);

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

const isLegacyNightLampCharacter = (character: Partial<TavernCharacter>) =>
  isRemovedSystemPresetId(character.systemPresetId) ||
  legacyNightLampCharacters.has(`${character.name ?? ""}|${character.avatar ?? ""}`);

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

    return createTavernCharacterFromSystemPresetCharacter(preset, character, {
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
  const markAsSystemPreset = options.markAsSystemPreset !== false;
  const room: TavernRoom = {
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
    scenePresetId: normalizeVisualPresetId(preset.room.scenePresetId),
    scene: preset.room.scene.trim(),
    sceneGoal: preset.room.sceneGoal?.trim() || "",
    memory: preset.room.memory?.trim() || "",
    autoMemory: "",
    autoMemoryUpdatedAt: undefined,
    summarizedMessageIds: [],
    characterMemories,
    lorebookEntries: (preset.room.lorebookEntries ?? [])
      .map((entry) => createPresetLorebookEntry(entry, createdAt))
      .filter((entry): entry is TavernLorebookEntry => Boolean(entry)),
    timelineEvents: (preset.room.timelineEvents ?? [])
      .map((event) => createPresetTimelineEvent(event, createdAt))
      .filter((event): event is TavernTimelineEvent => Boolean(event)),
    assetDrafts: (preset.room.assetDrafts ?? [])
      .map((draft) => createPresetAssetDraft(draft, characterIdByPresetId, createdAt))
      .filter((draft): draft is TavernAssetDraft => Boolean(draft)),
    characterIds,
    activeCharacterId,
    replyMode: normalizeReplyMode(preset.room.replyMode),
    userPersonaName: preset.room.userPersonaName?.trim() || "我",
    settings: normalizeRoomSettings(preset.room.settings),
    createdAt: options.roomCreatedAt ?? createdAt,
    updatedAt: createdAt,
  };
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
    characters: materializedPresets.flatMap((preset) => preset.characters),
    messagesByRoom: Object.fromEntries(
      materializedPresets.map((preset) => [preset.room.id, preset.messages]),
    ),
  };
};

const ensureSystemPresetCharacters = (
  rooms: TavernRoom[],
  characters: TavernCharacter[],
) => {
  let nextCharacters = [...characters];
  const referencedCharacterIds = new Set(rooms.flatMap((room) => room.characterIds));

  const markCharacter = (
    characterId: string,
    preset: TavernSystemPreset,
    presetCharacter: TavernSystemPresetCharacter,
  ) => {
    nextCharacters = nextCharacters.map((character) =>
      character.id === characterId
        ? {
            ...character,
            systemPresetId: preset.id,
            systemPresetCharacterId: presetCharacter.id,
            systemPresetVersion: character.systemPresetVersion ?? preset.version,
          }
        : character
    );
  };

  for (const preset of tavernSystemPresets) {
    const systemRooms = rooms.filter((room) => room.systemPresetId === preset.id);

    for (const presetCharacter of preset.characters) {
      const presetCharacterIndex = preset.room.characterIds.indexOf(presetCharacter.id);
      const legacyCharacter = presetCharacterIndex >= 0
        ? systemRooms
            .map((room) => nextCharacters.find((character) =>
              character.id === room.characterIds[presetCharacterIndex]
            ))
            .find((character): character is TavernCharacter =>
              Boolean(
                character &&
                !character.systemPresetId &&
                (
                  character.name === presetCharacter.name ||
                  character.avatar === presetCharacter.avatar
                ),
              )
            )
        : undefined;
      const existing = nextCharacters.find((character) =>
        character.systemPresetId === preset.id &&
        character.systemPresetCharacterId === presetCharacter.id
      );
      if (legacyCharacter && existing && legacyCharacter.id !== existing.id) {
        markCharacter(legacyCharacter.id, preset, presetCharacter);
        if (!referencedCharacterIds.has(existing.id)) {
          nextCharacters = nextCharacters.filter((character) => character.id !== existing.id);
        }
        continue;
      }

      if (existing) {
        markCharacter(existing.id, preset, presetCharacter);
        continue;
      }

      if (legacyCharacter) {
        markCharacter(legacyCharacter.id, preset, presetCharacter);
        continue;
      }

      nextCharacters = [
        ...nextCharacters,
        createTavernCharacterFromSystemPresetCharacter(preset, presetCharacter),
      ];
    }
  }

  return nextCharacters;
};

const ensureSystemPresetRooms = (
  workspaceId: string,
  state: TavernState,
): TavernState => {
  let nextRooms = [...state.rooms];
  let nextCharacters = [...state.characters];
  let nextMessagesByRoom = { ...state.messagesByRoom };
  const existingPresetIds = new Set(
    nextRooms.flatMap((room) => room.systemPresetId ? [room.systemPresetId] : []),
  );
  const createdAt = now();

  for (const preset of tavernSystemPresets) {
    if (existingPresetIds.has(preset.id)) {
      continue;
    }

    const characterIdByPresetId = new Map<string, string>();
    for (const presetCharacter of preset.characters) {
      const existingCharacter = nextCharacters.find((character) =>
        character.systemPresetId === preset.id &&
        character.systemPresetCharacterId === presetCharacter.id
      );
      if (existingCharacter) {
        characterIdByPresetId.set(presetCharacter.id, existingCharacter.id);
      }
    }

    const materialized = createTavernRoomFromSystemPreset(workspaceId, preset.id, {
      createdAt,
      characterIdByPresetId,
    });
    const materializedCharacterById = new Map(
      materialized.characters.map((character) => [character.id, character]),
    );
    const existingCharacterIds = new Set(nextCharacters.map((character) => character.id));

    nextRooms = [...nextRooms, materialized.room];
    nextCharacters = [
      ...nextCharacters.map((character) =>
        materializedCharacterById.get(character.id) ?? character
      ),
      ...materialized.characters.filter((character) => !existingCharacterIds.has(character.id)),
    ];
    nextMessagesByRoom = {
      ...nextMessagesByRoom,
      [materialized.room.id]: materialized.messages,
    };
    existingPresetIds.add(preset.id);
  }

  return {
    ...state,
    activeRoomId: nextRooms.some((room) => room.id === state.activeRoomId)
      ? state.activeRoomId
      : nextRooms[0]?.id ?? "",
    rooms: nextRooms,
    characters: nextCharacters,
    messagesByRoom: nextMessagesByRoom,
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
  const rooms = candidate.rooms.filter((room): room is TavernRoom =>
    Boolean(room?.id && room.workspaceId === workspaceId && room.title)
  ).filter((room) => !isLegacyNightLampRoom(room, sourceMessagesByRoom)).map((room) => {
    const systemPresetId = normalizeSystemPresetId((room as Partial<TavernRoom>).systemPresetId)
      ?? inferLegacySystemPresetId(room);
    const systemPreset = getTavernSystemPreset(systemPresetId);

    return {
      ...room,
      systemPresetId: systemPreset?.id,
      systemPresetVersion: systemPreset
        ? typeof (room as Partial<TavernRoom>).systemPresetVersion === "number"
          ? (room as Partial<TavernRoom>).systemPresetVersion
          : systemPreset.version
        : undefined,
      locked: Boolean((room as Partial<TavernRoom>).locked),
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
    };
  });
  const referencedCharacterIds = new Set(rooms.flatMap((room) => room.characterIds));
  const characters = candidate.characters.filter((character): character is TavernCharacter =>
    Boolean(character?.id && character.name)
  ).filter((character) =>
    referencedCharacterIds.has(character.id) || !isLegacyNightLampCharacter(character)
  ).map((character) => {
    const systemPresetId = normalizeSystemPresetId(
      (character as Partial<TavernCharacter>).systemPresetId,
    );
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
      modelConfig: normalizeCharacterModelConfig((character as Partial<TavernCharacter>).modelConfig),
    };
  });
  if (rooms.length === 0) {
    return null;
  }
  const normalizedCharacters = ensureSystemPresetCharacters(rooms, characters);

  const activeRoomId = rooms.some((room) => room.id === candidate.activeRoomId)
    ? candidate.activeRoomId ?? rooms[0].id
    : rooms[0].id;

  return ensureSystemPresetRooms(workspaceId, {
    version: 1,
    activeRoomId,
    rooms,
    characters: normalizedCharacters,
    messagesByRoom: Object.fromEntries(
      rooms.map((room) => [
        room.id,
        Array.isArray(sourceMessagesByRoom[room.id])
          ? sourceMessagesByRoom[room.id] as TavernMessage[]
          : [],
      ]),
    ),
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

  window.localStorage.setItem(storageKeyForWorkspace(workspaceId), JSON.stringify(state));
};

export const createTavernRoom = (workspaceId: string, index: number): TavernRoom => {
  const createdAt = now();
  return {
    id: createId("room"),
    workspaceId,
    locked: false,
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
