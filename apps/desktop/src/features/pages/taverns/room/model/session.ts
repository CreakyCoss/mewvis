import { uniq } from "lodash-es";
import type { VisualPresetId } from "@/features/pages/taverns/tavern/visual-presets/types";
import { normalizeVisualPresetId } from "@/features/pages/taverns/tavern/visual-presets";
import { createTavernId as createId, now } from "@/features/pages/taverns/tavern/ids";
import { normalizeStringRecord } from "@/features/pages/taverns/tavern/normalizers/normalization";
import {
  normalizeCharacterRelationships,
  normalizeSceneRelationshipOverrides,
} from "@/features/pages/taverns/tavern/normalizers/relationships";
import {
  normalizeRoomCharacterConfigs,
  roomCharacterMemoriesFromConfigs,
} from "@/features/pages/taverns/tavern/normalizers/room-character-configs";
import { normalizeReplyMode } from "@/features/pages/taverns/tavern/normalizers/reply-mode";
import { normalizeRoomSettings } from "@/features/pages/taverns/tavern/normalizers/room-settings";
import {
  normalizeCharacterPrivateStatuses,
  normalizeCharacterPublicStatuses,
  normalizePendingInteraction,
  normalizeReplyOption,
  normalizeSceneStatus,
} from "@/features/pages/taverns/tavern/normalizers/scene-state-normalizers";
import { normalizeRoomPresentation } from "@/features/pages/taverns/tavern/presentation/presentation-settings";
import {
  createDefaultTavernPromptSettings,
  normalizeTavernPromptSettings,
} from "@/features/pages/taverns/tavern/prompt-registry/text-blocks";
import { materializeTavernMessage } from "@/features/pages/taverns/room/message/domain/factory";
import type { TavernMessage } from "@/features/pages/taverns/tavern/types";
import type {
  TavernCharacter,
  TavernLorebookEntry,
  TavernPendingInteraction,
  TavernPromptBlock,
  TavernReplyOption,
  TavernRoom as TavernRoomConfig,
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

const normalizeArray = (value: unknown) => (Array.isArray(value) ? value : []);

const unique = (items: string[]) => uniq(items.filter(Boolean));

const normalizeItems = <T>(items: unknown[], normalize: (item: unknown) => T | null | undefined) =>
  items.map(normalize).filter((item): item is T => Boolean(item));

const normalizeSceneCharacterIds = (characterIds: unknown) =>
  unique(
    Array.isArray(characterIds)
      ? characterIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [],
  );

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
  const updatedAt = typeof input.updatedAt === "number" ? input.updatedAt : now();

  return {
    id: input.id || createId("node"),
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

const createDefaultStoryGraph = (title = "当前节点", timestamp = now()): TavernStoryGraph => {
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

const normalizePromptBlockTarget = (value: unknown): TavernPromptBlock["target"] | null => {
  if (value === "bridge" || value === "director" || value === "character") {
    return value;
  }
  return null;
};

const normalizeScenePromptOverrides = (
  input: Partial<TavernScenePromptOverrides> = {},
): TavernScenePromptOverrides => ({
  version: 1,
  blocks: Array.isArray(input.blocks)
    ? input.blocks
        .flatMap((block, index) => {
          if (!block || typeof block !== "object") {
            return [];
          }

          const candidate = block as Partial<TavernPromptBlock>;
          const target = normalizePromptBlockTarget(candidate.target);
          const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
          if (!target || !text) {
            return [];
          }

          const label =
            typeof candidate.label === "string" && candidate.label.trim() ? candidate.label.trim() : "节点风格补充";
          const id =
            typeof candidate.id === "string" && candidate.id.trim()
              ? candidate.id.trim()
              : `node-prompt:${target}:${index + 1}`;
          const order =
            typeof candidate.order === "number" && Number.isFinite(candidate.order) ? candidate.order : 9000 + index;

          return [
            {
              id,
              target,
              label,
              text,
              enabled: candidate.enabled !== false,
              order,
              source: {
                type: "custom",
                id: "node-prompt-override",
                label: "节点风格补充",
              },
            } satisfies TavernPromptBlock,
          ];
        })
        .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label))
    : [],
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
  const timestampNow = now();
  const updatedAt = numberOrDefault(input.updatedAt, timestampNow);
  const inputCharacterMemories = normalizeStringRecord(input.characterMemories);
  const nextCharacterMemories = {
    ...characterMemories,
    ...inputCharacterMemories,
  };
  const characterConfigs = normalizeRoomCharacterConfigs(input.characterConfigs, nextCharacterMemories);
  const sceneCharacterIds = normalizeSceneCharacterIds(input.characterIds);
  const resolvedCharacterIds = sceneCharacterIds.length > 0 ? sceneCharacterIds : characterIds;
  const resolvedActiveCharacterId = pickActiveCharacterId(
    input.activeCharacterId ?? activeCharacterId,
    resolvedCharacterIds,
  );

  return {
    title: pickText(input.title, defaultSceneTitle),
    scenePresetId: normalizeVisualPresetId(input.scenePresetId ?? scenePresetId),
    scene: pickText(input.scene, "一张空桌、一盏低灯，以及等待被写下的第一句对白。"),
    sceneGoal: pickText(input.sceneGoal),
    plot: pickText(input.plot),
    storyDirection: pickText(input.storyDirection),
    transition: pickText(input.transition),
    memory: pickText(input.memory),
    relationshipOverrides: normalizeSceneRelationshipOverrides(input.relationshipOverrides, updatedAt),
    sceneStatus: normalizeSceneStatus(input.sceneStatus, updatedAt),
    characterPublicStatuses: normalizeCharacterPublicStatuses(
      input.characterPublicStatuses,
      resolvedCharacterIds,
      undefined,
      updatedAt,
    ),
    characterPrivateStatuses: normalizeCharacterPrivateStatuses(
      input.characterPrivateStatuses,
      resolvedCharacterIds,
      undefined,
      updatedAt,
    ),
    pendingInteractions: normalizeItems<TavernPendingInteraction>(
      normalizeArray(input.pendingInteractions),
      normalizePendingInteraction,
    ),
    replyOptions: normalizeItems<TavernReplyOption>(normalizeArray(input.replyOptions), normalizeReplyOption),
    characterConfigs,
    characterMemories: roomCharacterMemoriesFromConfigs(characterConfigs),
    characterIds: resolvedCharacterIds,
    activeCharacterId: resolvedActiveCharacterId,
    promptOverrides: normalizeScenePromptOverrides(input.promptOverrides),
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
  id: trimText(input.id) || createId("character"),
  name: pickText(input.name, "未命名角色"),
  avatar: pickText(input.avatar),
  description: pickText(input.description),
  speakingStyle: pickText(input.speakingStyle),
  writingStyle: trimText(input.writingStyle) || undefined,
  replyStylePrompt: trimText(input.replyStylePrompt) || undefined,
  goals: trimText(input.goals) || undefined,
  relationships: normalizeCharacterRelationships(input.relationships, createdAt),
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
    id: trimText(input.id) || createId("lore"),
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

const createStoryBinding = (storyId: string, boundAt = now()): TavernStoryBinding => ({
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
        id: trimText(input.id) || createId("message"),
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
      id: trimText(input.id) || createId("message"),
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
  const characterConfigs = normalizeRoomCharacterConfigs(undefined, characterMemories);
  const presentation = normalizeRoomPresentation({
    presentation: tavernRoom.presentation,
  });
  const settings = normalizeRoomSettings(openingInput.runtime?.settings ?? tavernRoom.settings);
  const prompt = normalizeTavernPromptSettings(
    openingInput.runtime?.prompt ?? tavernRoom.prompt,
    openingInput.runtime?.prompt
      ? createDefaultTavernPromptSettings({
          presentationProfileId: presentation.profileId,
          immersiveDescriptionEnabled: settings.immersiveDescriptionEnabled,
        })
      : createDefaultTavernPromptSettings({
          presentationProfileId: presentation.profileId,
          immersiveDescriptionEnabled: settings.immersiveDescriptionEnabled,
        }),
  );
  const replyMode = normalizeReplyMode(openingInput.runtime?.replyMode ?? tavernRoom.replyMode);
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
  const createdAt = now();
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
                id: createId("message"),
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
