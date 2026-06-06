import type {
  TavernCharacter,
  TavernMessage,
  TavernReplyMode,
  TavernRoom,
  TavernState,
} from "./types";

const STORAGE_PREFIX = "novel-claw:tavern";

const storageKeyForWorkspace = (workspaceId: string) => `${STORAGE_PREFIX}:${workspaceId}`;

const createId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

const now = () => Date.now();

const normalizeReplyMode = (value: unknown): TavernReplyMode =>
  value === "round" ? "round" : "active";

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
      avatar: "cat-sun",
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
      avatar: "cat-sky",
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
      avatar: "cat-graphite",
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
    scene: "雨停后的夜晚，吧台上还有未擦干的水痕。几位熟客围在靠窗的位置，等待有人把故事继续讲下去。",
    memory: "",
    autoMemory: "",
    autoMemoryUpdatedAt: undefined,
    summarizedMessageIds: [],
    characterIds: characters.map((character) => character.id),
    activeCharacterId: keeperId,
    replyMode: "active",
    userPersonaName: "我",
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
    memory: typeof (room as Partial<TavernRoom>).memory === "string"
      ? (room as Partial<TavernRoom>).memory ?? ""
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
    replyMode: normalizeReplyMode((room as Partial<TavernRoom>).replyMode),
    userPersonaName: room.userPersonaName || "我",
    characterIds: Array.isArray(room.characterIds) ? room.characterIds : [],
    activeCharacterId: room.activeCharacterId || "",
  }));
  const characters = candidate.characters.filter((character): character is TavernCharacter =>
    Boolean(character?.id && character.name)
  );
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
    scene: "一张空桌、一盏低灯，以及等待被写下的第一句对白。",
    memory: "",
    autoMemory: "",
    autoMemoryUpdatedAt: undefined,
    summarizedMessageIds: [],
    characterIds: [],
    activeCharacterId: "",
    replyMode: "active",
    userPersonaName: "我",
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
