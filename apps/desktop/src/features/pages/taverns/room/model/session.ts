import { uniq } from "lodash-es";
import type { VisualPresetId } from "@/features/pages/taverns/tavern/visual-presets/types";
import { materializeTavernMessage } from "@/features/pages/taverns/room/message/domain/factory";
import type { TavernMessage } from "@/features/pages/taverns/tavern/types";
import { createTimestampId } from "@/utils/ids";
import { getCurrentTimestamp } from "@/utils/time";
import type {
  TavernCharacter,
  TavernLorebookEntry,
  TavernRoom as TavernRoomConfig,
  TavernRoomCharacterConfig,
  TavernRoomPromptSettings,
  TavernRoomSettings,
  TavernScenePromptOverrides,
} from "@/features/pages/taverns/manage/model";
import type { TavernRoomOpeningInput } from "./opening-input";
import type {
  TavernCharacterMemoryLayers,
  TavernRoomRuntime,
  TavernRoomSessionState,
  TavernScene,
  TavernSceneMemoryLayers,
  TavernStoryBinding,
  TavernStoryEdge,
  TavernStoryGraph,
  TavernStoryNode,
} from "./standard";

const defaultSceneTitle = "默认场景";

const trimText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const pickText = (value: unknown, defaultValue = "") => trimText(value) || defaultValue;

const numberOrDefault = (value: unknown, defaultValue: number) => (typeof value === "number" ? value : defaultValue);

const unique = (items: string[]) => uniq(items.filter(Boolean));

const normalizeSceneCharacterIds = (characterIds: unknown) =>
  unique(
    Array.isArray(characterIds)
      ? characterIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [],
  );

const createCharacterConfigsFromMemories = (
  memories: Record<string, string>,
): Record<string, TavernRoomCharacterConfig> =>
  Object.fromEntries(
    Object.entries(memories).map(([characterId, memory]) => [
      characterId,
      {
        characterId,
        memory: trimText(memory) || undefined,
      },
    ]),
  );

const collectCharacterMemories = (configs: Record<string, TavernRoomCharacterConfig>) =>
  Object.fromEntries(
    Object.entries(configs).flatMap(([characterId, config]) => {
      const memory = trimText(config.memory);
      return memory ? [[characterId, memory]] : [];
    }),
  );

const mergeRoomSettings = (base: TavernRoomSettings, override?: Partial<TavernRoomSettings>): TavernRoomSettings => ({
  ...base,
  ...override,
  directorLoop: {
    ...base.directorLoop,
    ...override?.directorLoop,
  },
  directorNarrativeControl: {
    ...base.directorNarrativeControl,
    ...override?.directorNarrativeControl,
  },
});

const mergePromptSettings = (
  base: TavernRoomPromptSettings,
  override?: Partial<TavernRoomPromptSettings>,
): TavernRoomPromptSettings => ({
  ...base,
  ...override,
  blocks: override?.blocks ?? base.blocks,
});

const pickActiveCharacterId = (inputCharacterId: unknown, characterIds: string[]) => {
  const matchedId =
    typeof inputCharacterId === "string" && characterIds.includes(inputCharacterId) ? inputCharacterId : undefined;

  return matchedId ?? characterIds[0] ?? "";
};

const normalizeTavernStoryNodeType = (value: unknown): TavernStoryNode["type"] =>
  value === "failure" || value === "ending" ? value : "normal";

const normalizeTavernStoryPathRole = (value: unknown): TavernStoryNode["pathRole"] =>
  value === "branch" ? "branch" : "main";

const normalizeTavernStoryNodeStatus = (value: unknown): TavernStoryNode["status"] =>
  value === "ready" || value === "played" || value === "draft" ? value : "draft";

const normalizeTavernStoryNode = (
  input: Partial<TavernStoryNode> & {
    title: string;
  },
): TavernStoryNode => {
  const updatedAt = typeof input.updatedAt === "number" ? input.updatedAt : getCurrentTimestamp();

  return {
    id: input.id || createTimestampId("node"),
    title: input.title.trim() || "当前节点",
    type: normalizeTavernStoryNodeType(input.type),
    pathRole: normalizeTavernStoryPathRole(input.pathRole),
    position: {
      x: typeof input.position?.x === "number" ? input.position.x : 120,
      y: typeof input.position?.y === "number" ? input.position.y : 120,
    },
    status: normalizeTavernStoryNodeStatus(input.status),
    createdAt: typeof input.createdAt === "number" ? input.createdAt : updatedAt,
    updatedAt,
  };
};

const normalizeTavernStoryEdge = (
  input: Partial<TavernStoryEdge> & {
    fromNodeId: string;
    toNodeId: string;
  },
): TavernStoryEdge => {
  const updatedAt = typeof input.updatedAt === "number" ? input.updatedAt : getCurrentTimestamp();

  return {
    id: input.id || createTimestampId("edge"),
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

const createDefaultStoryGraph = (title = "当前节点", timestamp = getCurrentTimestamp()): TavernStoryGraph => {
  const entryNode = normalizeTavernStoryNode({
    title,
    status: "ready",
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  return {
    version: 1,
    entryNodeId: entryNode.id,
    activeNodeId: entryNode.id,
    nodes: [entryNode],
    edges: [],
  };
};

const normalizeStoryGraph = (value: unknown, fallbackTitle: string, activeNodeId?: string): TavernStoryGraph => {
  if (!value || typeof value !== "object") {
    const graph = createDefaultStoryGraph(fallbackTitle);
    return activeNodeId && graph.nodes.some((node) => node.id === activeNodeId) ? { ...graph, activeNodeId } : graph;
  }

  const candidate = value as Partial<TavernStoryGraph>;
  const nodes = Array.isArray(candidate.nodes)
    ? candidate.nodes
        .map((node) => {
          const rawNode = node as Partial<TavernStoryNode>;
          const title = typeof rawNode.title === "string" ? rawNode.title : "";
          if (!title.trim()) {
            return null;
          }

          return normalizeTavernStoryNode({
            ...rawNode,
            title,
          });
        })
        .filter((node): node is TavernStoryNode => Boolean(node))
    : [];
  const normalizedNodes = nodes.length > 0 ? nodes : createDefaultStoryGraph(fallbackTitle).nodes;
  const nodeIds = new Set(normalizedNodes.map((node) => node.id));
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

          return normalizeTavernStoryEdge({
            ...rawEdge,
            fromNodeId: rawEdge.fromNodeId,
            toNodeId: rawEdge.toNodeId,
          });
        })
        .filter((edge): edge is TavernStoryEdge => Boolean(edge))
    : [];
  const entryNodeId =
    candidate.entryNodeId && nodeIds.has(candidate.entryNodeId)
      ? candidate.entryNodeId
      : (normalizedNodes[0]?.id ?? "");
  const resolvedActiveNodeId =
    activeNodeId && nodeIds.has(activeNodeId)
      ? activeNodeId
      : candidate.activeNodeId && nodeIds.has(candidate.activeNodeId)
        ? candidate.activeNodeId
        : entryNodeId;

  return {
    version: 1,
    entryNodeId,
    activeNodeId: resolvedActiveNodeId,
    nodes: normalizedNodes,
    edges,
  };
};

const createScenePromptOverrides = (input: Partial<TavernScenePromptOverrides> = {}): TavernScenePromptOverrides => ({
  version: 1,
  blocks: input.blocks ?? [],
});

const createSceneMemoryLayers = (input: Partial<TavernSceneMemoryLayers> = {}): TavernSceneMemoryLayers => ({
  required: input.required?.trim() ?? "",
  private: input.private?.trim() ?? "",
  public: input.public?.trim() ?? "",
  directorSecret: input.directorSecret?.trim() ?? "",
  updatedAt: input.updatedAt,
});

const createCharacterMemoryLayers = (
  input: Partial<TavernCharacterMemoryLayers> = {},
): TavernCharacterMemoryLayers => ({
  required: input.required?.trim() ?? "",
  public: input.public?.trim() ?? "",
  known: input.known?.trim() ?? "",
  privateSelf: input.privateSelf?.trim() ?? "",
  directorSecret: input.directorSecret?.trim() ?? "",
  updatedAt: input.updatedAt,
});

const normalizeScene = (
  input: TavernRoomOpeningInput["scene"] = {},
  {
    characterIds,
    activeCharacterId,
    characterMemories,
    scenePresetId,
    createdAt,
  }: {
    characterIds: string[];
    activeCharacterId: string;
    characterMemories: Record<string, string>;
    scenePresetId: VisualPresetId;
    createdAt: number;
  },
): TavernScene => {
  const timestampNow = getCurrentTimestamp();
  const updatedAt = numberOrDefault(input.updatedAt, timestampNow);
  const inputCharacterMemories = input.characterMemories ?? {};
  const nextCharacterMemories = {
    ...characterMemories,
    ...inputCharacterMemories,
  };
  const characterConfigs = input.characterConfigs ?? createCharacterConfigsFromMemories(nextCharacterMemories);
  const sceneCharacterIds = normalizeSceneCharacterIds(input.characterIds);
  const resolvedCharacterIds = sceneCharacterIds.length > 0 ? sceneCharacterIds : characterIds;
  const resolvedActiveCharacterId = pickActiveCharacterId(
    input.activeCharacterId ?? activeCharacterId,
    resolvedCharacterIds,
  );

  return {
    title: pickText(input.title, defaultSceneTitle),
    scenePresetId: input.scenePresetId ?? scenePresetId,
    scene: pickText(input.scene, "一张空桌、一盏低灯，以及等待被写下的第一句对白。"),
    sceneGoal: pickText(input.sceneGoal),
    plot: pickText(input.plot),
    storyDirection: pickText(input.storyDirection),
    transition: pickText(input.transition),
    memory: pickText(input.memory),
    relationshipOverrides: input.relationshipOverrides ?? [],
    sceneStatus: input.sceneStatus,
    characterPublicStatuses: input.characterPublicStatuses ?? {},
    characterPrivateStatuses: input.characterPrivateStatuses ?? {},
    pendingInteractions: input.pendingInteractions ?? [],
    replyOptions: input.replyOptions ?? [],
    characterConfigs,
    characterMemories: collectCharacterMemories(characterConfigs),
    characterIds: resolvedCharacterIds,
    activeCharacterId: resolvedActiveCharacterId,
    promptOverrides: createScenePromptOverrides(input.promptOverrides),
    memoryLayers: createSceneMemoryLayers({
      required: pickText(input.memory),
      ...input.memoryLayers,
      updatedAt,
    }),
    characterMemoryLayers: Object.fromEntries(
      resolvedCharacterIds.map((characterId) => [
        characterId,
        createCharacterMemoryLayers({
          required: nextCharacterMemories[characterId],
          ...input.characterMemoryLayers?.[characterId],
          updatedAt,
        }),
      ]),
    ),
    createdAt: numberOrDefault(input.createdAt, createdAt),
    updatedAt,
  };
};

const createInputCharacter = (
  input: Partial<TavernCharacter> & { memory?: string },
  createdAt: number,
): TavernCharacter => ({
  id: trimText(input.id) || createTimestampId("character"),
  name: pickText(input.name, "未命名角色"),
  avatar: pickText(input.avatar),
  description: pickText(input.description),
  speakingStyle: pickText(input.speakingStyle),
  writingStyle: trimText(input.writingStyle) || undefined,
  replyStylePrompt: trimText(input.replyStylePrompt) || undefined,
  goals: trimText(input.goals) || undefined,
  relationships: input.relationships ?? [],
  createdAt: numberOrDefault(input.createdAt, createdAt),
  updatedAt: numberOrDefault(input.updatedAt, createdAt),
});

const createInputLorebookEntry = (
  input: Partial<TavernLorebookEntry> & Pick<TavernLorebookEntry, "title" | "content">,
  createdAt: number,
): TavernLorebookEntry | null => {
  const title = trimText(input.title);
  const content = trimText(input.content);
  if (!title || !content) {
    return null;
  }

  return {
    id: trimText(input.id) || createTimestampId("lore"),
    title,
    content,
    keywords: unique((input.keywords ?? []).map(trimText)),
    enabled: input.enabled !== false,
    alwaysOn: Boolean(input.alwaysOn),
    createdAt: numberOrDefault(input.createdAt, createdAt),
    updatedAt: numberOrDefault(input.updatedAt, createdAt),
  };
};

const resolveCharacterIds = ({
  requestedCharacterIds,
  characters,
}: {
  requestedCharacterIds?: string[];
  characters: TavernCharacter[];
}) => {
  const characterIds = new Set(characters.map((character) => character.id));
  const requested = requestedCharacterIds?.filter((characterId) => characterIds.has(characterId)) ?? [];
  return requested.length > 0 ? unique(requested) : characters.map((character) => character.id);
};

const createStoryBinding = (storyId: string, boundAt = getCurrentTimestamp()): TavernStoryBinding => ({
  version: 1,
  storyId,
  source: "story",
  boundAt,
});

const createOpeningMessage = ({
  input,
  room,
  createdAt,
}: {
  input: Partial<TavernMessage> & Pick<TavernMessage, "role" | "content">;
  room: TavernRoomRuntime;
  createdAt: number;
}): TavernMessage | null => {
  const content = trimText(input.content);
  if (!content) {
    return null;
  }

  if (input.role === "character") {
    const characterId = trimText(input.characterId);
    if (!characterId || !room.cast.characterIds.includes(characterId)) {
      return null;
    }

    return materializeTavernMessage(
      {
        id: trimText(input.id) || createTimestampId("message"),
        roomId: room.identity.id,
        role: "character",
        characterId,
        content,
        createdAt: numberOrDefault(input.createdAt, createdAt),
        status: input.status === "error" ? "error" : "done",
      },
      room.presentation.profile.profileId,
    );
  }

  return materializeTavernMessage(
    {
      id: trimText(input.id) || createTimestampId("message"),
      roomId: room.identity.id,
      role: input.role === "user" ? "user" : "narrator",
      content,
      createdAt: numberOrDefault(input.createdAt, createdAt),
      status: input.status === "error" ? "error" : "done",
    },
    room.presentation.profile.profileId,
  );
};

const createRuntimeFromOpeningInput = ({
  workspaceId,
  tavernRoom,
  openingInput,
  roomId,
  createdAt,
}: {
  workspaceId: string;
  tavernRoom: TavernRoomConfig;
  openingInput: TavernRoomOpeningInput;
  roomId: string;
  createdAt: number;
}): TavernRoomRuntime => {
  const characters = (openingInput.cast?.characters ?? []).map((character) =>
    createInputCharacter(character, createdAt),
  );
  const characterIds = resolveCharacterIds({
    requestedCharacterIds: openingInput.cast?.characterIds,
    characters,
  });
  const activeCharacterId =
    openingInput.cast?.activeCharacterId && characterIds.includes(openingInput.cast.activeCharacterId)
      ? openingInput.cast.activeCharacterId
      : (characterIds[0] ?? "");
  const characterMemories = Object.fromEntries(
    (openingInput.cast?.characters ?? []).flatMap((character) => {
      const characterId = trimText(character.id);
      const memory = trimText(character.memory);
      return characterId && memory ? [[characterId, memory]] : [];
    }),
  );
  const characterConfigs = createCharacterConfigsFromMemories(characterMemories);
  const presentation = tavernRoom.presentation;
  const settings = mergeRoomSettings(tavernRoom.settings, openingInput.runtime?.settings);
  const prompt = mergePromptSettings(tavernRoom.prompt, openingInput.runtime?.prompt);
  const replyMode = openingInput.runtime?.replyMode ?? tavernRoom.replyMode;
  const scene = normalizeScene(openingInput.scene, {
    characterIds,
    activeCharacterId,
    characterMemories,
    scenePresetId: tavernRoom.scenePresetId,
    createdAt,
  });
  const title = trimText(openingInput.title) || tavernRoom.title || "故事演绎";
  const storyGraph = normalizeStoryGraph(openingInput.story?.graph, scene.title, openingInput.story?.activeNodeId);
  const storyBinding =
    openingInput.source?.type === "story" ? createStoryBinding(openingInput.source.id ?? roomId, createdAt) : undefined;
  const roomConfig: TavernRoomConfig = {
    ...tavernRoom,
    id: roomId,
    workspaceId,
    title,
    creationSource: openingInput.runtime?.creationSource ?? tavernRoom.creationSource ?? "manual",
    presentation,
    prompt,
    scenePresetId: scene.scenePresetId,
    replyMode,
    settings,
    createdAt: tavernRoom.createdAt ?? createdAt,
    updatedAt: createdAt,
  };

  return {
    version: 1,
    identity: {
      id: roomConfig.id,
      workspaceId: roomConfig.workspaceId,
      title: roomConfig.title,
      creationSource: roomConfig.creationSource,
      createdAt: roomConfig.createdAt,
      updatedAt: createdAt,
    },
    config: {
      room: roomConfig,
    },
    presentation: {
      profile: presentation,
      prompt,
      settings,
      scenePresetId: scene.scenePresetId,
      replyMode,
    },
    story: {
      binding: storyBinding,
      outline: trimText(openingInput.story?.outline),
      goal: trimText(openingInput.story?.goal),
      graph: storyGraph,
      activeNodeId: storyGraph.activeNodeId,
    },
    cast: {
      characters,
      characterIds,
      activeCharacterId,
      characterConfigs,
      characterMemories,
    },
    scene,
    world: {
      lorebookEntries: (openingInput.world?.lorebookEntries ?? [])
        .map((entry) => createInputLorebookEntry(entry, createdAt))
        .filter((entry): entry is TavernLorebookEntry => Boolean(entry)),
    },
    user: {
      personaName: trimText(openingInput.userPersonaName) || "我",
    },
  };
};

export const createTavernRoomSessionState = ({
  tavernRoom,
  openingInput,
}: {
  tavernRoom: TavernRoomConfig;
  openingInput: TavernRoomOpeningInput;
}): TavernRoomSessionState => {
  const createdAt = getCurrentTimestamp();
  const room = createRuntimeFromOpeningInput({
    workspaceId: tavernRoom.workspaceId,
    tavernRoom,
    openingInput,
    roomId: tavernRoom.id,
    createdAt,
  });
  const messages = (openingInput.openingMessages ?? [])
    .map((message) => createOpeningMessage({ input: message, room, createdAt }))
    .filter((message): message is TavernMessage => Boolean(message));

  return {
    runtime: room,
    messages:
      messages.length > 0
        ? messages
        : [
            materializeTavernMessage(
              {
                id: createTimestampId("message"),
                roomId: room.identity.id,
                role: "narrator",
                presentationProfileId: room.presentation.profile.profileId,
                content: "故事演绎已经准备好。",
                createdAt,
                status: "done",
              },
              room.presentation.profile.profileId,
            ),
          ],
  };
};
